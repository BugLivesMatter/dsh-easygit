import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/**
 * A tiny React stand-in: createElement builds plain trees, hooks return planned
 * initial values, and a recursive walker executes every function component once.
 * This catches prop-shape and null-dereference bugs without a browser.
 */
function makeReact(plan) {
  let index = 0
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props || {}),
          ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }),
        },
        children,
      }
    },
    useState(initial) {
      const value = index < plan.length ? plan[index] : initial
      index += 1
      return [value, () => {}]
    },
    useRef(initial) {
      return { current: initial }
    },
    useCallback(fn) {
      return fn
    },
    useMemo(fn) {
      return fn()
    },
    useEffect() {},
    useLayoutEffect() {},
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
    Component: class Component {
      constructor(props) {
        this.props = props
      }
    },
  }
  return React
}

function renderNode(node, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) renderNode(child, depth + 1)
    return
  }
  if (depth > 40) return
  if (typeof node.type === 'function') {
    renderNode(node.type(node.props), depth + 1)
    return
  }
  for (const child of node.children || []) renderNode(child, depth + 1)
}

function loadClient() {
  const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let captured
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => Promise.reject(new Error('fetch is unavailable in this smoke test')),
    AbortSignal,
    URL,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    WeakMap,
    Symbol,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { language: 'en-US' },
    document: { documentElement: { lang: 'en' } },
    window: {
      __ModuleLoader__: {
        load(definition) {
          captured = definition
        },
      },
    },
  }
  createContext(sandbox)
  runInContext(code, sandbox)
  assert.ok(captured, 'client factory was registered')
  return captured
}

function mountClient(plan) {
  const captured = loadClient()
  let index = 0
  const React = makeReact(plan)
  // The fake hook index is shared by every component rendered below.
  const module = captured.factory(name => {
    if (name === 'react') return React
    throw new Error(`unexpected require(${name})`)
  })
  const components = new Map()
  const disposers = []
  const ctx = {
    slots: {
      inject(_key, callback) {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(options, component) {
        components.set(`${options.name}:${options.key ?? options.id ?? ''}`, component)
        return () => {}
      },
    },
    sidebarRightTabs: {
      register() {
        return () => {}
      },
    },
    effect(callback) {
      const dispose = callback()
      disposers.push(typeof dispose === 'function' ? dispose : () => {})
    },
    get() {
      return undefined
    },
  }
  module.apply(ctx)
  return { components, disposers }
}

const FILE = {
  path: 'a.txt',
  index: ' ',
  worktree: 'M',
  staged: false,
  unstaged: true,
  untracked: false,
  deleted: false,
  renamed: false,
  tracked: true,
  sensitive: false,
}

const PAYLOAD = {
  repo: {
    path: '/repo',
    title: 'repo',
    isGit: true,
    branch: 'main',
    head: 'abc1234',
    detached: false,
    remoteUrl: 'https://github.com/example/repo',
    remoteName: 'origin',
    github: { cli: true, authenticated: true, login: 'tester' },
  },
  integrationBranch: 'main',
  branches: [
    {
      name: 'main',
      hash: 'abc1234',
      isHead: true,
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
      gone: false,
      subject: 'initial commit',
      time: 1700000000,
      author: 'Tester',
      color: 6,
      worktreePath: null,
      task: null,
      divergence: { ahead: 0, behind: 0 },
    },
    {
      name: 'feature/x',
      hash: 'def5678',
      isHead: false,
      upstream: null,
      ahead: 0,
      behind: 0,
      gone: false,
      subject: 'feature commit',
      time: 1700000001,
      author: 'Tester',
      color: 3,
      worktreePath: null,
      task: null,
      divergence: { ahead: 2, behind: 1 },
    },
  ],
  worktrees: [],
  commits: [
    {
      hash: 'abc1234',
      row: 0,
      lane: 0,
      color: 6,
      parents: [],
      author: 'Tester',
      email: 't@example.com',
      time: 1700000000,
      subject: 'initial commit',
      refs: [{ name: 'main', type: 'branch', isHead: true, color: 6 }],
      task: null,
    },
  ],
  edges: [],
  laneCount: 1,
  status: {
    files: [FILE],
    total: 1,
    staged: 0,
    unstaged: 1,
    untracked: 0,
    trackedChanged: 1,
    sensitive: 0,
    clean: false,
  },
  lastCommit: {
    hash: 'abc1234',
    author: 'Tester',
    email: 't@example.com',
    time: 1700000000,
    subject: 'initial commit',
    body: '',
    files: [{ path: 'a.txt', additions: 2, deletions: 0, binary: false }],
    filesTotal: 1,
    stats: { files: 1, additions: 2, deletions: 0 },
  },
  settings: {
    autoBranches: true,
    autoWorktrees: true,
    autoCheckpoint: true,
    branchPrefix: 'easygit/',
    worktreeSubdir: '.agents/worktrees/easygit',
    graphLimit: 300,
    sensitivePatterns: [],
    explainModel: null,
  },
  warnings: [],
  generatedAt: 0,
}

test('client Panel renders its initial state without throwing', () => {
  const { components, disposers } = mountClient([])
  assert.equal(typeof components.get('sidebar.right.pane.tab:easygit'), 'function')
  assert.equal(typeof components.get('sidebar.right.pane.tab.title:easygit'), 'function')
  const Body = components.get('sidebar.right.pane.tab:easygit')
  const boundaryElement = Body()
  assert.equal(boundaryElement.type.name, 'PanelBoundary')
  const panelElement = boundaryElement.children[0]
  assert.equal(panelElement.type.name, 'Panel')
  assert.doesNotThrow(() => {
    const tree = panelElement.type()
    assert.equal(tree.type, 'div')
    assert.equal(tree.props.className, 'eg-root')
    assert.equal(tree.children[0].type, 'style')
    assert.equal(tree.children[1].type, 'header')
  })
  for (const dispose of disposers) dispose()
})

test('client Panel renders a loaded repository payload (graph, composer, files)', () => {
  // Hook plan order: locale revision, then Panel's useState calls
  // (project, payload, loading, error, notice, busy, message, selected,
  //  allowSensitive, selectedHash, commit, explain, consentOpen,
  //  pendingExplainHash, explainBusy, settingsOpen, candidates, chosen).
  const plan = [
    0,
    { path: '/repo', title: 'repo', isGit: true, branch: 'main' },
    PAYLOAD,
    false,
    null,
    null,
    null,
    '',
    new Set(['a.txt']),
    false,
    null,
    null,
    null,
    false,
    null,
    false,
    false,
  ]
  const { components, disposers } = mountClient(plan)
  const Body = components.get('sidebar.right.pane.tab:easygit')
  const boundaryElement = Body({ sessionId: 'session-test' })
  const panelElement = boundaryElement.children[0]
  assert.doesNotThrow(() => {
    renderNode(panelElement.type())
  })
  for (const dispose of disposers) dispose()
})

function collectText(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node === 'object') {
    if (typeof node.type === 'function') collectText(node.type(node.props), out)
    for (const child of node.children || []) collectText(child, out)
  }
  return out
}

test('client Panel lists repositories found inside a non-git project', () => {
  const plan = [
    0,
    { path: '/workspace', title: 'workspace', isGit: false, branch: null },
    null,
    false,
    null,
    null,
    null,
    '',
    new Set(),
    false,
    null,
    null,
    null,
    false,
    null,
    false,
    false,
    [
      { path: '/workspace/playground', title: 'playground', branch: 'main', relative: 'playground' },
      { path: '/workspace/packages/app', title: 'app', branch: 'dev', relative: 'packages/app' },
    ],
    null,
  ]
  const { components, disposers } = mountClient(plan)
  const Body = components.get('sidebar.right.pane.tab:easygit')
  const boundaryElement = Body({ sessionId: 'session-test' })
  const panelElement = boundaryElement.children[0]
  const tree = panelElement.type()
  renderNode(tree)
  const text = collectText(tree).join(' ')
  assert.equal(text.includes('playground'), true)
  assert.equal(text.includes('packages/app'), true)
  assert.equal(text.includes('Repositories in this project folder'), true)
  for (const dispose of disposers) dispose()
})

test('client Panel renders a non-git project empty state', () => {
  const plan = [
    0,
    { path: '/workspace', title: 'workspace', isGit: false, branch: null },
    null,
    false,
    null,
    null,
    null,
    '',
    new Set(),
    false,
    null,
    null,
    null,
    false,
    null,
    false,
    false,
  ]
  const { components, disposers } = mountClient(plan)
  const Body = components.get('sidebar.right.pane.tab:easygit')
  const boundaryElement = Body({ sessionId: 'session-test' })
  const panelElement = boundaryElement.children[0]
  assert.doesNotThrow(() => {
    renderNode(panelElement.type())
  })
  for (const dispose of disposers) dispose()
})

function collectTags(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) collectTags(child, out)
    return out
  }
  if (typeof node === 'object') {
    if (typeof node.type === 'string') out.push(node)
    if (typeof node.type === 'function') collectTags(node.type(node.props), out)
    for (const child of node.children || []) collectTags(child, out)
  }
  return out
}

test('client Panel offers a branch-name box and a create button', () => {
  const plan = [
    0,
    { path: '/repo', title: 'repo', isGit: true, branch: 'main' },
    PAYLOAD,
    false,
    null,
    null,
    null,
    '',
    new Set(['a.txt']),
    false,
    null,
    null,
    null,
    false,
    null,
    false,
    false,
    [],
    null,
    'feature/new',
  ]
  const { components, disposers } = mountClient(plan)
  const Body = components.get('sidebar.right.pane.tab:easygit')
  const boundaryElement = Body({ sessionId: 'session-test' })
  const panelElement = boundaryElement.children[0]
  const tree = panelElement.type()
  renderNode(tree)

  const inputs = collectTags(tree).filter(node => node.type === 'input')
  const branchInput = inputs.find(node => node.props.value === 'feature/new')
  assert.ok(branchInput, 'branch name input is rendered with the typed value')
  assert.equal(typeof branchInput.props.onChange, 'function')
  assert.equal(typeof branchInput.props.onKeyDown, 'function')

  const buttons = collectTags(tree).filter(node => node.type === 'button')
  const createButton = buttons.find(node => collectText(node).join(' ').includes('create'))
  assert.ok(createButton, 'create button is rendered')
  assert.equal(typeof createButton.props.onClick, 'function')
  for (const dispose of disposers) dispose()
})

// A real host payload is the strongest shape check: run this file with
// EASYGIT_LIVE_PAYLOAD=<json file containing the route's `value`>.
if (typeof process.env.EASYGIT_LIVE_PAYLOAD === 'string' && process.env.EASYGIT_LIVE_PAYLOAD.length > 0) {
  test('client Panel renders the live host state payload', () => {
    const payload = JSON.parse(readFileSync(process.env.EASYGIT_LIVE_PAYLOAD, 'utf8'))
    const files = payload.status.files || []
    const selected = new Set(files.filter(file => !file.untracked && !file.sensitive).map(file => file.path))
    const project = payload.project || {
      path: payload.repo.path,
      title: payload.repo.title,
      isGit: true,
      branch: payload.repo.branch,
    }
    const plan = [
      0,
      project,
      payload,
      false,
      null,
      null,
      null,
      '',
      selected,
      false,
      null,
      null,
      null,
      false,
      null,
      false,
      false,
    ]
    const { components, disposers } = mountClient(plan)
    const Body = components.get('sidebar.right.pane.tab:easygit')
    const boundaryElement = Body({ sessionId: 'session-live' })
    const panelElement = boundaryElement.children[0]
    assert.doesNotThrow(() => {
      renderNode(panelElement.type())
    })
    for (const dispose of disposers) dispose()
  })
}

