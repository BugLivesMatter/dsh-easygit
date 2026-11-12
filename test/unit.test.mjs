import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, normalizeSettings, isSensitivePath, normalizeBranchPrefix, normalizeWorktreeSubdir } from '../lib/host/config.js'
import { parseStatusZ, parseRefs, parseLog, parseWorktrees, parseNumstat, parseTrack, parseRemotes } from '../lib/host/git.js'
import { buildGraph, colorIndexForBranch } from '../lib/host/graph.js'
import { taskBranchName, safeTaskId, isOpenTask, taskTitle } from '../lib/host/tasks.js'

test('sensitive path matching covers basenames and nested paths', () => {
  const patterns = ['.env', '.env.*', '*.pem', 'id_rsa*']
  assert.equal(isSensitivePath('.env', patterns), true)
  assert.equal(isSensitivePath('config/.env.local', patterns), true)
  assert.equal(isSensitivePath('certs/server.pem', patterns), true)
  assert.equal(isSensitivePath('.ssh/id_rsa', patterns), true)
  assert.equal(isSensitivePath('src/index.js', patterns), false)
  assert.equal(isSensitivePath('environment.ts', patterns), false)
})

test('settings are validated and defaults survive garbage', () => {
  const settings = normalizeSettings({
    autoBranches: 'yes',
    autoWorktrees: false,
    graphLimit: 999999,
    branchPrefix: 'team/',
    worktreeSubdir: '../escape',
    sensitivePatterns: ['*.secret'],
  })
  assert.equal(settings.autoBranches, true)
  assert.equal(settings.autoWorktrees, false)
  assert.equal(settings.graphLimit, 2000)
  assert.equal(settings.branchPrefix, 'team/')
  assert.equal(settings.worktreeSubdir, '.agents/worktrees/easygit')
  assert.deepEqual(settings.sensitivePatterns, ['*.secret'])
})

test('branch prefix and worktree subdirectory normalization', () => {
  assert.equal(normalizeBranchPrefix('easygit'), 'easygit/')
  assert.equal(normalizeBranchPrefix(''), '')
  assert.equal(normalizeBranchPrefix('bad prefix'), 'easygit/')
  assert.equal(normalizeWorktreeSubdir('.agents/worktrees/easygit/'), '.agents/worktrees/easygit')
  assert.equal(normalizeWorktreeSubdir('../x'), '.agents/worktrees/easygit')
})

test('row config keeps host switches', () => {
  const config = normalizeConfig({ promptSection: false, pollMs: 1, explainMaxBytes: 1, gitTimeoutMs: 1 })
  assert.equal(config.promptSection, false)
  assert.equal(config.pollMs, 2000)
  assert.equal(config.explainMaxBytes, 8192)
  assert.equal(config.gitTimeoutMs, 3000)
})

test('status parser handles modified, untracked and rename records', () => {
  const raw = ' M src/a.js\0?? new.txt\0R  new-name.js\0old-name.js\0'
  const files = parseStatusZ(raw)
  assert.equal(files.length, 3)
  assert.equal(files[0].path, 'src/a.js')
  assert.equal(files[0].tracked, undefined)
  assert.equal(files[0].untracked, false)
  assert.equal(files[0].unstaged, true)
  assert.equal(files[1].untracked, true)
  assert.equal(files[2].renamed, true)
  assert.equal(files[2].originalPath, 'old-name.js')
})

test('refs parser extracts branch, upstream and tracking', () => {
  const raw = [
    'refs/heads/main\x1fabc\x1f\x1finitial\x1forigin/main\x1f[ahead 2, behind 1]\x1f*',
    'refs/remotes/origin/main\x1fabc\x1f\x1finitial\x1f\x1f\x1f ',
    'refs/tags/v1\x1fdef\x1fabc\x1ftag\x1f\x1f\x1f ',
  ].join('\n')
  const refs = parseRefs(raw)
  const mainBranch = refs.find(ref => ref.name === 'main')
  assert.equal(mainBranch.type, 'branch')
  assert.equal(mainBranch.ahead, 2)
  assert.equal(mainBranch.behind, 1)
  assert.equal(mainBranch.isHead, true)
  assert.equal(mainBranch.upstream, 'origin/main')
  const remote = refs.find(ref => ref.name === 'origin/main')
  assert.equal(remote.type, 'remote')
  const tag = refs.find(ref => ref.name === 'v1')
  assert.equal(tag.type, 'tag')
  assert.equal(tag.hash, 'abc')
  assert.deepEqual(parseTrack('[gone]'), { ahead: 0, behind: 0, gone: true })
})

test('log parser splits NUL records and US fields', () => {
  const raw = 'abc\x1fdef xyz\x1fAlice\x1fa@b.c\x1f1700000000\x1fSubject one\0def\x1f\x1fBob\x1fb@b.c\x1f1700000001\x1fSubject two\0'
  const commits = parseLog(raw)
  assert.equal(commits.length, 2)
  assert.deepEqual(commits[0].parents, ['def', 'xyz'])
  assert.equal(commits[0].subject, 'Subject one')
  assert.equal(commits[1].parents.length, 0)
})

test('worktree parser and numstat parser', () => {
  const worktrees = parseWorktrees('worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/wt\nHEAD def\nbranch refs/heads/easygit/task-1\n')
  assert.equal(worktrees.length, 2)
  assert.equal(worktrees[0].path, '/repo')
  assert.equal(worktrees[1].branch, 'easygit/task-1')
  const files = parseNumstat('3\t1\tsrc/a.js\n-\t-\timage.png\n')
  assert.equal(files.length, 2)
  assert.equal(files[0].additions, 3)
  assert.equal(files[1].binary, true)
})

test('remote parser deduplicates fetch and push', () => {
  const remotes = parseRemotes('origin https://github.com/a/b.git (fetch)\norigin https://github.com/a/b.git (push)\n')
  assert.equal(remotes.length, 1)
  assert.equal(remotes[0].name, 'origin')
})

test('graph anchors lanes to branches with the integration branch centred', () => {
  const commits = [
    { hash: 'm', parents: ['a', 'b'], author: 'M', email: '', time: 4, subject: 'merge' },
    { hash: 'a', parents: ['root'], author: 'A', email: '', time: 3, subject: 'a' },
    { hash: 'b', parents: ['root'], author: 'B', email: '', time: 2, subject: 'b' },
    { hash: 'root', parents: [], author: 'R', email: '', time: 1, subject: 'root' },
  ]
  const refs = [
    { name: 'main', type: 'branch', hash: 'm', isHead: true },
    { name: 'feature/x', type: 'branch', hash: 'b', isHead: false },
  ]
  const graph = buildGraph(commits, refs)
  assert.equal(graph.rows.length, 4)
  assert.equal(graph.mainBranch, 'main')
  assert.equal(graph.laneCount, 2)
  assert.equal(graph.mainCol, 1)
  const row = hash => graph.rows.find(item => item.hash === hash)
  assert.equal(row('m').col, 1)
  assert.equal(row('a').col, 1)
  assert.equal(row('root').col, 1)
  assert.equal(row('b').col, 0)
  assert.notEqual(row('b').color, row('m').color)
  const mergeEdges = graph.edges.filter(edge => edge.fromRow === row('m').row)
  assert.equal(mergeEdges.length, 2)
  assert.deepEqual(mergeEdges.map(edge => edge.toCol).sort(), [0, 1])

  // Reordering the refs or checking out another branch must not move lanes.
  const swapped = buildGraph(commits, [
    { name: 'feature/x', type: 'branch', hash: 'b', isHead: true },
    { name: 'main', type: 'branch', hash: 'm', isHead: false },
  ])
  assert.equal(swapped.mainCol, graph.mainCol)
  assert.equal(swapped.rows.find(item => item.hash === 'b').col, 0)
  assert.equal(swapped.rows.find(item => item.hash === 'm').col, 1)
})

test('every branch keeps its own column when the integration branch advances', () => {
  const commits = [
    { hash: 'n', parents: ['m'], author: 'N', email: '', time: 6, subject: 'main moves' },
    { hash: 'm', parents: ['r'], author: 'M', email: '', time: 5, subject: 'base' },
    { hash: 'f2', parents: ['f1'], author: 'F', email: '', time: 4, subject: 'feature 2' },
    { hash: 'f1', parents: ['m'], author: 'F', email: '', time: 3, subject: 'feature 1' },
    { hash: 'r', parents: [], author: 'R', email: '', time: 1, subject: 'root' },
  ]
  const refs = [
    { name: 'main', type: 'branch', hash: 'n', isHead: true },
    { name: 'feature/deep', type: 'branch', hash: 'f2', isHead: false },
    { name: 'feature/other', type: 'branch', hash: 'm', isHead: false },
  ]
  const graph = buildGraph(commits, refs)
  const row = hash => graph.rows.find(item => item.hash === hash)
  assert.equal(row('n').col, graph.mainCol)
  assert.equal(row('m').col, graph.mainCol)
  assert.equal(row('r').col, graph.mainCol)
  assert.equal(row('f1').col, row('f2').col)
  assert.notEqual(row('f2').col, graph.mainCol)
  assert.equal(graph.laneCount, 3)
})

test('task branch naming is stable and collision-safe', () => {
  assert.equal(taskBranchName('easygit/', '1', 'team-abc'), 'easygit/task-1')
  assert.match(taskBranchName('easygit/', '1', 'team-abcdef', 1), /task-1-/)
  assert.equal(safeTaskId('1/../x'), '1-..-x')
  assert.equal(isOpenTask({ status: 'pending' }), true)
  assert.equal(isOpenTask({ status: 'completed' }), false)
  assert.equal(taskTitle({ subject: 'Do it' }), 'Do it')
  assert.equal(taskTitle({ title: 'Fallback' }), 'Fallback')
})
