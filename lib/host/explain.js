/**
 * "Explain" for one commit: one bounded model call over the commit patch.
 *
 * The panel asks before the first use because a patch may contain secrets or
 * proprietary code; the host itself never sends anything unless the user
 * pressed the button (or an agent explicitly called `easygit_explain`).
 *
 * @module @local/easygit/host/explain
 */

/** Cache lifetime for explanations. */
const CACHE_TTL_MS = 60 * 60 * 1000

/** Hard cap for one explanation call. */
const CALL_TIMEOUT_MS = 60000

/** Prompt limit for the patch text. */
const PROMPT_PATCH_LIMIT = 48 * 1024

/** Build the system prompt. */
const SYSTEM_PROMPT = [
  'You are a senior engineer explaining one git commit to a teammate.',
  'Answer in the language of the commit subject when it is clearly Russian, otherwise answer in English.',
  'Structure the answer in three short paragraphs without a heading: what changed, why it matters, what to watch for.',
  'Mention concrete files or symbols only when the patch shows them; never invent paths.',
  'Keep the whole answer under 220 words.',
].join(' ')

/**
 * Build the explainer.
 * @param {{
 *   ctx: { get: (name: string) => any }
 *   git: ReturnType<import('./git.js').createGit>
 *   getModel: () => { provider: string; model: string; reasoningEffort?: string } | null
 *   explainMaxBytes?: number
 * }} options
 */
export function createExplainer(options) {
  const { ctx, git, getModel } = options
  const maxBytes = options.explainMaxBytes ?? 96 * 1024
  /** @type {Map<string, {at: number; value: object}>} */
  const cache = new Map()

  /** Resolve the model route for one explanation. */
  function resolveModel(override) {
    if (override !== null && typeof override === 'object' && typeof override.provider === 'string' && typeof override.model === 'string') {
      return { provider: override.provider, model: override.model }
    }
    const configured = getModel()
    if (configured !== null && configured !== undefined && typeof configured.provider === 'string' && typeof configured.model === 'string') {
      return { provider: configured.provider, model: configured.model }
    }
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection()
      if (selection !== null && typeof selection === 'object' && typeof selection.provider === 'string' && typeof selection.model === 'string') {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      /* no selection */
    }
    return null
  }

  /**
   * Explain one commit.
   * @param {string} repo
   * @param {string} hash
   * @param {{ provider?: string; model?: string }} [override]
   */
  async function explain(repo, hash, override) {
    const key = `${repo}::${hash}`
    const cached = cache.get(key)
    if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ...cached.value, cached: true }
    }
    const llm = ctx.get('llm')
    if (llm === undefined || typeof llm.stream !== 'function') {
      const error = new Error('EasyGit: the model runtime is not available in this profile')
      error.code = 'no-llm'
      throw error
    }
    const model = resolveModel(override)
    if (model === null) {
      const error = new Error('EasyGit: configure a default model (or set explainModel) before using Explain')
      error.code = 'no-model'
      throw error
    }
    const details = await git.commitDetails(repo, hash, maxBytes)
    const patch = details.patch.length > PROMPT_PATCH_LIMIT ? `${details.patch.slice(0, PROMPT_PATCH_LIMIT)}\n[patch truncated]` : details.patch
    const userText = [
      `Repository: ${repo}`,
      `Commit: ${details.hash}`,
      `Author: ${details.author} <${details.email}>`,
      `Date: ${new Date(details.time * 1000).toISOString()}`,
      `Subject: ${details.subject}`,
      details.body.length > 0 ? `Body:\n${details.body}` : '',
      `Changed files: ${details.stats.files} (+${details.stats.additions}/-${details.stats.deletions})`,
      details.files.length > 0
        ? details.files.slice(0, 80).map(file => `- ${file.path} (+${file.additions}/-${file.deletions})`).join('\n')
        : '- (no file statistics)',
      '',
      'Patch:',
      '```diff',
      patch.length > 0 ? patch : '(patch unavailable)',
      '```',
    ]
      .filter(line => line.length > 0)
      .join('\n')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        maxTokens: 800,
        temperature: 0.2,
        signal: controller.signal,
      })
      let text = ''
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
          const message = chunk.reason.failure?.message ?? 'model request failed'
          const error = new Error(`EasyGit: Explain failed: ${message}`)
          error.code = 'explain-failed'
          throw error
        }
        if (chunk?.type === 'finish' && chunk.reason?.kind === 'aborted') {
          const error = new Error('EasyGit: Explain was interrupted')
          error.code = 'explain-aborted'
          throw error
        }
      }
      const trimmed = text.trim()
      if (trimmed.length === 0) {
        const error = new Error('EasyGit: the model returned an empty explanation')
        error.code = 'explain-empty'
        throw error
      }
      const value = { hash: details.hash, text: trimmed, model }
      cache.set(key, { at: Date.now(), value })
      return { ...value, cached: false }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Drop the cache (tests and settings changes). */
  function clearCache() {
    cache.clear()
  }

  return { explain, clearCache, resolveModel }
}
