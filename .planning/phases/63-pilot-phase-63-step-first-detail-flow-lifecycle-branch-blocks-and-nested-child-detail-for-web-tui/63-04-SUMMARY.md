---
phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui
plan: 04
subsystem: tui
tags: [tui, step-grouped-timeline, lifecycle-branch, session-identity, vitest]

# Dependency graph
requires:
  - phase: 63-01
    provides: grouped step timeline contract and lifecycle branch composition in core
provides:
  - TUI adapter that consumes grouped core timeline data for detail polling
  - Step-first TUI detail renderer with explicit section headers and lifecycle branch rows
  - Regression tests for step grouping, unattributed fallback, and session-ID merge semantics
affects: [63-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [tui-step-first-section-rendering, session-id-keyed-timeline-merge]

key-files:
  created:
    - test/tui/detail-step-flow.test.ts
  modified:
    - src/tui/data/opencode-db.ts
    - src/tui/views/detail.tsx

key-decisions:
  - "TUI detail polling merges full grouped snapshots by immutable section/item keys so lifecycle rows update in place"
  - "Branch lifecycle identity is keyed by child sessionId (fork:<sessionId>) to avoid title-collision merges"
  - "Adapter emits unattributed fallback section when grouped payload is absent so no timeline activity is dropped"

patterns-established:
  - "Step headers are first-class section separators in TUI detail output"
  - "Fork-card lifecycle rows are rendered once and updated over time instead of split fragments"

# Metrics
duration: 7 min
completed: 2026-03-14
---

# Phase 63 Plan 04: TUI Step-First Detail Alignment Summary

**TUI detail now consumes the shared grouped timeline model and renders explicit step sections with one lifecycle branch row per child session keyed by immutable session identity.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T13:17:28Z
- **Completed:** 2026-03-14T13:24:54Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Replaced title/group-specific TUI data shaping with a thin adapter over core `getJobTimeline()` grouped output.
- Refactored `DetailView` stream rendering to step-first section headers and lifecycle-aware branch rows.
- Switched timeline merge semantics to immutable section/item identities (`step:*`, `fork:<sessionId>`) rather than title keys.
- Added dedicated TUI regressions for grouped ordering, unattributed fallback, and session-ID collision safety.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build a TUI data adapter that consumes grouped step timeline from core** - `8c88194` (feat)
2. **Task 2: Refactor DetailView rendering to explicit step sections and lifecycle branch rows** - `d007048` (feat)
3. **Task 3: Add TUI regression tests for step grouping and lifecycle identity semantics** - `8470e8f` (test)

## Files Created/Modified
- `src/tui/data/opencode-db.ts` - Added grouped timeline adapter, stable section/item key helpers, and unattributed fallback behavior.
- `src/tui/views/detail.tsx` - Replaced delegation/execution framing with step-first headers and session-ID keyed lifecycle merge rendering.
- `test/tui/detail-step-flow.test.ts` - Added focused regressions for step grouping, fallback preservation, and session-ID collision updates.

## Decisions Made
- Poller now merges full grouped snapshots by stable keys so fork lifecycle rows can update without relying on created-at cursor drift.
- TUI branch updates are keyed by immutable child session IDs, never titles, preventing same-title subagent overwrite regressions.
- Unattributed fallback remains explicit at adapter level to preserve visibility when step attribution is incomplete.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TUI detail now matches the shared step/lifecycle information architecture expected by Phase 63.
- Ready for `63-05-PLAN.md` drill-in navigation polish and shortcut/hint parity work on top of this model.

---
*Phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui*
*Completed: 2026-03-14*
