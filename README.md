# EasyGit

[![test](https://github.com/BugLivesMatter/dsh-easygit/actions/workflows/test.yml/badge.svg)](https://github.com/BugLivesMatter/dsh-easygit/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](https://nodejs.org)

A DeepSeek Harness Web GUI plugin: a GitLens-style branch graph **in the right
sidebar**, with automatic branches and worktrees for Agent Teams tasks, safe
checkpoints, quick commits, GitHub push, and model explanations of a commit.

No dependencies. The host half is plain ESM; the browser half is a single
bundle served by the Loader.

## Install

Requirements:

- a DSH build with `plugin_manager` and client `slot` support (this plugin
  declares `dsh.bundle.patch` + `dsh.client`);
- Node.js 22 or newer for development and tests;
- `git` on `PATH` (the plugin shells out to it).

Clone, then install the bundle from that checkout:

```bash
git clone https://github.com/BugLivesMatter/dsh-easygit.git
```

```
plugin_manager action=install_bundle target="<absolute path>/dsh-easygit"
```

The result must report `application: applied`. If you prefer a manual row, add
it to a Cordis composition:

```yaml
- id: easygit
  name: '@local/easygit'
  config:
    autoBranches: true
    autoWorktrees: true
    autoCheckpoint: true
    branchPrefix: easygit/
    graphLimit: 300
    promptSection: true
```

Disable it from Settings → Plugins (or `plugin_manager action=set_plugin`) to
remove the panel, the tools and the `/easygit` routes.

## Quick start

Open the right sidebar's **Start** guide, click `＋` in the tab strip and pick
**EasyGit**. The panel stacks its sections vertically to fit the sidebar width.

There is no folder picker: the panel always uses the **project folder** of the
current session (the DSH workspace, or a git repository at the session cwd). If
that folder is a repository, its graph opens directly. If the folder is not a
repository, EasyGit lists the repositories found inside it (two levels deep,
dependency folders skipped) and opens one with a click; only a folder with no
repository at all offers **Initialize git repository**.

## What it does

- **Branch graph** — commit DAG with lanes, curved merge edges, stable branch
  colours, HEAD marker, task badges, worktree markers and a branch rail. Each
  branch shows how far it diverged from the integration branch (`↑2 vs main`),
  because a local branch usually has no upstream. Lanes are anchored to branches:
  the integration branch owns the centre column and every other branch keeps its
  own column and colour, so switching the checked-out branch never reshuffles
  the graph.
- **Task branches** — every `team/task` event creates `easygit/task-<id>` for the
  task's repository. A checkpoint of tracked changes is taken first.
- **Task worktrees** — when a task has an owner, the owner gets
  `<repo>/.agents/worktrees/easygit/<branch>` and its working directory is
  switched there, so parallel task branches are real.
- **Safe commits** — tracked files only on automatic checkpoints. Untracked
  files require explicit paths. `.env`, keys, `credentials*` and similar paths
  are excluded unless the user explicitly allows them from the panel.
- **Last commit block** — subject, author, per-file +/- statistics, **Explain**
  and **Push** buttons.
- **Explain** — one bounded model call over the commit patch; the first use asks
  for consent because the patch leaves the machine.
- **Push** — `git push` to the configured remote (never force); GitHub CLI is
  used only to report login state.

## Playground and branch verification

`scripts/playground-setup.sh` creates a disposable repository with a realistic
history: `main`, a merged `feature/lane-colors`, open `feature/graph-tooltip`
and `fix/status-parse` branches, and an `easygit/task-a1b2c3` task branch.

```bash
bash scripts/playground-setup.sh ../easygit-playground --force
node scripts/verify-branches.mjs ../easygit-playground --report docs/branch-verification.md
```

The verifier drives the same host modules the panel uses and checks repository
discovery, branch model, graph layout, checkpoint safety (including secret
filtering), branch creation/checkout, task worktrees, push failure without a
remote, and commit details. It is safe to run twice. A sample run
(`53/53 checks passed`) is committed as
[`docs/branch-verification.md`](./docs/branch-verification.md); it is
regenerated output, not hand-written.

## Host API (`/easygit/*`)

| Route | Purpose |
|---|---|
| `GET /repos` | Workspace repositories plus explicitly added folders (diagnostics; the panel uses the project folder) |
| `GET /state?session=` | State for the repository of one session's project folder |
| `GET /state?repo=` | State for an explicit repository |
| `GET /commit?repo=&hash=` | Commit details and patch |
| `POST /commit` | `{repo, message, paths?, allowSensitive?}` |
| `POST /checkpoint` | Same core without a required message |
| `POST /branch` | `{repo, name, from?}` |
| `POST /switch` | `{repo, name, checkpoint?}` |
| `POST /push` | `{repo, branch?}` |
| `POST /explain` | `{repo, hash?}` |
| `POST /init`, `POST /repos/add`, `POST /repos/remove`, `POST /pick` | Repository management |
| `POST /settings` | Persist EasyGit settings |
| `POST /worktree/remove` | Remove a clean task worktree |

## Agent tools

`easygit_status`, `easygit_checkpoint`, `easygit_commit`, `easygit_branch`,
`easygit_push`, `easygit_explain`. They call the same core as the panel, so the
panel and the agent can never diverge on safety rules.

## Safety rules

1. Automatic checkpoints run `git add -u`: tracked files only.
2. New files enter a commit only when a path list names them.
3. Sensitive-looking paths are skipped automatically and refused from agent
   commits. Only the panel can include them, after confirmation.
4. Push never uses `--force`; git runs non-interactively
   (`GIT_TERMINAL_PROMPT=0`).
5. Agents can reach only workspace roots and folders the user added.

## Configuration

The plugin row accepts plain config fields; defaults are safe:

```yaml
- id: easygit
  name: '@local/easygit'
  config:
    autoBranches: true
    autoWorktrees: true
    autoCheckpoint: true
    branchPrefix: easygit/
    graphLimit: 300
    promptSection: true
```

Runtime settings (toggles, branch prefix, added folders, task mapping) live in
`~/.dsh/easygit/state.json` and are editable from the panel.

## Architecture

| Path | Responsibility |
|---|---|
| `index.js` | Host entry: state → git → repos → explainer → tools → prompt section → routes → team automation |
| `lib/host/git.js` | Non-interactive git wrapper (timeouts, no prompts) |
| `lib/host/checkpoint.js` | Checkpoint/commit core and sensitive-path filter |
| `lib/host/repo.js` | Repository discovery and read model |
| `lib/host/graph.js` | Lane layout and merge edges for the DAG |
| `lib/host/worktrees.js` | Task worktree create/remove |
| `lib/host/tasks.js` | `team/task` automation (branch, checkpoint, worktree) |
| `lib/host/routes.js` | `/easygit/*` HTTP surface |
| `lib/host/tools.js` | Agent tool registration |
| `lib/host/state.js` | Durable settings and task mapping |
| `client.js` | Browser half: sidebar panel, graph rendering, actions |

## Development

```bash
cd dsh-easygit
node --test
node --check index.js && node --check client.js
```

Tests use real temporary repositories, a local bare remote, and stub DSH
services; no dependency installation is required. CI runs the same commands on
Linux with Node 22 and 24.

## Compatibility

- Tested against the DSH Web GUI of the release this plugin was developed on.
- Branch-graph behaviour depends on public plugin surfaces only
  (`dsh.bundle.patch`, `dsh.client`, `ctx.theme`-free host services); a DSH
  release that renames host service ids would need `index.js` wiring rechecked.
- Windows, macOS and Linux: git is the only platform dependency.

## License

MIT — see [LICENSE](./LICENSE). Русская версия: [README.ru.md](./README.ru.md).
