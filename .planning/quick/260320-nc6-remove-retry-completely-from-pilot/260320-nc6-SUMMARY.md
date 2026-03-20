---
phase: quick
plan: 260320-nc6
subsystem: core
tags: [retry-removal, simplification, lifecycle]
dependency_graph:
  requires: []
  provides: [no-retry-codebase]
  affects: [runner, db, cli, tui, notifications]
tech_stack:
  added: []
  patterns: [disposable-jobs, step-continuation]
key_files:
  created: []
  modified:
    - src/core/runner.ts
    - src/core/db.ts
    - src/core/callback.ts
    - src/core/job-introspection.ts
    - src/core/types.ts
    - src/core/config.ts
    - src/commands/add.ts
    - src/commands/info.ts
    - src/commands/log.ts
    - src/commands/milestone.ts
    - src/commands/project.ts
    - src/commands/projects.ts
    - src/index.ts
    - src/tui/components/completed-panel.tsx
  deleted:
    - src/commands/retry.ts
decisions:
  - Replaced retry() with requeueFailedJob() for milestone resume (minimal reset without retry tracking)
  - Kept getRetryAttempts for log --chain (archived attempt history remains readable)
  - Kept retry_budget column in DB schema (migration safety) but always insert 0
  - Kept retryBudget/retryCount/retryHint/lastFailureFingerprint on Job interface (vestigial read-only from DB)
metrics:
  duration_seconds: 1661
  completed: "2026-03-20T17:19:21Z"
---

# Quick Task 260320-nc6: Remove Retry Completely from Pilot — Summary

Jobs are disposable — succeed or fail, no retries. The step-continuation model (Phase 73) handles gaps/hung/failed within a single job run. Once a job terminates, it's done.

## What Changed

### Task 1: Remove retry command, strip CLI flags, update notifications
**Commit:** bc2d25c

- Deleted `src/commands/retry.ts` entirely
- Removed broken retry command stub from `src/index.ts`
- Removed `--retries` and `--no-retry` options from `AddOptions` in `add.ts`
- Removed `resolveRetryBudget` function and all `retryBudget` arguments from `addJob()` calls
- Removed retry budget output line from human-readable add output
- Updated runner.ts owner notification: `pilot retry → pilot unblock + queue new`
- Updated `project.ts` and `projects.ts` action hints to remove retry references

### Task 2: Remove DB functions, clean types/config, update notifications and display
**Commit:** f9b046c

- Deleted from db.ts: `resetToPending`, `retry()`, `canRetry`, `incrementRetryCount`, `resetRetryState`, `updateRetryHint`, `updateLastFailureFingerprint`, `recordRetryAttempt`, `isSameHungReason`
- Added `requeueFailedJob` (minimal reset for milestone resume — no retry tracking)
- Kept `getRetryAttempts` (still used by `log --chain` for archived attempt history)
- Removed `retryBudget` parameter from `addJob()`, always inserts `0`
- Removed `retryBudget` from `ConfigFileDefaults` and config validation
- Updated `callback.ts`: failure guidance says "unblock + queue new" instead of "pilot retry"
- Updated `job-introspection.ts`: `retryable-failure` → `failed`, `retry-unavailable` → `not-applicable`
- Simplified `info.ts`: `Attempt N/Y` → `Attempt N`, `Retryability` → `Failure`
- Simplified `log.ts`: `resolveCurrentAttemptNumber` uses `job.attempts` directly
- Updated TUI `completed-panel.tsx`: badge color for `failed` code
- Updated `milestone.ts`: uses `requeueFailedJob` instead of `retry`

### Task 3: Fix tests
**Commit:** e022437

- Removed entire `retryCommand` describe block and import from `cancel-retry-bump.test.ts`
- Removed `resetToPending`, `canRetry`, `incrementRetryCount`, `resetRetryState`, `isSameHungReason`, `retry()` test blocks from `db.test.ts`
- Removed retry budget tests from `add.test.ts`, removed trailing retryBudget arg from all addJob assertions
- Removed `retryBudget` from `config.test.ts` defaults and validation tests
- Updated `job-introspection.test.ts`: expected code `retryable-failure` → `failed`
- Removed hung session retry logic tests from `runner.test.ts` (old budget-based retry path)
- Removed `retryJobAction` test from `job-detail-query.test.ts`
- Updated assertions across `callback.test.ts`, `info.test.ts`, `log.test.ts`, `status.test.ts`, `completed-panel.test.ts`, `export.test.ts`, `milestone.test.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] milestone.ts imported retry() from db.ts**
- **Found during:** Task 2
- **Issue:** `milestone.ts` imports `retry()` for the `milestone resume` action to re-queue failed child jobs
- **Fix:** Created `requeueFailedJob()` in db.ts — minimal reset without retry tracking. Updated milestone.ts to use it.
- **Files modified:** src/core/db.ts, src/commands/milestone.ts
- **Commit:** f9b046c

## Verification

- `npx tsc --noEmit` — zero errors ✓
- `npx vitest run` — 1159 tests pass (58 suites) ✓
- `grep -r 'resetToPending' src/` — nothing ✓
- `grep -r 'pilot retry' src/` — nothing ✓
- `grep -r 'retryable-failure' src/` — nothing ✓
- `grep -rw 'canRetry' src/` — nothing ✓
- `ls src/commands/retry.ts` — deleted ✓
