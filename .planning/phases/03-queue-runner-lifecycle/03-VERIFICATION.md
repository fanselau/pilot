---
phase: 03-queue-runner-lifecycle
verified: 2026-02-20T17:45:00Z
status: passed
score: 13/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/13
  gaps_closed:
    - "Runner dispatches lifecycle modes correctly (build-full, continue-all, etc.)"
    - "Runner lifecycle integration produces correct end-to-end automation flow"
  gaps_remaining: []
  regressions: []
---

# Phase 3: Queue Runner + Lifecycle Automation Verification Report

**Phase Goal:** Implement the queue runner state machine and all lifecycle mode commands. This is the automation engine that processes QUEUE.md entries, spawns AI sessions, and manages the full plan->execute->verify pipeline.
**Verified:** 2026-02-20T17:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit bfc4b74)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pilot run` processes QUEUE.md entries with state machine (scan→launch→reap) | ✓ VERIFIED | runner.ts (815 lines): full state machine with mainLoop, scan(), launch(), reap(), waitForAnyCompletion(). EventEmitter events for external consumers. |
| 2 | Same-project entries sequential, cross-project parallel up to maxParallel | ✓ VERIFIED | runner.ts lines 212-234: runningProjects Set blocks same-project launches; line 141: size check against maxParallel |
| 3 | Pre-spawn checks: git gc disable, memory, config validation, binary, title truncation | ✓ VERIFIED | spawn.ts (368 lines): all 5 checks implemented. gc.auto=0 on snapshot repos + global, /proc/meminfo MemAvailable polling, permission (singular) + instructions array validation, binary resolution, 80-char truncation |
| 4 | Success detection: new commits OR .planning changes OR clean exit 0 | ✓ VERIFIED | runner.ts lines 484-517: countGitCommits pre/post comparison, checkPlanningChanges, explicit rejection of ≥8 messages heuristic, auto-commit of planning changes |
| 5 | `pilot stop` gracefully shuts down (SIGTERM → wait 30s → SIGKILL) | ✓ VERIFIED | stop.ts (93 lines): SIGTERM → 1s poll × 30 → tree-kill SIGKILL with --force. PID file cleanup. |
| 6 | `pilot add` appends to QUEUE.md with proper-lockfile | ✓ VERIFIED | add.ts (86 lines): mode validation against const array, withQueueLock wrapping, project dir validation |
| 7 | `pilot build` detects mode + adds + starts runner | ✓ VERIFIED | build.ts (114 lines): .planning/ existence → continue-all vs build-full detection, withQueueLock append, detached runner spawn |
| 8 | `pilot init` creates project + setup + spawns gsd-new-project | ✓ VERIFIED | init.ts (67 lines): mkdir, setupProject call, --auto flag passthrough, -- separator for flag args |
| 9 | All lifecycle commands spawn correct gsd-* commands | ✓ VERIFIED | 13 command files (plan, execute, verify, quick, debug, scope, insert, remove, research, milestone, todos, map, init) all wired in index.ts (17 imports counted), all spawn correct gsd-* commands with proper title truncation, flag passthrough, and exit code propagation |
| 10 | build-full rejects existing .planning/ directories | ✓ VERIFIED | lifecycle.ts lines 91-99: hard requirement check with pathExists(), throws descriptive error |
| 11 | Phase state detection uses STATE files with inference fallback | ✓ VERIFIED | phase-state.ts (397 lines): readStateFile → mapExplicitState priority, then inferPhaseState fallback (UAT → plan count → git commits) |
| 12 | Runner dispatches lifecycle modes correctly (build-full, continue-all, etc.) | ✓ VERIFIED | **GAP CLOSED.** runner.ts line 30: imports `runLifecycleMode` from lifecycle.ts. Lines 42-48: `LIFECYCLE_MODES` Set contains 5 lifecycle modes. Line 290: `LIFECYCLE_MODES.has(entry.mode)` branches to `launchLifecycleMode()`. Line 346: calls `runLifecycleMode(projectDir, entry.mode, entry.args)`. Non-lifecycle modes (run-command) fall through to `launchDirectSpawn()`. |
| 13 | Runner lifecycle integration produces correct end-to-end automation flow | ✓ VERIFIED | **GAP CLOSED.** Full chain: runner.launch() → LIFECYCLE_MODES check → launchLifecycleMode() → runLifecycleMode(projectDir, mode, args) → lifecycle switch dispatches to correct handler → runPhaseCycle() (plan→execute→verify→gap closure). Synthetic negative PIDs track lifecycle jobs. reap() (lines 440-452), shutdown() (lines 610-628), and waitForAnyCompletion() (lines 704-715) all correctly handle both real PIDs (> 0) and synthetic PIDs (< 0). |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/runner.ts` | Queue runner state machine | ✓ VERIFIED | 815 lines, scan→launch→reap, lifecycle dispatch, synthetic PIDs |
| `src/core/lifecycle.ts` | Lifecycle mode implementations | ✓ VERIFIED | 527 lines, all 6 modes + phase cycle, **now imported by runner.ts** |
| `src/core/spawn.ts` | Pre-spawn checks + session spawning | ✓ VERIFIED | 368 lines, all 5 checks, detached spawn |
| `src/core/phase-state.ts` | Phase state detection + STATE files | ✓ VERIFIED | 397 lines, STATE priority + inference fallback |
| `src/core/lock.ts` | proper-lockfile wrapper | ✓ VERIFIED | 39 lines, withQueueLock with 30s stale, 5 retries |
| `src/core/postmortem.ts` | JSONL logging | ✓ VERIFIED | 44 lines, pilot-job-history.jsonl append |
| `src/core/types.ts` | Phase 3 types | ✓ VERIFIED | 174 lines, all phase 3 types present |
| `src/commands/run.ts` | pilot run command | ✓ VERIFIED | 114 lines, creates runner, event listeners, --dry-run + --json |
| `src/commands/stop.ts` | pilot stop command | ✓ VERIFIED | 93 lines, SIGTERM→SIGKILL, PID cleanup |
| `src/commands/add.ts` | pilot add command | ✓ VERIFIED | 86 lines, mode validation, queue locking |
| `src/commands/build.ts` | pilot build command | ✓ VERIFIED | 114 lines, mode detection, runner start |
| `src/commands/init.ts` | pilot init command | ✓ VERIFIED | 67 lines, dir creation, setup, gsd-new-project |
| `src/commands/plan.ts` | pilot plan command | ✓ VERIFIED | 54 lines, gsd-plan-phase with flags |
| `src/commands/execute.ts` | pilot execute command | ✓ VERIFIED | 52 lines, gsd-execute-phase with --gaps-only |
| `src/commands/verify.ts` | pilot verify command | ✓ VERIFIED | 56 lines, gsd-verify-auto with --port |
| `src/commands/quick.ts` | pilot quick command | ✓ VERIFIED | 48 lines, gsd-quick |
| `src/commands/debug.ts` | pilot debug command | ✓ VERIFIED | 53 lines, gsd-debug |
| `src/commands/scope.ts` | pilot scope command | ✓ VERIFIED | 84 lines, gsd-add-phase with --build wired |
| `src/commands/insert.ts` | pilot insert command | ✓ VERIFIED | 50 lines, gsd-insert-phase |
| `src/commands/remove.ts` | pilot remove command | ✓ VERIFIED | 41 lines, gsd-remove-phase |
| `src/commands/research.ts` | pilot research command | ✓ VERIFIED | 41 lines, gsd-research-phase |
| `src/commands/milestone.ts` | pilot milestone command | ✓ VERIFIED | 76 lines, subcommand routing to 4 gsd-* commands |
| `src/commands/todos.ts` | pilot todos command | ✓ VERIFIED | 72 lines, subcommand routing to 2 gsd-* commands |
| `src/commands/map.ts` | pilot map command | ✓ VERIFIED | 40 lines, gsd-map-codebase |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| index.ts | All 17 commands | dynamic imports | ✓ WIRED | 17 command imports verified in index.ts |
| commands/run.ts | core/runner.ts | `createRunner` import | ✓ WIRED | Creates runner, registers event listeners |
| **runner.ts** | **core/lifecycle.ts** | **`runLifecycleMode` import (line 30)** | **✓ WIRED** | **GAP CLOSED.** Import at line 30, called at line 346 inside launchLifecycleMode(). |
| runner.ts | core/lock.ts | `withQueueLock` import | ✓ WIRED | Used in launch(), handleJobCompletion(), shutdown() |
| runner.ts | core/spawn.ts | `preSpawnChecks + spawnSession` | ✓ WIRED | preSpawnChecks in launch() line 268, spawnSession in launchDirectSpawn() line 381 |
| runner.ts | core/postmortem.ts | `logPostmortem` import | ✓ WIRED | Called in handleJobCompletion() line 539 |
| runner.ts | core/queue-parser.ts | `parseQueueFile + markEntry` | ✓ WIRED | Used in scan() and completion handling |
| lifecycle.ts | core/phase-state.ts | `getPhaseState + writePhaseState` | ✓ WIRED | Used throughout runPhaseCycle |
| lifecycle.ts | core/spawn.ts | `truncateTitle + getResolvedBinary` | ✓ WIRED | Used in spawnAndWait |
| commands/add.ts | core/lock.ts | `withQueueLock` | ✓ WIRED | Wraps QUEUE.md append |
| commands/build.ts | core/lock.ts | `withQueueLock` | ✓ WIRED | Wraps QUEUE.md append |

### Mode Dispatch Verification (Gap Closure Detail)

The runner correctly splits launch logic based on mode:

| Mode | LIFECYCLE_MODES? | Handler | Verified |
|------|-----------------|---------|----------|
| `build-full` | ✓ Yes | `launchLifecycleMode()` → `runLifecycleMode()` | ✓ |
| `continue` | ✓ Yes | `launchLifecycleMode()` → `runLifecycleMode()` | ✓ |
| `continue-all` | ✓ Yes | `launchLifecycleMode()` → `runLifecycleMode()` | ✓ |
| `build-to-phase` | ✓ Yes | `launchLifecycleMode()` → `runLifecycleMode()` | ✓ |
| `add-and-build` | ✓ Yes | `launchLifecycleMode()` → `runLifecycleMode()` | ✓ |
| `run-command` | ✗ No | `launchDirectSpawn()` → `spawnSession()` | ✓ |

Synthetic PID handling verified in:
- `reap()` — lines 440-452: checks `pid < 0` for exitCodes map, `pid > 0` for `isProcessAlive()`
- `shutdown()` — lines 610-628: only sends SIGTERM/SIGKILL to `pid > 0`
- `waitForAnyCompletion()` — lines 704-715: checks `pid < 0` for exitCodes, `pid > 0` for alive
- `handleJobTimeout()` — lines 580-585: only kills process tree for `pid > 0`

### Build + Test Verification

| Check | Result |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | ✓ Clean — zero errors |
| Test suite (`vitest run`) | ✓ 200/200 tests passed (9 files, 645ms) |
| No stub patterns in runner.ts/lifecycle.ts | ✓ Zero TODO/FIXME/placeholder found |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/commands/*.ts | multiple | Inline truncateTitle/sanitizeArgs duplication | ⚠️ Warning | Same helper repeated in 12+ files instead of importing from spawn.ts — cosmetic, not a blocker |
| src/core/runner.ts | 293 | `'pending' as 'running'` type cast | ⚠️ Warning | Workaround for markEntry type constraint — works but indicates API gap |

No blocker anti-patterns found.

### Human Verification Required

#### 1. Runner + Lifecycle Integration Under Real Queue

**Test:** Add entries with `pilot add myproject build-full` and `pilot add myproject2 continue-all`, then `pilot run --once`
**Expected:** build-full dispatches to lifecycle engine (not gsd-build-full session), continue-all loops phases correctly
**Why human:** Requires live AI sessions and real project directories

#### 2. Graceful Shutdown Under Load

**Test:** Start `pilot run` with multiple queue entries, then `pilot stop`
**Expected:** All children killed, entries marked back to pending, PID files cleaned
**Why human:** Requires running processes and signal handling

#### 3. Timeout Handling for Lifecycle Modes

**Test:** Set a short timeout on a queue entry, run lifecycle mode that takes longer
**Expected:** Synthetic PID gets exit code -1, job marked as failed
**Why human:** Requires timed execution

---

_Verified: 2026-02-20T17:45:00Z_
_Verifier: Claude (gsd-verifier)_
