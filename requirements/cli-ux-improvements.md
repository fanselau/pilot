# CLI UX Improvements

## Problem
1. Job IDs are random 4-char alphanumeric (`6ao5`, `mq0y`) — hard to remember, type, or reference
2. `pilot log` shows "No messages yet" while the job is actively running (delegation phase, rate limiting, etc.)
3. No visibility into what the runner is doing between "queued" and "first opencode message"

## Goal
Make pilot CLI pleasant to use for humans who are watching builds.

## Requirements

### Must Have
- [ ] Sequential numeric job IDs: `#1`, `#2`, `#3` etc. (auto-incrementing)
- [ ] `pilot log` shows runner activity even before opencode sessions start:
  - "Delegating..." when delegation is running
  - "Waiting for memory..." when in checkMemory loop
  - "Spawning opencode session..." when about to spawn
  - "Polling for session completion..." when waiting
- [ ] `pilot log` with no args shows the most recent active/failed job (already works, good)
- [ ] `pilot status` shows the current step name (e.g. "Step 2/3: execute-phase")

### Nice to Have
- [ ] `pilot log --live` streams updates in real-time (like `tail -f`)
- [ ] Job aliases: `pilot log latest`, `pilot log last-failed`
- [ ] Short status line: `pilot` with no subcommand shows one-liner status

## Technical Notes
- Sequential IDs: change from `nanoid(4)` to auto-increment column in SQLite
- Runner activity: write status updates to a `runner_log` table or job `activity` column
- Keep backward compat: old random IDs should still work for lookup

## Do NOT
- Break existing `pilot log <id>` with old-format IDs
- Add complex TUI elements to the CLI output (save that for `pilot tui`)
- Change the DB schema in a breaking way (migration needed)
