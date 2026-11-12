#!/usr/bin/env node
/**
 * Exercise the EasyGit branch machinery against a real repository.
 *
 * The script drives the same host modules the panel and the agent tools use,
 * so a green run means the UI would show the same behaviour. It mutates the
 * target repository (checkpoints, a temporary branch, a temporary worktree),
 * which is why the target must be the disposable playground created by
 * `scripts/playground-setup.sh`.
 *
 * Usage:
 *   node scripts/verify-branches.mjs <repo-path> [--report <file>]
 */
import { createGit } from '../lib/host/git.js'
import { createRepoService } from '../lib/host/repo.js'
import { performCheckpoint } from '../lib/host/checkpoint.js'
import { ensureWorktree, removeWorktreeSafely } from '../lib/host/worktrees.js'
import { DEFAULT_SETTINGS } from '../lib/host/config.js'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const repoArg = args.find(arg => !arg.startsWith('--'))
const reportFlag = args.indexOf('--report')
const reportPath = reportFlag >= 0 ? args[reportFlag + 1] : undefined
if (repoArg === undefined) {
  console.error('usage: node scripts/verify-branches.mjs <repo-path> [--report <file>]')
  process.exit(2)
}
const repo = resolve(repoArg)

const git = createGit()
const settings = DEFAULT_SETTINGS
const state = {
  data: { repos: {} },
  settings: () => settings,
  addedRepos: () => [],
  taskByBranch: () => undefined,
}
const repos = createRepoService({
  git,
  state,
  getWorkspaces: () => [{ id: 'playground', title: 'easygit-playground', path: repo }],
  settings: () => settings,
})

const results = []
let failed = 0
function check(name, condition, detail) {
  const ok = Boolean(condition)
  if (!ok) failed += 1
  results.push({ name, ok, detail: detail === undefined ? '' : String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}
function section(title) {
  results.push({ section: title })
  console.log(`\n## ${title}`)
}

const FILE = 'src/format.js'
const ENV_FILE = 'credentials.json'

// ---------------------------------------------------------------- repository
section('Repository discovery')
const detected = await repos.detect(repo)
check('detect: is a git work tree', detected.isGit)
check('detect: primary checkout resolved', typeof detected.primary === 'string', detected.primary)
check('detect: current branch is main', detected.branch === 'main', detected.branch)
check('detect: no remote configured', detected.remote === undefined, detected.remote?.url ?? 'none')

let payload = await repos.describeRepo(repo)
section('Branch model')
check('repo payload built', payload.repo?.isGit === true)
check('branch count is 5', payload.branches.length === 5, payload.branches.map(branch => branch.name).join(', '))
const names = payload.branches.map(branch => branch.name)
for (const expected of ['main', 'feature/lane-colors', 'feature/graph-tooltip', 'fix/status-parse', 'easygit/task-a1b2c3']) {
  check(`branch present: ${expected}`, names.includes(expected))
}
check('head branch listed first', payload.branches[0].isHead === true, payload.branches[0].name)
check('open branches diverge from the integration branch', payload.branches.filter(branch => !branch.isHead && (branch.divergence?.ahead ?? 0) >= 1).length >= 3, payload.branches.map(branch => `${branch.name}:+${branch.divergence?.ahead ?? 0}`).join(' '))
check('integration branch detected', payload.integrationBranch === 'main', payload.integrationBranch)
check('merged branch reports ahead 0', payload.branches.find(branch => branch.name === 'feature/lane-colors')?.ahead === 0)
check('agent task branch has task metadata slot', 'task' in payload.branches.find(branch => branch.name === 'easygit/task-a1b2c3'))

section('Graph layout')
check('graph rows emitted', payload.commits.length >= 8, `${payload.commits.length} rows`)
check('graph uses at least 2 lanes', payload.laneCount >= 2, `${payload.laneCount} lanes`)
check('graph edges connect parents', payload.edges.length >= 7, `${payload.edges.length} edges`)
const mergeRow = payload.commits.find(row => Array.isArray(row.parents) && row.parents.length === 2)
check('merge commit present', mergeRow !== undefined, mergeRow?.subject)
const mergeIndex = payload.commits.indexOf(mergeRow)
check('merge commit forks into two lanes', payload.edges.filter(edge => edge.fromRow === mergeIndex).length === 2, `${payload.edges.filter(edge => edge.fromRow === mergeIndex).length} outgoing edges`)
check('every row has a lane index', payload.commits.every(row => Number.isInteger(row.lane)))
check('ref chips rendered on a row', payload.commits.some(row => (row.refs ?? []).length > 0))
check('every row has a visual column', payload.commits.every(row => Number.isInteger(row.col)))
check('integration branch detected in the layout', payload.mainBranch === 'main', payload.mainBranch)
const mainCol = payload.mainCol
check('main owns a centre column', Number.isInteger(mainCol) && mainCol > 0 && mainCol < payload.laneCount - 1, `col ${mainCol} of ${payload.laneCount}`)
const tipCols = payload.branches.map(branch => payload.commits.find(row => row.hash === branch.hash)?.col)
check('every branch tip has its own column', new Set(tipCols).size === payload.branches.length, tipCols.join(','))
const mainRow = payload.commits.find(row => (row.refs ?? []).some(ref => ref.name === 'main' && ref.type === 'branch'))
check('main tip drawn in the centre column', mainRow?.col === mainCol, `col ${mainRow?.col}`)
const mergeRows = payload.commits.filter(row => row.parents.length > 1)
check('merge commits stay on the integration spine', mergeRows.every(row => row.col === mainCol), mergeRows.map(row => row.col).join(','))

// --------------------------------------------------------------- checkpoints
section('Checkpoint safety')
await writeFile(join(repo, FILE), `${await readFile(join(repo, FILE), 'utf8')}\nexport const FORMAT_VERSION = 2\n`)
await writeFile(join(repo, ENV_FILE), 'SECRET=do-not-commit\n')
const auto = await performCheckpoint({ git, repo, settings, trigger: 'test auto' })
check('tracked change committed', auto.noop === false)
check('commit includes tracked file', auto.committed.includes(FILE), auto.committed.join(', '))
check('sensitive untracked file excluded', auto.excluded.includes(ENV_FILE), auto.excluded.join(', '))
const statusAfterAuto = await git.status(repo)
check('sensitive file still untracked', statusAfterAuto.some(file => file.path === ENV_FILE && file.untracked))

const explicitSensitive = await performCheckpoint({ git, repo, settings, trigger: 'test explicit', paths: [ENV_FILE] })
check('explicit sensitive path skipped', explicitSensitive.skipped.some(item => item.path === ENV_FILE), explicitSensitive.skipped.map(item => item.reason).join(', '))

await writeFile(join(repo, 'src/notes.md'), `# notes ${Date.now()}\n`)
const explicitOk = await performCheckpoint({ git, repo, settings, trigger: 'test explicit', paths: ['src/notes.md'] })
check('explicit untracked path committed', explicitOk.noop === false && explicitOk.committed.includes('src/notes.md'))

// ------------------------------------------------------------------- branches
section('Branch creation and checkout')
const newBranch = 'test/from-easygit'
check('branch name validated', await git.isValidBranchName(repo, newBranch))
await git.createBranch(repo, newBranch, 'main')
check('branch created', await git.branchExists(repo, newBranch))
payload = await repos.describeRepo(repo)
check('new branch appears in model', payload.branches.some(branch => branch.name === newBranch))
check('new branch starts level with main', payload.branches.find(branch => branch.name === newBranch)?.ahead === 0)
await git.checkout(repo, newBranch)
check('checkout switched HEAD', (await git.currentBranch(repo)) === newBranch)
check('payload follows HEAD', (await repos.describeRepo(repo)).repo.branch === newBranch)
await git.checkout(repo, 'main')
check('checkout back to main', (await git.currentBranch(repo)) === 'main')

// ------------------------------------------------------------------ worktrees
section('Task worktree')
const worktree = await ensureWorktree({
  git,
  repoRoot: repo,
  branch: 'easygit/task-a1b2c3',
  subdir: settings.worktreeSubdir,
  createBranch: false,
})
check('worktree created', worktree.created === true, worktree.path)
check('worktree is inside the pool', worktree.path.includes('.agents/worktrees'), worktree.path)
const worktreeBranch = await git.currentBranch(worktree.path)
check('worktree checked out on task branch', worktreeBranch === 'easygit/task-a1b2c3', worktreeBranch)
const headBefore = await git.head(repo)
const taskHeadBefore = (await git.run(worktree.path, ['rev-parse', 'easygit/task-a1b2c3'])).stdout.trim()
const taskFile = `src/task-notes-${Date.now()}.md`
await writeFile(join(worktree.path, taskFile), '# task work\n')
await git.commitPaths(worktree.path, [taskFile], 'chore(task): note the agent worktree')
const taskHeadAfter = (await git.run(repo, ['rev-parse', 'easygit/task-a1b2c3'])).stdout.trim()
check('commit in worktree advanced the branch', taskHeadAfter !== taskHeadBefore, `${taskHeadBefore.slice(0, 7)} -> ${taskHeadAfter.slice(0, 7)}`)
check('primary checkout HEAD unchanged', (await git.head(repo)) === headBefore)
const worktrees = await git.worktrees(repo)
check('worktree registered', worktrees.some(item => item.path.replace(/\\/g, '/') === worktree.path))
check('worktree reported in payload', (await repos.describeRepo(repo)).worktrees.some(item => item.branch === 'easygit/task-a1b2c3'))
await removeWorktreeSafely({ git, repoRoot: repo, path: worktree.path })
check('clean worktree removed', !(await git.worktrees(repo)).some(item => item.path.replace(/\\/g, '/') === worktree.path))

// ---------------------------------------------------------------------- push
section('Push and last commit')
const push = await git.push(repo, 'origin', 'main')
check('push without remote fails cleanly', push.ok === false, (push.stderr || 'no remote').slice(0, 120))
const singleParentRow = payload.commits.find(row => Array.isArray(row.parents) && row.parents.length === 1)
const details = await git.commitDetails(repo, singleParentRow.hash)
check('commit details readable', details.hash === singleParentRow.hash && details.stats.files >= 1, `${details.stats.files} files`)
check('patch text captured', details.patch.length > 0)

// -------------------------------------------------------------- cleanup pass
await rm(join(repo, ENV_FILE), { force: true })
await git.run(repo, ['branch', '-D', newBranch])

section('Summary')
const passed = results.filter(item => item.ok === true).length
const total = results.filter(item => typeof item.ok === 'boolean').length
console.log(`\n${passed}/${total} checks passed`)

if (reportPath !== undefined) {
  const lines = [`# EasyGit branch verification`, '', `Repository: \`${repo}\``, `Generated: ${new Date().toISOString()}`, '', `Result: **${passed}/${total} checks passed**`, '']
  for (const item of results) {
    if (item.section !== undefined) lines.push('', `## ${item.section}`)
    else lines.push(`- ${item.ok ? 'PASS' : 'FAIL'} — ${item.name}${item.detail ? ` (${item.detail})` : ''}`)
  }
  await mkdir(resolve(reportPath, '..'), { recursive: true })
  await writeFile(reportPath, `${lines.join('\n')}\n`)
  console.log(`report written: ${reportPath}`)
}

process.exit(failed === 0 ? 0 : 1)
