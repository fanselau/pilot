---
phase: 62-pilot-web-ui-phase-2
plan: 01
subsystem: api
tags: [timeline, discriminated-union, server-functions, tanstack-start, mutations]

# Dependency graph
requires:
  - phase: 61
    provides: compact query backbone (getJobDetail, getSessionActivity, server-fns.ts)
provides:
  - getJobTimeline() merged chronological timeline query
  - TimelineItem discriminated union (activity, tool-summary, fork-card, completion-card)
  - TimelinePage cursor-based pagination type
  - Mutation wrappers (retryJobAction, cancelJobAction, forceQuitJobAction, unblockProjectAction)
  - Server functions for timeline + mutations (getJobTimelineFn, retryJobFn, cancelJobFn, forceQuitJobFn, unblockProjectFn)
affects: [62-02, 62-03, 62-04, 62-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [merged-timeline-composition, discriminated-union-timeline-items, mutation-server-functions]

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - web/src/lib/server-fns.ts

key-decisions:
  - "forceQuitJobAction uses source='cli' since db.forceQuitJob only accepts 'cli'|'tui'"
  - "Mutation server functions wrap in try/catch returning { ok: false } for fire-and-forget safety"
  - "Completion cards only emitted when child session timeUpdated > timeCreated (meaningful duration)"

patterns-established:
  - "Timeline composition: merge root parts + child fork cards into single sorted stream"
  - "Mutation RPCs: POST server functions with { ok: boolean } return for web UI actions"

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 62 Plan 01: Merged Timeline Query + Mutation Server Functions Summary

**Merged timeline composition layer with discriminated TimelineItem union, cursor-based pagination, and 5 mutation server functions for web UI actions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T15:32:45Z
- **Completed:** 2026-03-13T15:36:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added TimelineItem discriminated union with 4 kinds (activity, tool-summary, fork-card, completion-card) for type-safe rendering
- Implemented getJobTimeline() that merges root session activity with sub-agent fork cards in chronological order
- Added mutation wrappers delegating to db.ts (retry, cancel, forceQuit, unblock)
- Created 5 new server functions in server-fns.ts (timeline query + 4 mutations)
- Cursor-based pagination with configurable limit (default 100)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TimelineItem types and getJobTimeline() query function** - `fa6d88d` (feat)
2. **Task 2: Add timeline and mutation server functions** - `8ee9208` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added TimelineItem discriminated union, TimelinePage, and 4 item interfaces
- `src/core/job-detail-query.ts` - Added getJobTimeline() composition function and 4 mutation wrappers
- `web/src/lib/server-fns.ts` - Added 5 server functions (getJobTimelineFn, retryJobFn, cancelJobFn, forceQuitJobFn, unblockProjectFn)

## Decisions Made
- Used `source='cli'` for forceQuitJobAction since db.forceQuitJob only accepts `'cli' | 'tui'` — web UI is closest to CLI semantics
- Mutation server functions wrap in try/catch returning `{ ok: false }` on error for fire-and-forget safety in web context
- Completion cards only emitted for done child sessions where timeUpdated > timeCreated to avoid zero-duration cards

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Timeline query and mutation server functions ready for web UI consumption
- Ready for 62-02-PLAN.md (next plan in phase)

---
*Phase: 62-pilot-web-ui-phase-2*
*Completed: 2026-03-13*
