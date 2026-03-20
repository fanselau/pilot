---
phase: 73-phase-1-judge-step-continuation
plan: 01
subsystem: database
tags: [sqlite, types, step-model, append-forward]

# Dependency graph
requires: []
provides:
  - StepSource type union for step provenance tracking
  - Extended JobStep interface with source, reason, error, pending status
  - MAX_STEPS_PER_JOB constant (10) for step cap enforcement
  - 8 new step CRUD functions in db.ts for append-forward model
  - DelegationIntent categories field for plan-and-execute
affects: [73-02, 73-03, 73-04, 73-05, 73-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [append-forward step model, pending→running→completed/failed lifecycle]

key-files:
  created:
    - test/core/step-types.test.ts
  modified:
    - src/core/types.ts
    - src/core/db.ts

key-decisions:
  - "StepSource as narrow string union (5 values) rather than generic string for type safety"
  - "Keep legacy verdictSource/verdictReason on JobStep for backward compat during transition"
  - "startedAt nullable on JobStep (pending steps haven't started)"
  - "appendSteps uses transaction for bulk insert atomicity"
  - "Migration via ALTER TABLE ADD COLUMN with try/catch for idempotent schema upgrades"

patterns-established:
  - "Append-forward step lifecycle: pending → running → completed/failed (never backwards)"
  - "Step provenance via StepSource: every step tracks why it exists"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-03-20
---

# Phase 73 Plan 01: Foundation — Step Record Types, DB Schema, and Step CRUD Summary

**StepSource type, extended JobStep with pending/source/reason/error, MAX_STEPS_PER_JOB constant, and 8 new step CRUD functions for the append-forward model**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T13:30:24Z
- **Completed:** 2026-03-20T13:41:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- StepSource union type with 5 provenance values (delegation, judge:gaps, judge:hung, judge:failed, operator)
- Extended JobStep interface with source tracking, pending status, nullable startedAt, reason, and error fields
- MAX_STEPS_PER_JOB constant for step cap enforcement
- 8 new step CRUD functions: createPendingStep, getNextPendingStep, markStepRunning, markStepCompleted, markStepFailed, getTotalStepCount, getPendingStepCount, appendSteps
- Schema migration for existing databases (ALTER TABLE ADD COLUMN for source, reason, error)
- DelegationIntent plan-and-execute variant now supports optional categories field

## Task Commits

Each task was committed atomically:

1. **Task 1: Add StepSource type and extend JobStep interface in types.ts (TDD)**
   - `cf72e08` (test: failing tests for StepSource, JobStep, MAX_STEPS_PER_JOB)
   - `d16929d` (feat: implement StepSource, extend JobStep, add MAX_STEPS_PER_JOB)

2. **Task 2: Migrate job_steps table schema and add step CRUD functions in db.ts**
   - `d844863` (feat: schema migration + 8 new step CRUD functions)

## Files Created/Modified
- `test/core/step-types.test.ts` — TDD tests for StepSource type, extended JobStep, MAX_STEPS_PER_JOB
- `src/core/types.ts` — StepSource type, updated JobStep interface, DelegationIntent categories, MAX_STEPS_PER_JOB
- `src/core/db.ts` — Schema migration, JobStepRow update, rowToJobStep mapper, 8 new step CRUD functions

## Decisions Made
- StepSource as narrow 5-value union for type safety rather than generic string
- Keep legacy verdictSource/verdictReason on JobStep for backward compat
- startedAt nullable since pending steps haven't started
- appendSteps uses db.transaction() for bulk insert atomicity
- Migration via ALTER TABLE ADD COLUMN with try/catch for idempotent schema upgrades
- Existing recordStep/completeStep/getJobSteps/skipRemainingSteps preserved for backward compat (runner rewrite in Plan 03 will switch to new functions)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Step data layer complete — ready for Plan 02 (delegation re-query) and Plan 03 (runner step execution loop)
- All new types and DB functions exported and importable
- Existing tests unaffected (118 DB tests + 10 new type tests all pass)

---
*Phase: 73-phase-1-judge-step-continuation*
*Completed: 2026-03-20*
