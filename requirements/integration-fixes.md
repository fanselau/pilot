# Integration Test Fixes — Make Pilot Actually Work

## Problem

Integration testing on 2026-02-20 revealed several bugs that prevent pilot from replacing the bash queue runner:

### Bug 1: Setup creates `.claude/` instead of `.opencode/`
`pilot setup` symlinks into `.claude/` directory but opencode uses `.opencode/`. Also creates `claude.json` instead of `opencode.json`.

### Bug 2: Status command hangs ~30s with running processes
`pilot status` triggers CPU sampling on ALL PIDs found in /tmp, including the queue runner PID itself. 3x10s sampling = 30s hang.

### Bug 3: run-command mode passed wrong command to spawn (FIXED)
Was passing `entry.mode` ("run-command") as the command instead of `entry.args`. Fixed in d1bbb56 but needs tests.

### Bug 4: Runner --once exits before jobs complete
With `--once` flag, runner scans queue, launches job, scans again (nothing new), exits — while the detached opencode process is still running.

### Bug 5: Update fails without upstream tracking
`pilot update` runs `git pull` which fails if branch has no upstream set. Should use `git pull origin main` or `git pull origin dev` explicitly.

### Bug 6: Setup creates wrong config file
Creates `claude.json` instead of `opencode.json`. Config content may also be wrong for opencode format.

## Requirements

### Must Have
- [ ] Setup creates `.opencode/` symlinks (not `.claude/`):
  - `.opencode/agents/` → pilot-gsd/agents
  - `.opencode/command/` → pilot-gsd/commands  
  - `.opencode/get-shit-done/` → pilot-gsd/get-shit-done
  - Creates `opencode.json` (not claude.json) with correct format
- [ ] Status excludes queue runner PID from CPU sampling (check PID file, skip it)
- [ ] Status has a timeout on CPU sampling (max 3s total, not per-process)
- [ ] run-command mode correctly extracts command from args (add regression test)
- [ ] `--once` mode waits for all launched jobs to complete before exiting
- [ ] Update uses `git pull origin <branch>` with explicit remote/branch
- [ ] Update sets upstream tracking if not set: `git branch --set-upstream-to=origin/dev dev`
- [ ] Setup detects existing `.opencode/` with real files (not symlinks) and warns instead of overwriting

### Must Have — Tests
- [ ] Integration test: setup creates correct symlinks in `.opencode/`
- [ ] Integration test: run-command spawns correct `gsd-*` command
- [ ] Unit test: status skips queue runner PID
- [ ] Unit test: --once waits for job completion

## Technical Notes
- The `.claude/` → `.opencode/` rename affects `src/core/setup.ts`
- CPU sampling is in `src/core/stuck.ts` — add PID exclusion list
- The run-command fix is already in runner.ts but needs test coverage
- `--once` needs to wait on `waitForAnyCompletion()` after all scans show no new items

## Do NOT
- Change the detached spawn model — it's correct for long-running jobs
- Remove CPU sampling — it's valuable for stuck detection, just needs to be faster/filtered
