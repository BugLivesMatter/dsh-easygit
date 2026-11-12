import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { createGit } from '../lib/host/git.js'
import { StateStore } from '../lib/host/state.js'
import { performCheckpoint } from '../lib/host/checkpoint.js'
import { ensureWorktree, removeWorktreeSafely } from '../lib/host/worktrees.js'
import { createRepoService } from '../lib/host/repo.js'
import { git, makeRepo, makeBareRemote, tempDir, cleanup, headFiles } from '../test-support/helpers.mjs'

const gitFace = createGit()

async function storeFor(repo) {
  const store = new StateStore({ file: join(repo, '.git', 'easygit-test-state.json') })
  await store.ready()
  return store
}

test('checkpoint commits tracked changes only and excludes secrets', async () => {
  const repo = await makeRepo({ trackEnv: true })
  try {
    const store = await storeFor(repo)
    await writeFile(join(repo, 'a.txt'), 'changed\n', 'utf8')
    await writeFile(join(repo, '.env'), 'SECRET=changed\n', 'utf8')
    await writeFile(join(repo, 'new.txt'), 'new file\n', 'utf8')

    const first = await performCheckpoint({ git: gitFace, repo, settings: store.settings(), trigger: 'test task' })
    assert.equal(first.noop, false)
    assert.deepEqual(first.committed, ['a.txt'])
    assert.deepEqual(first.excluded, ['.env'])
    assert.deepEqual(await headFiles(repo), ['a.txt'])
    const message = (await git(repo, ['log', '-1', '--format=%s'])).trim()
    assert.match(message, /easygit.*checkpoint/)

    const status = await gitFace.status(repo)
    assert.equal(status.some(file => file.path === '.env'), true)
    assert.equal(status.some(file => file.path === 'new.txt'), true)

    const explicit = await performCheckpoint({
      git: gitFace,
      repo,
      settings: store.settings(),
      trigger: 'explicit',
      paths: ['new.txt'],
    })
    assert.equal(explicit.noop, false)
    assert.deepEqual(explicit.committed, ['new.txt'])
    assert.deepEqual(await headFiles(repo), ['new.txt'])

    const secret = await performCheckpoint({
      git: gitFace,
      repo,
      settings: store.settings(),
      trigger: 'explicit secret',
      paths: ['.env'],
    })
    assert.equal(secret.noop, true)
    assert.equal(secret.skipped.some(item => item.path === '.env'), true)

    await writeFile(join(repo, 'another.txt'), 'untracked\n', 'utf8')
    const onlyUntracked = await performCheckpoint({ git: gitFace, repo, settings: store.settings(), trigger: 'noop' })
    assert.equal(onlyUntracked.noop, true)
  } finally {
    await cleanup(repo)
  }
})

test('worktrees are created, reused and removed safely', async () => {
  const repo = await makeRepo()
  try {
    await gitFace.createBranch(repo, 'easygit/task-1', 'HEAD')
    const created = await ensureWorktree({
      git: gitFace,
      repoRoot: repo,
      branch: 'easygit/task-1',
      subdir: '.agents/worktrees/easygit',
    })
    assert.equal(created.created, true)
    assert.equal((await stat(created.path)).isDirectory(), true)
    const worktreeGit = await stat(join(created.path, '.git'))
    assert.equal(worktreeGit.isFile(), true)
    assert.equal(created.path.includes('.agents/worktrees/easygit/'), true)

    const reused = await ensureWorktree({
      git: gitFace,
      repoRoot: repo,
      branch: 'easygit/task-1',
      subdir: '.agents/worktrees/easygit',
    })
    assert.equal(reused.reused, true)

    await writeFile(join(created.path, 'dirty.txt'), 'dirty\n', 'utf8')
    await assert.rejects(
      removeWorktreeSafely({ git: gitFace, repoRoot: repo, path: created.path }),
      /uncommitted/,
    )

    await git(created.path, ['add', '-A'])
    await git(created.path, ['commit', '-m', 'task work'])
    await removeWorktreeSafely({ git: gitFace, repoRoot: repo, path: created.path })
    const remaining = await gitFace.worktrees(repo)
    assert.equal(remaining.some(item => item.path === created.path), false)
  } finally {
    await cleanup(repo)
  }
})

test('push reaches a local bare remote without force', async () => {
  const repo = await makeRepo()
  const remote = await makeBareRemote()
  try {
    await git(repo, ['remote', 'add', 'origin', remote])
    const result = await gitFace.push(repo, 'origin', 'main')
    assert.equal(result.ok, true)
    const published = (await git(remote, ['rev-parse', 'refs/heads/main'])).trim()
    const local = (await gitFace.head(repo))?.trim()
    assert.equal(published, local)
  } finally {
    await cleanup(repo)
    await cleanup(remote)
  }
})

test('repository read model exposes branches, graph and last commit', async () => {
  const repo = await makeRepo({ trackEnv: true })
  try {
    await writeFile(join(repo, 'a.txt'), 'second\n', 'utf8')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-m', 'second commit'])
    const store = await storeFor(repo)
    const repos = createRepoService({
      git: gitFace,
      state: store,
      getWorkspaces: () => [{ id: 'workspace-1', title: 'Workspace', path: repo }],
      settings: () => store.settings(),
    })
    const list = await repos.listRepos()
    assert.equal(list.length, 1)
    assert.equal(list[0].isGit, true)
    assert.equal(list[0].branch, 'main')

    const payload = await repos.describeRepo(repo)
    assert.equal(payload.repo.path, repo)
    assert.equal(payload.repo.branch, 'main')
    assert.equal(payload.repo.isGit, true)
    assert.equal(payload.branches.some(branch => branch.name === 'main' && branch.isHead), true)
    assert.equal(payload.commits.length >= 2, true)
    assert.equal(payload.lastCommit.subject, 'second commit')
    assert.equal(payload.lastCommit.stats.additions, 1)
    assert.equal(typeof payload.laneCount, 'number')
    assert.equal(Array.isArray(payload.edges), true)
    assert.equal(payload.status.clean, true)
    assert.equal(payload.settings.autoCheckpoint, true)
  } finally {
    await cleanup(repo)
  }
})

test('repo service refuses paths outside the allowlist', async () => {
  const repo = await makeRepo()
  const outside = await tempDir('easygit-outside-')
  try {
    const store = await storeFor(repo)
    const repos = createRepoService({
      git: gitFace,
      state: store,
      getWorkspaces: () => [{ id: 'workspace-1', path: repo }],
      settings: () => store.settings(),
    })
    await assert.rejects(repos.resolveRepo(outside), /not a git repository|not allowed/)
  } finally {
    await cleanup(repo)
    await cleanup(outside)
  }
})

test('branch divergence is measured against the integration branch', async () => {
  const repo = await makeRepo()
  try {
    await git(repo, ['switch', '-c', 'feature/diverged'])
    await writeFile(join(repo, 'b.txt'), 'feature\n', 'utf8')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-m', 'feature commit'])
    await git(repo, ['switch', 'main'])
    await writeFile(join(repo, 'a.txt'), 'main only\n', 'utf8')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-m', 'main commit'])
    const store = await storeFor(repo)
    const repos = createRepoService({
      git: gitFace,
      state: store,
      getWorkspaces: () => [{ id: 'workspace-1', path: repo }],
      settings: () => store.settings(),
    })
    const payload = await repos.describeRepo(repo)
    assert.equal(payload.integrationBranch, 'main')
    const feature = payload.branches.find(branch => branch.name === 'feature/diverged')
    assert.equal(feature.divergence.ahead, 1)
    assert.equal(feature.divergence.behind, 1)
    const main = payload.branches.find(branch => branch.name === 'main')
    assert.deepEqual(main.divergence, { ahead: 0, behind: 0 })
  } finally {
    await cleanup(repo)
  }
})

test('repositories nested in a project folder are discovered', async () => {
  const workspace = await tempDir('easygit-scan-')
  const app = join(workspace, 'app')
  const nested = join(workspace, 'packages', 'lib')
  const ignored = join(workspace, 'node_modules', 'dep')
  try {
    for (const dir of [app, nested, ignored]) {
      await mkdir(dir, { recursive: true })
      await git(dir, ['init', '-b', 'main'])
      await git(dir, ['config', 'user.email', 'easygit@example.com'])
      await git(dir, ['config', 'user.name', 'EasyGit Test'])
      await writeFile(join(dir, 'f.txt'), 'x\n', 'utf8')
      await git(dir, ['add', '-A'])
      await git(dir, ['commit', '-m', 'init'])
    }
    const store = await storeFor(app)
    const repos = createRepoService({
      git: gitFace,
      state: store,
      getWorkspaces: () => [{ id: 'workspace-1', path: workspace }],
      settings: () => store.settings(),
    })
    const found = await repos.scanForRepos(workspace)
    const paths = found.map(item => item.path.replace(/\\/g, '/'))
    assert.equal(paths.length, 2)
    assert.equal(paths.some(path => path.endsWith('/app')), true)
    assert.equal(paths.some(path => path.endsWith('packages/lib')), true)
    assert.equal(paths.some(path => path.includes('node_modules')), false)
    assert.equal(found.find(item => item.path.endsWith('/app')).branch, 'main')
  } finally {
    await cleanup(workspace)
  }
})

test('untracked secret-looking files are reported as excluded', async () => {
  const repo = await makeRepo()
  try {
    const store = await storeFor(repo)
    await writeFile(join(repo, 'a.txt'), 'changed\n', 'utf8')
    await writeFile(join(repo, 'credentials.json'), '{"token":"secret"}\n', 'utf8')
    const result = await performCheckpoint({ git: gitFace, repo, settings: store.settings(), trigger: 'test' })
    assert.equal(result.committed.includes('credentials.json'), false)
    assert.equal(result.excluded.includes('credentials.json'), true)
  } finally {
    await cleanup(repo)
  }
})
