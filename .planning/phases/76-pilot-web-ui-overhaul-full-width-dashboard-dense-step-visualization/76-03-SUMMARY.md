---
phase: 76-pilot-web-ui-overhaul
plan: 03
subsystem: ui
tags: [react-query, tanstack, timeline, pagination, sse, typescript]

# Dependency graph
requires:
  - phase: 76-pilot-web-ui-overhaul
    provides: getJobTimeline paginated query, getSessionParts, server-fns scaffold
provides:
  - Non-paginated timeline via getFullJobTimeline (limit:10000) returning GroupedTimelinePage|null
  - Show full button in ActivityRow using getFullMessageFn for text >220 chars
  - Single-query session activity (limit:1000, no pagination)
  - SSE live invalidation preserved for timeline
affects:
  - 76-04
  - 76-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useQuery (not useInfiniteQuery) for timeline: single full-load query with refetchInterval"
    - "SSE invalidation pattern: useJobDetailStream events trigger queryClient.invalidateQueries"
    - "Show full pattern: useState<string|null> + getFullMessageFn lazy fetch per ActivityRow"

key-files:
  created: []
  modified:
    - src/core/job-detail-query.ts
    - web/src/components/timeline-stream.tsx
    - web/src/components/session-activity.tsx
    - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx

key-decisions:
  - "getFullJobTimeline uses limit:10000 (not 50000) — high enough for all practical jobs"
  - "session-activity keeps Collapsible [expand] pattern (text already fully loaded server-side)"
  - "ActivityRow Show full calls getFullMessageFn for parity with plan spec even though text is in item.text"
  - "Removed initialLimit prop from SessionActivityProps — all-at-once load removes need for configurable limits"

patterns-established:
  - "Non-paginated timeline: useQuery + getFullJobTimelineFn + refetchInterval:5000 when active"
  - "Show full button: isTruncated check + useState<string|null> + lazy getFullMessageFn call"

requirements-completed:
  - WUI-04
  - WUI-05

# Metrics
duration: 9min
completed: 2026-03-20
---

# Phase 76 Plan 03: Remove Timeline Pagination + Show Full Summary

**Single-query non-paginated timeline with Show full expansion for truncated activity rows**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-20T17:18:43Z
- **Completed:** 2026-03-20T17:28:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed `getFullJobTimeline` to use `limit: 10000` returning `GroupedTimelinePage | null` (was capped at 100 items)
- Rewrote `timeline-stream.tsx` replacing `useInfiniteQuery` with `useQuery` + `getFullJobTimelineFn`
- Added "Show full" button in `ActivityRow` for text > 220 chars — fetches via `getFullMessageFn`
- Simplified `session-activity.tsx` to single `useQuery` (limit: 1000, no pagination)
- Removed all "Load more" buttons from both components
- SSE live invalidation preserved via `useJobDetailStream` + `queryClient.invalidateQueries`

## Task Commits

Each task was committed atomically:

1. **Task 1: Non-paginated timeline query + full message fetch backend** - `32a8305` (feat)
2. **Task 2: Remove pagination from timeline + session, add Show full button** - `2b0f021` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified
- `src/core/job-detail-query.ts` — Fixed `getFullJobTimeline` limit:10000, return type GroupedTimelinePage|null
- `web/src/components/timeline-stream.tsx` — Full rewrite: useQuery, getFullJobTimelineFn, Show full, no Load more
- `web/src/components/session-activity.tsx` — Simplified: single useQuery, no pagination, no Load more
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Removed initialLimit prop from SessionActivity call

## Decisions Made
- Used `limit: 10000` (not `limit: 50000`) for `getFullJobTimeline` — sufficient for all practical jobs and more conservative
- Kept Collapsible `[expand]` pattern in `PartCard` for session-activity.tsx since text is already fully loaded server-side (no truncation)
- `ActivityRow` Show full calls `getFullMessageFn` per plan spec (consistent pattern even though `item.text` is already full text)
- Removed `initialLimit` prop from `SessionActivityProps` — all-at-once loading removes the need for configurable initial limits
- `useJobDetailStream` gets `'0'` as cursor (not the old nextCursor from paginated pages) — since we refetch the full timeline, cursor doesn't matter for SSE invalidation triggering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed initialLimit prop removal from caller**
- **Found during:** Task 2 (session-activity.tsx rewrite)
- **Issue:** `jobs.$jobId.sessions.$sessionId.tsx` called `<SessionActivity initialLimit={30} />` — removing the prop from the interface broke the caller
- **Fix:** Removed `initialLimit={30}` from the caller since we now load all data with limit:1000
- **Files modified:** `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx`
- **Verification:** TypeScript `tsc --noEmit` passed with no errors
- **Committed in:** 2b0f021 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — caller prop cleanup)
**Impact on plan:** Auto-fix necessary for TypeScript correctness. No scope creep.

## Issues Encountered
- `getFullJobTimeline` was already scaffolded in job-detail-query.ts (from 76-01/76-02) but used the default limit of 100 (capped). Fixed to use `limit: 10000` returning `GroupedTimelinePage | null` directly.
- `getFullJobTimelineFn` and `getFullMessageFn` were already in `server-fns.ts` from prior setup.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Timeline loads all data without pagination ✓
- Session activity loads all parts without pagination ✓
- Show full button works for truncated ActivityRow items ✓
- SSE live updates preserved ✓
- TypeScript clean with no errors ✓
- Ready for 76-04 (dense step visualization or further UI work)

---
*Phase: 76-pilot-web-ui-overhaul*
*Completed: 2026-03-20*
