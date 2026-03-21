---
phase: 80-web-ui-attribution-mobile-overflow-hardening
plan: 01
subsystem: ui
tags: [timeline, attribution, resolveStepIndex, job-detail-query, tdd]

# Dependency graph
requires:
  - phase: 79-web-ui-job-activity-regression-restore-visible-activity-under-jobs
    provides: Restored visible activity and timeline rendering
provides:
  - 5-tier attribution in resolveStepIndex (sessionId → sessionTitle → timeWindow → childTransitivity → lastStepFallback)
  - childToStepIndex map built during BFS in getJobTimeline()
affects: [web-ui, timeline-stream, step-content-pane]

# Tech tracking
tech-stack:
  added: []
  patterns: [transitive-child-attribution, last-step-fallback]

key-files:
  created: []
  modified:
    - src/core/job-detail-query.ts
    - test/core/job-detail-query.test.ts

key-decisions:
  - "Child-to-step ownership tracked via sessionIdToStepIndex + childToStepIndex maps during BFS"
  - "Last-step fallback uses max startedAtMs across all step refs, only when candidate.createdAt >= that value"
  - "Unattributed bucket preserved for genuinely unassignable content (createdAt before any step starts)"

patterns-established:
  - "5-tier attribution: sessionId → sessionTitle → timeWindow → childTransitivity → lastStepFallback"
  - "Transitive child ownership propagation during BFS traversal"

requirements-completed: [ATTR-01, ATTR-02, ATTR-03, ATTR-04, ATTR-05]

# Metrics
duration: 10min
completed: 2026-03-21
---

# Phase 80 Plan 01: Attribution Fix Summary

**5-tier resolveStepIndex attribution with child session transitivity and last-step fallback, eliminating false Unattributed timeline items for late judge/final-step activity**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-21T09:07:34Z
- **Completed:** 2026-03-21T09:18:02Z
- **Tasks:** 1 (TDD: RED-GREEN-REFACTOR)
- **Files modified:** 2

## Accomplishments
- Late judge/final-step activity that previously appeared as `Unattributed` is now attributed to the correct step
- Added tier 4 (child session transitivity): candidates from sessions spawned by a step's root session are attributed to that step
- Added tier 5 (last-step fallback): activity after all step windows close is attributed to the most recently started step
- Unattributed bucket preserved only for genuinely unassignable content (e.g., activity before any step starts)
- 7 focused attribution tests covering all 5 tiers plus edge cases

## Task Commits

Each task was committed atomically (TDD cycle):

1. **Task 1 RED: Add failing tests for 5-tier attribution** - `646d0bb` (test)
2. **Task 1 GREEN: Implement 5-tier attribution** - `119c39a` (feat)

_Note: REFACTOR phase skipped — implementation was clean from the start._

## Files Created/Modified
- `src/core/job-detail-query.ts` — Added tiers 4+5 to resolveStepIndex(), built childToStepIndex map during BFS in getJobTimeline(), updated JSDoc
- `test/core/job-detail-query.test.ts` — Added 7 tests in "resolveStepIndex 5-tier attribution" describe block, added getSessionMeta mock

## Decisions Made
- **Child ownership via dual maps**: `sessionIdToStepIndex` (step.sessionId → stepIndex) and `childToStepIndex` (child.id → stepIndex) separate concerns cleanly. Ownership propagates transitively during BFS.
- **Last-step fallback scoped to post-start**: Tier 5 only fires when candidate.createdAt >= latestStep.startedAtMs, preventing pre-job activity from being incorrectly attributed.
- **No signature export changes**: resolveStepIndex is private; only internal call site updated with new parameter.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Attribution fix complete, ready for Plan 02 (mobile overflow hardening)
- 3 pre-existing test failures in web routes and TUI shortcuts are unrelated to this change

---
*Phase: 80-web-ui-attribution-mobile-overflow-hardening*
*Completed: 2026-03-21*
