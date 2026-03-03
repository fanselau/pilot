---
phase: 26-runner-immediate-dispatch-force-quit
verified: 2026-03-03T18:51:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 26: Runner Immediate Dispatch + Force-Quit Verification Report

**Phase Goal:** Make runner scheduling and operator controls predictable: fill all available parallel slots immediately when eligible jobs exist (no idle wait), enforce project-level serialization via DB-backed atomic claim, and provide first-class force-quit controls in both CLI (`pilot kill <id> --force`) and TUI (`K` key) that deterministically terminate active jobs and update DB state consistently.

**Verified:** 2026-03-03T18:51:00Z  
**Status:** ✅ PASSED  
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `claimNextLaunchable()` atomically selects and marks-running the next eligible job, enforcing project-level serialization within the transaction | ✓ VERIFIED | `db.ts:355-387` — full `db.transaction()` block with SELECT…WHERE project NOT IN (running) + UPDATE atomically |
| 2 | A job for project X cannot be claimed while another job for project X is already running | ✓ VERIFIED | `db.ts:360-368` — SQL subquery `AND project NOT IN (SELECT DISTINCT project FROM jobs WHERE status = 'running')` inside transaction |
| 3 | `forceQuitJob()` transitions job + all running steps to failed with operator source metadata | ✓ VERIFIED | `db.ts:535-579` — transaction UPDATE jobs + UPDATE job_steps both to `status='failed'`, error includes `[source: cli\|tui]` |
| 4 | `killJobSession()` terminates the opencode process by matching session title pattern via pgrep | ✓ VERIFIED | `runner.ts:1063-1147` — pgrep -f per title, SIGTERM then 5s wait then SIGKILL |
| 5 | Runner fills ALL available parallel slots before sleeping (no idle wait between slots) | ✓ VERIFIED | `runner.ts:236-263` — inner `while (activeJobs.size < maxParallel)` drain loop; `if (launched) continue` skips sleep when jobs were dispatched |
| 6 | A new queue insertion wakes the runner within ~1s instead of waiting full poll interval | ✓ VERIFIED | `runner.ts:190-198, 271` — `fsWatch(dbPath)` fires `triggerWake()` → resolves `wakeOrTimeout` promise early |
| 7 | Project-level serialization enforced by DB-backed claim (not just in-memory) | ✓ VERIFIED | DB-level: `claimNextLaunchable()` SQL subquery; in-memory belt-and-suspenders at `runner.ts:245-252` |
| 8 | `markRunning()` NOT called inside `launch()` — no double-increment of attempts | ✓ VERIFIED | `runner.ts:316-328` — explicit comment "do NOT call markRunning here"; grep confirms zero `markRunning(` calls in launch() body |
| 9 | `reconcileStaleRunning()` kills orphaned running jobs whose process is not alive | ✓ VERIFIED | `runner.ts:80-128` — skips jobs in `activeJobs`, pgrep-checks the rest, calls `forceQuitJob(id, 'cli', 'Stale-running reconciler...')` for orphans |
| 10 | `pilot kill <id> --force` requires `--force`, rejects non-running jobs, kills process + updates DB | ✓ VERIFIED | `kill.ts:15-68` — full flow: getJob → require force → check status='running' → killJobSession → forceQuitJob('cli') |
| 11 | `pilot kill` is registered in `index.ts` | ✓ VERIFIED | `index.ts:101-107` — `.command('kill <id>')` with `.option('--force', ...)` |
| 12 | TUI `K` key shows confirmation overlay when running job selected in running panel | ✓ VERIFIED | `app.tsx:259-281` — `key.sequence === 'K' && panelFocus() === 'running'` sets `pendingConfirmAction` + `showConfirm(true)` |
| 13 | TUI confirmation 'y' calls `killJobSession(job)` + `forceQuitJob(id, 'tui')` | ✓ VERIFIED | `app.tsx:263-277` — confirm action calls both, then immediate queue refresh |
| 14 | Help overlay documents 'K = Force-quit running job' | ✓ VERIFIED | `help-overlay.tsx:29, 41` — "K            Force-quit running job" in Dashboard and Detail sections |

**Score: 14/14 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/db.ts` | `claimNextLaunchable`, `forceQuitJob`, `getRunningJobsByProject` | ✓ VERIFIED | 731 lines; all three exported at `db.ts:716,725,726`; no stubs |
| `src/core/runner.ts` | Immediate dispatch loop, `killJobSession` export, `reconcileStaleRunning` | ✓ VERIFIED | 1180 lines; all patterns present and wired |
| `src/commands/kill.ts` | `killCommand` with force-quit logic | ✓ VERIFIED | 68 lines; exports `killCommand`; full kill→DB sequence |
| `src/index.ts` | `pilot kill` command registration | ✓ VERIFIED | Lines 101-107; --force flag registered |
| `src/tui/components/confirm-overlay.tsx` | `ConfirmOverlay` component | ✓ VERIFIED | 37 lines; exports `ConfirmOverlay`; message + y/n hint text |
| `src/tui/state.ts` | `showConfirm`, `pendingConfirmAction` signals | ✓ VERIFIED | Lines 45-46; both signals created and returned |
| `src/tui/app.tsx` | K key handler + ConfirmOverlay wired | ✓ VERIFIED | K handler at line 260; ConfirmOverlay rendered at line 315 |
| `src/tui/components/help-overlay.tsx` | "K = Force-quit running job" | ✓ VERIFIED | Lines 29, 41 |
| `test/core/db.test.ts` | `claimNextLaunchable` + `forceQuitJob` tests | ✓ VERIFIED | 507 lines; describe blocks at lines 395, 454; all edge cases covered |
| `test/core/runner.test.ts` | Immediate dispatch + reconcile tests | ✓ VERIFIED | 494 lines; `describe('immediate dispatch')` at line 313; reconcile tests at line 370 |
| `test/commands/kill.test.ts` | CLI kill command tests | ✓ VERIFIED | 133 lines; 6 tests covering all error paths and happy path |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `db.ts:claimNextLaunchable` | `jobs` table | `db.transaction()` SELECT+UPDATE | ✓ WIRED | Transaction at line 358; re-fetches updated row after UPDATE |
| `db.ts:forceQuitJob` | `jobs` + `job_steps` tables | Single transaction, both UPDATEs | ✓ WIRED | `db.ts:554-575`; both tables updated atomically |
| `runner.ts:run()` | `claimNextLaunchable` | Replaces `getNextPending` in drain loop | ✓ WIRED | `runner.ts:237`; inner while-loop calls `claimNextLaunchable()` |
| `runner.ts:killJobSession` | OS process via `pgrep` | SIGTERM → 5s wait → SIGKILL | ✓ WIRED | `runner.ts:1081-1146`; execa pgrep + process.kill |
| `runner.ts:reconcileStaleRunning` | `getAllRunningJobs` + `forceQuitJob` | pgrep check per job, force-quit orphans | ✓ WIRED | `runner.ts:80-128` |
| `commands/kill.ts` | `forceQuitJob(id, 'cli')` | Direct import + call | ✓ WIRED | `kill.ts:10,48` |
| `commands/kill.ts` | `killJobSession(job)` | Direct import + call | ✓ WIRED | `kill.ts:11,42` |
| `tui/app.tsx:K key` | `state.showConfirm` | Sets `true` on K press | ✓ WIRED | `app.tsx:278` |
| `tui/app.tsx:confirm handler` | `forceQuitJob + killJobSession` | Confirm action lambda | ✓ WIRED | `app.tsx:265-266` with `source='tui'` |

---

## Test Results

All tests pass. Run evidence:

```
✓ test/core/db.test.ts (36 tests) 41ms
✓ test/core/runner.test.ts (35 tests) 16ms
✓ test/commands/kill.test.ts (6 tests) 17ms
✓ Full suite: 10 test files, 222 tests — 0 failures
✓ npm run lint (tsc --noEmit) — 0 errors
```

**Key test coverage verified:**
- `claimNextLaunchable` — null when none, claims and marks running, project serialization (same project blocked, different project allowed), null when exhausted
- `forceQuitJob` — ok:false for missing/non-running, ok:true marks job+steps failed, source metadata recorded in error for both 'cli' and 'tui'
- Immediate dispatch — multiple slots filled without sleep, maxParallel respected
- `reconcileStaleRunning` — force-quits orphaned processes (pgrep returns empty); does NOT force-quit live processes (pgrep returns PID)
- `killCommand` — requires `--force`, exits 1 for non-running job, calls kill+forceQuit in correct order, continues DB update even when process kill fails

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `app.tsx:299` | `<text content="Split view — coming soon" />` | ℹ️ Info | Pre-existing placeholder for split view, unrelated to phase 26 scope |

No blocker or warning anti-patterns introduced by phase 26 changes.

---

## Implementation Notes

One minor deviation from plan templates — not a defect:

- **Plan 01** specified error format `"Force-quit by operator via ${source}: ${reason}"` but implementation uses `"${reason} [source: ${source}]"` (e.g., `"stuck process [source: cli]"`). The tests correctly test the actual format using separate matchers (`/stuck process/i` and `/cli/`), and all 36 DB tests pass. Behavior is equivalent.

---

## Human Verification Required

None. All acceptance criteria are verifiable programmatically and confirmed by passing tests.

The following remain naturally human-only but are not blocking:

1. **TUI visual rendering** — ConfirmOverlay positioning (absolute, 40% top, 25% left) — visual layout can only be confirmed by running `pilot tui`
2. **SIGTERM→SIGKILL timing** — 5s timeout between signals feels appropriate but is a subjective operational judgement

---

_Verified: 2026-03-03T18:51:00Z_  
_Verifier: Claude (gsd-verifier)_
