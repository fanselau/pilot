---
phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui
plan: 01
subsystem: core
tags: [timeline, step-grouping, lifecycle-branch, server-functions, vitest]

# Dependency graph
requires:
  - phase: 62
    provides: flat merged timeline query + web timeline server function baseline
provides:
  - step-grouped timeline DTOs in core types
  - grouped getJobTimeline() with deterministic step attribution and lifecycle branch upsert
  - grouped timeline server function contract for web callers
  - regression coverage for grouped shape, lifecycle dedupe, unattributed fallback, and pagination
affects: [63-02, 63-03, 63-04, 63-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [step-first-timeline-grouping, lifecycle-branch-upsert, deterministic-attribution-fallback]

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - web/src/lib/server-fns.ts
    - test/core/job-detail-query.test.ts

key-decisions:
  - "Step attribution order is sessionId -> sessionTitle -> time window -> unattributed"
  - "Child branch lifecycle uses one fork-card object with completion metadata instead of a second completion row"
  - "Grouped payload keeps a deprecated flat items array temporarily to avoid breaking in-flight consumers"

patterns-established:
  - "Step containers are the primary timeline structure; chronology is preserved inside each step"
  - "Branch lifecycle state is merged by stable child session identity"

# Metrics
duration: 10 min
completed: 2026-03-14
---

# Phase 63 Plan 01: Step-Grouped Timeline Contract Summary

**Core timeline composition now returns step-grouped sections with deterministic attribution and one lifecycle branch object per child session across spawn-to-completion.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-14T13:01:15Z
- **Completed:** 2026-03-14T13:12:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added step-first timeline DTOs (`StepTimelineGroup`, `BranchLifecycleItem`, `GroupedTimelinePage`) in core types.
- Refactored `getJobTimeline()` to build grouped output and lifecycle branch upserts keyed by child session ID.
- Implemented deterministic attribution fallback (session ID, session title, step window, unattributed).
- Updated web server function contract to typed grouped timeline payload.
- Expanded core timeline regressions for grouped shape, lifecycle dedupe, unattributed fallback, and cursor pagination.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define grouped step timeline and lifecycle DTOs** - `a0a9adf` (feat)
2. **Task 2: Refactor getJobTimeline() for grouped lifecycle composition** - `6f0ccd1` (feat)
3. **Task 3: Update server contract and regression coverage** - `57c3ec8` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added grouped timeline contracts and lifecycle branch fields.
- `src/core/job-detail-query.ts` - Rebuilt timeline composition into grouped step output with lifecycle upsert logic.
- `web/src/lib/server-fns.ts` - Typed `getJobTimelineFn` against grouped timeline return contract.
- `test/core/job-detail-query.test.ts` - Added grouped timeline regression scenarios and removed completion-row expectations.

## Decisions Made
- `getJobTimeline()` attributes timeline items in a strict order: session ID, then session title, then step window, then unattributed fallback.
- Child branch completion is folded into a single lifecycle object (`fork-card`) with `completedAt`/`finalMessagePreview` metadata.
- Transitional `items` is retained on `GroupedTimelinePage` so existing consumers compile while migrating to `groups`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added transitional `items` field on grouped payload**
- **Found during:** Task 2 verification
- **Issue:** Existing timeline callers/tests still referenced `page.items`, causing type/runtime breakage during grouped contract rollout
- **Fix:** Added deprecated `items` on `GroupedTimelinePage` and returned a flat view alongside grouped data
- **Files modified:** src/core/types.ts, src/core/job-detail-query.ts
- **Verification:** `npx vitest run test/core/job-detail-query.test.ts`, `pnpm build` (web)
- **Committed in:** 57c3ec8

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Transitional compatibility only; grouped step-first contract remains primary.

## Issues Encountered
Legacy timeline tests expected `completion-card` rows for done child sessions; updated tests to assert lifecycle folding on `fork-card` instead.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core grouped timeline contract is ready for web rendering updates in `63-02-PLAN.md`.
- Lifecycle branch consolidation is locked by regression tests and available to both web and TUI consumers.

---
*Phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui*
*Completed: 2026-03-14*
