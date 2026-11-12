#!/usr/bin/env bash
# Create a disposable git repository with a realistic branch history so the
# EasyGit graph, checkpoint and worktree flows can be exercised by hand.
#
# Usage:
#   bash scripts/playground-setup.sh [target-dir] [--force]
#
# The default target is `<workspace>/easygit-playground`, a sibling of this
# plugin, so the folder is inside the project directory the panel resolves.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET="${1:-$WORKSPACE_DIR/easygit-playground}"
FORCE="no"
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then FORCE="yes"; fi
done

if [ -e "$TARGET/.git" ] && [ "$FORCE" != "yes" ]; then
  echo "playground already exists: $TARGET"
  echo "re-create it with: bash scripts/playground-setup.sh '$TARGET' --force"
  exit 0
fi

if [ "$FORCE" = "yes" ]; then
  rm -rf "$TARGET"
fi

mkdir -p "$TARGET"
cd "$TARGET"

git init -q -b main
git config user.name "EasyGit Playground"
git config user.email "playground@easygit.local"
git config commit.gpgsign false

now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
commit() { # commit <message> <iso-date>
  git add -A
  GIT_AUTHOR_DATE="$2" GIT_COMMITTER_DATE="$2" git commit -q -m "$1"
}

cat > package.json <<'JSON'
{
  "name": "easygit-playground",
  "version": "0.1.0",
  "private": true,
  "description": "Disposable repository used to exercise the EasyGit panel",
  "type": "module",
  "scripts": {
    "start": "node src/main.js"
  }
}
JSON

cat > README.md <<'MD'
# easygit-playground

Disposable repository for exercising the EasyGit right-sidebar panel.

Branches expected after setup:

- `main` — base history with a merge commit from `feature/lane-colors`
- `feature/lane-colors` — merged, keeps a visible lane
- `feature/graph-tooltip` — open branch, one commit ahead
- `fix/status-parse` — open branch, one commit ahead
- `easygit/task-a1b2c3` — simulates an agent task branch

Run `node scripts/verify-branches.mjs <path-to-this-repo>` from the plugin to
check that branches, checkpoints and worktrees still behave.
MD

cat > .gitignore <<'GI'
node_modules/
dist/
*.log
.env
GI

mkdir -p src
cat > src/counter.js <<'JS'
/** Tiny counter used as the playground's main module. */
export function createCounter(start = 0) {
  let value = start
  return {
    get value() {
      return value
    },
    increment(by = 1) {
      value += by
      return value
    },
    reset() {
      value = start
      return value
    },
  }
}
JS

cat > src/main.js <<'JS'
import { createCounter } from './counter.js'

const counter = createCounter()
counter.increment(2)
console.log(`counter = ${counter.value}`)
JS

commit "feat: initial counter module" "$(now)"
sleep 1

cat > src/format.js <<'JS'
/** Human readable label for a counter value. */
export function formatCounter(value) {
  return `counter = ${value}`
}
JS

commit "feat(format): add counter formatter" "$(now)"
sleep 1
git tag -a v0.1.0 -m "playground 0.1.0"

git switch -q -c feature/lane-colors
cat > src/palette.js <<'JS'
/** Branch colour palette shared by the graph and the branch rail. */
export const LANE_COLORS = [
  '#7c6cf0',
  '#2aa198',
  '#d19a66',
  '#e06c75',
  '#61afef',
]
JS
commit "feat(palette): add lane colours" "$(now)"
sleep 1
cat > src/palette.test.js <<'JS'
import { LANE_COLORS } from './palette.js'

if (LANE_COLORS.length < 4) throw new Error('expected at least four lane colours')
console.log('palette ok')
JS
commit "test(palette): assert lane colour count" "$(now)"
sleep 1

git switch -q main
GIT_AUTHOR_DATE="$(now)" GIT_COMMITTER_DATE="$(now)" git merge -q --no-ff feature/lane-colors -m "merge: lane colours into main"
sleep 1

git switch -q -c feature/graph-tooltip
cat > src/tooltip.js <<'JS'
/** Tooltip text shown when the pointer rests on a graph dot. */
export function tooltipFor(commit) {
  return `${commit.subject} · ${commit.author}`
}
JS
commit "feat(tooltip): describe a commit on hover" "$(now)"
sleep 1

git switch -q main
git switch -q -c fix/status-parse
cat > src/status.js <<'JS'
/** Split porcelain v1 output into entries. */
export function parseStatus(text) {
  return text
    .split('\n')
    .filter(line => line.length > 3)
    .map(line => ({ code: line.slice(0, 2).trim(), path: line.slice(3) }))
}
JS
commit "fix(status): keep paths with spaces" "$(now)"
sleep 1

git switch -q main
git switch -q -c easygit/task-a1b2c3
cat > src/task.js <<'JS'
/** Marker file written by the simulated agent task branch. */
export const TASK_ID = 'a1b2c3'
JS
commit "chore(task): start agent task a1b2c3" "$(now)"
sleep 1

git switch -q main

# Untracked working-tree change so the panel opens with something to commit.
cat > src/notes.md <<'MD'
# Playground notes

This file is intentionally uncommitted; EasyGit shows it as an untracked file
that the panel can commit explicitly.
MD

echo
echo "playground ready: $TARGET"
echo "branches:"
git branch --format='  %(refname:short) %(objectname:short) %(contents:subject)'
echo "status:"
git status --short
