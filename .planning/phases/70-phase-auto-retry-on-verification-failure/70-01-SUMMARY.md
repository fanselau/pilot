---
phase: 70-phase-auto-retry-on-verification-failure
plan: 01
subsystem: database
tags: [sqlite, retry, lineage, better-sqlite3]

# Dependency graph
requires:
  - phase: 67-session-blocker-handling-db-based-hung-detection
    provides: persisted retry_budget/retry_count/hung retry primitives
  - phase: 69-model-system-agent-frontmatter-patching
    provides: current runner baseline this persistence layer extends
provides:
  - persisted retry hint and failure fingerprint fields on job records
  - retry budget default of 2 for new jobs with optional per-job override
  - retry attempt archive table + helper APIs + reset-to-pending lineage capture
affects: [phase-70-02-runner-retry-policy, phase-70-04-log-chain]

# Tech tracking
tech-stack:
  added: []
  patterns: ["additive sqlite migrations", "archive-before-reset retry lineage"]

key-files:
  created: []
  modified: [src/core/types.ts, src/core/db.ts, test/core/db.test.ts]

key-decisions:
  - "Enforce default retry budget at addJob insert time so legacy DB default drift cannot override new policy."
  - "Archive retry attempt lineage inside resetToPending transaction before clearing live step/session fields."
  - "Persist failure fingerprints as JSON arrays with tolerant parsing fallback for older/plain values."

patterns-established:
  - "Retry metadata is first-class on jobs (retryHint + lastFailureFingerprint)."
  - "Attempt history reads are deterministic via attempt_number/id ordering."

# Metrics
duration: 5 min
completed: 2026-03-16
---

# Phase 70 Plan 01: Retry Persistence Foundation Summary

**SQLite-backed retry metadata and attempt-lineage archival for phase-level auto-retry orchestration.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T03:15:44Z
- **Completed:** 2026-03-16T03:21:14Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added persisted retry metadata fields (`retryHint`, `lastFailureFingerprint`) to the `Job` contract and DB row mapping.
- Set retry budget default behavior to `2` for new jobs and added optional explicit retry budget support in `addJob(...)`.
- Introduced `job_retry_attempts` archive storage and helper APIs, and wired `resetToPending(...)` to archive attempt lineage before clearing live state.
- Expanded DB regression coverage for retry defaults, metadata round-trips, and deterministic attempt archive ordering.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend retry metadata contract and schema defaults** - `532cc3a` (feat)
2. **Task 2: Add attempt-history archive and retry-state helper APIs** - `1484101` (feat)
3. **Task 3: Expand DB regression coverage for persistence rules** - `dcf4698` (test)

**Plan metadata:** pending (added in docs commit for this plan execution)

## Files Created/Modified
- `src/core/types.ts` - Added retry hint + failure fingerprint fields to `Job`.
- `src/core/db.ts` - Added retry metadata columns/defaults, archive table/helpers, and reset archival behavior.
- `test/core/db.test.ts` - Added regression tests for retry metadata persistence and attempt archive lineage.

## Decisions Made
- Enforced retry budget default (`2`) in the `addJob(...)` insert path so behavior is consistent even on older DB files created with prior defaults.
- Archived attempt lineage in the same transaction as `resetToPending(...)` to preserve ordering and prevent partial reset/archive states.
- Stored fingerprint payloads as JSON arrays and parsed with fallback to keep reads resilient against non-JSON historical values.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 70 persistence foundation is complete and verified (`npm test -- test/core/db.test.ts`, `npm run lint`).
- Ready for `70-02-PLAN.md` (runner verification auto-retry orchestration).

---
*Phase: 70-phase-auto-retry-on-verification-failure*
*Completed: 2026-03-16*
