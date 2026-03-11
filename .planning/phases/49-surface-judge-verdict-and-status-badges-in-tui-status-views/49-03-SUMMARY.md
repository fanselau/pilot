---
phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views
plan: 03
subsystem: ui
tags: [tui, opentui, solidjs, judge, badges, vitest]

# Dependency graph
requires:
  - phase: 49-01
    provides: shared judge verdict parsing/formatting primitives
provides:
  - explicit judge + retry + undo badges in completed panel terminal rows
  - dedicated Status/Verdict/Retry/Undo triage lines in detail header helpers and rendering
  - regression coverage for badge composition and inconclusive verdict behavior
affects: [phase-49-completion, tui-triage, operator-observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - shared core semantics for judge/retry/undo reused in TUI row/header presentation
    - pure-helper regression tests for TUI contracts without renderer coupling

key-files:
  created: []
  modified:
    - src/tui/components/completed-panel.tsx
    - src/tui/views/detail.tsx
    - test/tui/completed-panel.test.ts
    - test/tui/detail-header.test.ts

key-decisions:
  - "Render terminal-row badges via shared buildJudgeSignal/buildRetryWhy/buildUndoWhy helpers instead of ad-hoc parsing in the panel."
  - "Keep legacy reason header helper focused on wait-context notes while introducing explicit Status/Verdict/Retry/Undo triage lines."

patterns-established:
  - "TUI row badges: [judge:*] + operational badges co-exist with observability metrics."
  - "Detail header triage: dedicated labeled lines for status/verdict/retry/undo, with concise verdict reason preview."

# Metrics
duration: 4 min
completed: 2026-03-08
---

# Phase 49 Plan 03: TUI verdict and operational badge surfaces Summary

**Completed rows now show explicit judge/retry/undo badges, and detail headers expose dedicated Status/Verdict/Retry/Undo lines for fast phase-job triage.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T21:18:12Z
- **Completed:** 2026-03-08T21:23:05Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added explicit terminal-row badge composition in the TUI completed panel using shared judge and introspection helpers.
- Added dedicated status/verdict/retry/undo triage lines to detail header helper output and live rendering path.
- Extended TUI regression tests to lock badge variants, badge combinations, dedicated header-line presence, and inconclusive handling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Render explicit judge + operational badges in completed panel rows** - `350e1cf` (feat)
2. **Task 2: Add dedicated Status/Verdict/Retry/Undo lines in detail header** - `592b384` (feat)
3. **Task 3: Extend TUI regression tests for badge and header contracts** - `62ca8b9` (test)

**Plan metadata:** Pending (added in docs commit for this plan)

## Files Created/Modified
- `src/tui/components/completed-panel.tsx` - Added shared badge composition + rendering for judge/retry/undo terminal-row badges.
- `src/tui/views/detail.tsx` - Added triage header line helper and rendered dedicated Status/Verdict/Retry/Undo lines.
- `test/tui/completed-panel.test.ts` - Added badge-composition regression tests covering pass/fail/doubt/inconclusive and operational badge combinations.
- `test/tui/detail-header.test.ts` - Added header contract tests for dedicated triage lines and inconclusive verdict behavior.

## Decisions Made
- Reused `buildJudgeSignal`, `buildRetryWhy`, and `buildUndoWhy` for TUI badge semantics to match CLI-introspection behavior and avoid local verdict parsing drift.
- Kept `buildReasonHeaderLines` focused on additional context (e.g., grace-wait), while adding explicit triage lines for core operator signals.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TUI badge and detail triage contracts for Phase 49 are in place and verified.
- Phase 49 is complete; ready for transition to the next roadmap phase.

---
*Phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views*
*Completed: 2026-03-08*
