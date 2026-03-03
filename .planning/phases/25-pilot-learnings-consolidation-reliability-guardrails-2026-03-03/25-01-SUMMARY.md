---
phase: 25-pilot-learnings-consolidation-reliability-guardrails-2026-03-03
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, job-queue, reconciliation, serialization]

# Dependency graph
requires:
  - phase: 17-pilot-v2-complete-rewrite
    provides: SQLite job queue DB with db.ts CRUD operations

provides:
  - getRunningJobsForProject(project) — query running jobs for a project
  - getAllRunningJobs() — query all currently running jobs
  - reconcileStaleJobs(activeJobIds) — reset ghost-running jobs to pending
  - markStale(id) — mark a single running job as stale-pending

affects:
  - 25-02 (runner uses getRunningJobsForProject for serialization guard + reconcileStaleJobs on startup)
  - 25-04 (tests exercise all four new functions)
  - 26 (claimNextLaunchable builds on serialization primitives from this phase)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reconciliation pattern: runner tracks activeJobIds Set, DB detects divergence"
    - "WHERE id = ? AND status = 'running' guard on markStale prevents double-reset"

key-files:
  created: []
  modified:
    - src/core/db.ts

key-decisions:
  - "reconcileStaleJobs calls getAllRunningJobs internally (not getDb directly) for consistency"
  - "markStale sets started_at = NULL so job gets a fresh attempt next run"
  - "error field records reconciliation reason for debugging ghost-running jobs"
  - "WHERE status = 'running' guard on markStale prevents idempotency issues"

patterns-established:
  - "Reconciliation: compare DB state vs runner in-memory state, reset divergences"
  - "Stale job recovery: pending reset with error annotation, not failed, so job retries"

# Metrics
duration: 1min
completed: 2026-03-03
---

# Phase 25 Plan 01: DB Layer — Serialization and Reconciliation Helpers Summary

**Four new DB functions enabling same-project serialization and stale-running reconciliation: `getRunningJobsForProject`, `getAllRunningJobs`, `reconcileStaleJobs`, `markStale`**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-03T17:08:28Z
- **Completed:** 2026-03-03T17:09:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `getRunningJobsForProject(project: string): Job[]` — queries running jobs for a specific project, ordered by started_at ASC; used by runner for same-project serialization guard
- Added `getAllRunningJobs(): Job[]` — queries all currently running jobs; used internally by reconcileStaleJobs and available for status/monitoring
- Added `reconcileStaleJobs(activeJobIds: Set<string>): string[]` — compares all DB-running jobs against runner's known active set, resets any divergences to pending via markStale, returns IDs of reset jobs for logging
- Added `markStale(id: string): void` — atomically resets a running job to pending with a reconciliation note in the error field; `WHERE status = 'running'` guard prevents double-reset idempotency issues

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getRunningJobsForProject and getAllRunningJobs** - `6fa71db` (feat)
2. **Task 2: Add reconcileStaleJobs and markStale** - `bb4c0bf` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/core/db.ts` — Added four new exported functions after `getQueue()`: `getRunningJobsForProject`, `getAllRunningJobs`, `reconcileStaleJobs`, `markStale`

## Decisions Made

- `reconcileStaleJobs` calls `getAllRunningJobs()` internally (not `getDb()` directly) for consistency and reuse
- `markStale` sets `started_at = NULL` so the job gets a fresh timing on next run (not stale duration from ghost session)
- `error` field on reset jobs records the reconciliation reason for post-mortem debugging
- `WHERE id = ? AND status = 'running'` guard on `markStale` makes it safely idempotent

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DB layer complete for Phase 25: all four functions available for import by runner (25-02)
- `getRunningJobsForProject` ready for serialization guard: `if (getRunningJobsForProject(job.project).length > 0) skip`
- `reconcileStaleJobs` ready for startup call: `reconcileStaleJobs(new Set(activeJobs.keys()))`
- All 26 existing `db.test.ts` tests pass — no regressions

---
*Phase: 25-pilot-learnings-consolidation-reliability-guardrails-2026-03-03*
*Completed: 2026-03-03*
