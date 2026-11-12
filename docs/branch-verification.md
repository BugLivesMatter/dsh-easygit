# EasyGit branch verification

Repository: `./easygit-playground`
Generated: 2026-11-12T11:01:19.865Z

Result: **53/53 checks passed**


## Repository discovery
- PASS — detect: is a git work tree
- PASS — detect: primary checkout resolved (./easygit-playground)
- PASS — detect: current branch is main (main)
- PASS — detect: no remote configured (none)

## Branch model
- PASS — repo payload built
- PASS — branch count is 5 (main, easygit/task-a1b2c3, feature/graph-tooltip, feature/lane-colors, fix/status-parse)
- PASS — branch present: main
- PASS — branch present: feature/lane-colors
- PASS — branch present: feature/graph-tooltip
- PASS — branch present: fix/status-parse
- PASS — branch present: easygit/task-a1b2c3
- PASS — head branch listed first (main)
- PASS — open branches diverge from the integration branch (main:+0 easygit/task-a1b2c3:+1 feature/graph-tooltip:+1 feature/lane-colors:+0 fix/status-parse:+1)
- PASS — integration branch detected (main)
- PASS — merged branch reports ahead 0
- PASS — agent task branch has task metadata slot

## Graph layout
- PASS — graph rows emitted (8 rows)
- PASS — graph uses at least 2 lanes (5 lanes)
- PASS — graph edges connect parents (8 edges)
- PASS — merge commit present (merge: lane colours into main)
- PASS — merge commit forks into two lanes (2 outgoing edges)
- PASS — every row has a lane index
- PASS — ref chips rendered on a row
- PASS — every row has a visual column
- PASS — integration branch detected in the layout (main)
- PASS — main owns a centre column (col 2 of 5)
- PASS — every branch tip has its own column (2,0,1,3,4)
- PASS — main tip drawn in the centre column (col 2)
- PASS — merge commits stay on the integration spine (2)

## Checkpoint safety
- PASS — tracked change committed
- PASS — commit includes tracked file (src/format.js)
- PASS — sensitive untracked file excluded (credentials.json)
- PASS — sensitive file still untracked
- PASS — explicit sensitive path skipped (sensitive file — commit it explicitly from the panel)
- PASS — explicit untracked path committed

## Branch creation and checkout
- PASS — branch name validated
- PASS — branch created
- PASS — new branch appears in model
- PASS — new branch starts level with main
- PASS — checkout switched HEAD
- PASS — payload follows HEAD
- PASS — checkout back to main

## Task worktree
- PASS — worktree created (./easygit-playground/.agents/worktrees/easygit/easygit-task-a1b2c3)
- PASS — worktree is inside the pool (./easygit-playground/.agents/worktrees/easygit/easygit-task-a1b2c3)
- PASS — worktree checked out on task branch (easygit/task-a1b2c3)
- PASS — commit in worktree advanced the branch (5eec9c0 -> a668801)
- PASS — primary checkout HEAD unchanged
- PASS — worktree registered
- PASS — worktree reported in payload
- PASS — clean worktree removed

## Push and last commit
- PASS — push without remote fails cleanly (fatal: 'origin' does not appear to be a git repository
fatal: Could not read from remote repository.

Please make sure y)
- PASS — commit details readable (1 files)
- PASS — patch text captured

## Summary
