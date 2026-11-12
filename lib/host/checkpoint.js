/**
 * Safe checkpoints.
 *
 * The user explicitly chose "tracked files plus what the agent names" over
 * `git add -A`: an automatic commit must never swallow an untracked secret.
 * Consequences encoded here:
 * - untracked files are only committed when an explicit path list names them;
 * - sensitive paths are excluded from automatic checkpoints and rejected from
 *   explicit commits unless the user's own UI action opts in;
 * - a clean tree is a no-op, never an empty commit.
 *
 * @module @local/easygit/host/checkpoint
 */

import { isAbsolute, relative, resolve } from 'node:path'
import { isSensitivePath } from './config.js'

/** Turn an absolute path into a repo-relative POSIX path, or undefined. */
function toRepoRelative(repo, absolute) {
  const rel = relative(repo, absolute).replace(/\\/g, '/')
  if (rel.length === 0 || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) return undefined
  return rel
}

/** Normalize one caller-supplied repo-relative path. */
export function normalizeRepoPath(repo, input) {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.includes('\0')) return undefined
  const absolute = isAbsolute(trimmed) ? resolve(trimmed) : resolve(repo, trimmed)
  return toRepoRelative(repo, absolute)
}

/** Build the default checkpoint commit message. */
export function checkpointMessage(trigger, detail) {
  const suffix = typeof detail === 'string' && detail.length > 0 ? ` — ${detail.slice(0, 120)}` : ''
  return `chore(easygit): checkpoint before ${trigger}${suffix}`
}

/**
 * Commit a safe set of changes.
 * @param {{
 *   git: ReturnType<import('./git.js').createGit>
 *   repo: string
 *   settings: import('./config.js').DEFAULT_SETTINGS
 *   paths?: string[]
 *   message?: string
 *   trigger: string
 *   detail?: string
 *   allowSensitive?: boolean
 * }} request
 * @returns {Promise<{noop: boolean; hash?: string; message: string; committed: string[]; excluded: string[]; skipped: Array<{path: string; reason: string}>}>}
 */
export async function performCheckpoint(request) {
  const { git, repo, settings, trigger } = request
  const allowSensitive = request.allowSensitive === true
  const explicitPaths = Array.isArray(request.paths) && request.paths.length > 0
  const status = await git.status(repo)
  const committed = []
  const excluded = []
  const skipped = []

  if (explicitPaths) {
    const normalized = []
    for (const input of request.paths) {
      const path = normalizeRepoPath(repo, input)
      if (path === undefined) {
        skipped.push({ path: String(input), reason: 'path is outside the repository' })
        continue
      }
      if (isSensitivePath(path, settings.sensitivePatterns) && !allowSensitive) {
        skipped.push({ path, reason: 'sensitive file — commit it explicitly from the panel' })
        continue
      }
      if (await git.isIgnored(repo, path)) {
        skipped.push({ path, reason: 'ignored by .gitignore' })
        continue
      }
      normalized.push(path)
    }
    if (normalized.length === 0) {
      return { noop: true, message: request.message ?? '', committed: [], excluded, skipped }
    }
    committed.push(...normalized)
  } else {
    for (const file of status) {
      if (file.path.length === 0) continue
      // Report secret-looking files before the untracked filter so the panel can
      // warn about them even though they are never auto-committed.
      if (isSensitivePath(file.path, settings.sensitivePatterns)) {
        excluded.push(file.path)
        continue
      }
      if (file.untracked) continue
      committed.push(file.path)
    }
  }

  if (committed.length === 0) {
    return { noop: true, message: request.message ?? '', committed: [], excluded, skipped }
  }

  const message = request.message ?? checkpointMessage(trigger, request.detail)
  const result = await git.commitPaths(repo, committed, message)
  if (result.noop === true) {
    return { noop: true, message, committed: [], excluded, skipped }
  }
  // Keep the status lookup meaningful for callers that report what changed.
  return { noop: false, hash: result.hash, message, committed, excluded, skipped }
}
