/**
 * The only place EasyGit shells out to git.
 *
 * Invariants:
 * - Literal argv through `execFile`, never a shell, so no user value can become
 *   shell syntax.
 * - Every call has a timeout and a bounded output buffer.
 * - Read helpers are fail-soft enough for the panel; mutating helpers throw a
 *   readable GitError that the route/tool layer surfaces.
 * - Parsers are pure exports so tests can exercise them without a repository.
 *
 * @module @local/easygit/host/git
 */

import { execFile } from 'node:child_process'

/** Longest stdout/stderr either side may produce. */
const MAX_BUFFER = 8 * 1024 * 1024

/** Environment that keeps git non-interactive and machine-readable. */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  LC_ALL: 'C',
  LANG: 'C',
}

/** One git failure with a user-readable message. */
export class GitError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string; stderr?: string }} [details]
   */
  constructor(message, details = {}) {
    super(message)
    this.name = 'GitError'
    this.code = details.code ?? 'git-failed'
    this.stderr = details.stderr ?? ''
  }
}

/** Trim git's stderr into one readable line block. */
function cleanStderr(stderr) {
  return String(stderr ?? '').replace(/\r\n/g, '\n').trim()
}

/** First non-empty error line, used as the short failure message. */
export function errorLine(stderr, fallback = 'git command failed') {
  const lines = cleanStderr(stderr).split('\n').map(line => line.trim()).filter(Boolean)
  return lines.length > 0 ? lines[0] : fallback
}

/**
 * Parse `git status --porcelain=v1 -z` output.
 * @param {string} raw
 * @returns {Array<{path: string; originalPath?: string; index: string; worktree: string; staged: boolean; unstaged: boolean; untracked: boolean; deleted: boolean; renamed: boolean}>}
 */
export function parseStatusZ(raw) {
  const tokens = String(raw).split('\0')
  const files = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.length < 4) continue
    const indexStatus = token[0]
    const worktreeStatus = token[1]
    const path = token.slice(3).replace(/\\/g, '/')
    let originalPath
    if ([indexStatus, worktreeStatus].some(char => char === 'R' || char === 'C')) {
      const next = tokens[index + 1]
      if (typeof next === 'string' && next.length > 0) {
        originalPath = next.replace(/\\/g, '/')
        index += 1
      }
    }
    const untracked = indexStatus === '?' && worktreeStatus === '?'
    const ignored = indexStatus === '!' && worktreeStatus === '!'
    if (ignored) continue
    files.push({
      path,
      ...(originalPath === undefined ? {} : { originalPath }),
      index: indexStatus,
      worktree: worktreeStatus,
      staged: !untracked && indexStatus !== ' ' && indexStatus !== '?',
      unstaged: !untracked && worktreeStatus !== ' ' && worktreeStatus !== '?',
      untracked,
      deleted: indexStatus === 'D' || worktreeStatus === 'D',
      renamed: indexStatus === 'R' || worktreeStatus === 'R',
    })
  }
  return files
}

/**
 * Parse one `%(upstream:track)` cell (`[ahead 1, behind 2]`, `[gone]`, ``).
 * @param {string} track
 * @returns {{ahead: number; behind: number; gone: boolean}}
 */
export function parseTrack(track) {
  const text = String(track ?? '')
  if (text.includes('gone')) return { ahead: 0, behind: 0, gone: true }
  const ahead = /ahead (\d+)/.exec(text)
  const behind = /behind (\d+)/.exec(text)
  return {
    ahead: ahead === null ? 0 : Number(ahead[1]),
    behind: behind === null ? 0 : Number(behind[1]),
    gone: false,
  }
}

/**
 * Parse `git for-each-ref` records.
 * @param {string} raw
 * @returns {Array<{ref: string; name: string; type: 'branch'|'remote'|'tag'|'other'; hash: string; subject: string; upstream?: string; ahead: number; behind: number; gone: boolean; isHead: boolean}>}
 */
export function parseRefs(raw) {
  const refs = []
  for (const line of String(raw).split('\n')) {
    if (line.length === 0) continue
    const [ref, hash, peeled, subject, upstream, track, head] = line.split('\x1f')
    if (typeof ref !== 'string' || !ref.startsWith('refs/')) continue
    let type = 'other'
    let name = ref
    if (ref.startsWith('refs/heads/')) {
      type = 'branch'
      name = ref.slice('refs/heads/'.length)
    } else if (ref.startsWith('refs/remotes/')) {
      type = 'remote'
      name = ref.slice('refs/remotes/'.length)
    } else if (ref.startsWith('refs/tags/')) {
      type = 'tag'
      name = ref.slice('refs/tags/'.length)
    } else {
      continue
    }
    const tracking = parseTrack(track)
    refs.push({
      ref,
      name,
      type,
      hash: type === 'tag' && peeled.length > 0 ? peeled : hash,
      subject: subject ?? '',
      ...(upstream !== undefined && upstream.length > 0 ? { upstream } : {}),
      ahead: tracking.ahead,
      behind: tracking.behind,
      gone: tracking.gone,
      isHead: head === '*',
    })
  }
  return refs
}

/**
 * Parse `git log -z --format=...` records.
 * @param {string} raw
 * @returns {Array<{hash: string; parents: string[]; author: string; email: string; time: number; subject: string}>}
 */
export function parseLog(raw) {
  const commits = []
  for (const record of String(raw).split('\0')) {
    if (record.length === 0) continue
    const [hash, parents, author, email, time, subject] = record.split('\x1f')
    if (typeof hash !== 'string' || hash.length === 0) continue
    commits.push({
      hash,
      parents: typeof parents === 'string' && parents.length > 0 ? parents.split(' ') : [],
      author: author ?? '',
      email: email ?? '',
      time: Number(time) || 0,
      subject: subject ?? '',
    })
  }
  return commits
}

/**
 * Parse `git worktree list --porcelain` blocks.
 * @param {string} raw
 * @returns {Array<{path: string; head?: string; branch?: string; bare: boolean; detached: boolean}>}
 */
export function parseWorktrees(raw) {
  const worktrees = []
  let current
  for (const line of String(raw).split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current !== undefined) worktrees.push(current)
      current = { path: line.slice('worktree '.length), bare: false, detached: false }
      continue
    }
    if (current === undefined) continue
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length)
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (line === 'bare') current.bare = true
    else if (line === 'detached') current.detached = true
  }
  if (current !== undefined) worktrees.push(current)
  return worktrees
}

/**
 * Parse `git show --numstat` (binary files use `-`).
 * @param {string} raw
 * @returns {Array<{path: string; additions: number; deletions: number; binary: boolean}>}
 */
export function parseNumstat(raw) {
  const files = []
  for (const line of String(raw).split('\n')) {
    if (line.length === 0) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const [add, del, ...pathParts] = parts
    const path = pathParts.join('\t').replace(/\\/g, '/')
    files.push({
      path,
      additions: add === '-' ? 0 : Number(add) || 0,
      deletions: del === '-' ? 0 : Number(del) || 0,
      binary: add === '-' || del === '-',
    })
  }
  return files
}

/**
 * Parse `git remote -v` into unique remotes.
 * @param {string} raw
 * @returns {Array<{name: string; url: string}>}
 */
export function parseRemotes(raw) {
  const seen = new Map()
  for (const line of String(raw).split('\n')) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
    if (match === null) continue
    if (!seen.has(match[1])) seen.set(match[1], { name: match[1], url: match[2] })
  }
  return [...seen.values()]
}

/**
 * Build the git face.
 * @param {{ execFileImpl?: typeof execFile; defaultTimeoutMs?: number }} [options]
 */
export function createGit(options = {}) {
  const exec = options.execFileImpl ?? execFile
  const defaultTimeout = options.defaultTimeoutMs ?? 15000

  /**
   * Run git with literal arguments.
   * @param {string} cwd
   * @param {string[]} args
   * @param {{ timeout?: number }} [runOptions]
   * @returns {Promise<{ok: boolean; code: number|string; stdout: string; stderr: string; timedOut: boolean}>}
   */
  function run(cwd, args, runOptions = {}) {
    const timeout = runOptions.timeout ?? defaultTimeout
    return new Promise(resolve => {
      try {
        exec('git', ['-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args], {
          cwd,
          timeout,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
          encoding: 'utf8',
          env: GIT_ENV,
        }, (error, stdout, stderr) => {
          resolve({
            ok: error === null || error === undefined,
            code: typeof error?.code === 'number' || typeof error?.code === 'string' ? error.code : 0,
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : error?.message ?? '',
            timedOut: error?.killed === true,
          })
        })
      } catch (error) {
        resolve({
          ok: false,
          code: 'spawn-failed',
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false,
        })
      }
    })
  }

  /** Run and throw GitError on failure. */
  async function runOrThrow(cwd, args, runOptions = {}) {
    const result = await run(cwd, args, runOptions)
    if (!result.ok) {
      const reason = result.timedOut
        ? `git ${args[0] ?? ''} timed out after ${runOptions.timeout ?? defaultTimeout} ms`
        : String(result.code) === 'ENOENT'
          ? 'git is not installed or not on PATH'
          : errorLine(result.stderr, `git ${args[0] ?? ''} failed`)
      throw new GitError(`EasyGit: ${reason}`, { code: 'git-failed', stderr: cleanStderr(result.stderr) })
    }
    return result.stdout
  }

  return {
    run,
    runOrThrow,

    /** Whether `dir` is inside a git work tree. */
    async isRepo(dir) {
      const result = await run(dir, ['rev-parse', '--is-inside-work-tree'], { timeout: 5000 })
      return result.ok && result.stdout.trim() === 'true'
    },

    /** Whether a usable git binary answers at all. */
    async binaryAvailable() {
      const result = await run(process.cwd(), ['--version'], { timeout: 5000 })
      return result.ok
    },

    /** Absolute top-level directory of the work tree containing `dir`. */
    async toplevel(dir) {
      const result = await run(dir, ['rev-parse', '--show-toplevel'], { timeout: 5000 })
      return result.ok ? result.stdout.trim().replace(/\\/g, '/') : undefined
    },

    /** Shared git directory (`.git` or its common dir for linked worktrees). */
    async commonDir(dir) {
      const result = await run(dir, ['rev-parse', '--git-common-dir'], { timeout: 5000 })
      if (!result.ok) return undefined
      const value = result.stdout.trim()
      return value.length === 0 ? undefined : value
    },

    /** First entry of `git worktree list` is the primary checkout. */
    async primaryCheckout(dir) {
      const list = await this.worktrees(dir)
      return list.length > 0 ? list[0].path : undefined
    },

    /** Current branch short name, or undefined on detached HEAD. */
    async currentBranch(dir) {
      const result = await run(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { timeout: 5000 })
      return result.ok && result.stdout.trim().length > 0 ? result.stdout.trim() : undefined
    },

    /** HEAD commit hash. */
    async head(dir) {
      const result = await run(dir, ['rev-parse', 'HEAD'], { timeout: 5000 })
      return result.ok ? result.stdout.trim() : undefined
    },

    /** Parsed `status --porcelain=v1 -z`. */
    async status(dir) {
      const result = await run(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { timeout: 10000 })
      return result.ok ? parseStatusZ(result.stdout) : []
    },

    /** Parsed refs (branches, remotes, tags). */
    async refs(dir) {
      const format = '%(refname)%1f%(objectname)%1f%(*objectname)%1f%(subject)%1f%(upstream:short)%1f%(upstream:track)%1f%(HEAD)'
      const result = await run(dir, ['for-each-ref', `--format=${format}`], { timeout: 10000 })
      return result.ok ? parseRefs(result.stdout) : []
    },

    /** Parsed reflog-free commit list, newest first. */
    async log(dir, limit = 300) {
      const format = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s'
      const result = await run(dir, ['log', '--all', '--date-order', '-n', String(limit), '-z', `--format=${format}`], { timeout: 15000 })
      return result.ok ? parseLog(result.stdout) : []
    },

    /** Parsed worktree list. */
    async worktrees(dir) {
      const result = await run(dir, ['worktree', 'list', '--porcelain'], { timeout: 10000 })
      return result.ok ? parseWorktrees(result.stdout) : []
    },

    /** Commits unique to `branch` (ahead) and to `base` (behind). */
    async aheadBehind(dir, base, branch) {
      const result = await run(dir, ['rev-list', '--left-right', '--count', `${base}...${branch}`], { timeout: 10000 })
      if (!result.ok) return { ahead: 0, behind: 0 }
      const [left, right] = result.stdout.trim().split(/\s+/)
      return { ahead: Number(right) || 0, behind: Number(left) || 0 }
    },

    /** Configured remotes. */
    async remotes(dir) {
      const result = await run(dir, ['remote', '-v'], { timeout: 5000 })
      return result.ok ? parseRemotes(result.stdout) : []
    },

    /** Whether `name` is a syntactically valid branch name. */
    async isValidBranchName(dir, name) {
      if (typeof name !== 'string' || name.length === 0 || name.length > 200) return false
      if (name.startsWith('-') || name.includes('..') || name.includes(' ')) return false
      const result = await run(dir, ['check-ref-format', '--branch', name], { timeout: 5000 })
      return result.ok
    },

    /** Whether a local branch has this exact name. */
    async branchExists(dir, name) {
      const result = await run(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { timeout: 5000 })
      return result.ok
    },

    /** Create a branch at `from` (no checkout). */
    async createBranch(dir, name, from = 'HEAD') {
      await this.runOrThrow(dir, ['branch', '--', name, from], { timeout: 15000 })
    },

    /** Check out an existing local branch. */
    async checkout(dir, name) {
      await this.runOrThrow(dir, ['switch', '--', name], { timeout: 15000 })
    },

    /** Stage the given repo-relative paths, then commit them. */
    async commitPaths(dir, paths, message) {
      if (paths.length === 0) throw new GitError('EasyGit: nothing to commit')
      await this.runOrThrow(dir, ['add', '-A', '--', ...paths], { timeout: 15000 })
      const staged = await run(dir, ['diff', '--cached', '--quiet'], { timeout: 10000 })
      if (staged.ok) return { noop: true }
      await this.runOrThrow(dir, ['commit', '-m', message, '--no-verify'], { timeout: 15000 })
      const hash = await this.head(dir)
      if (hash === undefined) throw new GitError('EasyGit: commit succeeded but HEAD cannot be read')
      return { noop: false, hash }
    },

    /** One commit's metadata. */
    async showMeta(dir, hash) {
      const result = await run(dir, ['show', '-s', '--format=%H%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b', hash], { timeout: 10000 })
      if (!result.ok) return undefined
      const [full, author, email, time, subject, body] = result.stdout.split('\x1f')
      return {
        hash: full.trim(),
        author: author ?? '',
        email: email ?? '',
        time: Number(time) || 0,
        subject: subject ?? '',
        body: (body ?? '').trim(),
      }
    },

    /** Changed files of one commit with line counts. */
    async showFiles(dir, hash) {
      const result = await run(dir, ['show', '--numstat', '--format=', '--no-ext-diff', '--no-textconv', hash], { timeout: 10000 })
      return result.ok ? parseNumstat(result.stdout) : []
    },

    /** Capped unified patch of one commit. */
    async showPatch(dir, hash, maxBytes = 96 * 1024) {
      const result = await run(dir, ['show', '--patch', '--format=', '--no-color', '--no-ext-diff', '--no-textconv', hash], { timeout: 15000 })
      if (!result.ok) return { text: '', truncated: false }
      let text = result.stdout
      let truncated = false
      if (text.length > maxBytes) {
        text = text.slice(0, maxBytes)
        truncated = true
      }
      return { text, truncated }
    },

    /** Commit summary used by the last-commit block. */
    async commitDetails(dir, hash, maxBytes = 96 * 1024) {
      const meta = await this.showMeta(dir, hash)
      if (meta === undefined) throw new GitError(`EasyGit: commit ${hash} not found`)
      const files = await this.showFiles(dir, hash)
      const patch = await this.showPatch(dir, hash, maxBytes)
      const additions = files.reduce((sum, file) => sum + file.additions, 0)
      const deletions = files.reduce((sum, file) => sum + file.deletions, 0)
      return { ...meta, files, stats: { files: files.length, additions, deletions }, patch: patch.text, truncated: patch.truncated }
    },

    /** `git check-ignore` for one repo-relative path. */
    async isIgnored(dir, path) {
      const result = await run(dir, ['check-ignore', '-q', '--', path], { timeout: 5000 })
      return result.ok
    },

    /** Delete a worktree registration and directory (caller checked cleanliness). */
    async worktreeAdd(root, path, branch, options = {}) {
      if (options.create === true) {
        await this.runOrThrow(root, ['worktree', 'add', '-b', branch, '--', path, options.from ?? 'HEAD'], { timeout: 30000 })
      } else {
        await this.runOrThrow(root, ['worktree', 'add', '--', path, branch], { timeout: 30000 })
      }
    },

    /** Remove a worktree directory; `force` only after the caller verified it. */
    async worktreeRemove(root, path, force = false) {
      const args = ['worktree', 'remove']
      if (force) args.push('--force')
      args.push('--', path)
      await this.runOrThrow(root, args, { timeout: 30000 })
    },

    /** Prune stale worktree registrations. */
    async worktreePrune(root) {
      await this.runOrThrow(root, ['worktree', 'prune'], { timeout: 15000 })
    },

    /** Push one local branch to a named remote without force. */
    async push(dir, remote, branch) {
      const result = await run(dir, ['push', '--set-upstream', remote, branch], { timeout: 60000 })
      return {
        ok: result.ok,
        stdout: result.stdout.trim(),
        stderr: cleanStderr(result.stderr),
        timedOut: result.timedOut,
      }
    },

    /** Initialize a repository in `dir`. */
    async init(dir) {
      await this.runOrThrow(dir, ['init'], { timeout: 15000 })
    },
  }
}

/**
 * Check GitHub CLI login state. Cached by the caller; never returns a token.
 * @param {(command: string, args: string[], options: object) => Promise<{ok: boolean; stdout: string; stderr: string}>} execTool
 * @returns {Promise<{cli: boolean; authenticated: boolean; login?: string}>}
 */
export async function checkGhAuth(execTool) {
  try {
    const result = await execTool('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 6000 })
    const text = `${result.stdout}\n${result.stderr}`
    if (!result.ok) return { cli: true, authenticated: false }
    const match = /Logged in to github\.com account (\S+)/i.exec(text) ?? /account (\S+)/i.exec(text)
    return { cli: true, authenticated: true, ...(match === null ? {} : { login: match[1] }) }
  } catch {
    return { cli: false, authenticated: false }
  }
}
