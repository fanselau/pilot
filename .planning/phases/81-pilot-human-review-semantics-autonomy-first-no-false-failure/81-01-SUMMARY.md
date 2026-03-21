---
phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure
plan: 01
subsystem: database
tags: [sqlite, job-status, review-states, tdd, introspection]

# Dependency graph
requires:
  - phase: 73-judge-step-continuation
    provides: append-forward job step model and DB functions
provides:
  - Extended JobStatus type with completed_pending_review and review_hold
  - DB functions for review state lifecycle (mark, approve, resume)
  - Job introspection triage codes for both review states
  - Schema migration for existing databases
affects:
  - runner (needs to call markCompletedPendingReview/markReviewHold)
  - CLI pilot-review command (approveReview/resumeFromReviewHold)
  - TUI/web UI (review states in queue and recent views)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Review states never block projects — deliberate NOT calling blockProject()"
    - "SQLite CHECK constraint migration via sqlite_master detection + table recreation"
    - "TDD RED-GREEN-REFACTOR with separate commits per phase"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/job-introspection.ts
    - test/core/db.test.ts
    - test/core/job-introspection.test.ts

key-decisions:
  - "Review states (completed_pending_review, review_hold) do NOT block projects — critical invariant"
  - "SQLite CHECK constraint migration: detect via sqlite_master, recreate table if needed"
  - "migrateReviewStates() runs after migrateSchema() but before seedModelTables()"
  - "review_hold included in getQueue() (mid-execution), completed_pending_review in getRecent()"
  - "approveReview/resumeFromReviewHold use WHERE id = ? AND status = ... for safe no-op on wrong state"

patterns-established:
  - "Pattern: Non-blocking terminal states — completed_pending_review and review_hold set status without blockProject()"
  - "Pattern: SQLite schema migration via sqlite_master inspection and table recreation under PRAGMA foreign_keys=off"

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05, REVIEW-06]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 81 Plan 01: Review State Foundation Summary

**Extended JobStatus with `completed_pending_review`/`review_hold`, SQLite CHECK migration, 4 DB lifecycle functions, and introspection triage — review states never block projects**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T10:50:00Z
- **Completed:** 2026-03-21T10:55:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Extended `JobStatus` union type from 6 to 8 values with `completed_pending_review` and `review_hold`
- Added `migrateReviewStates()` that detects old CHECK constraint via `sqlite_master` and safely recreates the table with updated constraint (PRAGMA foreign_keys=off + DROP/RENAME)
- Added 4 new DB lifecycle functions: `markCompletedPendingReview`, `markReviewHold`, `approveReview`, `resumeFromReviewHold` — none call `blockProject()`
- Updated `getQueue()` to include `review_hold` (mid-execution jobs), `getRecent()` to include `completed_pending_review` (autonomous execution done)
- Extended `buildJobWhy()` with `pending-human-review` and `review-hold` triage codes including actionable `next` hints

## Task Commits

Each task was committed atomically following TDD RED-GREEN-REFACTOR:

1. **Task 1: Extend JobStatus + DB schema + review state functions**
   - `6fcee66` (test): RED — failing tests for review state transitions
   - `78d9a0c` (feat): GREEN — DB functions and CHECK constraint migration

2. **Task 2: Update job-introspection for review states**
   - `576f76e` (test): RED — failing tests for review state introspection
   - `675fc4f` (feat): GREEN — implement review state triage in buildJobWhy

## Files Created/Modified

- `src/core/types.ts` — Extended `JobStatus` union with `completed_pending_review` and `review_hold`
- `src/core/db.ts` — `migrateReviewStates()`, 4 new functions, updated `getQueue()`/`getRecent()`, exports
- `src/core/job-introspection.ts` — Added `pending-human-review` and `review-hold` to `JobWhyCode`, early returns in `buildJobWhy`
- `test/core/db.test.ts` — 13 new tests for review state transitions (now 114 total)
- `test/core/job-introspection.test.ts` — 5 new tests for review state introspection (now 18 total)

## Decisions Made

- **Review states never block**: `markCompletedPendingReview` and `markReviewHold` explicitly do NOT call `blockProject()` — the critical invariant of this phase. Comments make this deliberate.
- **Schema migration approach**: Used `sqlite_master` inspection to detect old CHECK constraint, then PRAGMA foreign_keys=off + CREATE jobs_review_migration + INSERT SELECT + DROP + RENAME. This is safe for both fresh DBs (no-op) and existing DBs.
- **getQueue includes review_hold**: `review_hold` jobs are mid-execution and should appear in the queue view. `completed_pending_review` is terminal-ish and belongs in `getRecent`.
- **approveReview WHERE guard**: Uses `WHERE id = ? AND status = 'completed_pending_review'` — safe no-op if job is in wrong state, no error thrown.
- **introspection action field**: Plan used `action` but `JobWhy` interface uses `next` — used `next` throughout for type correctness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used `next` field instead of `action` in JobWhy returns**
- **Found during:** Task 2 (implementing buildJobWhy review state cases)
- **Issue:** Plan spec used `action:` field name but `JobWhy` interface defines `next: string`; using `action` would cause TypeScript errors
- **Fix:** Used `next` field with the same content as specified for `action` in the plan
- **Files modified:** src/core/job-introspection.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 675fc4f (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (1 field name correction for type safety)
**Impact on plan:** Minimal — same content, correct field name. No semantic change.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Review state contract layer is complete: types, DB schema, lifecycle functions, and introspection
- Ready for Phase 81-02: Runner integration — detecting judge signals and calling `markCompletedPendingReview`/`markReviewHold`
- Ready for Phase 81-03: CLI and UI — `pilot review` command using `approveReview`/`resumeFromReviewHold`

## Self-Check: PASSED

- ✅ src/core/types.ts — exists
- ✅ src/core/db.ts — exists
- ✅ test/core/db.test.ts — exists
- ✅ 81-01-SUMMARY.md — exists
- ✅ Commits 6fcee66, 78d9a0c, 576f76e, 675fc4f — found in git log
- ✅ 158 tests pass (db.test.ts + job-introspection.test.ts + judge-signal.test.ts)

---
*Phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure*
*Completed: 2026-03-21*
