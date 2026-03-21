---
phase: 82-pilot-timeline-semantics-renderer-unification
plan: 04
subsystem: ui
tags: [timeline, step-semantics, verdict, judge, react, typescript]

# Dependency graph
requires:
  - phase: 82-pilot-timeline-semantics-renderer-unification
    provides: previous plans 01-03 establishing step-semantics and split-pane layout

provides:
  - Stacked metadata header layout in ActivityRow and ToolSummaryRow (timestamp+badge above content)
  - No remaining generic Step N / Building step fallbacks in any web UI component
  - isJudgeStep() helper exported from step-semantics.ts
  - verdictReason field on StepTimelineGroup type and populated through core query
  - Inline amber verdict card in step-content-pane for judge step groups
  - Compact verdict line in timeline-stream StepGroupSection for judge step groups

affects:
  - 82-pilot-timeline-semantics-renderer-unification (gap closure target)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stacked metadata header: outer div with space-y-0.5, header div with flex items-center, content div below"
    - "isJudgeStep(): detect judge steps by command containing judge/verify or source starting with judge:"
    - "verdictReason flows from DB → TimelineStepRef → StepTimelineGroup → UI components"

key-files:
  created: []
  modified:
    - web/src/components/timeline-stream.tsx
    - web/src/components/split-pane-detail.tsx
    - web/src/components/step-timeline-sidebar.tsx
    - web/src/components/step-content-pane.tsx
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - web/src/lib/step-semantics.ts

key-decisions:
  - "isJudgeStep uses command.includes('judge'/'verify') OR source.startsWith('judge:') — covers both step types"
  - "Verdict block uses amber color scheme (border-amber-500/30, bg-amber-500/5) consistent with warning/judge semantic"
  - "ActivityRow/ToolSummaryRow stacked: py-1.5 max-w-full overflow-hidden space-y-0.5 outer, flex items-center gap-x-2 header"
  - "Generic step fallback uses #N format (not 'Step N') — numeric indicator without semantically incorrect label word"

patterns-established:
  - "Timeline row metadata-above-content: stacked layout with space-y-0.5 and dedicated header div"
  - "Judge verdict rendering: amber-tinted card with 'Verdict' uppercase label + status badge + reason text"

requirements-completed:
  - requirements/pilot-timeline-semantics-and-renderer-unification.md

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 82 Plan 04: Gap Closure — Timeline Layout + Verdict Surfacing Summary

**Stacked metadata header rows in ActivityRow/ToolSummaryRow, all generic Step N fallbacks replaced with #N, and judge verdict surfaced as first-class inline visual via verdictReason flowing from core types through UI**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T12:17:58Z
- **Completed:** 2026-03-21T12:23:34Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Refactored `ActivityRow` and `ToolSummaryRow` in timeline-stream.tsx to stacked layout: metadata header (timestamp + badge) above content, using `space-y-0.5` and dedicated flex header div
- Eliminated all 3 generic "Step N" / "Building step" fallbacks across split-pane-detail.tsx (×2) and step-timeline-sidebar.tsx — replaced with `#N` compact format
- Added `verdictReason?: string | null` to `StepTimelineGroup` type and propagated through `TimelineStepRef` and group construction in job-detail-query.ts
- Added `isJudgeStep()` helper to step-semantics.ts (command contains 'judge'/'verify' OR source starts with 'judge:')
- Added inline amber verdict card in step-content-pane.tsx for judge step groups with verdictReason
- Added compact verdict line in timeline-stream.tsx StepGroupSection for judge step groups

## Task Commits

Each task was committed atomically:

1. **Task 1: Stacked layout + generic Step N removal** - `b6e985f` (feat)
2. **Task 2: Judge verdict first-class object + verdictReason flow** - `6294089` (feat)

**Plan metadata:** TBD (docs: complete plan — see final commit below)

## Files Created/Modified
- `web/src/components/timeline-stream.tsx` — stacked ActivityRow/ToolSummaryRow + isJudgeStep import + verdict line in StepGroupSection
- `web/src/components/split-pane-detail.tsx` — replaced 2× Step N fallbacks with #N
- `web/src/components/step-timeline-sidebar.tsx` — replaced Step {job.currentStep} with #{job.currentStep}
- `web/src/components/step-content-pane.tsx` — isJudgeStep import + inline amber verdict card
- `src/core/types.ts` — verdictReason field on StepTimelineGroup
- `src/core/job-detail-query.ts` — verdictReason in TimelineStepRef + populated in stepRefs and group construction
- `web/src/lib/step-semantics.ts` — isJudgeStep() exported helper

## Decisions Made
- Used `isJudgeStep` combining command-based AND source-based detection to catch both named judge commands and judge-sourced steps (gap closure, recovery, retry)
- Chose amber color scheme for verdict UI (border-amber-500/30, bg-amber-500/5) — consistent with "judge/warning" semantic already in verdict-card.tsx
- Generic step fallback uses `#N` (not `Step N`) — compact, numeric, avoids semantically incorrect "Step" label

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- 4 pre-existing test failures confirmed unrelated to plan changes (opencode-db stale-child test, tui shortcuts test, web job-routes tests). Same failures on baseline without changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 gap truths from Phase 82 verification are now closeable: metadata layout stacked (Truth #5/#12), no generic Step N (Truth #7), judge verdict surfaced (Truth #10)
- Phase 82 plan 04 is the last plan in the phase — phase ready for verification

---
*Phase: 82-pilot-timeline-semantics-renderer-unification*
*Completed: 2026-03-21*
