/**
 * EasyGit host half.
 *
 * Wiring: durable state -> git face -> repository allowlist/read model ->
 * explainer -> agent tools -> system-prompt section -> `/easygit` routes ->
 * team-task branch/worktree automation. The browser half is `./client`.
 *
 * Export shape: a function plugin (`name` / `inject` / `apply`), no default.
 *
 * @module @local/easygit
 */

import { normalizeConfig } from './lib/host/config.js'
import { createGit } from './lib/host/git.js'
import { StateStore } from './lib/host/state.js'
import { createRepoService } from './lib/host/repo.js'
import { createExplainer } from './lib/host/explain.js'
import { createTeamAutomation } from './lib/host/tasks.js'
import { registerRoutes } from './lib/host/routes.js'
import { registerEasyGitTools } from './lib/host/tools.js'

/** Cordis plugin name. */
export const name = 'easygit'

/** Required host services. Everything else degrades gracefully when absent. */
export const inject = ['tools']

/** Keep the model-facing section short: it is mounted in every session. */
const PROMPT_SECTION = [
  '# EasyGit',
  'This profile mounts EasyGit, a git control surface with a branch graph and automatic task branches.',
  '- A team task automatically gets a branch (prefixed `easygit/task-`); its owning teammate may be moved into a dedicated worktree. Use the current directory - it is the right checkout.',
  '- Before starting a new unit of work, call `easygit_checkpoint`. To include a new/untracked file, list it explicitly in `paths`; `easygit_checkpoint` never stages untracked files on its own.',
  '- Commit with `easygit_commit`. Push with `easygit_push` only when the user asks; never force-push.',
  '- Sensitive files (.env, keys, credentials) are refused or skipped by design. Commit them only from the EasyGit panel with the user\'s confirmation.',
  '- `easygit_status` reports the branch, worktree and task mapping; `easygit_explain` summarizes one commit.',
].join('\n')

/**
 * Mount the host half.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} config
 */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config)
  const git = createGit({ defaultTimeoutMs: resolved.gitTimeoutMs })
  const state = new StateStore()
  const repos = createRepoService({
    git,
    state,
    getWorkspaces: () => ctx.get('workspaceRegistry')?.list() ?? [],
    settings: () => state.settings(),
  })
  const explainer = createExplainer({
    ctx,
    git,
    getModel: () => state.settings().explainModel ?? null,
    explainMaxBytes: resolved.explainMaxBytes,
  })
  const host = { ctx, config: resolved, git, state, repos, explainer }
  const disposers = []

  // Kick the durable state load off immediately; every consumer awaits ready().
  void state.ready()

  // 1. Agent tools (schemas stay stable from the first request).
  try {
    disposers.push(registerEasyGitTools(ctx, host))
  } catch (error) {
    console.warn('[easygit] tool registration failed:', error instanceof Error ? error.message : String(error))
  }

  // 2. Short model-facing workflow section.
  if (resolved.promptSection) {
    try {
      const systemPrompt = ctx.get('systemPrompt')
      if (systemPrompt !== undefined && typeof systemPrompt.section === 'function') {
        disposers.push(systemPrompt.section({ name: 'easygit', order: 30, text: PROMPT_SECTION }))
      }
    } catch (error) {
      console.warn('[easygit] prompt section failed:', error instanceof Error ? error.message : String(error))
    }
  }

  // 3. Team-task automation (branches, checkpoints, worktrees, cwd switches).
  try {
    const automation = createTeamAutomation({ ctx, git, state, repos, config: resolved })
    disposers.push(automation.start())
  } catch (error) {
    console.warn('[easygit] task automation failed to start:', error instanceof Error ? error.message : String(error))
  }

  // 4. HTTP routes once the web server exists.
  ctx.inject(['webServer'], webCtx => {
    try {
      webCtx.effect(() => {
        const dispose = registerRoutes(webCtx, host)
        return dispose
      }, 'easygit: routes')
    } catch (error) {
      console.warn('[easygit] routes failed to mount:', error instanceof Error ? error.message : String(error))
    }
  })

  // 5. Own every registration above.
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }, 'easygit: host resources')
}
