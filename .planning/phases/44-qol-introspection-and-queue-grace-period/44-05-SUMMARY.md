---
phase: 44-qol-introspection-and-queue-grace-period
plan: 05
subsystem: ui
tags: [tui, introspection, grace, queue, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: shared JobWhy reason model and CLI-aligned badges from 44-03
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: queue grace-period launch semantics and wait metadata from 44-02
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: recovery checkpoint/guard states surfaced in detail headers
provides:
  - Grace and guarded reason badges in queue rows with grace remaining seconds
  - Compact detail header reason lines for grace waits, guarded retry, and guarded undo states
  - Pure-helper regression coverage for queue row badges and detail header reason composition
affects: [phase-44-closeout, tui-operator-ux, introspection-surface-consistency]

# Tech tracking
tech-stack:
  added: []
  patterns: [derive TUI badges from shared JobWhy helpers, use pure formatting helpers for deterministic TUI regression tests]

key-files:
  created: [test/tui/queue-panel.test.ts]
  modified: [src/tui/views/dashboard.tsx, src/tui/components/queue-panel.tsx, src/tui/views/detail.tsx, test/tui/detail-header.test.ts]

key-decisions:
  - "Queue rows render only actionable pending badges (grace/blocked/guarded), not generic launchable badges, to preserve scanability"
  - "Dashboard computes blocked/running/dependency context and passes it to QueuePanel so badge derivation stays CLI-consistent without extra DB reads"
  - "Detail header reason lines are added only for grace waits, needs-revision retry states, and guarded/missing-checkpoint undo states"

patterns-established:
  - "Shared reason vocabulary: TUI queue/detail badges reuse the same reason codes/badges as status/retry surfaces"
  - "UI regression strategy: test exported pure row/header helpers instead of renderer-heavy snapshot tests"

# Metrics
duration: 9min
completed: 2026-03-08
---

# Phase 44 Plan 05: TUI Grace and Reason Visibility Summary

**Queue and detail TUI surfaces now expose CLI-aligned grace/guard reason badges with remaining-wait context, so operators can understand waiting and safety states without leaving the dashboard.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-08T00:39:13Z
- **Completed:** 2026-03-08T00:48:48Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- Wired Dashboard -> QueuePanel context for blocked projects, running-project serialization signals, dependency status lookups, and grace configuration
- Added QueuePanel badge derivation helpers that render compact grace/blocked/guarded badges, including `grace-wait:{remaining}s`
- Added detail-header reason-line helpers and view rendering for grace wait, needs-revision retry guidance, and guarded undo/missing-checkpoint undo states
- Expanded detail header tests for new reason-line contracts and added a new queue-panel regression suite for badge composition/readability
- Ran targeted TUI/status suites and a full `npm test` regression run (689 tests) with all checks passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Surface grace and guarded reason badges in queue/detail TUI views** - `597baef` (feat)
2. **Task 2: Add TUI regression tests for new queue/detail reason rendering** - `14ddc20` (test)
3. **Task 3: Run end-to-end phase regression verification** - no code changes required (verification-only)

## Files Created/Modified

- `src/tui/views/dashboard.tsx` - passes blocked/running/dependency context plus grace config into queue row rendering
- `src/tui/components/queue-panel.tsx` - adds pure queue badge/row helpers and renders compact reason badges from shared introspection signals
- `src/tui/views/detail.tsx` - adds compact reason-line helpers and detail-header rendering for grace/retry/undo guard context
- `test/tui/detail-header.test.ts` - extends header helper coverage for grace wait and guarded retry/undo reason-line scenarios
- `test/tui/queue-panel.test.ts` - new pure helper tests for grace countdown, blocked/guarded/no-op badges, and selected-row readability

## Decisions Made

- Reused `buildJobWhy`/`buildUndoWhy` in TUI helpers rather than introducing TUI-specific reason strings, keeping label contracts aligned with CLI status/retry output
- Kept queue badges compact by suppressing `pending-ready` rows and only showing guard/actionable states
- Preserved existing Phase 43 recovery metadata line in detail view, then layered compact reason lines below it for faster triage

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44 now has all six plan summaries, including this TUI reason-visibility pass
- CLI and TUI introspection surfaces share a consistent reason vocabulary for grace/retry/undo guidance
- Phase is ready for closeout/transition work

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
