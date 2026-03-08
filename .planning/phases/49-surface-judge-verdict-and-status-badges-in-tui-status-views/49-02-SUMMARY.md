---
phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views
plan: 02
subsystem: cli
tags: [judge, status, info, badges, vitest]

# Dependency graph
requires:
  - phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views
    provides: Shared judge verdict parser/formatter helpers from 49-01
provides:
  - Explicit judge badges in `pilot status` recent rows for completed phase jobs
  - Shared judge verdict semantics in `pilot info` Verdict line
  - Command regressions that lock pass vs inconclusive badge behavior
affects: [49-03, status, tui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI status/info surfaces consume buildJudgeSignal for consistent verdict semantics"

key-files:
  created: []
  modified:
    - src/commands/status.ts
    - src/commands/info.ts
    - test/commands/status.test.ts
    - test/commands/info.test.ts

key-decisions:
  - "Status recent rows show explicit [judge:*] text for completed phase jobs while preserving existing retry/undo/obs badges"
  - "Info Verdict line now uses shared buildJudgeSignal + formatJudgeReason semantics instead of local JSON parsing"

patterns-established:
  - "Judge badge wording in command output is sourced from src/core/judge-signal.ts"

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 49 Plan 02: CLI Judge Badge Wiring Summary

**`pilot status` and `pilot info` now expose explicit, shared judge badge semantics (pass/fail/doubt/inconclusive) while keeping retry and undo guidance in the same scan path.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T21:18:33Z
- **Completed:** 2026-03-08T21:22:10Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Replaced local status inconclusive parsing with `buildJudgeSignal` and added compact `[judge:*]` badges for completed phase rows in Recent output.
- Reworked `pilot info` Verdict rendering to use shared core verdict parsing/formatting, including reason-first with summary fallback handling.
- Added command regressions for explicit pass/inconclusive badge distinction, quick-job judge badge suppression, and shared info verdict behavior.
- Verified all required plan checks (`status`, `info`, and combined suites) with 20/20 passing command tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add compact judge badges to `pilot status` recent phase rows** - `b0ed9d3` (feat)
2. **Task 2: Reuse shared verdict formatter in `pilot info` verdict line** - `1465b34` (feat)
3. **Task 3: Extend command regressions for judge badge coverage** - `f4737cd` (test)

## Files Created/Modified
- `src/commands/status.ts` - Recent row rendering now composes judge badge text from shared judge signal helpers.
- `src/commands/info.ts` - Verdict line now uses shared judge outcome badge + reason semantics.
- `test/commands/status.test.ts` - Added regressions for phase pass/inconclusive judge badges and quick-job suppression.
- `test/commands/info.test.ts` - Added regressions for shared verdict formatting, summary fallback, and inconclusive output.

## Decisions Made
- Kept judge badges explicit in status text (`[judge:pass 92%]`, `[judge:inconclusive]`) instead of relying on icon color alone.
- Preserved existing operational badge ordering by appending judge signal alongside existing retry/no-op, undo, and observability markers.
- Scoped status judge badge rendering to completed phase rows so quick jobs and non-phase scopes remain unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI verdict semantics are now centralized in `judge-signal` consumption and regression-locked for command surfaces.
- Phase 49-03 can now mirror these same judge badge semantics in TUI completed/detail views.

---
*Phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views*
*Completed: 2026-03-08*
