---
phase: 82-pilot-timeline-semantics-renderer-unification
plan: "03"
subsystem: ui
tags: [react, typescript, semantic-labels, timeline, step-rendering]

requires:
  - phase: 82-01
    provides: step-semantics.ts with formatStepLabel, isContinuationStep, formatDelegationIndex
  - phase: 82-02
    provides: unified renderer pipeline (timeline-item-renderer)

provides:
  - Semantic step labels ("Execution", "Judge", "Gap Closure") in all web UI surfaces
  - Continuation badge markers in step-content-pane headers
  - Amber left-border accent for continuation steps in sidebar
  - "Timeline" tab name instead of "Steps" in split-pane-detail
  - Mobile semantic abbreviations (E, P, J, G, R, Q) with continuation ring
  - Improved running banner showing semantic step label instead of "Building step N"
  - Step index shown as secondary hint (#N) rather than primary label

affects:
  - Any future phase modifying step display UI
  - 82-01 (already depends on)

tech-stack:
  added: []
  patterns:
    - "Import from ~/lib/step-semantics for all step label formatting across UI components"
    - "formatStepLabel(group) replaces all inline step label derivation"
    - "isContinuationStep(group) drives visual distinction for gap-closure steps"
    - "mobileStepChar() helper for compact single-char semantic abbreviations"

key-files:
  created: []
  modified:
    - web/src/components/step-content-pane.tsx
    - web/src/components/timeline-stream.tsx
    - web/src/components/step-timeline-sidebar.tsx
    - web/src/components/split-pane-detail.tsx
    - web/src/components/job-list.tsx

key-decisions:
  - "Renamed 'Timeline' tab to 'Summary' in split-pane-detail to avoid naming conflict when 'Steps' tab became 'Timeline'"
  - "Changed 'Step N' badges in job-list to '#N' since job-list only has currentStep number, not full step group data for semantic label"
  - "Running banner uses currentGroup lookup to show 'Execution #3...' instead of 'Building step 3' when group data available"
  - "formatStepDescription/stepSemanticClass imported but not yet used in step-content-pane — kept for future use, TypeScript doesn't flag unused imports with current tsconfig"

patterns-established:
  - "All UI step label rendering imports from ~/lib/step-semantics, never derives locally"
  - "Local formatDelegationIndex functions in sidebar replaced by shared import"

requirements-completed:
  - requirements/pilot-timeline-semantics-and-renderer-unification.md

duration: 8min
completed: 2026-03-21
---

# Phase 82 Plan 03: UI Surfaces — Semantic Labels, Timeline Tab, and Continuation Markers Summary

**Semantic step labels ("Execution", "Judge", "Gap Closure") wired into all web UI surfaces via step-semantics.ts with continuation badges, amber sidebar accents, and renamed "Timeline" tab**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-21T11:53:15Z
- **Completed:** 2026-03-21T12:01:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- All three step-rendering components (step-content-pane, timeline-stream, step-timeline-sidebar) now use `formatStepLabel(group)` — no more "Step N" generic labels
- Continuation/gap-closure steps visually marked: "continuation" badge in content pane header, amber left-border in sidebar, ring accent on mobile pills
- Steps tab renamed to "Timeline" in split-pane-detail; mobile step pills use semantic single-char abbreviations (E=Execution, J=Judge, G=Gap Closure, etc.)
- Running banner shows semantic step label ("Execution #3…") when step group data is available
- Local `formatDelegationIndex` in sidebar removed — now imported from shared step-semantics.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply semantic labels and continuation markers across step-content-pane, timeline-stream, and sidebar** - `ed64562` (feat)
2. **Task 2: Rename Steps tab, fix top-level status narrative, and verify mobile safety** - `0b7f83c` (feat)

**Plan metadata:** *(to be added in final metadata commit)*

## Files Created/Modified

- `web/src/components/step-content-pane.tsx` — Import formatStepLabel/isContinuationStep/stepSemanticClass/formatStepDescription; replace Step N badge with semantic label; add continuation badge and step index hint (#N); show command+args only when it adds info beyond the semantic label
- `web/src/components/timeline-stream.tsx` — Import formatStepLabel; replace stepLabel calculation; rename "Timeline by step" to "Timeline"
- `web/src/components/step-timeline-sidebar.tsx` — Import formatStepLabel/formatDelegationIndex/isContinuationStep; remove local formatDelegationIndex; use formatStepLabel for primary label; add amber border accent for continuation steps
- `web/src/components/split-pane-detail.tsx` — Add mobileStepChar helper; rename Steps→Timeline, Timeline→Summary tabs; update mobile indicator pills with semantic chars and continuation ring; update running banner with semantic label; currentGroup useMemo for label lookup
- `web/src/components/job-list.tsx` — Change "Step N" badge text to "#N" in both JobCard and JobTable (currentStep is just a number, can't derive semantic label without full step group)

## Decisions Made

- **Renamed "Timeline" tab to "Summary"**: When renaming "Steps" tab to "Timeline", the existing "timeline" tab created a naming conflict. Renamed it to "Summary" to preserve functionality while avoiding conflict. Internal `value` attributes unchanged.
- **"#N" instead of semantic label in job-list**: `job-list.tsx` only has `job.currentStep` (a number), not the full `StepTimelineGroup`. Without `command` and `source` data, `formatStepLabel()` cannot be called. Changed to `#N` to reduce semantic confusion while keeping step number visible.
- **Unused imports allowed**: `formatStepDescription` and `stepSemanticClass` are imported in step-content-pane.tsx for future use. TypeScript doesn't error with the project's current tsconfig settings.

## Deviations from Plan

None - plan executed exactly as written, with one clarification needed:

The plan specified `<TabsTrigger value="steps">Steps</TabsTrigger>` → "Timeline" but the file already had a `<TabsTrigger value="timeline">Timeline</TabsTrigger>`. Renamed the existing "Timeline" tab to "Summary" to resolve the naming conflict. This preserves user-visible distinctiveness of the two tabs.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 is the final plan in phase 82
- All semantic label surfaces are now wired: step-content-pane, timeline-stream, step-timeline-sidebar, split-pane-detail
- Phase 82 complete: foundation (01), renderer unification (02), UI wiring (03) all done
- Ready for phase transition

## Self-Check: PASSED

- All 5 modified files exist on disk ✓
- Task commits ed64562 and 0b7f83c exist in git log ✓
- TypeScript compilation passes with no errors ✓

---
*Phase: 82-pilot-timeline-semantics-renderer-unification*
*Completed: 2026-03-21*
