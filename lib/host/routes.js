/**
 * `/easygit/*` JSON routes on the shared DSH web server.
 *
 * The routes are the browser half's only mutating surface; they call the same
 * core functions as the agent tools, so behavior cannot drift between the two
 * callers. Every path input is resolved through the repository allowlist.
 *
 * @module @local/easygit/host/routes
 */

import { performCheckpoint } from './checkpoint.js'
import { removeWorktreeSafely } from './worktrees.js'
import { isSensitivePath } from './config.js'
import { dshHome } from './state.js'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isInside, normalizePath } from './repo.js'

/** Route prefix mounted on the web server. */
export const ROUTE_PREFIX = '/easygit'

/** Maximum accepted JSON body. */
const MAX_BODY_BYTES = 64 * 1024

/** Read a bounded JSON body. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('EasyGit: request body is too large'), { code: 'body-too-large' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('EasyGit: request body is not valid JSON'), { code: 'body-invalid' }))
      }
    })
    req.on('error', reject)
  })
}

/** Send one JSON response. */
function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Send a success envelope. */
function ok(res, value) {
  send(res, 200, { ok: true, value })
}

/** Send a failure envelope. */
function fail(res, error) {
  const code = typeof error?.code === 'string' ? error.code : 'internal'
  const message = error instanceof Error ? error.message : String(error)
  const status = code === 'repo-required' || code === 'invalid-argument' ? 400
    : code === 'repo-not-allowed' ? 403
    : code === 'not-a-repo' || code === 'branch-exists' || code === 'dirty-tree' ? 409
    : code === 'not-found' ? 404
    : 500
  send(res, status, { ok: false, error: { code, message } })
}

/** Require a non-empty string field. */
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    const error = new Error(`EasyGit: ${field} is required`)
    error.code = 'invalid-argument'
    throw error
  }
  return value
}

/** Normalize a path array field. */
function pathArray(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    const error = new Error('EasyGit: paths must be an array')
    error.code = 'invalid-argument'
    throw error
  }
  return value.filter(item => typeof item === 'string' && item.trim().length > 0).slice(0, 500)
}

/** Resolve the remote and working directory for a push. */
function pushTarget(branches, requested) {
  const branch = requested ?? branches.find(item => item.isHead)?.name
  if (branch === undefined) {
    const error = new Error('EasyGit: no branch to push (detached HEAD)')
    error.code = 'detached-head'
    throw error
  }
  const record = branches.find(item => item.name === branch)
  if (record === undefined) {
    const error = new Error(`EasyGit: unknown branch ${branch}`)
    error.code = 'invalid-argument'
    throw error
  }
  const upstreamRemote = typeof record.upstream === 'string' && record.upstream.includes('/') ? record.upstream.split('/')[0] : undefined
  return { branch, remote: upstreamRemote }
}

/**
 * Mount the routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} host
 * @returns {() => void}
 */
export function registerRoutes(ctx, host) {
  const { git, state, repos, explainer } = host

  /** Resolve one allowed repository from the request. */
  async function repoFrom(body, source) {
    return repos.resolveRepo(requireString(body?.repo ?? source?.get('repo'), 'repo'))
  }

  /**
   * The repository of a session's project folder: the workspace containing the
   * session cwd, or a git repository at that cwd. This is the only repository the
   * panel shows; there is no picker.
   */
  async function projectForSession(sessionId) {
    const session = (() => {
      try {
        return ctx.get('sessions')?.get(sessionId)
      } catch {
        return undefined
      }
    })()
    if (session === undefined) {
      const error = new Error(`EasyGit: session ${sessionId} is not available`)
      error.code = 'session-not-found'
      throw error
    }
    let cwd
    try {
      cwd = ctx.get('workingDirectory')?.get(session)
    } catch {
      cwd = undefined
    }
    if (typeof cwd !== 'string' || cwd.length === 0) cwd = session.header?.cwd
    if (typeof cwd !== 'string' || cwd.length === 0) {
      const error = new Error('EasyGit: the session has no project directory')
      error.code = 'project-missing'
      throw error
    }
    let workspace
    try {
      const list = ctx.get('workspaceRegistry')?.list() ?? []
      const matches = list
        .filter(item => item !== null && typeof item === 'object' && typeof item.path === 'string')
        .filter(item => isInside(cwd, item.path))
        .sort((left, right) => right.path.length - left.path.length)
      workspace = matches[0]
    } catch {
      workspace = undefined
    }
    const candidate = workspace?.path ?? cwd
    const info = await repos.detect(candidate)
    let root = info.isGit ? info.primary : undefined
    if (root === undefined) {
      const cwdInfo = await repos.detect(cwd)
      if (cwdInfo.isGit) root = cwdInfo.primary
    }
    if (root !== undefined && !repos.isAllowed(root)) root = undefined
    const projectPath = root ?? normalizePath(workspace?.path ?? cwd)
    return {
      project: {
        path: projectPath,
        workspacePath: workspace === undefined ? null : normalizePath(workspace.path),
        title: workspace?.title ?? basename(projectPath),
        isGit: root !== undefined,
        branch: info.branch ?? null,
      },
      root,
    }
  }

  async function handler(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://easygit.local')
      if (!url.pathname.startsWith(ROUTE_PREFIX)) {
        send(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown EasyGit route' } })
        return
      }
      const route = url.pathname.slice(ROUTE_PREFIX.length) || '/'
      const method = (req.method ?? 'GET').toUpperCase()

      if (method === 'GET' && route === '/repos') {
        ok(res, { repos: await repos.listRepos(), settings: state.settings() })
        return
      }
      if (method === 'GET' && route === '/state') {
        const sessionId = url.searchParams.get('session')
        if (typeof sessionId === 'string' && sessionId.length > 0) {
          const { project, root } = await projectForSession(sessionId)
          if (root === undefined) {
            const scanTarget = project.workspacePath ?? project.path
            const candidates = await repos.scanForRepos(scanTarget)
            ok(res, { project, isGit: false, settings: state.settings(), candidates })
            return
          }
          const payload = await repos.describeRepo(root)
          ok(res, { ...payload, project, isGit: true })
          return
        }
        const { root } = await repoFrom(undefined, url.searchParams)
        ok(res, await repos.describeRepo(root))
        return
      }
      if (method === 'GET' && route === '/commit') {
        const { root } = await repoFrom(undefined, url.searchParams)
        const hash = url.searchParams.get('hash')
        if (typeof hash !== 'string' || hash.length === 0) {
          const error = new Error('EasyGit: hash is required')
          error.code = 'invalid-argument'
          throw error
        }
        ok(res, await git.commitDetails(root, hash, host.config.explainMaxBytes))
        return
      }
      if (method === 'GET' && route === '/diff') {
        const { root } = await repoFrom(undefined, url.searchParams)
        const path = url.searchParams.get('path')
        const base = url.searchParams.get('base') ?? 'HEAD'
        if (typeof path !== 'string' || path.length === 0) {
          const error = new Error('EasyGit: path is required')
          error.code = 'invalid-argument'
          throw error
        }
        const result = await git.run(root, ['diff', '--no-color', base, '--', path], { timeout: 15000 })
        ok(res, { text: result.stdout, truncated: false })
        return
      }
      if (method !== 'POST') {
        send(res, 405, { ok: false, error: { code: 'method-not-allowed', message: `${method} is not supported` } })
        return
      }

      const body = await readBody(req)
      if (route === '/commit' || route === '/checkpoint') {
        const { root } = await repoFrom(body)
        const message = route === '/commit' ? requireString(body?.message, 'message') : typeof body?.message === 'string' ? body.message : undefined
        const result = await performCheckpoint({
          git,
          repo: root,
          settings: state.settings(),
          paths: pathArray(body?.paths),
          ...(message === undefined ? {} : { message }),
          trigger: 'manual commit',
          allowSensitive: body?.allowSensitive === true,
        })
        ok(res, result)
        return
      }
      if (route === '/branch') {
        const { root } = await repoFrom(body)
        const name = requireString(body?.name, 'name')
        if (!(await git.isValidBranchName(root, name))) {
          const error = new Error(`EasyGit: ${name} is not a valid branch name`)
          error.code = 'invalid-argument'
          throw error
        }
        if (await git.branchExists(root, name)) {
          const error = new Error(`EasyGit: branch ${name} already exists`)
          error.code = 'branch-exists'
          throw error
        }
        const from = typeof body?.from === 'string' && body.from.length > 0 ? body.from : 'HEAD'
        await git.createBranch(root, name, from)
        ok(res, { branch: name, from })
        return
      }
      if (route === '/switch') {
        const { root } = await repoFrom(body)
        const name = requireString(body?.name, 'name')
        const status = await git.status(root)
        if (status.length > 0) {
          if (body?.checkpoint !== true) {
            const error = new Error(`EasyGit: ${status.length} uncommitted change(s); commit them before switching`)
            error.code = 'dirty-tree'
            throw error
          }
          await performCheckpoint({
            git,
            repo: root,
            settings: state.settings(),
            trigger: `switch to ${name}`,
            detail: name,
          })
        }
        await git.checkout(root, name)
        ok(res, { branch: name })
        return
      }
      if (route === '/push') {
        const { root } = await repoFrom(body)
        const statePayload = await repos.describeRepo(root)
        const target = pushTarget(statePayload.branches, typeof body?.branch === 'string' ? body.branch : undefined)
        const remote = target.remote ?? statePayload.repo.remoteName
        if (remote === null || remote === undefined) {
          const error = new Error('EasyGit: no git remote is configured for this repository')
          error.code = 'no-remote'
          throw error
        }
        const result = await git.push(root, remote, target.branch)
        if (!result.ok) {
          const error = new Error(`EasyGit: push failed: ${result.stderr || 'git push exited non-zero'}`)
          error.code = result.timedOut ? 'push-timeout' : 'push-failed'
          error.stderr = result.stderr
          throw error
        }
        ok(res, { branch: target.branch, remote, output: result.stdout || result.stderr })
        return
      }
      if (route === '/explain') {
        const { root } = await repoFrom(body)
        const hash = typeof body?.hash === 'string' && body.hash.length > 0 ? body.hash : (await git.head(root))
        if (hash === undefined) {
          const error = new Error('EasyGit: the repository has no commits yet')
          error.code = 'no-commits'
          throw error
        }
        const model = body?.model !== null && typeof body?.model === 'object' ? body.model : undefined
        ok(res, await explainer.explain(root, hash, model))
        return
      }
      if (route === '/init') {
        const path = requireString(body?.repo, 'repo')
        ok(res, await repos.initRepo(path))
        return
      }
      if (route === '/repos/add') {
        const path = requireString(body?.path, 'path')
        ok(res, { path: await repos.addRepo(path), repos: await repos.listRepos() })
        return
      }
      if (route === '/repos/remove') {
        const path = requireString(body?.path, 'path')
        await repos.removeRepo(path)
        ok(res, { repos: await repos.listRepos() })
        return
      }
      if (route === '/pick') {
        const picker = ctx.get('directoryPickerController')
        if (picker === undefined || typeof picker.pick !== 'function') {
          const error = new Error('EasyGit: this host has no native folder picker; type the path instead')
          error.code = 'picker-unavailable'
          throw error
        }
        const picked = await picker.pick(AbortSignal.timeout(120000))
        ok(res, { path: typeof picked === 'string' && picked.length > 0 ? picked : null })
        return
      }
      if (route === '/settings') {
        const settings = await state.setSettings(body?.settings ?? {})
        explainer.clearCache()
        ok(res, { settings })
        return
      }
      if (route === '/worktree/remove') {
        const { root } = await repoFrom(body)
        const path = requireString(body?.path, 'path')
        ok(res, await removeWorktreeSafely({ git, repoRoot: root, path }))
        return
      }
      if (route === '/client-error') {
        // Browser-half crash diagnostics: a render error must leave a trace on the
        // host because the Web console is not reachable from a terminal session.
        const message = typeof body?.message === 'string' ? body.message.slice(0, 8000) : 'unknown client error'
        const componentStack = typeof body?.componentStack === 'string' ? body.componentStack.slice(0, 4000) : ''
        const file = join(dshHome(), 'easygit', 'client-errors.log')
        try {
          await mkdir(dirname(file), { recursive: true })
          await appendFile(file, `[${new Date().toISOString()}] ${message}\n${componentStack}\n\n`, 'utf8')
          const info = await stat(file)
          if (info.size > 128 * 1024) {
            const current = await readFile(file, 'utf8')
            await writeFile(file, current.slice(-64 * 1024), 'utf8')
          }
        } catch {
          /* diagnostics must never fail the request */
        }
        console.warn('[easygit] client error:', message.split('\n')[0])
        ok(res, { logged: true })
        return
      }
      if (route === '/status-line') {
        // Debug helper used by tests: report whether a path would be treated as sensitive.
        const path = requireString(body?.path, 'path')
        ok(res, { sensitive: isSensitivePath(path, state.settings().sensitivePatterns) })
        return
      }
      send(res, 404, { ok: false, error: { code: 'not-found', message: `unknown EasyGit route ${route}` } })
    } catch (error) {
      fail(res, error)
    }
  }

  const disposeRoute = ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler })
  return () => {
    try {
      disposeRoute()
    } catch {
      /* disposed */
    }
  }
}
