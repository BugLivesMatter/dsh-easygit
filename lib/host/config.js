/**
 * EasyGit configuration: defaults, coercion and the secret-path filter.
 *
 * The plugin reads its row `config` as a plain object. It deliberately does not
 * import a schema library: a linked workspace bundle must not resolve
 * `@deepseek-ai/*` runtime packages from the profile, and every value here is
 * cheap to validate by hand.
 *
 * @module @local/easygit/host/config
 */

/** Default secret-ish path globs that never enter an automatic checkpoint. */
export const DEFAULT_SENSITIVE_PATTERNS = Object.freeze([
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  'id_rsa*',
  'id_ed25519*',
  'id_ecdsa*',
  'credentials*',
  'secrets*',
  'auth.json',
  '.npmrc',
  '.pypirc',
  '*.kdbx',
])

/** Default user-facing settings (persisted in the EasyGit state file). */
export const DEFAULT_SETTINGS = Object.freeze({
  autoBranches: true,
  autoWorktrees: true,
  autoCheckpoint: true,
  branchPrefix: 'easygit/',
  worktreeSubdir: '.agents/worktrees/easygit',
  graphLimit: 300,
  sensitivePatterns: DEFAULT_SENSITIVE_PATTERNS,
  explainModel: null,
})

/** Default row config (settings plus host-only switches). */
export const DEFAULT_CONFIG = Object.freeze({
  ...DEFAULT_SETTINGS,
  promptSection: true,
  pollMs: 5000,
  explainMaxBytes: 96 * 1024,
  gitTimeoutMs: 15000,
})

/**
 * Convert one small glob (`*`, `?`, `**`) to an anchored RegExp.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let out = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        out += '.*'
        index += 1
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      out += `\\${char}`
    } else {
      out += char
    }
  }
  return new RegExp(`^${out}$`, 'i')
}

/**
 * Does a repo-relative path look like a secret? Matches both the full relative
 * path and the basename, so `config/.env` is caught by `.env`.
 * @param {string} path
 * @param {readonly string[]} patterns
 * @returns {boolean}
 */
export function isSensitivePath(path, patterns = DEFAULT_SENSITIVE_PATTERNS) {
  const normalized = String(path).replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  for (const pattern of patterns) {
    const regex = globToRegExp(String(pattern))
    if (regex.test(normalized) || regex.test(base)) return true
  }
  return false
}

/** Coerce a boolean with a default. */
function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** Coerce a bounded integer with a default. */
function asInteger(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

/** Normalize a branch prefix; empty prefix is allowed. */
export function normalizeBranchPrefix(value) {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.branchPrefix
  let prefix = value.trim().replace(/\\/g, '/')
  if (prefix.length === 0) return ''
  prefix = prefix.replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\.{2,}/g, '.')
  if (!prefix.endsWith('/')) prefix += '/'
  if (!/^[A-Za-z0-9._/-]+$/.test(prefix) || prefix.startsWith('-') || prefix.endsWith('..')) {
    return DEFAULT_SETTINGS.branchPrefix
  }
  return prefix
}

/** Normalize the worktree pool subdirectory (repo-relative). */
export function normalizeWorktreeSubdir(value) {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.worktreeSubdir
  const cleaned = value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (cleaned.length === 0 || cleaned.split('/').some(part => part === '..' || part === '.')) {
    return DEFAULT_SETTINGS.worktreeSubdir
  }
  return cleaned
}

/** Normalize the secret glob list. */
export function normalizePatterns(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SENSITIVE_PATTERNS]
  const patterns = value
    .filter(item => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, 64)
  return patterns.length > 0 ? patterns : [...DEFAULT_SENSITIVE_PATTERNS]
}

/**
 * Merge a raw settings patch over the defaults and validate every field.
 * @param {unknown} raw
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const explainModelRaw = input.explainModel
  const explainModel =
    explainModelRaw !== null &&
    typeof explainModelRaw === 'object' &&
    typeof explainModelRaw.provider === 'string' &&
    typeof explainModelRaw.model === 'string'
      ? {
          provider: explainModelRaw.provider,
          model: explainModelRaw.model,
          ...(typeof explainModelRaw.reasoningEffort === 'string'
            ? { reasoningEffort: explainModelRaw.reasoningEffort }
            : {}),
        }
      : null
  return {
    autoBranches: asBoolean(input.autoBranches, DEFAULT_SETTINGS.autoBranches),
    autoWorktrees: asBoolean(input.autoWorktrees, DEFAULT_SETTINGS.autoWorktrees),
    autoCheckpoint: asBoolean(input.autoCheckpoint, DEFAULT_SETTINGS.autoCheckpoint),
    branchPrefix: normalizeBranchPrefix(input.branchPrefix),
    worktreeSubdir: normalizeWorktreeSubdir(input.worktreeSubdir),
    graphLimit: asInteger(input.graphLimit, DEFAULT_SETTINGS.graphLimit, 20, 2000),
    sensitivePatterns: normalizePatterns(input.sensitivePatterns),
    explainModel,
  }
}

/**
 * Merge a raw row config over the defaults.
 * @param {unknown} raw
 */
export function normalizeConfig(raw) {
  const settings = normalizeSettings(raw)
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    ...settings,
    promptSection: asBoolean(input.promptSection, DEFAULT_CONFIG.promptSection),
    pollMs: asInteger(input.pollMs, DEFAULT_CONFIG.pollMs, 2000, 60000),
    explainMaxBytes: asInteger(input.explainMaxBytes, DEFAULT_CONFIG.explainMaxBytes, 8 * 1024, 512 * 1024),
    gitTimeoutMs: asInteger(input.gitTimeoutMs, DEFAULT_CONFIG.gitTimeoutMs, 3000, 120000),
  }
}
