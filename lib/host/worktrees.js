/**
 * Task worktrees.
 *
 * The native `ctx.worktrees` service only creates a *new* branch, while EasyGit
 * pre-creates a task branch as soon as the task appears; this module keeps both
 * orderings working with plain git and then publishes the directory through the
 * sanctioned `workingDirectory` service.
 *
 * Pool layout: `<repo>/<worktreeSubdir>/<branch-with-slashes-as-dashes>`.
 * A newly created pool gets a self-ignoring `.gitignore`, and the pool is added
 * to `.git/info/exclude`, so it never shows up as untracked work.
 *
 * @module @local/easygit/host/worktrees
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Turn a branch name into one safe directory segment. */
export function worktreeDirName(branch) {
  return String(branch)
    .replace(/\\/g, '/')
    .replace(/\//g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'task'
}

/** Absolute worktree path for one branch. */
export function worktreePathFor(repoRoot, subdir, branch) {
  return join(repoRoot, subdir, worktreeDirName(branch)).replace(/\\/g, '/')
}

/** Whether a path already exists as a directory. */
async function directoryExists(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Ensure the pool exists and is ignored by git. */
async function ensurePool(git, repoRoot, subdir) {
  const pool = join(repoRoot, subdir)
  const existed = await directoryExists(pool)
  if (!existed) {
    await mkdir(pool, { recursive: true })
    const ignore = join(pool, '.gitignore')
    try {
      await stat(ignore)
    } catch {
      await writeFile(ignore, '*\n', 'utf8')
    }
  }
  // Keep the pool out of `git status` even when the directory predates us.
  const commonDir = await git.commonDir(repoRoot)
  if (commonDir !== undefined) {
    const absoluteCommon = commonDir.startsWith('/') || /^[A-Za-z]:/.test(commonDir)
      ? commonDir
      : join(repoRoot, commonDir)
    const excludeFile = join(absoluteCommon, 'info', 'exclude')
    try {
      await mkdir(dirname(excludeFile), { recursive: true })
      const current = await readFile(excludeFile, 'utf8').catch(() => '')
      const line = `/${subdir.replace(/\\/g, '/')}/`
      if (!current.split(/\r?\n/).includes(line)) {
        await writeFile(excludeFile, `${current}${current.endsWith('\n') || current.length === 0 ? '' : '\n'}${line}\n`, 'utf8')
      }
    } catch {
      // An unwritable info/exclude is cosmetic; the pool has its own .gitignore.
    }
  }
  return pool
}

/**
 * Create or reuse a worktree for an existing (or new) branch.
 * @param {{
 *   git: ReturnType<import('./git.js').createGit>
 *   repoRoot: string
 *   branch: string
 *   subdir: string
 *   createBranch?: boolean
 *   from?: string
 * }} request
 * @returns {Promise<{path: string; branch: string; created: boolean; reused: boolean}>}
 */
export async function ensureWorktree(request) {
  const { git, repoRoot, branch, subdir } = request
  const path = worktreePathFor(repoRoot, subdir, branch)
  const worktreeList = await git.worktrees(repoRoot)
  const registered = worktreeList.find(worktree => worktree.path.replace(/\\/g, '/') === path)
  if (registered !== undefined) {
    if (registered.branch === branch) return { path, branch, created: false, reused: true }
    const error = new Error(`EasyGit: ${path} is registered for branch ${registered.branch ?? '(detached)'}`)
    error.code = 'worktree-conflict'
    throw error
  }
  if (await directoryExists(path)) {
    const error = new Error(`EasyGit: worktree directory already exists but is not registered: ${path}`)
    error.code = 'worktree-conflict'
    throw error
  }
  await ensurePool(git, repoRoot, subdir)
  const branchExists = await git.branchExists(repoRoot, branch)
  if (!branchExists) {
    await git.worktreeAdd(repoRoot, path, branch, { create: true, from: request.from ?? 'HEAD' })
  } else {
    await git.worktreeAdd(repoRoot, path, branch)
  }
  return { path, branch, created: true, reused: false }
}

/**
 * Remove a worktree only when it has no uncommitted changes.
 * @param {{
 *   git: ReturnType<import('./git.js').createGit>
 *   repoRoot: string
 *   path: string
 * }} request
 */
export async function removeWorktreeSafely(request) {
  const { git, repoRoot, path } = request
  const list = await git.worktrees(repoRoot)
  const registered = list.find(worktree => worktree.path.replace(/\\/g, '/') === path.replace(/\\/g, '/'))
  if (registered === undefined) {
    const error = new Error(`EasyGit: ${path} is not a registered worktree`)
    error.code = 'worktree-missing'
    throw error
  }
  if (registered.bare === true) {
    const error = new Error('EasyGit: refusing to remove a bare worktree')
    error.code = 'worktree-refused'
    throw error
  }
  const status = await git.status(path)
  if (status.length > 0) {
    const error = new Error(`EasyGit: worktree ${path} has ${status.length} uncommitted change(s); commit or discard them first`)
    error.code = 'worktree-dirty'
    throw error
  }
  await git.worktreeRemove(repoRoot, path)
  return { ok: true }
}
