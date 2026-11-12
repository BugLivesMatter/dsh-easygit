import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { createGit } from '../lib/host/git.js'
import { StateStore } from '../lib/host/state.js'
import { createRepoService } from '../lib/host/repo.js'
import { createTeamAutomation } from '../lib/host/tasks.js'
import { makeRepo, cleanup, git } from '../test-support/helpers.mjs'

const gitFace = createGit()

function fakeHost(workspace) {
  const session = { id: 'session-owner', header: { cwd: workspace } }
  const agent = { id: 'session-owner', session: session }
  let cwd = workspace
  const listeners = new Map()
  const ctx = {
    get(name) {
      if (name === 'agents') return { get: id => (id === agent.id ? agent : undefined), list: () => [agent] }
      if (name === 'sessions') return { get: id => (id === session.id ? session : undefined) }
      if (name === 'workspaceRegistry') return { list: () => [{ id: 'workspace-1', path: workspace, title: 'Workspace' }] }
      if (name === 'workingDirectory') {
        return {
          get: () => cwd,
          set: async (_agent, path) => {
            cwd = path
            return path
          },
        }
      }
      return undefined
    },
    on(name, listener) {
      listeners.set(name, listener)
      return () => listeners.delete(name)
    },
  }
  return { ctx, agent, session, getCwd: () => cwd, listeners }
}

function taskEvent(task, teamId = 'team-1') {
  return {
    type: 'team/task',
    data: {
      version: 2,
      teamId,
      task: {
        id: task.id,
        revision: task.revision ?? 1,
        subject: task.subject ?? 'Task',
        description: '',
        status: task.status ?? 'pending',
        ...(task.ownerId === undefined ? {} : { ownerId: task.ownerId }),
        blockedBy: [],
        writeScopes: [],
      },
    },
  }
}

test('a team task creates a branch, checkpoint, worktree and cwd switch', async () => {
  const repo = await makeRepo()
  try {
    const host = fakeHost(repo)
    const store = new StateStore({ file: join(repo, '.git', 'easygit-tasks-state.json') })
    await store.ready()
    const repos = createRepoService({
      git: gitFace,
      state: store,
      getWorkspaces: () => [{ id: 'workspace-1', title: 'Workspace', path: repo }],
      settings: () => store.settings(),
    })
    const automation = createTeamAutomation({ ctx: host.ctx, git: gitFace, state: store, repos })

    await writeFile(join(repo, 'a.txt'), 'work before task\n', 'utf8')
    await automation.handleEvent(host.session, taskEvent({ id: '1', subject: 'Build the graph', ownerId: 'session-owner' }))

    const branchHash = (await git(repo, ['rev-parse', '--verify', 'refs/heads/easygit/task-1'])).trim()
    assert.match(branchHash, /^[0-9a-f]{7,}$/)
    const worktrees = await gitFace.worktrees(repo)
    assert.equal(worktrees.length, 2)
    const mapped = store.task(repo, 'team-1::1')
    assert.equal(mapped.branch, 'easygit/task-1')
    assert.equal(typeof mapped.worktreePath, 'string')
    assert.equal(host.getCwd(), mapped.worktreePath)
    const log = await git(repo, ['log', '-1', '--format=%s'])
    assert.match(log, /checkpoint before task 1/)

    const again = await advance(automation, host, taskEvent({ id: '1', subject: 'Build the graph', ownerId: 'session-owner', revision: 2, status: 'in_progress' }))
    assert.equal(again, true)
    const mappedAgain = store.task(repo, 'team-1::1')
    assert.equal(mappedAgain.branch, mapped.branch)
    assert.equal(mappedAgain.worktreePath, mapped.worktreePath)

    await automation.handleEvent(host.session, taskEvent({ id: '2', subject: 'No owner jet' }))
    const noOwner = store.task(repo, 'team-1::2')
    assert.equal(noOwner.branch, 'easygit/task-2')
    assert.equal(noOwner.worktreePath, undefined)
    assert.equal(host.getCwd(), mapped.worktreePath)
  } finally {
    await cleanup(repo)
  }
})

async function advance(automation, host, event) {
  await automation.handleEvent(host.session, event)
  return true
}
