---
phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui
plan: 02
subsystem: ui
tags: [web-ui, timeline, step-grouping, lifecycle-branch, react-query, vitest]

# Dependency graph
requires:
  - phase: 63-01
    provides: grouped timeline payloads and lifecycle branch core contract
provides:
  - web timeline renders explicit step sections as the primary detail structure
  - one lifecycle branch block per child session with semantic-first summaries
  - stable load-more behavior during polling via infinite-query pagination
  - focused regression tests for branch identity, preview precedence, and drill-in path wiring
affects: [63-05, web-detail-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: [step-first-web-rendering, lifecycle-branch-semantic-summary, infinite-query-page-merging]

key-files:
  created:
    - web/src/components/branch-lifecycle-block.tsx
    - web/src/components/branch-lifecycle-block.helpers.ts
    - test/web/branch-lifecycle-block.test.ts
  modified:
    - web/src/components/timeline-fork-card.tsx
    - web/src/components/timeline-stream.tsx
    - web/src/components/job-detail.tsx

key-decisions:
  - "TimelineStream switched to useInfiniteQuery so live refetches do not discard loaded pages"
  - "Branch display semantics were extracted to pure helper functions for deterministic unit testing"
  - "timeline-fork-card was kept as a compatibility wrapper that delegates to the new lifecycle block"

patterns-established:
  - "Step sections with explicit status/command headers are the primary web timeline structure"
  - "Branch cards prioritize identity, purpose, and useful answer preview before operational metrics"

# Metrics
duration: 10 min
completed: 2026-03-14
---

# Phase 63 Plan 02: Web Step-First Timeline and Lifecycle Branch Block Summary

**Web job detail now renders grouped step sections as the primary timeline story, with each child session represented by one lifecycle-aware branch block that carries semantic status from spawn to completion.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-14T13:16:58Z
- **Completed:** 2026-03-14T13:27:09Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `branch-lifecycle-block.tsx` as the canonical child-branch renderer with semantic-first content (identity, purpose, latest/final answer preview).
- Retired split branch assumptions by turning `timeline-fork-card.tsx` into a thin compatibility wrapper over the lifecycle block.
- Refactored `TimelineStream` to consume grouped step payloads, render explicit step separators/headers, and inline lifecycle blocks in their step context.
- Replaced page-reset pagination with `useInfiniteQuery` so live polling no longer wipes loaded timeline pages.
- Simplified `JobDetail` so the grouped step timeline is the primary detail structure (removed competing standalone step panel).
- Added deterministic tests for branch preview precedence, semantic parsing, and drill-in route wiring.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build lifecycle branch block component and retire split-branch UI assumptions** - `217f1d1` (feat)
2. **Task 2: Refactor timeline and job detail to step-first rendering with explicit separators** - `625a953` (feat)
3. **Task 3: Add focused regression tests for branch lifecycle display semantics** - `6a2e9a6` (test)

## Files Created/Modified
- `web/src/components/branch-lifecycle-block.tsx` - Canonical lifecycle branch card component and semantic-first branch display.
- `web/src/components/branch-lifecycle-block.helpers.ts` - Pure identity/preview/path helpers used by component and tests.
- `web/src/components/timeline-fork-card.tsx` - Compatibility wrapper delegating to lifecycle block.
- `web/src/components/timeline-stream.tsx` - Step-grouped timeline rendering, inline lifecycle blocks, and infinite-query pagination.
- `web/src/components/job-detail.tsx` - Removed redundant step panel so grouped timeline is the primary structure.
- `test/web/branch-lifecycle-block.test.ts` - Regression tests for lifecycle display semantics and drill-in path behavior.

## Decisions Made
- Timeline pagination now uses `useInfiniteQuery` so polling refetches preserve already-loaded pages instead of clearing historical context.
- Branch semantic logic was extracted into `branch-lifecycle-block.helpers.ts` to make lifecycle display rules testable without a browser/rendering environment.
- Legacy `TimelineForkCard` entry point remains as a wrapper to avoid breakage during migration to `BranchLifecycleBlock`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted pure helper module for lifecycle tests**
- **Found during:** Task 3 (branch lifecycle regression tests)
- **Issue:** Root Vitest environment failed to resolve web UI aliases when importing the component directly, preventing deterministic lifecycle semantic tests.
- **Fix:** Moved semantic logic into `branch-lifecycle-block.helpers.ts` and tested helpers directly.
- **Files modified:** web/src/components/branch-lifecycle-block.helpers.ts, web/src/components/branch-lifecycle-block.tsx, test/web/branch-lifecycle-block.test.ts
- **Verification:** `npx vitest run test/web/branch-lifecycle-block.test.ts`
- **Committed in:** 6a2e9a6

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; unblock was required to ship deterministic regression coverage in current test infrastructure.

## Issues Encountered
- Direct component import in root Vitest tests failed due web alias/runtime boundaries; resolved by testing extracted pure helpers.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Web timeline now follows the step-first/lifecycle-block model required by Phase 63.
- Remaining Phase 63 work is `63-05-PLAN.md` (TUI drill-in navigation and shortcut parity polish).

---
*Phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui*
*Completed: 2026-03-14*
