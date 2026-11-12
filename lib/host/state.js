/**
 * EasyGit durable state: user settings, explicitly added repositories and the
 * task -> branch/worktree mapping. The file is a rebuildable cache (git and the
 * team log stay authoritative), written atomically and serialized in-process.
 *
 * @module @local/easygit/host/state
 */

import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { DEFAULT_SETTINGS, normalizeSettings } from './config.js'

/** State format version. */
export const STATE_VERSION = 1

/** DSH home (kept local to avoid importing runtime packages). */
export function dshHome() {
  const override = process.env.DSH_HOME
  return resolve(override !== undefined && override.length > 0 ? override : join(homedir(), '.dsh'))
}

/** Default state file path. */
export function defaultStateFile() {
  return join(dshHome(), 'easygit', 'state.json')
}

/** Empty durable state. */
function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    addedRepos: [],
    repos: {},
  }
}

/** Coerce a loaded document into the current shape. */
function normalizeState(raw) {
  const base = emptyState()
  if (raw === null || typeof raw !== 'object') return base
  const added = Array.isArray(raw.addedRepos)
    ? raw.addedRepos.filter(item => typeof item === 'string' && item.length > 0).map(item => item.replace(/\\/g, '/'))
    : []
  const repos = {}
  const sourceRepos = raw.repos !== null && typeof raw.repos === 'object' ? raw.repos : {}
  for (const [key, value] of Object.entries(sourceRepos)) {
    if (value === null || typeof value !== 'object') continue
    const tasks = {}
    const sourceTasks = value.tasks !== null && typeof value.tasks === 'object' ? value.tasks : {}
    for (const [taskKey, task] of Object.entries(sourceTasks)) {
      if (task === null || typeof task !== 'object') continue
      tasks[taskKey] = {
        branch: typeof task.branch === 'string' ? task.branch : '',
        ...(typeof task.worktreePath === 'string' ? { worktreePath: task.worktreePath } : {}),
        ...(typeof task.baseCommit === 'string' ? { baseCommit: task.baseCommit } : {}),
        title: typeof task.title === 'string' ? task.title : '',
        ...(typeof task.ownerId === 'string' ? { ownerId: task.ownerId } : {}),
        ...(typeof task.status === 'string' ? { status: task.status } : {}),
        ...(typeof task.teamId === 'string' ? { teamId: task.teamId } : {}),
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : 0,
        updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : 0,
      }
    }
    repos[key] = {
      tasks,
      warnings: Array.isArray(value.warnings) ? value.warnings.filter(item => typeof item === 'string').slice(0, 8) : [],
    }
  }
  return {
    version: STATE_VERSION,
    settings: normalizeSettings(raw.settings),
    addedRepos: added.slice(0, 64),
    repos,
  }
}

/** Write JSON atomically (temp file + rename, with a Windows fallback). */
async function writeJsonAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    await rename(temp, file)
  } catch (error) {
    if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') throw error
    await unlink(file).catch(() => undefined)
    await rename(temp, file)
  }
}

/** Durable EasyGit state store. */
export class StateStore {
  /**
   * @param {{ file?: string }} [options]
   */
  constructor(options = {}) {
    this.file = options.file ?? defaultStateFile()
    this.data = emptyState()
    this.loaded = false
    this.chain = Promise.resolve()
    this.readyPromise = this.load()
  }

  /** Load the state file once. */
  async load() {
    try {
      const raw = await readFile(this.file, 'utf8')
      this.data = normalizeState(JSON.parse(raw))
    } catch {
      this.data = emptyState()
    }
    this.loaded = true
    return this
  }

  /** Wait for the initial load. */
  async ready() {
    await this.readyPromise
    return this
  }

  /** Current settings. */
  settings() {
    return this.data.settings
  }

  /** Current added repository paths. */
  addedRepos() {
    return [...this.data.addedRepos]
  }

  /** Ensure and return one repository bucket. */
  repo(root) {
    if (this.data.repos[root] === undefined) {
      this.data.repos[root] = { tasks: {}, warnings: [] }
    }
    return this.data.repos[root]
  }

  /** One task mapping (`teamId::taskId`). */
  task(root, taskKey) {
    return this.data.repos[root]?.tasks?.[taskKey]
  }

  /** Find a task mapping by branch name. */
  taskByBranch(root, branch) {
    const tasks = this.data.repos[root]?.tasks ?? {}
    for (const [key, task] of Object.entries(tasks)) {
      if (task.branch === branch) return { key, task }
    }
    return undefined
  }

  /** Open tasks of one owner, newest first. */
  openTasksOfOwner(root, ownerId) {
    const tasks = this.data.repos[root]?.tasks ?? {}
    return Object.entries(tasks)
      .filter(([, task]) => task.ownerId === ownerId)
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .map(([key, task]) => ({ key, ...task }))
  }

  /**
   * Serialized mutation, persisted before fulfillment.
   * @template T
   * @param {(data: ReturnType<typeof emptyState>) => T | Promise<T>} mutate
   * @returns {Promise<T>}
   */
  update(mutate) {
    const run = async () => {
      await this.ready()
      const result = await mutate(this.data)
      await writeJsonAtomic(this.file, this.data)
      return result
    }
    const next = this.chain.then(run, run)
    this.chain = next.then(() => undefined, () => undefined)
    return next
  }

  /** Replace user settings. */
  async setSettings(next) {
    return this.update(data => {
      data.settings = normalizeSettings({ ...data.settings, ...next })
      return data.settings
    })
  }

  /** Add one repository path to the user allowlist. */
  async addRepo(path) {
    const normalized = path.replace(/\\/g, '/')
    return this.update(data => {
      if (!data.addedRepos.includes(normalized)) data.addedRepos.push(normalized)
      return data.addedRepos
    })
  }

  /** Remove one repository path from the user allowlist. */
  async removeRepo(path) {
    const normalized = path.replace(/\\/g, '/')
    return this.update(data => {
      data.addedRepos = data.addedRepos.filter(item => item !== normalized)
      return data.addedRepos
    })
  }

  /** Append one warning for a repository (deduplicated, capped). */
  async warn(root, message) {
    return this.update(data => {
      const repo = data.repos[root] ?? (data.repos[root] = { tasks: {}, warnings: [] })
      if (!repo.warnings.includes(message)) repo.warnings.push(message)
      repo.warnings = repo.warnings.slice(-8)
      return repo.warnings
    })
  }
}
