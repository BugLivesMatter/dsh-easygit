/**
 * Agent-facing EasyGit tools.
 *
 * These call the same core operations as the panel routes; they never invent a
 * separate workflow. Repository arguments are resolved through the same
 * workspace/added-folder allowlist, and a missing argument defaults to the
 * calling agent's current directory (which may be a task worktree).
 *
 * @module @local/easygit/host/tools
 */

import { performCheckpoint } from './checkpoint.js'

/** JSON pretty output shared by every tool. */
function renderJson(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** Current agent behind a tool call. */
function currentAgent(ctx) {
  try {
    return ctx.get('agents')?.currentInitiator()
  } catch {
    return undefined
  }
}

/** Effective cwd of one agent. */
function agentCwd(ctx, agent) {
  try {
    const session = agent?.session
    if (session === undefined) return undefined
    return ctx.get('workingDirectory')?.get(session)
  } catch {
    return undefined
  }
}

/** Resolve the repository for a tool call. */
async function toolRepo(ctx, repos, repoArg, agent) {
  if (typeof repoArg === 'string' && repoArg.trim().length > 0) {
    const { root } = await repos.resolveRepo(repoArg)
    return root
  }
  const cwd = agentCwd(ctx, agent)
  if (typeof cwd !== 'string' || cwd.length === 0) {
    const error = new Error('EasyGit: pass repo explicitly; the calling session has no working directory')
    error.code = 'repo-required'
    throw error
  }
  const { root } = await repos.resolveRepo(cwd)
  return root
}

/** One local branch record or undefined. */
async function branchRecord(git, root, name) {
  const refs = await git.refs(root)
  return refs.find(ref => ref.type === 'branch' && ref.name === name)
}

/** Build the six tool definitions. */
function toolDefinitions(host) {
  const { ctx, git, state, repos, explainer } = host

  return [
    {
      name: 'easygit_status',
      description:
        'Read the git state of the repository the calling agent works in: current branch, worktree, ahead/behind, '
        + 'uncommitted files, the last commit, and the EasyGit task branch mapped to this worktree. '
        + 'Call this before deciding whether to checkpoint, commit, or push.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
        },
      },
      async execute(args) {
        const agent = currentAgent(ctx)
        const root = await toolRepo(ctx, repos, args.repo, agent)
        const payload = await repos.describeRepo(root)
        const mapping = state.taskByBranch(root, payload.repo.branch ?? '')
        return {
          repo: root,
          workspaceTitle: payload.repo.title,
          branch: payload.repo.branch,
          detached: payload.repo.detached,
          worktree: agentCwd(ctx, agent) ?? null,
          remote: payload.repo.remoteName === null ? null : { name: payload.repo.remoteName, url: payload.repo.remoteUrl },
          status: {
            clean: payload.status.clean,
            trackedChanged: payload.status.trackedChanged,
            untracked: payload.status.untracked,
            staged: payload.status.staged,
            sensitive: payload.status.sensitive,
            files: payload.status.files.slice(0, 60).map(file => ({
              path: file.path,
              staged: file.staged,
              untracked: file.untracked,
              sensitive: file.sensitive,
            })),
          },
          head: payload.repo.head,
          lastCommit: payload.lastCommit === null ? null : {
            hash: payload.lastCommit.hash,
            subject: payload.lastCommit.subject,
            author: payload.lastCommit.author,
            time: payload.lastCommit.time,
            stats: payload.lastCommit.stats,
          },
          task: mapping === undefined ? null : {
            key: mapping.key,
            branch: mapping.task.branch,
            title: mapping.task.title,
            status: mapping.task.status,
            ownerId: mapping.task.ownerId ?? null,
          },
          warnings: payload.warnings,
        }
      },
    },
    {
      name: 'easygit_checkpoint',
      description:
        'Create a safety checkpoint commit before starting a new unit of work. Without paths it commits only changes '
        + 'to already-tracked files; untracked files are committed only when listed explicitly. Sensitive files '
        + '(.env, private keys, credentials*) are refused and reported. Returns the commit hash, committed paths and '
        + 'skipped paths.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit repo-relative paths to include (required for new/untracked files).',
          },
          message: { type: 'string', description: 'Optional commit message; a descriptive default is used otherwise.' },
        },
      },
      async execute(args) {
        const root = await toolRepo(ctx, repos, args.repo, currentAgent(ctx))
        return performCheckpoint({
          git,
          repo: root,
          settings: state.settings(),
          paths: Array.isArray(args.paths) ? args.paths : undefined,
          ...(typeof args.message === 'string' && args.message.trim().length > 0 ? { message: args.message.trim().slice(0, 2000) } : {}),
          trigger: 'checkpoint',
          detail: 'agent checkpoint',
        })
      },
    },
    {
      name: 'easygit_commit',
      description:
        'Commit changes with an explicit message. Without paths it commits tracked changes only; list untracked new '
        + 'files explicitly. Sensitive paths require the user to commit them from the EasyGit panel. Returns the hash '
        + 'and the committed/skipped paths.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message: { type: 'string', description: 'Commit message (required).' },
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit repo-relative paths to include; required for untracked files.',
          },
        },
        required: ['message'],
      },
      async execute(args) {
        if (typeof args.message !== 'string' || args.message.trim().length === 0) {
          throw new Error('EasyGit: message is required')
        }
        const root = await toolRepo(ctx, repos, args.repo, currentAgent(ctx))
        return performCheckpoint({
          git,
          repo: root,
          settings: state.settings(),
          paths: Array.isArray(args.paths) ? args.paths : undefined,
          message: args.message.trim().slice(0, 2000),
          trigger: 'commit',
          detail: 'agent commit',
        })
      },
    },
    {
      name: 'easygit_branch',
      description:
        'Create a local branch at a revision without checking it out. Task branches are created automatically from '
        + 'team tasks; use this for extra branches the user asked for. Returns the branch name and start point.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'New branch name (validated with git check-ref-format).' },
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
          from: { type: 'string', description: 'Start point (branch, tag, or commit). Defaults to HEAD.' },
        },
        required: ['name'],
      },
      async execute(args) {
        if (typeof args.name !== 'string' || args.name.trim().length === 0) {
          throw new Error('EasyGit: name is required')
        }
        const name = args.name.trim()
        const root = await toolRepo(ctx, repos, args.repo, currentAgent(ctx))
        if (!(await git.isValidBranchName(root, name))) {
          throw new Error(`EasyGit: ${name} is not a valid branch name`)
        }
        if (await git.branchExists(root, name)) {
          throw new Error(`EasyGit: branch ${name} already exists`)
        }
        const from = typeof args.from === 'string' && args.from.trim().length > 0 ? args.from.trim() : 'HEAD'
        await git.createBranch(root, name, from)
        return { branch: name, from, repo: root }
      },
    },
    {
      name: 'easygit_push',
      description:
        'Push one local branch to its configured remote (no force). Returns the branch, remote and git output; '
        + 'failures carry the readable git reason (auth, rejected, no remote).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
          branch: { type: 'string', description: 'Local branch to push. Defaults to the current branch.' },
        },
      },
      async execute(args) {
        const root = await toolRepo(ctx, repos, args.repo, currentAgent(ctx))
        const refs = await git.refs(root)
        const branches = refs.filter(ref => ref.type === 'branch')
        const branch = typeof args.branch === 'string' && args.branch.length > 0
          ? args.branch
          : branches.find(ref => ref.isHead)?.name
        if (branch === undefined) throw new Error('EasyGit: no branch to push (detached HEAD)')
        const record = branches.find(ref => ref.name === branch)
        if (record === undefined) throw new Error(`EasyGit: unknown branch ${branch}`)
        const remotes = await git.remotes(root)
        const remote = typeof record.upstream === 'string' && record.upstream.includes('/')
          ? record.upstream.split('/')[0]
          : remotes[0]?.name
        if (remote === undefined) throw new Error('EasyGit: no git remote is configured for this repository')
        const result = await git.push(root, remote, branch)
        if (!result.ok) {
          throw new Error(`EasyGit: push failed: ${result.stderr || 'git push exited non-zero'}`)
        }
        return { branch, remote, output: result.stdout || result.stderr, repo: root }
      },
    },
    {
      name: 'easygit_explain',
      description:
        'Explain one commit with the configured model: what changed, why it matters, what to watch for. '
        + 'Defaults to HEAD. The commit patch is sent to the model provider.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: 'Repository path or workspace path. Defaults to the calling agent cwd.' },
          hash: { type: 'string', description: 'Commit hash; defaults to HEAD.' },
        },
      },
      async execute(args) {
        const root = await toolRepo(ctx, repos, args.repo, currentAgent(ctx))
        const hash = typeof args.hash === 'string' && args.hash.length > 0 ? args.hash : await git.head(root)
        if (hash === undefined) throw new Error('EasyGit: the repository has no commits yet')
        return explainer.explain(root, hash)
      },
    },
  ]
}

/**
 * Register every tool; returns one disposer.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} host
 */
export function registerEasyGitTools(ctx, host) {
  const disposers = []
  for (const tool of toolDefinitions(host)) {
    const definition = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: { schema: {}, render: (_args, value) => renderJson(value) },
      execute: (args, exec) => tool.execute(args, exec),
    }
    disposers.push(ctx.tools.register(definition))
  }
  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}
