/**
 * Team-task automation.
 *
 * DSH commits every Agent Teams task as a `team/task` session event. Revision 1
 * is "a task was added"; later revisions carry status/owner changes. EasyGit
 * derives one branch per task, checkpoints tracked work before it appears, and
 * gives the owning subagent its own worktree so parallel task lanes are real.
 *
 * All failures are recorded as repository warnings: task automation must never
 * break the team runtime or a session turn.
 *
 * @module @local/easygit/host/tasks
 */

import { ensureWorktree, removeWorktreeSafely } from './worktrees.js'
import { performCheckpoint } from './checkpoint.js'

/** Task statuses that are still work in progress. */
const OPEN_STATUSES = new Set(['pending', 'in_progress'])

/** Whether a team task snapshot is open. */
export function isOpenTask(task) {
  return OPEN_STATUSES.has(String(task?.status ?? 'pending'))
}

/** Stable, branch-safe fragment of a task id. */
export function safeTaskId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '-').replace(/-{2,}/g, '-').slice(0, 48) || 'task'
}

/**
 * Compose the task branch name; collisions get the team suffix.
 * @param {string} prefix
 * @param {string} taskId
 * @param {string} teamId
 * @param {number} [attempt]
 */
export function taskBranchName(prefix, taskId, teamId, attempt = 0) {
  const base = `${prefix}task-${safeTaskId(taskId)}`
  if (attempt === 0) return base
  if (attempt === 1) {
    const short = String(teamId).replace(/[^A-Za-z0-9]/g, '').slice(-6)
    return `${base}-${short || 'team'}`
  }
  return `${base}-${attempt}`
}

/** The task title lives under `subject` in the durable snapshot. */
export function taskTitle(task) {
  const value = task?.subject ?? task?.title ?? ''
  return typeof value === 'string' ? value : ''
}

/** Build the team-task automation service. */
export function createTeamAutomation(options) {
  const { ctx, git, state, repos, config } = options
  const now = options.now ?? (() => Date.now())
  const disposers = []
  let chain = Promise.resolve()
  let stopped = false

  const log = (...args) => {
    if (process.env.EASYGIT_TRACE === '1') console.log('[easygit]', ...args)
  }

  /** Serialize automation work so two task events cannot race one repository. */
  function enqueue(work) {
    const run = async () => {
      await state.ready()
      return work()
    }
    const next = chain.then(run, run).catch(error => {
      console.warn('[easygit] task automation failed:', error instanceof Error ? error.message : String(error))
    })
    chain = next.then(() => undefined, () => undefined)
    return next
  }

  /** Live Agent by Session id. */
  function agentById(id) {
    try {
      return ctx.get('agents')?.get(id)
    } catch {
      return undefined
    }
  }

  /** Session behind an agent id. */
  function sessionById(id) {
    try {
      return ctx.get('sessions')?.get(id)
    } catch {
      return undefined
    }
  }

  /** Effective cwd of one agent. */
  function cwdOf(agent) {
    try {
      const session = agent?.session ?? sessionById(agent?.id)
      if (session === undefined) return undefined
      return ctx.get('workingDirectory')?.get(session)
    } catch {
      return undefined
    }
  }

  /** Workspace containing a directory, longest match first. */
  function workspaceFor(cwd) {
    if (typeof cwd !== 'string' || cwd.length === 0) return undefined
    try {
      const list = ctx.get('workspaceRegistry')?.list() ?? []
      const matches = list
        .filter(workspace => typeof workspace?.path === 'string')
        .map(workspace => ({ workspace, path: workspace.path.replace(/\\/g, '/') }))
        .filter(item => {
          const target = cwd.replace(/\\/g, '/').toLowerCase()
          const root = item.path.toLowerCase()
          return target === root || target.startsWith(`${root}/`)
        })
        .sort((left, right) => right.path.length - left.path.length)
      return matches[0]?.workspace
    } catch {
      return undefined
    }
  }

  /** Resolve the primary checkout hosting one session cwd. */
  async function repoForCwd(cwd) {
    if (typeof cwd !== 'string' || cwd.length === 0) return undefined
    const workspace = workspaceFor(cwd)
    const candidate = workspace?.path ?? cwd
    const info = await repos.detect(candidate)
    if (!info.isGit || info.primary === undefined) {
      if (workspace !== undefined) {
        await state.warn(info.dir, 'Auto-branches paused: this workspace is not a git repository.')
      }
      return undefined
    }
    if (!repos.isAllowed(info.primary)) return undefined
    return info.primary
  }

  /** All known team tasks of one owner across repositories. */
  function ownerTasks(ownerId) {
    const found = []
    for (const [root, repo] of Object.entries(state.data.repos)) {
      for (const [key, task] of Object.entries(repo.tasks)) {
        if (task.ownerId === ownerId && isOpenTask(task)) found.push({ root, key, task })
      }
    }
    return found.sort((left, right) => right.task.createdAt - left.task.createdAt)
  }

  /** Choose a branch name that does not collide with another task. */
  async function branchNameFor(root, taskId, teamId) {
    const prefix = state.settings().branchPrefix
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = taskBranchName(prefix, taskId, teamId, attempt)
      if (!(await git.branchExists(root, candidate))) return candidate
      const mapped = state.taskByBranch(root, candidate)
      if (mapped !== undefined && mapped.task.teamId === teamId) return candidate
    }
    return taskBranchName(prefix, taskId, teamId, 5)
  }

  /** Persist one task mapping. */
  async function saveTask(root, key, patch) {
    return state.update(data => {
      const repo = data.repos[root] ?? (data.repos[root] = { tasks: {}, warnings: [] })
      const prior = repo.tasks[key] ?? {
        branch: '',
        title: '',
        createdAt: now(),
        updatedAt: now(),
      }
      repo.tasks[key] = {
        ...prior,
        ...patch,
        updatedAt: now(),
      }
      return repo.tasks[key]
    })
  }

  /** Create a worktree for a task when its owner is live and idle enough. */
  async function maybeWorktree(root, key, reason) {
    const settings = state.settings()
    if (!settings.autoWorktrees) return undefined
    const mapping = state.task(root, key)
    if (mapping === undefined || mapping.ownerId === undefined) return undefined
    if (!isOpenTask(mapping)) return mapping.worktreePath
    const agent = agentById(mapping.ownerId)
    if (agent === undefined) return undefined
    const branchExists = await git.branchExists(root, mapping.branch)
    if (!branchExists) return undefined

    const existingWorktrees = await git.worktrees(root)
    let worktreePath = mapping.worktreePath
    let registered =
      worktreePath !== undefined &&
      existingWorktrees.some(
        worktree => worktree.path.replace(/\\/g, '/') === worktreePath.replace(/\\/g, '/') && worktree.branch === mapping.branch,
      )
    if (!registered) {
      try {
        const worktree = await ensureWorktree({ git, repoRoot: root, branch: mapping.branch, subdir: settings.worktreeSubdir })
        worktreePath = worktree.path
        registered = true
        await saveTask(root, key, { worktreePath })
        log('worktree', reason, worktreePath)
      } catch (error) {
        await state.warn(root, `Worktree for task ${key}: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    }
    if (!registered || worktreePath === undefined) return undefined

    const workingDirectory = ctx.get('workingDirectory')
    const currentCwd = cwdOf(agent)
    const alreadyHere = currentCwd !== undefined && currentCwd.replace(/\\/g, '/') === worktreePath.replace(/\\/g, '/')
    const otherActive = ownerTasks(mapping.ownerId).filter(candidate => {
      if (candidate.key === key) return false
      if (candidate.task.worktreePath === undefined) return false
      const current = currentCwd?.replace(/\\/g, '/')
      return current !== undefined && current.startsWith(candidate.task.worktreePath.replace(/\\/g, '/'))
    })
    if (workingDirectory !== undefined && !alreadyHere && otherActive.length === 0) {
      try {
        await workingDirectory.set(agent, worktreePath)
        await saveTask(root, key, { worktreePath, switchedAt: now() })
        log('cwd switched', mapping.ownerId, worktreePath)
      } catch (error) {
        await state.warn(root, `Could not enter worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return worktreePath
  }

  /** Switch an idle owner to its newest open task worktree. */
  async function switchOwnerToOpenTask(ownerId) {
    const workingDirectory = ctx.get('workingDirectory')
    const agent = agentById(ownerId)
    if (workingDirectory === undefined || agent === undefined) return
    const candidate = ownerTasks(ownerId).find(item => item.task.worktreePath !== undefined && item.task.status !== 'completed' && item.task.status !== 'deleted')
    if (candidate === undefined) return
    const currentCwd = cwdOf(agent)?.replace(/\\/g, '/')
    const target = candidate.task.worktreePath.replace(/\\/g, '/')
    if (currentCwd === target) return
    try {
      await workingDirectory.set(agent, target)
      await saveTask(candidate.root, candidate.key, { switchedAt: now() })
    } catch (error) {
      await state.warn(candidate.root, `Could not switch to ${target}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Ensure the branch exists for a team task and persist it. */
  async function ensureTask(root, { teamId, task, cwd, checkpoint }) {
    const settings = state.settings()
    const key = `${teamId}::${String(task.id)}`
    const title = taskTitle(task)
    const prior = state.task(root, key)
    const base = {
      title,
      teamId,
      status: String(task.status ?? 'pending'),
      ...(typeof task.ownerId === 'string' ? { ownerId: task.ownerId } : {}),
      ...(prior?.branch !== undefined && prior.branch.length > 0 ? { branch: prior.branch } : {}),
      ...(prior?.baseCommit !== undefined ? { baseCommit: prior.baseCommit } : {}),
    }

    if (prior === undefined && settings.autoBranches && isOpenTask(task)) {
      if (checkpoint && settings.autoCheckpoint) {
        try {
          const result = await performCheckpoint({ git, repo: root, settings, trigger: `task ${String(task.id)}`, detail: title })
          if (!result.noop) log('checkpoint before task', key, result.hash)
        } catch (error) {
          await state.warn(root, `Checkpoint before task ${String(task.id)} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      try {
        const branch = await branchNameFor(root, task.id, teamId)
        const baseCommit = await git.head(root)
        if (!(await git.branchExists(root, branch))) {
          await git.createBranch(root, branch, 'HEAD')
        }
        await saveTask(root, key, { ...base, branch, ...(baseCommit === undefined ? {} : { baseCommit }), createdAt: now() })
        log('branch created', key, branch)
      } catch (error) {
        await saveTask(root, key, { ...base, branch: prior?.branch ?? '' })
        await state.warn(root, `Could not create a branch for task ${String(task.id)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else if (prior !== undefined) {
      await saveTask(root, key, base)
    } else {
      await saveTask(root, key, { ...base, branch: prior?.branch ?? '' })
    }

    await maybeWorktree(root, key, 'task event')
    void cwd
    return key
  }

  /** Handle one `team/task` event. */
  async function onChange(session, event) {
    if (stopped) return
    if (event?.type !== 'team/task') return
    const data = event.data
    const task = data?.task
    if (data === null || typeof data !== 'object' || task === null || typeof task !== 'object') return
    if (typeof task.id !== 'string' || typeof task.status !== 'string') return
    const teamId = typeof data.teamId === 'string' ? data.teamId : 'team'
    let cwd = session?.header?.cwd
    try {
      const live = ctx.get('workingDirectory')?.get(session)
      if (typeof live === 'string' && live.length > 0) cwd = live
    } catch {
      /* keep header cwd */
    }
    const root = await repoForCwd(cwd)
    if (root === undefined) return
    const key = `${teamId}::${String(task.id)}`
    const prior = state.task(root, key)
    const isFirst = prior === undefined
    await ensureTask(root, { teamId, task, cwd, checkpoint: isFirst })
    if (!isOpenTask(task) && typeof task.ownerId === 'string') {
      await switchOwnerToOpenTask(task.ownerId)
    }
  }

  /** Handle a newly created agent: wire pending task worktrees. */
  async function onAgentCreated(agent) {
    if (stopped || agent === undefined) return
    if (!state.settings().autoWorktrees) return
    const candidates = ownerTasks(agent.id)
    for (const candidate of candidates) {
      await maybeWorktree(candidate.root, candidate.key, 'agent created')
    }
  }

  /** Bootstrap existing open tasks for live team leads. */
  async function bootstrap() {
    const teams = ctx.get('agentTeams')
    const agents = ctx.get('agents')
    if (teams === undefined || agents === undefined) return
    let lead
    let membership
    for (const agent of agents.list()) {
      try {
        const found = teams.tryMembership(agent)
        if (found !== undefined) {
          lead = agent
          membership = found
          break
        }
      } catch {
        /* next */
      }
    }
    if (lead === undefined || membership === undefined) return
    let tasks = []
    try {
      tasks = teams.listTasks(lead)
    } catch {
      return
    }
    const teamId = String(membership.teamId ?? membership.id ?? lead.id)
    const cwd = cwdOf(lead) ?? lead?.session?.header?.cwd
    const root = await repoForCwd(cwd)
    if (root === undefined) return
    for (const task of tasks) {
      if (task === null || typeof task !== 'object' || typeof task.id !== 'string') continue
      if (!isOpenTask(task)) continue
      await ensureTask(root, { teamId, task: { ...task, subject: task.subject ?? task.title }, cwd, checkpoint: false })
    }
  }

  /** Attach listeners; returns one disposer. */
  function start() {
    const offEvent = ctx.on('session/event', (session, event) => {
      if (event?.type !== 'team/task') return
      enqueue(() => onChange(session, event))
    })
    disposers.push(offEvent)
    const offAgent = ctx.on('agent/created', payload => {
      const agent = payload?.agent ?? payload
      enqueue(() => onAgentCreated(agent))
    })
    disposers.push(offAgent)
    enqueue(bootstrap)
    return () => {
      stopped = true
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    start,
    /** Testing hook: run one fake event synchronously. */
    handleEvent: (session, event) => enqueue(() => onChange(session, event)),
    handleAgentCreated: agent => enqueue(() => onAgentCreated(agent)),
    removeWorktreeSafely,
  }
}
