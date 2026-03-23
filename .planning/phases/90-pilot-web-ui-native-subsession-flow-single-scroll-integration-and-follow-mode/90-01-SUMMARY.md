---
phase: 90-pilot-web-ui-native-subsession-flow-single-scroll-integration-and-follow-mode
plan: 01
subsystem: ui
tags: [react, shadcn, follow-mode, scroll-spy, subsession, sticky-headers]

# Dependency graph
requires:
  - phase: 88-pilot-web-ui-job-detail-content-first-redesign
    provides: BranchLifecycleBlock, StepContentPane, FollowModeBar, SplitPaneDetail, SessionActivity
  - phase: 89-pilot-web-ui-nested-sticky-hierarchy-summary-and-label-fixes
    provides: resolveSemanticHint, SEMANTIC_TYPE_CONFIG, step-semantics
provides:
  - Dead code cleanup in branch-lifecycle-block.helpers.ts
  - UI-SPEC interaction contract audit verification (18/18 pass)
  - Fixed FollowModeBar SVG rendering (stroke-based path)
affects: [90-02]

# Tech tracking
tech-stack:
  added: []
  patterns: [stroke-based SVG icons for line paths]

key-files:
  created: []
  modified:
    - web/src/components/branch-lifecycle-block.helpers.ts
    - web/src/components/step-content-pane.tsx
    - web/src/components/follow-mode-bar.tsx

key-decisions:
  - "FollowModeBar SVG changed from fill to stroke rendering — line-based paths need stroke attributes"

patterns-established:
  - "SVG icons using M/L/v path commands should use stroke='currentColor' fill='none' not fill='currentColor'"

requirements-completed: [NSSF-01, NSSF-02, NSSF-03, NSSF-04, SSI-01, SSI-02, FM-01, FM-02, FM-03, CLEAN-01]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 90 Plan 01: UI-SPEC Contract Audit and Dead Code Cleanup Summary

**Dead code removed from branch helpers, all 18 UI-SPEC interaction contracts verified against implementation, FollowModeBar SVG fixed to use stroke-based rendering**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T14:58:38Z
- **Completed:** 2026-03-23T15:01:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed 3 dead exports (`selectBranchPreview`, `getBranchDrillInPath`, `isPresent`) and 1 unused import (`BranchLifecycleItem`) from branch-lifecycle-block.helpers.ts
- Verified all 18 UI-SPEC interaction contracts: 6/6 Native Subsession Flow, 6/6 Single-Scroll Integration, 6/6 Follow Mode
- Fixed FollowModeBar SVG icon to use proper stroke rendering instead of fill for line-based path commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dead exports and harden branch-lifecycle-block.helpers.ts** - `7b1197f` (chore)
2. **Task 2: Audit all UI-SPEC interaction contracts against current implementation** - `d273f11` (feat)

## Files Created/Modified
- `web/src/components/branch-lifecycle-block.helpers.ts` - Removed dead exports (selectBranchPreview, getBranchDrillInPath, isPresent), removed unused BranchLifecycleItem import
- `web/src/components/step-content-pane.tsx` - Added Phase 90 UI-SPEC audit verification comment
- `web/src/components/follow-mode-bar.tsx` - Fixed SVG from fill="currentColor" to stroke="currentColor" fill="none" for correct line-path rendering

## Decisions Made
- FollowModeBar SVG changed from `fill="currentColor"` to `stroke="currentColor" fill="none"` with strokeWidth/strokeLinecap/strokeLinejoin — the path `M6 2v7M3 6l3 3 3-3` uses line commands that need stroke, not fill, for both shaft and arrowhead to render

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 90-02 plan execution
- All UI-SPEC contracts verified, dead code cleaned up, TypeScript compiles cleanly

---
*Phase: 90-pilot-web-ui-native-subsession-flow-single-scroll-integration-and-follow-mode*
*Completed: 2026-03-23*

## Self-Check: PASSED
