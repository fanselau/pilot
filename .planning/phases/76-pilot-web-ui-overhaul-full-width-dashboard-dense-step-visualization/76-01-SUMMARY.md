---
phase: 76-pilot-web-ui-overhaul
plan: 01
subsystem: ui
tags: [react, tanstack-start, tailwind, typescript, sqlite, time-utils, vitest]

# Dependency graph
requires: []
provides:
  - Timezone-safe timestamp parser (src/core/time-utils.ts) — safeParseTimestamp + computeSafeDurationMs
  - Client-side timestamp utilities (web/src/lib/time-utils.ts) — parseSqliteTimestamp + formatDurationSafe + getDurationMsSafe
  - Full-width layout on all pages (max-w-[1800px])
  - getFullJobTimeline, getProjectsWithStats, getFullSessionPart — backend queries for Plans 03-05
  - getFullJobTimelineFn, getProjectsListFn, getFullMessageFn — server functions for Plans 03-05
  - retryJobAction — fixes pre-existing missing export bug
affects:
  - 76-02
  - 76-03
  - 76-04
  - 76-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Timezone normalization: SQLite UTC strings without Z suffix normalized by appending Z before Date.parse()"
    - "Client/server time-utils duplication: web/src/lib/time-utils.ts mirrors core without sqlite3 dependency"
    - "TDD: RED (failing test) → GREEN (implementation) → committed separately"

key-files:
  created:
    - src/core/time-utils.ts
    - test/core/time-utils.test.ts
    - web/src/lib/time-utils.ts
  modified:
    - src/core/job-introspection.ts
    - src/core/job-detail-query.ts
    - src/core/types.ts
    - web/src/lib/server-fns.ts
    - web/src/routes/__root.tsx
    - web/src/routes/index.tsx
    - web/src/routes/jobs.$jobId.tsx
    - web/src/components/job-list.tsx
    - web/src/components/job-detail.tsx

key-decisions:
  - "Duplicated time-utils for client: web/src/lib/time-utils.ts mirrors core implementation to avoid importing sqlite3-dependent core module in browser bundle"
  - "safeParseTimestamp returns epoch ms (not epoch seconds): consistent with JavaScript Date APIs; job-introspection.ts converts to seconds where needed"
  - "retryJobAction added to job-detail-query.ts: fixes pre-existing missing export bug by delegating to db.requeueFailedJob()"
  - "ProjectWithStats already present in types.ts: confirmed correct, no duplicate needed"

patterns-established:
  - "All SQLite timestamp strings must go through safeParseTimestamp/parseSqliteTimestamp before arithmetic"
  - "Frontend components import from ~/lib/time-utils, never use new Date(sqliteString).getTime() directly"

requirements-completed:
  - WUI-01
  - WUI-07
  - WUI-09

# Metrics
duration: 7min
completed: 2026-03-20
---

# Phase 76 Plan 01: Foundation Summary

**Timezone-safe SQLite timestamp parser with TDD tests, full-width layout (max-w-[1800px]) across all routes, 3 backend queries + server fns for Plans 03-05**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T17:07:00Z
- **Completed:** 2026-03-20T17:14:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created `safeParseTimestamp` and `computeSafeDurationMs` in `src/core/time-utils.ts` with 18 TDD test cases — fixes timezone bug where SQLite UTC strings (no Z suffix) were parsed as local time
- Replaced all `max-w-5xl` with `max-w-[1800px]` in `__root.tsx`, `index.tsx`, `jobs.$jobId.tsx` enabling full-width layout
- Created `web/src/lib/time-utils.ts` — client-safe mirror of core time-utils without sqlite3 dependency; fixed all frontend duration calculations in `job-list.tsx` and `job-detail.tsx`
- Added `getFullJobTimeline`, `getProjectsWithStats`, `getFullSessionPart` to `job-detail-query.ts` + corresponding server functions for Plans 03-05 consumption

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing TDD tests** - `b661250` (test)
2. **Task 1 (GREEN): Safe timestamp parser + backend queries** - `6c67563` (feat)
3. **Task 2: Full-width layout + client time-utils + frontend fix** - `35f0730` (feat)

## Files Created/Modified
- `src/core/time-utils.ts` — safeParseTimestamp, computeSafeDurationMs (timezone-safe UTC parser)
- `test/core/time-utils.test.ts` — 18 TDD test cases for timestamp parsing edge cases
- `web/src/lib/time-utils.ts` — parseSqliteTimestamp, formatDurationSafe, getDurationMsSafe (client-safe copy)
- `src/core/job-introspection.ts` — parseTimestampToEpochSeconds delegates to safeParseTimestamp
- `src/core/job-detail-query.ts` — computeDurationMs + parseStepTime use time-utils; 3 new functions + retryJobAction added
- `src/core/types.ts` — ProjectWithStats confirmed present (already existed)
- `web/src/lib/server-fns.ts` — getFullJobTimelineFn, getProjectsListFn, getFullMessageFn added; import cleanup
- `web/src/routes/__root.tsx` — max-w-5xl → max-w-[1800px]
- `web/src/routes/index.tsx` — max-w-5xl → max-w-[1800px] (2 occurrences)
- `web/src/routes/jobs.$jobId.tsx` — max-w-5xl → max-w-[1800px]
- `web/src/components/job-list.tsx` — formatDuration + getDurationMs delegate to time-utils
- `web/src/components/job-detail.tsx` — formatTime + running duration use parseSqliteTimestamp

## Decisions Made
- **Client/server time-utils duplication**: `web/src/lib/time-utils.ts` intentionally mirrors `src/core/time-utils.ts` to avoid importing core (which has sqlite3 deps) in browser bundles
- **safeParseTimestamp returns epoch ms**: Consistent with JS Date APIs; `parseTimestampToEpochSeconds` in job-introspection.ts converts to seconds where needed
- **retryJobAction fixed as deviation**: Was imported in server-fns.ts but never exported from job-detail-query.ts — added by delegating to `db.requeueFailedJob()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing retryJobAction export to job-detail-query.ts**
- **Found during:** Task 1 (adding server functions)
- **Issue:** `server-fns.ts` imported `retryJobAction` from `@pilot/core/job-detail-query.js` but the function was never defined or exported there — a pre-existing bug causing a TypeScript error
- **Fix:** Added `retryJobAction(jobId)` to `job-detail-query.ts` delegating to `db.requeueFailedJob(jobId)`; added to exports
- **Files modified:** `src/core/job-detail-query.ts`
- **Verification:** TypeScript LSP error on `retryJobAction` import resolved
- **Committed in:** `6c67563`

**2. [Rule 1 - Bug] ProjectWithStats already existed in types.ts**
- **Found during:** Task 1 (adding ProjectWithStats interface)
- **Issue:** Plan said to add ProjectWithStats to types.ts but it was already present (added by a prior quick task)
- **Fix:** Confirmed the existing interface matches the plan spec — no duplicate added
- **Files modified:** None (already correct)

**3. [Rule 1 - Bug] server-fns.ts had stale direct db.ts imports for getProjectsListFn**
- **Found during:** Task 1 (updating server-fns.ts)
- **Issue:** `server-fns.ts` was already modified with `getProjectsListFn` inline using `getAllProjects`/`getProjectJobCounts` directly from db.ts
- **Fix:** Updated to use the new `getProjectsWithStats()` function from job-detail-query.ts and removed the stale direct db.ts imports
- **Files modified:** `web/src/lib/server-fns.ts`
- **Committed in:** `6c67563`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 pre-existing issue)
**Impact on plan:** All auto-fixes necessary for correctness and consistency. No scope creep.

## Issues Encountered
None - all verifications passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend foundation complete: `getFullJobTimeline`, `getProjectsWithStats`, `getFullSessionPart` ready for Plans 03-05
- Server functions ready: `getFullJobTimelineFn`, `getProjectsListFn`, `getFullMessageFn` exported and importable
- Full-width layout in place for split-pane implementation in Plan 02+
- All duration calculations are now timezone-safe in both backend and frontend

---
*Phase: 76-pilot-web-ui-overhaul*
*Completed: 2026-03-20*
