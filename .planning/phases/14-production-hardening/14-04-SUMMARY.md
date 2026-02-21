---
phase: 14-production-hardening
plan: 04
subsystem: runner-stuck-detection
tags: [stuck-detection, flaky-detection, daemon, orphan-cleanup, resilience]
dependency-graph:
  requires: ["14-01", "14-02", "14-03"]
  provides: ["daemon-stuck-auto-recovery", "flaky-detection", "orphan-cleanup"]
  affects: ["14-05"]
tech-stack:
  added: []
  patterns: ["periodic-check-loop", "try-catch-resilience", "flaky-3-strike-rule"]
key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/stuck.ts
    - src/core/runner.ts
decisions:
  - "DaemonStuckAssessment type separate from StuckAssessment — daemon needs isFlaky field and skips CPU"
  - "Flaky detection checks attempts >= maxAttempts FIRST — exhausted attempts always fail regardless of flaky signals"
  - "Only mark consistently_flaky when flakyAttempts map has prior entries — prevents false positives on first failure"
  - "Orphan cleanup via pgrep + getProcessRuntime — cross-references with activeJobs, 2-hour threshold"
  - "statSync for log file size in flaky detection — sync is fine for single-call in completion handler"
metrics:
  duration: "6 minutes"
  completed: "2026-02-21"
---

# Phase 14 Plan 04: Daemon Stuck Detection + Auto-Recovery + Flaky Detection Summary

Built-in 60-second stuck detection loop with auto-kill/retry, flaky job detection with 3-strike rule, and periodic orphan process cleanup for multi-day unsupervised daemon operation.

## What Was Done

### Task 1: Fast daemon stuck scorer in stuck.ts
- Added `DaemonStuckAssessment` type to types.ts with `score`, `verdict`, `signals`, `isFlaky` fields
- Added `computeDaemonStuckScore()` function to stuck.ts optimized for 60-second check cycle
- 4 signal types (NO CPU sampling — too slow for periodic checks):
  1. Log staleness (max 50 points): 15min stale → 30pts, 5min stale → 20pts
  2. Process state + wchan (max 80 points): zombie → 80pts, stopped → 50pts, stdin-blocked → 30pts
  3. Memory pressure (max 20 points): high RSS → 10pts, low system memory → 10pts
  4. No output at all (max 40 points): empty log after 5min → 40pts
- Same 70/40 thresholds: ≥70 stuck, 40-69 suspect, <40 healthy
- All /proc reads wrapped in try/catch — returns healthy if process unreadable

### Task 2: Stuck check loop + flaky detection + orphan cleanup in runner.ts
- **checkStuckJobs()**: Runs every 60s from main loop, checks all real PIDs (skips synthetic/lifecycle), kills stuck processes (SIGTERM → 5s → tree-kill), sets exit code for reap cycle
- **Flaky detection in handleJobCompletion**: `exitCode !== 0 && duration < 5min && logSize < 4KB` = flaky; retries up to 3 times via `flakyAttempts` Map; 3 strikes = `consistently_flaky` failure
- **cleanOrphanPeriodic()**: Runs every 30 minutes, finds opencode processes via pgrep, cross-references with activeJobs, kills untracked processes running > 2 hours
- All periodic checks wrapped in try/catch — failures never crash the daemon
- Added imports: `computeDaemonStuckScore` from stuck.ts, `getProcessRuntime` from process.ts, `statSync` from node:fs

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| No CPU sampling in daemon scorer | 30s sampling delay unacceptable for 60s check cycle; log staleness + process state sufficient |
| Flaky detection after maxAttempts check | Exhausted attempts always fail — prevents flaky path from extending beyond max retries |
| flakyAttempts map entry required for consistently_flaky label | First-time failures shouldn't be labeled flaky without prior flaky tracking evidence |
| Orphan cleanup via pgrep cross-reference | Can't match PIDs to queue items directly; compares count and runtime as heuristic |
| statSync for log file size | Single synchronous call in completion handler is fine; avoids async complexity |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flaky detection overriding maxAttempts exhaustion**
- **Found during:** Task 2 verification
- **Issue:** Test `per-item maxAttempts: fails when attempts >= maxAttempts` failed because mock jobs with quick exit and no log file triggered flaky path, which retried instead of failing
- **Fix:** Restructured result determination to check `attempts >= maxAttempts` BEFORE flaky detection, and only label `consistently_flaky` when `flakyAttempts` map has prior entries
- **Files modified:** src/core/runner.ts
- **Commit:** 84c9581

## Verification

- `npm run build` — passes (no type errors)
- `npm test` — all 524 tests pass (29 files)
- Stuck detection: checkStuckJobs called every 60s, kills stuck + sets exit code for reap
- Flaky detection: isFlaky = exitCode != 0 && duration < 5min && logSize < 4KB
- 3 flaky retries → consistently_flaky → markFailed with reason
- Orphan cleanup: cleanOrphanPeriodic every 30min, kills untracked processes > 2h
- All handlers wrapped in try/catch for graceful degradation

## Next Phase Readiness

Plan 14-05 (tests for production hardening) can now test:
- `computeDaemonStuckScore` with mocked /proc data
- `checkStuckJobs` integration with runner
- Flaky detection logic in handleJobCompletion
- Orphan cleanup with mocked pgrep
