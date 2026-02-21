---
phase: 14
plan: 02
subsystem: core-spawn-config
tags: [resource-guards, memory, disk, spawn-rate, config]
dependency_graph:
  requires: [14-01]
  provides: [memory-guard-2gb, disk-space-check, spawn-rate-limiter, auto-max-parallel, log-level-config]
  affects: [14-03, 14-04, 14-05]
tech_stack:
  added: []
  patterns: [statfs-disk-check, rate-limiter, auto-detect-from-hardware]
key_files:
  created: []
  modified:
    - src/core/spawn.ts
    - src/core/config.ts
    - src/core/types.ts
    - src/commands/run.ts
    - src/commands/build.ts
    - src/commands/config.ts
decisions:
  - id: 14-02-01
    description: "BigInt arithmetic for disk space calculation"
    rationale: "bfree * bsize can exceed Number.MAX_SAFE_INTEGER on large filesystems"
  - id: 14-02-02
    description: "Spawn rate limiter as module-level state in spawn.ts"
    rationale: "Single daemon process means module-level is effectively singleton"
  - id: 14-02-03
    description: "validLogLevels cast to readonly string[] for includes() check"
    rationale: "TypeScript const tuple needs widened type for string.includes()"
metrics:
  duration: 7m
  completed: 2026-02-21
---

# Phase 14 Plan 02: Resource Guards Summary

**Resource guards: 2GB memory threshold, 1GB disk space check, auto maxParallel from RAM, spawn rate limiter, PILOT_LOG_LEVEL config.**

## What Was Done

### Task 1: Upgraded memory guard + disk space check + spawn rate limiter (spawn.ts)
- Upgraded `checkMemory` threshold from 500MB to 2048MB (2GB) for production VPS use
- Added `checkDiskSpace()` function using `fs.statfs` — blocks spawn when filesystem has < 1GB free, with BigInt arithmetic to handle large filesystems
- Added `enforceSpawnRateLimit()` — module-level rate limiter enforcing 5-second minimum between spawns to prevent thundering herd
- Wired `checkDiskSpace` into `preSpawnChecks` pipeline (after memory, before config validation)
- Exported `enforceSpawnRateLimit` and `checkDiskSpace` for runner.ts integration in Plan 03

### Task 2: Config updates — auto maxParallel + log level (config.ts, types.ts)
- Added `maxParallel` to PilotConfig: auto-detects from system RAM (`os.totalmem()`), <32GB → 2, ≥32GB → 5
- Added `PILOT_MAX_PARALLEL` env var override for manual control
- Added `logLevel` to PilotConfig: DEBUG/INFO/WARN/ERROR with `PILOT_LOG_LEVEL` env var (default INFO)
- Updated `run.ts` and `build.ts` to use `config.maxParallel` instead of hardcoded 5
- Updated `config` command to display both new fields in human and JSON output
- Updated all test config mocks (9 files) with new required PilotConfig fields

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 14-02-01 | BigInt arithmetic for bfree*bsize | Can exceed Number.MAX_SAFE_INTEGER on large filesystems |
| 14-02-02 | Spawn rate limiter as module-level state | Single daemon = module singleton pattern is correct |
| 14-02-03 | Cast validLogLevels for includes() | TypeScript const tuple typing needs widened type |

## Verification Results

- `npm run build` — passes with no type errors
- `npm test` — all 515 tests pass (29 test files)
- Memory guard threshold confirmed at 2048MB
- Disk space check uses `statfs` from `node:fs/promises`
- `enforceSpawnRateLimit` exported as async function
- `config.maxParallel` auto-detects from RAM
- `config.logLevel` defaults to INFO, validates against known levels

## Next Phase Readiness

Plan 03 (daemon resilience) can consume:
- `enforceSpawnRateLimit()` — call before each spawn in runner loop
- `config.logLevel` — for structured daemon logging
- `config.maxParallel` — runner already uses it via run.ts/build.ts

No blockers for Plan 03.
