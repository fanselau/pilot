---
phase: 78-web-ui-premium-data-rich-dense-modern-dashboard
plan: 02
subsystem: ui
tags: [react, tanstack-query, sparkline, observability, verdict, git]

requires:
  - phase: 78-web-ui-premium-data-rich-dense-modern-dashboard
    provides: sparkline primitives (TokenBar, DurationBar, CostDot), status badges, copy button, format utilities
provides:
  - ObservabilityCard component (token breakdown, cost, model match)
  - VerdictCard component (verdict badge, confidence bar, gap list, history)
  - GitCheckpointCard component (SHA display with copy, dirty indicator)
  - Enriched step sidebar rows (duration bars, source badges, reason tooltips)
  - Git fields on JobDetailSnapshot.job type
affects: [78-web-ui-premium-data-rich-dense-modern-dashboard]

tech-stack:
  added: []
  patterns:
    - "Info card pattern: compact border-b sections in sidebar with data fetching via useQuery"
    - "stepMap pattern: useMemo Map for O(1) step metadata lookup in sidebar"

key-files:
  created:
    - web/src/components/observability-card.tsx
    - web/src/components/verdict-card.tsx
    - web/src/components/git-checkpoint-card.tsx
  modified:
    - web/src/components/step-timeline-sidebar.tsx
    - src/core/types.ts
    - src/core/job-detail-query.ts

key-decisions:
  - "ObservabilityCard fetches via getJobObservabilityFn with 5s refetch for active jobs"
  - "VerdictCard renders collapsible gap list using base-ui Collapsible"
  - "GitCheckpointCard is pure presentational — receives props, no data fetching"
  - "Step rows enriched with DurationBar, SourceBadge, compact duration text, and reason tooltips"

patterns-established:
  - "Info card section: border-b p-3 space-y-2 container with 10px uppercase label header"
  - "stepMap: useMemo Map for step metadata lookup from snapshot.steps"

requirements-completed: []

duration: 4min
completed: 2026-03-21
---

# Phase 78 Plan 02: Job Detail Left-Pane Enrichment Summary

**ObservabilityCard, VerdictCard, GitCheckpointCard for left pane + enriched step sidebar with duration bars, source badges, and reason tooltips**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T03:46:41Z
- **Completed:** 2026-03-21T03:51:03Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Three new left-pane info cards surface token/cost/model observability, judge verdicts with confidence and gap lists, and git checkpoint SHAs
- Step sidebar rows now show duration mini-bars, source badges, compact duration text, reason tooltips, and error dots
- JobDetailSnapshot.job type extended with gitBaseCommit, gitHeadCommit, startedDirty fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ObservabilityCard, VerdictCard, GitCheckpointCard** - `b82c7f7` (feat)
2. **Task 2: Enrich step sidebar and wire cards into split-pane** - `7aeb157` (feat)

## Files Created/Modified
- `web/src/components/observability-card.tsx` - Token breakdown, per-model usage, cost estimate card
- `web/src/components/verdict-card.tsx` - Judge verdict badge, confidence bar, gap list, history progression
- `web/src/components/git-checkpoint-card.tsx` - Git SHA display with copy buttons and dirty indicator
- `web/src/components/step-timeline-sidebar.tsx` - Enhanced with DurationBar, SourceBadge, cards, stepMap
- `src/core/types.ts` - Added git fields to JobDetailSnapshot.job
- `src/core/job-detail-query.ts` - Map git fields in getJobDetail()

## Decisions Made
- ObservabilityCard fetches data via `getJobObservabilityFn` with 5s refetch for active jobs
- VerdictCard uses base-ui Collapsible for expandable gap list
- GitCheckpointCard is pure props-based (no server fetch needed — data comes from snapshot)
- Step rows use `stepMap` (useMemo Map) for O(1) metadata lookup from snapshot.steps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added git fields to JobDetailSnapshot.job type**
- **Found during:** Task 2
- **Issue:** Plan noted git fields might not be in the type — they weren't
- **Fix:** Added gitBaseCommit, gitHeadCommit, startedDirty to types.ts and mapped in getJobDetail()
- **Files modified:** src/core/types.ts, src/core/job-detail-query.ts
- **Verification:** grep confirms fields present in both type and query
- **Committed in:** 7aeb157 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Expected — plan explicitly noted this might be needed. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 info cards render in the left pane between Models and Steps sections
- Step rows now show rich metadata (duration, source, reason, errors)
- Ready for Plan 03 (next phase of UI enrichment)

---
*Phase: 78-web-ui-premium-data-rich-dense-modern-dashboard*
*Completed: 2026-03-21*
