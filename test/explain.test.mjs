import test from 'node:test'
import assert from 'node:assert/strict'
import { createExplainer } from '../lib/host/explain.js'

function fakeGit() {
  return {
    async commitDetails(repo, hash) {
      return {
        hash,
        author: 'Alice',
        email: 'a@example.com',
        time: 1700000000,
        subject: 'Fix the graph',
        body: 'Why it changed.',
        files: [{ path: 'src/a.js', additions: 3, deletions: 1, binary: false }],
        stats: { files: 1, additions: 3, deletions: 1 },
        patch: 'diff --git a/src/a.js b/src/a.js\n+hello\n-world\n',
        truncated: false,
      }
    },
  }
}

test('explain streams text and caches the result', async () => {
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'llm') {
        return {
          stream(options) {
            calls.push(options)
            return (async function* () {
              yield { type: 'text-delta', text: 'First ' }
              yield { type: 'text-delta', text: 'answer.' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            })()
          },
        }
      }
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-flash' }) }
      return undefined
    },
  }
  const explainer = createExplainer({ ctx, git: fakeGit(), getModel: () => null })
  const first = await explainer.explain('/repo', 'abcdef1234')
  assert.equal(first.text, 'First answer.')
  assert.equal(first.model.provider, 'deepseek')
  assert.equal(first.cached, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].provider, 'deepseek')
  assert.match(calls[0].messages[0].content[0].text, /Patch:/)

  const second = await explainer.explain('/repo', 'abcdef1234')
  assert.equal(second.cached, true)
  assert.equal(calls.length, 1)
})

test('explain reports a missing model instead of crashing', async () => {
  const ctx = {
    get(name) {
      if (name === 'llm') return { stream() { throw new Error('should not be called') } }
      return undefined
    },
  }
  const explainer = createExplainer({ ctx, git: fakeGit(), getModel: () => null })
  await assert.rejects(explainer.explain('/repo', 'abcdef'), error => error.code === 'no-model')
})

test('explain surfaces a model failure finish chunk', async () => {
  const ctx = {
    get(name) {
      if (name === 'llm') {
        return {
          stream() {
            return (async function* () {
              yield { type: 'finish', reason: { kind: 'error', failure: { message: 'quota exceeded', code: 'quota' } } }
            })()
          },
        }
      }
      return undefined
    },
  }
  const explainer = createExplainer({
    ctx,
    git: fakeGit(),
    getModel: () => ({ provider: 'deepseek', model: 'deepseek-flash' }),
  })
  await assert.rejects(explainer.explain('/repo', 'abcdef'), /quota exceeded/)
})
