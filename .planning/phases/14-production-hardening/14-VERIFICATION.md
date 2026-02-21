---
phase: 14-production-hardening
verified: 2026-02-21T14:05:00Z
status: passed
score: 13/13 must-haves verified
gaps: []
---

# Phase 14: Production Hardening Verification Report

**Phase Goal:** Make the daemon bulletproof for multi-day unsupervised operation. Crash recovery, resource management, stuck auto-recovery, log rotation, atomic writes, disk/memory guards. Every failure mode from the bash runner era must be handled automatically.
**Verified:** 2026-02-21T14:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Queue writes are atomic (temp+fsync+rename) | ✓ VERIFIED | `queue-store.ts:138-166` — saveQueue does backup→tmp→fsync→rename sequence with sync fs methods |
| 2 | Corrupt queue.json recovers from backup | ✓ VERIFIED | `queue-store.ts:83-126` — 3-level recovery chain: parse→trim trailing garbage→backup→empty queue |
| 3 | Memory guard blocks spawn when < 2GB free | ✓ VERIFIED | `spawn.ts:96-128` — checkMemory uses 2048MB threshold, polls /proc/meminfo every 30s up to 10min |
| 4 | Disk guard blocks spawn when < 1GB free | ✓ VERIFIED | `spawn.ts:156-179` — checkDiskSpace uses BigInt arithmetic with fs.statfs, throws at < 1GB |
| 5 | Auto maxParallel from RAM (<32GB→2, ≥32GB→5) | ✓ VERIFIED | `config.ts:55-58` — os.totalmem() with PILOT_MAX_PARALLEL env override |
| 6 | Spawn rate limiting (1 per 5s minimum) | ✓ VERIFIED | `spawn.ts:298-304` — enforceSpawnRateLimit with 5000ms MIN_SPAWN_INTERVAL_MS module-level state |
| 7 | Startup self-check validates 5 preconditions | ✓ VERIFIED | `runner.ts:193-247` — checks binary, gsd dir, queue readable, disk>500MB, memory>2GB |
| 8 | Heartbeat file written every 60s | ✓ VERIFIED | `runner.ts:153-166` — writeFileSync to ~/.pilot/heartbeat with ISO timestamp, 60s setInterval, cleared in finally |
| 9 | Structured logging with levels and rotation | ✓ VERIFIED | `runner-log.ts:128-185` — [ISO-8601] [LEVEL] format, DEBUG<INFO<WARN<ERROR filtering, 10MB size rotation with 3 cascading rotated files |
| 10 | Built-in stuck detection every 60s | ✓ VERIFIED | `runner.ts:346-359,880-912` — checkStuckJobs in main loop at 60s interval, uses computeDaemonStuckScore, kills stuck processes |
| 11 | Flaky detection with 3-strike rule | ✓ VERIFIED | `runner.ts:731-770` — isFlaky = exitCode!=0 && duration<5min && logSize<4KB, flakyAttempts Map tracks per-item, 3 strikes → consistently_flaky failure |
| 12 | Orphan process cleanup | ✓ VERIFIED | `runner.ts:257-293` — cleanOrphanProcesses on startup (log only), `runner.ts:925-969` — cleanOrphanPeriodic every 30min kills untracked processes >2 hours |
| 13 | Job log cleanup | ✓ VERIFIED | `runner.ts:303-340` — cleanJobLogs keeps 20 most recent, deletes others >7 days old |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/queue-store.ts` | Atomic writes + corruption recovery | ✓ VERIFIED (649 lines) | saveQueue: backup→tmp→fsync→rename; loadQueue: parse→trim→bak→empty; tryParseJson with trailing garbage trim |
| `src/core/lock.ts` | Stale lock cleanup | ✓ VERIFIED (76 lines) | cleanStaleLocks removes lock files >5min old, called from runner startup |
| `src/core/spawn.ts` | Resource guards + rate limiter | ✓ VERIFIED (411 lines) | checkMemory (2GB), checkDiskSpace (1GB BigInt), enforceSpawnRateLimit (5s), exports checkBinary and getSystemFreeMem |
| `src/core/runner.ts` | Daemon resilience + stuck detection + flaky | ✓ VERIFIED (1125 lines) | startupSelfCheck, heartbeat, cleanOrphanProcesses, cleanJobLogs, checkStuckJobs (60s), cleanOrphanPeriodic (30min), flaky detection in handleJobCompletion, graceful degradation try/catch on reap+checkTimeouts |
| `src/core/runner-log.ts` | Structured logging with rotation | ✓ VERIFIED (262 lines) | Log levels (DEBUG<INFO<WARN<ERROR), [ISO-8601] [LEVEL] format, 10MB size rotation with 3 cascade, backward-compat log()→info() |
| `src/core/stuck.ts` | Daemon stuck scorer | ✓ VERIFIED (653 lines) | computeDaemonStuckScore: 4 signals (log staleness, proc state, memory, no output), no CPU sampling, same 70/40 thresholds |
| `src/core/config.ts` | Auto maxParallel + logLevel | ✓ VERIFIED (84 lines) | maxParallel auto-detect from RAM, PILOT_MAX_PARALLEL override, logLevel with validation |
| `src/core/types.ts` | DaemonStuckAssessment type | ✓ VERIFIED (268 lines) | DaemonStuckAssessment with score, verdict, signals, isFlaky fields |
| `test/core/spawn.test.ts` | Resource guard tests | ✓ VERIFIED (146 lines) | getSystemFreeMem, checkDiskSpace threshold, enforceSpawnRateLimit with fake timers |
| `test/core/lock.test.ts` | Stale lock tests | ✓ VERIFIED (81 lines) | stale removed, fresh preserved, missing handled |
| `test/core/queue-store.test.ts` | Atomic write + corruption tests | ✓ VERIFIED (978 lines) | Backup-on-write test, truncated JSON recovery, garbage recovery, both-corrupt fallback |
| `test/core/stuck.test.ts` | Daemon stuck scorer tests | ✓ VERIFIED (915 lines) | computeDaemonStuckScore healthy, no_output, dead process, shape validation |
| `test/core/runner.test.ts` | Flaky + heartbeat tests | ✓ VERIFIED | Flaky retry, 3-strike consistently_flaky, heartbeat written on startup |
| `test/core/runner-log.test.ts` | Structured logging tests | ✓ VERIFIED | Level filtering, size rotation at 10MB, cascade rotations, max rotation delete |
| `test/core/config.test.ts` | Config tests for maxParallel + logLevel | ✓ VERIFIED | Auto-detect 16GB→2, 64GB→5, PILOT_MAX_PARALLEL override, logLevel validation + case-insensitive |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runner.ts` → `spawn.ts` | spawn.enforceSpawnRateLimit | import + call in launch() | ✓ WIRED | Line 34 import, line 503 call before preSpawnChecks |
| `runner.ts` → `spawn.ts` | spawn.checkBinary | import + call in startupSelfCheck | ✓ WIRED | Line 34 import, line 196 call |
| `runner.ts` → `spawn.ts` | spawn.getSystemFreeMem | import + call in startupSelfCheck | ✓ WIRED | Line 34 import, line 240 call |
| `runner.ts` → `spawn.ts` | spawn.checkDiskSpace | via preSpawnChecks | ✓ WIRED | preSpawnChecks (line 325) calls checkDiskSpace |
| `runner.ts` → `lock.ts` | lock.cleanStaleLocks | import + call in start() | ✓ WIRED | Line 38 import, line 135 call |
| `runner.ts` → `stuck.ts` | stuck.computeDaemonStuckScore | import + call in checkStuckJobs | ✓ WIRED | Line 39 import, line 888 call |
| `runner.ts` → `queue-store.ts` | loadQueue | import + call in startupSelfCheck | ✓ WIRED | Line 33 import, line 214 call |
| `runner.ts` → `queue-store.ts` | ensurePilotDir | import + call in start() for heartbeat setup | ✓ WIRED | Line 33 import, line 154 call |
| `config.ts` → `types.ts` | PilotConfig.maxParallel + logLevel | type export | ✓ WIRED | config returns maxParallel and logLevel in PilotConfig |
| `runner-log.ts` → size rotation | rotateBySize | called in writeLog when file > MAX_LOG_SIZE | ✓ WIRED | Line 145-147 size check + rotate call |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Atomic queue writes (temp+rename with fsync) | ✓ SATISFIED | queue-store.ts saveQueue: copyFileSync→writeFileSync→fsyncSync→renameSync |
| Corruption recovery from backup | ✓ SATISFIED | queue-store.ts loadQueue: tryParseJson→backup→empty fallback chain |
| Resource guards (2GB memory, 1GB disk) | ✓ SATISFIED | spawn.ts: checkMemory 2048MB, checkDiskSpace 1GB BigInt |
| Auto-detected maxParallel from RAM | ✓ SATISFIED | config.ts: os.totalmem() <32GB→2, ≥32GB→5, PILOT_MAX_PARALLEL override |
| Spawn rate limiting (1 per 5s) | ✓ SATISFIED | spawn.ts: enforceSpawnRateLimit with 5000ms module-level timer |
| Startup self-check (binary, gsd dir, queue, disk, memory) | ✓ SATISFIED | runner.ts startupSelfCheck: 5 checks (binary critical, gsd critical, queue non-critical, disk critical, memory non-critical) |
| Heartbeat file every 60s | ✓ SATISFIED | runner.ts: writeFileSync to ~/.pilot/heartbeat, 60s setInterval, cleared in finally |
| Structured logging with levels and rotation | ✓ SATISFIED | runner-log.ts: [ISO-8601] [LEVEL] format, 4 levels, 10MB size rotation, 3 cascade |
| Built-in stuck detection every 60s | ✓ SATISFIED | runner.ts: checkStuckJobs at STUCK_CHECK_INTERVAL=60000ms, computeDaemonStuckScore, auto-kill stuck |
| Flaky detection with 3-strike rule | ✓ SATISFIED | runner.ts: isFlaky detection, flakyAttempts Map, 3 strikes → consistently_flaky |
| Orphan process cleanup | ✓ SATISFIED | runner.ts: startup detection (log only) + periodic cleanup every 30min (kills >2h untracked) |
| Job log cleanup | ✓ SATISFIED | runner.ts: cleanJobLogs keeps 20 most recent, deletes >7 days old |
| Test coverage for all above | ✓ SATISFIED | 29 tests added across 6 test files; 553 total tests pass, 31 test files |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO, FIXME, placeholder, or empty implementation patterns found in Phase 14 modified files. All error paths emit descriptive messages and use graceful degradation (try/catch with continue in daemon loop).

### Build & Test Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✓ Clean — no type errors |
| `npm test -- --run` | ✓ 553/553 tests pass (31 files) |
| Phase 14 specific tests | ✓ 29 new tests across spawn.test.ts, lock.test.ts, queue-store.test.ts, stuck.test.ts, runner.test.ts, config.test.ts |

### Human Verification Required

### 1. Multi-day daemon stability

**Test:** Run `pilot run` for 24+ hours with mixed queue entries (some flaky, some long-running)
**Expected:** Runner recovers from stuck processes, rotates logs, writes heartbeat continuously, doesn't leak memory
**Why human:** Requires real long-running daemon observation; can't verify multi-day stability programmatically

### 2. Resource guard behavior under real pressure

**Test:** Run on a VPS with <4GB RAM, queue 5+ concurrent builds
**Expected:** Memory guard blocks spawns when <2GB free, logs the wait; disk guard catches low space before crash
**Why human:** Requires real resource-constrained environment; test mocks verify logic but not real /proc/meminfo behavior

### 3. Orphan cleanup accuracy

**Test:** Crash the daemon while jobs are running, restart it
**Expected:** Startup detects orphan processes (log message), periodic cleanup kills them after 2 hours
**Why human:** Requires real process crash and restart scenario; pgrep cross-referencing needs real process table

---

_Verified: 2026-02-21T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
