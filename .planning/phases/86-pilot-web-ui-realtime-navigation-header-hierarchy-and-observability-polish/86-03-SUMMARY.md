---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
plan: "03"
subsystem: ui
tags: [react, typescript, step-headers, scroll, ux, sticky-headers, deep-link]

# Dependency graph
requires:
  - phase: 63-pilot-step-first-detail-flow
    provides: StepTimelineGroup, step-content-pane, split-pane-detail, step-timeline-sidebar
provides:
  - synthesizeHeaderFields() helper centralizing rich header field derivation
  - SynthesizedHeaderFields interface for structured header data
  - Color-coded sticky step headers differentiated by hierarchy level
  - Summary deep-link (click-to-scroll) from sidebar and step header
affects:
  - step-content-pane
  - step-timeline-sidebar
  - step-semantics

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "synthesizeHeaderFields pattern: centralized header field synthesis from StepTimelineGroup"
    - "Colored border differentiation: step type → border color (execution=primary, judge=amber, gap=orange)"
    - "Two-row sticky header: row1=label+status+model+duration, row2=stage+counters+reason"

key-files:
  created: []
  modified:
    - web/src/lib/step-semantics.ts
    - web/src/components/step-content-pane.tsx
    - web/src/components/step-timeline-sidebar.tsx

key-decisions:
  - "synthesizeHeaderFields in step-semantics.ts (not inline in component) — centralizes derivation for reuse across multiple UI surfaces"
  - "statusCounters count fork-card items only — these are child sessions, the meaningful 'running sessions' count"
  - "hasSummary = isJudgeStep(group) && !!verdictReason — both conditions needed to avoid false positives"
  - "Sidebar summary indicator is a separate clickable element from main step button — different click targets for different actions"

patterns-established:
  - "Step type → color mapping: execution/delegation=primary, judge/verify=amber, gap-closure=orange, failed-retry=red, quick/unattributed=muted"
  - "Summary deep-link ID format: step-${stepIndex}-summary"

requirements-completed: [STICK86-01, STICK86-02, STICK86-03, STICK86-04, SUMM86-01]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 86 Plan 03: Sticky Header Hierarchy + Summary Deep-Link Summary

**Rich two-row sticky step headers differentiated by type (execution=primary border, judge=amber, gap-closure=orange) with synthesizeHeaderFields() helper; sidebar summary indicators scroll to verdict cards**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T00:08:47Z
- **Completed:** 2026-03-22T00:11:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `SynthesizedHeaderFields` interface + `synthesizeHeaderFields()` to step-semantics.ts — centralizes header field derivation (label, stage, verdict, model, statusCounters, continuationReason, hasSummary, isActive)
- Reworked sticky step headers in step-content-pane.tsx to two-row layout with color-coded bottom borders per step type, active pulse dot + left accent bar, "View Summary" deep-link button
- Added sidebar summary indicator icons in step-timeline-sidebar.tsx — clicking jumps to step-N-summary verdict card

## Task Commits

Each task was committed atomically:

1. **Task 1: Header field synthesis + sticky header redesign** - `262c64c` (feat)
2. **Task 2: Summary deep-link sidebar indicator** - `fa3e1b2` (feat)

## Files Created/Modified

- `web/src/lib/step-semantics.ts` — Added SynthesizedHeaderFields interface and synthesizeHeaderFields() function, plus BranchLifecycleItem import
- `web/src/components/step-content-pane.tsx` — Reworked sticky headers (two-row, color borders, pulse dot, z-20, View Summary button), added id on verdict cards, stepHeaderBorderClass helper
- `web/src/components/step-timeline-sidebar.tsx` — Replaced step buttons with flex wrapper, added separate summary indicator button with scrollIntoView

## Decisions Made

- Used `synthesizeHeaderFields` in step-semantics.ts rather than inline in the component — ensures all UI surfaces (current and future) use consistent header field derivation
- StatusCounters count fork-card (BranchLifecycleItem) items only, since those represent child sessions (the meaningful "sessions active/done" concept)
- Sidebar summary indicator is a separate clickable element (not part of the main step click target) — users expect the step label click = scroll to step top, while the icon click = scroll to summary
- Verdict card left border color reflects verdict outcome (green=pass/done, red=failed, amber=pending/doubting)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three must-have artifacts created/modified: step-semantics.ts (synthesizeHeaderFields), step-content-pane.tsx (sticky + summary scroll-to), step-timeline-sidebar.tsx (summary indicator)
- Build verified clean (✓ built in ~1s)
- Ready for remaining plans in phase 86

## Self-Check: PASSED

- FOUND: web/src/lib/step-semantics.ts ✓
- FOUND: web/src/components/step-content-pane.tsx ✓
- FOUND: web/src/components/step-timeline-sidebar.tsx ✓
- Commits 262c64c (Task 1) and fa3e1b2 (Task 2) exist in git log ✓
- Build: ✓ built in ~1s (no TypeScript errors) ✓

---
*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Completed: 2026-03-22*
