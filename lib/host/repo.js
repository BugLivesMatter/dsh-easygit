/**
 * Repository discovery and the read model the EasyGit panel consumes.
 *
 * A repository is addressed by its primary checkout (the first entry of
 * `git worktree list`), so a session that works inside a task worktree still
 * opens the same graph. Only workspace roots and explicitly added folders are
 * allowed; agent tools never reach an arbitrary path.
 *
 * @module @local/easygit/host/repo
 */

import { execFile } from 'node:child_process'
import { basename, join, resolve as resolvePath } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { isSensitivePath } from './config.js'
import { buildGraph, colorIndexForBranch } from './graph.js'
import { checkGhAuth } from './git.js'

/** Detection cache lifetime. */
const DETECT_TTL_MS = 15000

/** GitHub authentication probe cache lifetime. */
const GH_TTL_MS = 60000

/** Directory names never descended into while looking for repositories. */
const SCAN_SKIP = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.agents',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'site-packages',
])

/** Hard stops so a huge project folder cannot stall the panel. */
const SCAN_MAX_DIRS = 400
const SCAN_MAX_REPOS = 40
const SCAN_DEPTH = 2

/** Normalize a filesystem path for storage/display. */
export function normalizePath(value) {
  return resolvePath(String(value)).replace(/\\/g, '/')
}

/** Case-aware path equality (Windows is case-insensitive). */
export function samePath(left, right) {
  const a = normalizePath(left)
  const b = normalizePath(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Whether `child` is `parent` or inside it. */
export function isInside(child, parent) {
  const a = normalizePath(child)
  const b = normalizePath(parent)
  if (process.platform === 'win32') {
    const lowerA = a.toLowerCase()
    const lowerB = b.toLowerCase()
    return lowerA === lowerB || lowerA.startsWith(`${lowerB}/`)
  }
  return a === b || a.startsWith(`${b}/`)
}

/** Human title for a repository path. */
function titleFor(path) {
  return basename(normalizePath(path)) || normalizePath(path)
}

/** Probe `gh auth status` without exposing a token. */
function createGhProbe() {
  let cached = { at: 0, value: { cli: false, authenticated: false } }
  return async () => {
    if (Date.now() - cached.at < GH_TTL_MS) return cached.value
    const execTool = (command, args, options) =>
      new Promise(resolve => {
        execFile(command, args, {
          timeout: options?.timeout ?? 6000,
          windowsHide: true,
          encoding: 'utf8',
          env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
        }, (error, stdout, stderr) => {
          resolve({ ok: error === null || error === undefined, stdout: stdout ?? '', stderr: stderr ?? '' })
        })
      })
    cached = { at: Date.now(), value: await checkGhAuth(execTool) }
    return cached.value
  }
}

/**
 * Build the repository service.
 * @param {{
 *   git: ReturnType<import('./git.js').createGit>
 *   state: import('./state.js').StateStore
 *   getWorkspaces: () => Array<{id: string; title?: string; path: string}>
 *   settings: () => import('./config.js').DEFAULT_SETTINGS
 *   now?: () => number
 * }} options
 */
export function createRepoService(options) {
  const { git, state, getWorkspaces, settings } = options
  const now = options.now ?? (() => Date.now())
  const ghProbe = createGhProbe()
  /** @type {Map<string, {at: number; value: object}>} */
  const detectCache = new Map()

  /** Workspace records, defensively normalized. */
  function workspaces() {
    try {
      const list = getWorkspaces() ?? []
      return list
        .filter(item => item !== null && typeof item === 'object' && typeof item.path === 'string')
        .map(item => ({ id: String(item.id ?? item.path), title: typeof item.title === 'string' ? item.title : undefined, path: normalizePath(item.path) }))
    } catch {
      return []
    }
  }

  /** Every directory the user may target. */
  function allowedDirs() {
    const dirs = workspaces().map(workspace => workspace.path)
    for (const added of state.addedRepos()) {
      if (typeof added === 'string' && added.length > 0) dirs.push(normalizePath(added))
    }
    return dirs
  }

  /** Whether a primary checkout is inside an allowed directory. */
  function isAllowed(root) {
    return allowedDirs().some(dir => isInside(root, dir))
  }

  /** Detect useful facts about one directory, with a short cache. */
  async function detect(dir) {
    const key = normalizePath(dir)
    const cached = detectCache.get(key)
    if (cached !== undefined && Date.now() - cached.at < DETECT_TTL_MS) return cached.value
    let exists = false
    try {
      exists = (await stat(key)).isDirectory()
    } catch {
      exists = false
    }
    const isGit = exists ? await git.isRepo(key) : false
    const root = isGit ? await git.toplevel(key) : undefined
    const primary = isGit ? await git.primaryCheckout(key) : undefined
    const branch = isGit ? await git.currentBranch(primary ?? key) : undefined
    const head = isGit ? await git.head(primary ?? key) : undefined
    const remotes = isGit ? await git.remotes(primary ?? key) : []
    const value = {
      dir: key,
      exists,
      isGit: isGit && root !== undefined,
      root,
      primary: primary === undefined ? undefined : normalizePath(primary),
      branch,
      head,
      remote: remotes.length > 0 ? remotes[0] : undefined,
    }
    detectCache.set(key, { at: Date.now(), value })
    return value
  }

  /** Clear the detection cache (after init/add/remove). */
  function invalidate() {
    detectCache.clear()
  }

  /** The list shown by the repository picker. */
  async function listRepos() {
    const records = []
    const seen = new Set()
    const push = (path, workspace) => {
      const key = normalizePath(path)
      if (seen.has(key)) return
      seen.add(key)
      records.push({ path: key, workspace })
    }
    for (const workspace of workspaces()) push(workspace.path, workspace)
    for (const added of state.addedRepos()) push(added, undefined)
    const github = await ghProbe()
    const result = []
    const outputKeys = new Set()
    for (const record of records) {
      const info = await detect(record.path)
      const key = info.primary ?? record.path
      if (outputKeys.has(key)) continue
      outputKeys.add(key)
      const repoTitle = record.workspace?.title ?? titleFor(key)
      result.push({
        path: key,
        title: repoTitle,
        ...(record.workspace === undefined ? { added: true } : { workspaceId: record.workspace.id }),
        isGit: info.isGit,
        branch: info.branch ?? null,
        head: info.head ?? null,
        remoteUrl: info.remote?.url ?? null,
        github,
      })
    }
    return result
  }

  /** Resolve one allowed repository to its primary checkout. */
  async function resolveRepo(inputPath) {
    if (typeof inputPath !== 'string' || inputPath.trim().length === 0) {
      const error = new Error('EasyGit: a repository path is required')
      error.code = 'repo-required'
      throw error
    }
    const info = await detect(inputPath)
    if (!info.isGit || info.primary === undefined) {
      const error = new Error(`EasyGit: ${normalizePath(inputPath)} is not a git repository`)
      error.code = 'not-a-repo'
      throw error
    }
    if (!isAllowed(info.primary)) {
      const error = new Error(`EasyGit: repository ${info.primary} is not an allowed workspace or added folder`)
      error.code = 'repo-not-allowed'
      throw error
    }
    return { root: info.primary, info }
  }

  /** Add a folder to the user allowlist. */
  async function addRepo(inputPath) {
    const dir = normalizePath(inputPath)
    let exists = false
    try {
      exists = (await stat(dir)).isDirectory()
    } catch {
      exists = false
    }
    if (!exists) {
      const error = new Error(`EasyGit: folder does not exist: ${dir}`)
      error.code = 'path-missing'
      throw error
    }
    const info = await detect(dir)
    const target = info.primary ?? dir
    await state.addRepo(target)
    invalidate()
    return target
  }

  /** Remove an explicitly added folder. */
  async function removeRepo(inputPath) {
    const dir = normalizePath(inputPath)
    await state.removeRepo(dir)
    invalidate()
    const info = await detect(dir)
    if (info.primary !== undefined) await state.removeRepo(info.primary)
    return true
  }

  /** Initialize a repository in an allowed directory. */
  async function initRepo(inputPath) {
    const dir = normalizePath(inputPath)
    if (!allowedDirs().some(allowed => samePath(allowed, dir))) {
      const error = new Error('EasyGit: only a workspace root or an added folder can be initialized')
      error.code = 'repo-not-allowed'
      throw error
    }
    const info = await detect(dir)
    if (info.isGit) return { ok: true, already: true, root: info.primary }
    await git.init(dir)
    invalidate()
    const after = await detect(dir)
    return { ok: true, already: false, root: after.primary ?? dir }
  }

  /** Last-commit summary without the patch. */
  async function commitSummary(root, hash) {
    const meta = await git.showMeta(root, hash)
    if (meta === undefined) return undefined
    const files = await git.showFiles(root, hash)
    return {
      ...meta,
      files: files.slice(0, 100),
      filesTotal: files.length,
      stats: {
        files: files.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      },
    }
  }

  /**
   * Full panel state for one repository.
   * @param {string} inputPath
   */
  async function describeRepo(inputPath) {
    const { root } = await resolveRepo(inputPath)
    const currentSettings = settings()
    const [refs, commits, files, worktrees, remotes, head] = await Promise.all([
      git.refs(root),
      git.log(root, currentSettings.graphLimit),
      git.status(root),
      git.worktrees(root),
      git.remotes(root),
      git.head(root),
    ])
    const currentBranch = refs.find(ref => ref.type === 'branch' && ref.isHead)?.name
    const commitByHash = new Map(commits.map(commit => [commit.hash, commit]))
    const worktreeByBranch = new Map(
      worktrees
        .filter(worktree => typeof worktree.branch === 'string')
        .map(worktree => [worktree.branch, worktree]),
    )

    const graph = buildGraph(commits, refs)

    const branches = refs
      .filter(ref => ref.type === 'branch')
      .map(ref => {
        const commit = commitByHash.get(ref.hash)
        const task = state.taskByBranch(root, ref.name)
        return {
          name: ref.name,
          hash: ref.hash,
          isHead: ref.isHead,
          upstream: ref.upstream ?? null,
          ahead: ref.ahead,
          behind: ref.behind,
          gone: ref.gone,
          subject: commit?.subject ?? ref.subject,
          time: commit?.time ?? 0,
          author: commit?.author ?? '',
          color: graph.branchColor.get(ref.name) ?? colorIndexForBranch(ref.name),
          worktreePath: worktreeByBranch.get(ref.name)?.path ?? null,
          task: task === undefined ? null : { key: task.key, title: task.task.title, status: task.task.status ?? null, ownerId: task.task.ownerId ?? null },
        }
      })
      .sort((left, right) => Number(right.isHead) - Number(left.isHead) || (left.task === null ? 1 : 0) - (right.task === null ? 1 : 0) || left.name.localeCompare(right.name))

    // Divergence from the integration branch. A local branch usually has no
    // upstream, so `ahead`/`behind` alone leaves the rail empty; the panel needs
    // "N ahead of main" to read like GitLens.
    const integrationRef =
      refs.find(ref => ref.type === 'branch' && /^(main|master|trunk)$/i.test(ref.name)) ??
      refs.find(ref => ref.type === 'branch' && ref.isHead) ??
      refs.find(ref => ref.type === 'branch')
    const integrationBranch = integrationRef?.name ?? null
    await Promise.all(
      branches.map(async branch => {
        branch.divergence = integrationBranch === null || branch.name === integrationBranch
          ? { ahead: 0, behind: 0 }
          : await git.aheadBehind(root, integrationBranch, branch.name)
      }),
    )

    for (const row of graph.rows) {
      for (const ref of row.refs) {
        if (ref.type !== 'branch') continue
        const task = state.taskByBranch(root, ref.name)
        if (task !== undefined) {
          row.task = { key: task.key, title: task.task.title, status: task.task.status ?? null }
          break
        }
      }
    }

    const statusFiles = files.slice(0, 300).map(file => ({
      ...file,
      tracked: !file.untracked,
      sensitive: isSensitivePath(file.path, currentSettings.sensitivePatterns),
    }))
    const changed = {
      files: statusFiles,
      total: files.length,
      staged: files.filter(file => file.staged).length,
      unstaged: files.filter(file => file.unstaged).length,
      untracked: files.filter(file => file.untracked).length,
      trackedChanged: files.filter(file => !file.untracked).length,
      sensitive: statusFiles.filter(file => file.sensitive).length,
      clean: files.length === 0,
    }

    const activeBranch = branches.find(branch => branch.isHead)
    const lastHash = activeBranch?.hash ?? head ?? graph.rows[0]?.hash
    const lastCommit = lastHash === undefined ? null : await commitSummary(root, lastHash)
    const remote = remotes.length > 0 ? remotes[0] : undefined
    const github = /github\.com/i.test(remote?.url ?? '') ? await ghProbe() : { cli: false, authenticated: false }

    return {
      repo: {
        path: root,
        title: titleFor(root),
        isGit: true,
        branch: currentBranch ?? null,
        head: head ?? null,
        detached: currentBranch === undefined,
        remoteUrl: remote?.url ?? null,
        remoteName: remote?.name ?? null,
        github,
      },
      integrationBranch,
      branches,
      worktrees: worktrees.map(worktree => ({
        path: worktree.path,
        branch: worktree.branch ?? null,
        head: worktree.head ?? null,
        bare: worktree.bare,
        detached: worktree.detached,
        isMain: samePath(worktree.path, root),
      })),
      commits: graph.rows,
      edges: graph.edges,
      laneCount: graph.laneCount,
      mainBranch: graph.mainBranch,
      mainCol: graph.mainCol,
      status: changed,
      lastCommit,
      settings: currentSettings,
      warnings: state.data.repos[root]?.warnings ?? [],
      generatedAt: now(),
    }
  }

  /**
   * Find git repositories inside a project folder (not the folder itself).
   * Used when the workspace root is not a repository, so the panel can offer the
   * repositories that actually live in the project instead of an empty state.
   * @param {string} inputPath
   * @param {{depth?: number}} [options]
   */
  async function scanForRepos(inputPath, options = {}) {
    const start = normalizePath(inputPath)
    const depth = Number.isInteger(options.depth) ? Math.min(Math.max(options.depth, 0), 3) : SCAN_DEPTH
    const found = []
    let visited = 0
    async function visit(dir, level) {
      if (visited >= SCAN_MAX_DIRS || found.length >= SCAN_MAX_REPOS) return
      visited += 1
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      const children = entries
        .filter(entry => entry.isDirectory() && !SCAN_SKIP.has(entry.name))
        .filter(entry => !entry.name.startsWith('.'))
        .sort((left, right) => left.name.localeCompare(right.name))
      for (const entry of children) {
        if (visited >= SCAN_MAX_DIRS || found.length >= SCAN_MAX_REPOS) return
        const child = join(dir, entry.name)
        const marker = await stat(join(child, '.git')).catch(() => null)
        if (marker !== null) {
          const info = await detect(child)
          if (!info.isGit || info.primary === undefined) continue
          found.push({
            path: info.primary,
            title: titleFor(info.primary),
            branch: info.branch ?? null,
            relative: normalizePath(child).slice(start.length + 1),
          })
          continue
        }
        if (level < depth) await visit(child, level + 1)
      }
    }
    await visit(start, 0)
    return found
  }

  return {
    workspaces,
    allowedDirs,
    isAllowed,
    detect,
    invalidate,
    listRepos,
    resolveRepo,
    addRepo,
    removeRepo,
    initRepo,
    describeRepo,
    commitSummary,
    scanForRepos,
  }
}
