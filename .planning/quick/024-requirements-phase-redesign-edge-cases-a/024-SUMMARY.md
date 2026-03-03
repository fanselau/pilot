---
phase: quick-024
plan: 01
subsystem: core-runner
tags: [db, runner, delegate, retry, judge, edge-cases]
requires: [quick-021]
provides: [hardened-retry-paths, resume-hint, resilient-judge-parsing]
affects: []
tech-stack:
  added: []
  patterns: [re-fetch-before-retry, shutdown-guard, multi-format-json-parsing]
key-files:
  created: []
  modified:
    - src/core/db.ts
    - src/core/types.ts
    - src/core/runner.ts
    - src/core/delegate.ts
    - test/core/db.test.ts
    - test/core/runner.test.ts
    - test/core/delegate.test.ts
decisions:
  - key: resume_hint_dedicated_column
    value: "resume_hint stored in dedicated column, not error field — clean separation of concerns"
  - key: parseJudgeVerdict_exported
    value: "parseJudgeVerdict extracted as exported function for direct unit testing (avoids private method testing)"
  - key: getJob_refetch_before_retry
    value: "Re-fetch job via getJob() before retry decision since claimNextLaunchable already incremented attempts"
  - key: shutdown_guard_resetToPending
    value: "Shutdown during judge → resetToPending not markFailed — phase session completed, work must be preserved"
  - key: resetToPending_clears_job_steps
    value: "DELETE FROM job_steps on resetToPending prevents stale TUI steps and stale pgrep session title matches"
metrics:
  duration: 10m
  completed: 2026-03-03
---

# Quick Task 024: Phase Redesign Edge Cases — Summary

**One-liner:** Hardened retry/shutdown/judge paths: resume_hint column, resetToPending cleanup, 3-format JSON parsing, shutdown-before-judge guard, attempts off-by-one fix.

## What Was Built

5 targeted edge case fixes to harden the phase redesign (quick-021) retry, shutdown, and judge evaluation paths.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB layer — resetToPending cleanup + resume_hint column | c33c311 | src/core/db.ts, src/core/types.ts, test/core/db.test.ts |
| 2 | Runner — shutdown-during-judge guard + off-by-one fix + JSON parsing | 2a0de6b | src/core/runner.ts, test/core/runner.test.ts |
| 3 | Delegate — buildPhaseArgs reads resumeHint + tests | bb3ddcc | src/core/delegate.ts, test/core/delegate.test.ts |

## Changes Made

### Task 1: DB Layer
- Added `resume_hint TEXT` column via migration (`ALTER TABLE jobs ADD COLUMN resume_hint TEXT`)
- Added `resume_hint` to `JobRow` interface and `rowToJob()` mapper
- Added `resumeHint: string | null` field to `Job` interface in `types.ts`
- Rewrote `resetToPending()` to:
  - Clear `session_titles = NULL` (prevents stale pgrep matches in reconciler)
  - Clear `error = NULL` (no longer overloaded with "Reset: ..." text)
  - Store hint in `resume_hint` column (dedicated, clean)
  - `DELETE FROM job_steps WHERE job_id = ?` (prevents stale TUI step display)
- Called `migrateSchema()` in `_getTestDb()` so in-memory test DBs get all columns
- 7 new tests in `test/core/db.test.ts`

### Task 2: Runner
- Extracted `parseJudgeVerdict(content, sessionTitle?)` as exported module-level function
  - Format 1: fenced ` ```json ` block
  - Format 2: raw JSON (entire trimmed content is valid JSON)  
  - Format 3: first `{...}` brace block via regex (handles text-wrapped JSON from Haiku)
- Added shutdown-during-judge guard in `launch()`:
  - Pre-check: if `this.shuttingDown` before `runJudge()` → `resetToPending` and return
  - Catch path: if judge throws during shutdown → `resetToPending` and return
  - Phase session already completed — marking failed would lose that work
- Fixed `job.attempts` off-by-one:
  - `claimNextLaunchable()` already incremented `attempts` in DB before `launch()` saw the job
  - Now re-fetches via `const freshJob = getJob(job.id)` before retry decision
  - Uses `freshJob.attempts < freshJob.maxAttempts` (accurate) instead of stale `job` object
- Fixed pre-existing test failures caused by missing `resolveTopLevelModel` in models mock
- Added `resumeHint: null` to `makeJob()` helper for updated `Job` interface
- 7 new tests + 2 previously-failing tests now pass (judge eval tests)

### Task 3: Delegate
- Updated `buildPhaseArgs()` to append `--resume` when `job.resumeHint` is truthy
- All 3 routing branches (requirementPath, bare number, description) get the flag appended
- Added `resumeHint: null` to `makeTestJob()` helper
- 4 new tests covering all combinations

## Verification

```
npx vitest run       → 301 passed (0 failures)
npx tsc --noEmit     → clean (no type errors)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing runner test failures (6 tests failing before this task)**
- **Found during:** Task 2
- **Issue:** `resolveTopLevelModel` was not mocked in `test/core/runner.test.ts` models mock. Added in quick-023 but mock not updated, causing `TypeError: resolveTopLevelModel is not a function` in all judge-based evaluation tests.
- **Fix:** Added `resolveTopLevelModel: vi.fn(() => 'claude-3-5-haiku-20241022')` to models mock
- **Files modified:** test/core/runner.test.ts

**2. [Rule 1 - Bug] `_getTestDb()` didn't run migrations**
- **Found during:** Task 1
- **Issue:** In-memory test DB created by `_getTestDb()` didn't call `migrateSchema()`, so new columns added via ALTER TABLE (resume_hint, model_profile, etc.) were missing in tests. The CREATE TABLE SQL is the baseline; migrations add new columns.
- **Fix:** Added `migrateSchema(cachedDb!)` call in `_getTestDb()`
- **Files modified:** src/core/db.ts

## Success Criteria Met

- [x] `resetToPending` clears job_steps and session_titles
- [x] Shutdown during judge → resetToPending (not markFailed)
- [x] resume_hint column added via migration (backward-compatible ALTER TABLE)
- [x] Job interface has resumeHint field
- [x] Judge JSON parsing handles fenced, raw, and text-wrapped formats
- [x] job.attempts off-by-one fixed via re-fetch before retry decision
- [x] buildPhaseArgs appends --resume when resumeHint is set
- [x] Full test suite (301 tests) passes with zero regressions
- [x] No Nice to Have items touched (milestone decomposition deferred)
