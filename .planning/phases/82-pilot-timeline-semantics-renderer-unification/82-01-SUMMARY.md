---
phase: 82-pilot-timeline-semantics-renderer-unification
plan: 01
subsystem: api
tags: [timeline, attribution, semantics, step-grouping, web-ui]

# Dependency graph
requires: []
provides:
  - semanticLabel field on StepTimelineGroup for pre-computed human-readable labels
  - computeSemanticLabel() helper with 11 label mappings in job-detail-query.ts
  - step-semantics.ts shared module for web UI semantic label consumption
  - Improved resolveStepIndex() with 6-tier attribution (reduces Unattributed content)
affects:
  - 82-02 (UI components can now consume semanticLabel + step-semantics.ts helpers)
  - Any web UI component rendering StepTimelineGroup (StepContentPane, StepTimelineSidebar, TimelineStream)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-computed semantic labels: populate in core data layer, consume in UI (no re-derivation)"
    - "6-tier attribution with Tier 3.5 for delegation containment and Tier 5 restricted to judge steps"
    - "Shared semantic module pattern: web/src/lib/step-semantics.ts exports all label helpers"

key-files:
  created:
    - web/src/lib/step-semantics.ts
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - test/core/job-detail-query.test.ts

key-decisions:
  - "Tier 5 restricted to judge steps only — non-judge last steps fall through to Unattributed (reduces false attribution)"
  - "Tier 3 running-step window capped at next step's startedAtMs (prevents greedy open-ended attribution)"
  - "New Tier 3.5 explicitly handles delegation session children via childToStepIndex with negative indices"
  - "After-BFS explicit delegation child mapping added as safety net for sessions not in opencode parent-child graph"
  - "step-semantics.ts uses pre-computed semanticLabel from core if available; falls back to local derivation"
  - "Updated test helpers (makeJob/makeStep) to include all required type fields to fix pre-existing TS errors"

patterns-established:
  - "Attribution tier naming: Tier 3.5 between Tier 3 and Tier 4 for delegation-specific logic"
  - "computeSemanticLabel() in core populates StepTimelineGroup.semanticLabel; UI helpers re-use it"

requirements-completed:
  - requirements/pilot-timeline-semantics-and-renderer-unification.md

# Metrics
duration: 12min
completed: 2026-03-21
---

# Phase 82 Plan 01: Attribution Logic and Semantic Label Foundation Summary

**Improved 6-tier resolveStepIndex() attribution with running-step window restriction + delegation containment; new semanticLabel field on StepTimelineGroup populated by core; shared step-semantics.ts module with 5 helpers for consistent web UI label rendering**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-21T11:37:43Z
- **Completed:** 2026-03-21T11:50:03Z
- **Tasks:** 2
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- Enhanced `resolveStepIndex()` from 5 to 6 attribution tiers with targeted improvements that reduce false Unattributed placement
- Added `semanticLabel?: string` to `StepTimelineGroup` and populated it in `getJobTimeline()` using `computeSemanticLabel()` with 11 distinct label mappings
- Created `web/src/lib/step-semantics.ts` — a shared module exporting `formatStepLabel`, `formatStepDescription`, `stepSemanticClass`, `isContinuationStep`, `formatDelegationIndex`
- All 56 job-detail-query tests pass; 4 pre-existing failures in unrelated test files confirmed unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Improve resolveStepIndex attribution and add semanticLabel to types** - `7f7ff00` (feat)
2. **Task 2: Create step-semantics.ts helper module for web UI** - `8907a0a` (feat)

## Files Created/Modified
- `src/core/types.ts` — Added `semanticLabel?: string` to `StepTimelineGroup` interface
- `src/core/job-detail-query.ts` — Enhanced attribution tiers, added `computeSemanticLabel()`, populated labels in `getJobTimeline()`
- `test/core/job-detail-query.test.ts` — Updated tests for new Tier 5 behavior; fixed pre-existing makeJob/makeStep TS type errors
- `web/src/lib/step-semantics.ts` — New shared semantic label helper module (5 exported functions)

## Decisions Made
- **Tier 5 restricted to judge steps**: The plan specified restricting the last-step fallback to judge commands (`command.includes('judge')` or `source.startsWith('judge:')`). This required updating the existing tier-5 test to use a judge command, plus adding a new test for the non-judge fallback behavior (goes to Unattributed). Documented as intentional behavior change.
- **Tier 3.5 implemented via childToStepIndex**: Tier 3.5 checks `childToStepIndex` for negative indices (delegation steps) before the general Tier 4 check, providing a logical separation: delegation attribution (3.5) vs regular step attribution (4).
- **Pre-existing makeJob/makeStep type errors fixed**: `makeJob` was missing `retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`, `hungCount`, `lastHungReason`. `makeStep` was missing `source`, `reason`, `error`. Fixed as Rule 1 (Bug) deviation since these caused TypeScript errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TypeScript type errors in test helpers**
- **Found during:** Task 1 (when updating makeStep to accept `command` field)
- **Issue:** `makeJob` was missing required `Job` fields (`retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`, `hungCount`, `lastHungReason`); `makeStep` was missing required `JobStep` fields (`source`, `reason`, `error`)
- **Fix:** Added all missing required fields with appropriate default values to `makeJob` and `makeStep` in the test file
- **Files modified:** `test/core/job-detail-query.test.ts`
- **Verification:** No TS errors in test file; all 56 tests pass
- **Committed in:** `7f7ff00` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed pre-existing `completion-card` TypeScript error in test**
- **Found during:** Task 1 (triggered by type check)
- **Issue:** `page.items.filter((i) => i.kind === 'completion-card')` — TypeScript error because `'completion-card'` is not in the `StepTimelineItem` kind union
- **Fix:** Added `(i as { kind: string })` cast in the filter
- **Files modified:** `test/core/job-detail-query.test.ts`
- **Verification:** TS error resolved; test still asserts zero completion-card items
- **Committed in:** `7f7ff00` (Task 1 commit)

**3. [Rule 1 - Bug] Tier 5 test updated for new judge-only behavior**
- **Found during:** Task 1 (Tier 5 implementation)
- **Issue:** Existing "tier 5" test used `command: 'execute-phase'` for the last step, which with the new judge-only Tier 5 restriction would cause the test to fail (late activity now goes to Unattributed instead of step 1)
- **Fix:** Updated `setupAttribution` to accept optional `command` and `source` fields; updated tier 5 test to use `command: 'judge-gaps'` for the last step; added new test for non-judge fallback behavior
- **Files modified:** `test/core/job-detail-query.test.ts`
- **Verification:** All 56 attribution tests pass; behavior change is intentional per plan spec
- **Committed in:** `7f7ff00` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 pre-existing type bugs, 1 behavior-change test update)
**Impact on plan:** All fixes necessary for type correctness and to match intended behavior change. No scope creep.

## Issues Encountered
None beyond the deviations documented above. Pre-existing test failures in `opencode-db.test.ts`, `job-routes.test.ts`, and `shortcuts.test.ts` were confirmed to exist before this plan's changes (verified via git stash).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Attribution improvements and `semanticLabel` field are ready for UI consumption (Plan 82-02+)
- `web/src/lib/step-semantics.ts` can be imported by `StepContentPane`, `StepTimelineSidebar`, `TimelineStream` and any other component that renders step groups
- Remaining plans in Phase 82 can now replace `Step N` / `Steps` labels with `formatStepLabel()` from the shared module
- No blockers

---
*Phase: 82-pilot-timeline-semantics-renderer-unification*
*Completed: 2026-03-21*
