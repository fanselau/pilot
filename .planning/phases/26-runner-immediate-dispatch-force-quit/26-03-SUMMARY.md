---
phase: 26-runner-immediate-dispatch-force-quit
plan: 03
subsystem: cli
tags: [kill, force-quit, process-management, commander]

# Dependency graph
requires:
  - phase: 26-runner-immediate-dispatch-force-quit
    provides: forceQuitJob() in db.ts and killJobSession() in runner.ts (plans 01+02)
provides:
  - "pilot kill <id> --force CLI command for operator force-quit"
  - "killCommand function exported from src/commands/kill.ts"
affects: [tui, documentation, operator-runbooks]

# Tech tracking
tech-stack:
  added: []
  patterns: ["kill-then-update: always attempt process kill first, then always update DB (ghost prevention)"]

key-files:
  created: ["src/commands/kill.ts"]
  modified: ["src/index.ts"]

key-decisions:
  - "Job lookup before force-check (step 1) — fail fast on unknown IDs before any other validation"
  - "Kill-then-update order: OS kill first, DB update always — prevents ghost-running jobs even if kill fails"
  - "DB update continues even when killJobSession returns killed:false (process may already be gone)"

patterns-established:
  - "Force-flag pattern: required confirmation flag on destructive commands (mirrors pilot cancel design)"

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 26 Plan 03: Kill Command Summary

**`pilot kill <id> --force` CLI command wiring killJobSession + forceQuitJob with kill-then-update ordering**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T18:39:42Z
- **Completed:** 2026-03-03T18:43:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- New `src/commands/kill.ts` implementing `killCommand(id, opts)` with proper force-quit sequence
- `pilot kill <id> --force` registered in `src/index.ts` in the Queue management section between `cancel` and `retry`
- Kill sequence enforced: OS process termination via `killJobSession()` first, then `forceQuitJob('cli')` DB update always (ghost-running prevention)
- Safety gates: `--force` required, non-running jobs rejected with hint to use `pilot cancel`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/commands/kill.ts with force-quit logic** - `bf61580` (feat)
2. **Task 2: Register pilot kill command in index.ts** - `0c0d130` (feat)

**Plan metadata:** `(docs commit follows)`

## Files Created/Modified

- `src/commands/kill.ts` — killCommand with --force gate, running-status check, kill-then-update sequence, human+JSON output
- `src/index.ts` — `pilot kill <id>` command registration with `--force` option, dynamic import

## Decisions Made

- Job lookup before force-check: fails fast on unknown IDs without reading opts
- Kill-then-update ordering: always attempt OS kill first, always call forceQuitJob regardless — ensures DB reflects terminal state even when process already exited
- Stderr warning (not fatal) when killJobSession returns `killed: false` — process may be already dead, DB update still proceeds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 fully complete (plans 01, 02, 03 done)
- `pilot kill` provides the CLI surface for the force-quit controls introduced in plans 01+02
- Ready for Phase 27 (TUI Detail Header Rework)

---
*Phase: 26-runner-immediate-dispatch-force-quit*
*Completed: 2026-03-03*
