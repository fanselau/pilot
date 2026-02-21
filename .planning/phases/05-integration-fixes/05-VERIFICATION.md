---
phase: 05-integration-fixes
verified: 2026-02-21T10:40:00Z
status: passed
score: 10/10 must-haves verified
must_haves:
  truths:
    - "Setup creates .opencode/ directory with symlinks (not .claude/)"
    - "Setup creates opencode.json with correct permission format"
    - "Setup warns on real directories (not symlinks) instead of overwriting"
    - "Setup adds .opencode/ to .gitignore"
    - "Status returns fast (<5s) — no 30s CPU sampling hang"
    - "Queue runner PID excluded from stuck detection"
    - "CPU sampling has timeout cap"
    - "Runner --once waits for all launched jobs to complete"
    - "Update succeeds without upstream tracking"
    - "Regression tests cover all 6 fixes"
  artifacts:
    - path: "src/core/setup.ts"
      provides: ".opencode/ symlinks, opencode.json, .gitignore, lstat detection"
    - path: "src/core/stuck.ts"
      provides: "computeStuckScoreFast, sampleCpu with timeoutMs"
    - path: "src/commands/status.ts"
      provides: "Fast stuck scoring, runner PID exclusion"
    - path: "src/core/runner.ts"
      provides: "--once wait-for-all, run-command dispatch"
    - path: "src/commands/update.ts"
      provides: "Explicit remote/branch pull, upstream tracking"
    - path: "test/core/setup.test.ts"
      provides: "Setup regression tests"
    - path: "test/core/runner.test.ts"
      provides: "Runner --once and run-command tests"
    - path: "test/commands/status.test.ts"
      provides: "Status runner PID exclusion test"
    - path: "test/core/stuck.test.ts"
      provides: "computeStuckScoreFast export test"
  key_links:
    - from: "status.ts"
      to: "stuck.ts"
      via: "import computeStuckScoreFast"
    - from: "status.ts"
      to: "process.ts"
      via: "readPidFile('queue') for runner PID"
    - from: "runner.ts mainLoop"
      to: "wait-for-all block"
      via: "break from --once → while(activeJobs.size > 0) loop"
---

# Phase 5: Integration Fixes Verification Report

**Phase Goal:** Fix 6 integration bugs discovered during testing that prevent pilot from replacing the bash queue runner: setup creates wrong directory/config, status hangs 30s, run-command wrong dispatch, --once exits early, update fails without upstream.
**Verified:** 2026-02-21T10:40:00Z
**Status:** ✅ PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Setup creates .opencode/ directory with symlinks (not .claude/) | ✓ VERIFIED | setup.ts L77: `path.join(absDir, '.opencode')`. No reference to `.claude` anywhere in file (grep confirmed). Symlinks to `commands/`, `agents/`, `get-shit-done/` at L87-91. |
| 2 | Setup creates opencode.json with correct permission format | ✓ VERIFIED | setup.ts L129: `opencode.json` filename. L136-144: `{permission: {read: {'**': 'allow'}, write: {'**': 'allow'}, edit: {'**': 'allow'}, bash: {'**': 'allow'}, external_directory: {'**': 'allow'}}}`. Singular `permission` matches spawn.ts validator. |
| 3 | Setup warns on real directories (not symlinks) | ✓ VERIFIED | setup.ts L105: `const linkStats = await lstat(linkPath)` — uses lstat (not stat) to distinguish. L106: `linkStats.isSymbolicLink()` check. L109-111: skipped message includes "real directory (not symlink)" warning. |
| 4 | Setup adds .opencode/ to .gitignore | ✓ VERIFIED | setup.ts L159: `line.trim() === '.opencode/'` check. L161: appends `.opencode/\n`. L167: creates new gitignore with `.opencode/\n`. |
| 5 | Status returns fast — no CPU sampling hang | ✓ VERIFIED | status.ts L13: imports `computeStuckScoreFast` (not `computeStuckScore`). L88: calls `computeStuckScoreFast()`. stuck.ts L402-438: `computeStuckScoreFast` passes `cpuSamples: []` — zero I/O delay. Scorer defaults maxCpu=100 for empty samples (L70). |
| 6 | Queue runner PID excluded from stuck scoring | ✓ VERIFIED | status.ts L65-78: Runner PID detection happens BEFORE stuck scoring. L81-83: `scorablePidEntries = runnerPid !== null ? pidEntries.filter((e) => e.pid !== runnerPid) : pidEntries`. L86: stuck loop iterates `scorablePidEntries` only. |
| 7 | CPU sampling has timeout cap | ✓ VERIFIED | stuck.ts L191: `sampleCpu(pid, count, intervalMs, timeoutMs?: number)` — optional 4th param. L226-228 and L233-235: checks `(Date.now() - startTime) >= timeoutMs` before and after each sleep. L368: `computeStuckScore` calls `sampleCpu(pid, 3, 10_000, 3_000)` — 3s timeout cap. |
| 8 | Runner --once waits for all launched jobs | ✓ VERIFIED | runner.ts L162-164: `if (this.opts.once) { break; }` exits scan loop when no more launchable entries. L181-191: unconditional wait-for-all block: `while (this.state.activeJobs.size > 0) { await this.reap(); ... }`. In --once mode, this drains launched jobs before returning. |
| 9 | Update succeeds without upstream tracking | ✓ VERIFIED | update.ts L36-37: detects current branch via `git branch --show-current`. L41: best-effort `git branch --set-upstream-to origin/<branch>` in try/catch. L47: `git pull origin <currentBranch>` — explicit remote+branch, works without upstream. |
| 10 | Regression tests cover all 6 fixes | ✓ VERIFIED | All 81 tests pass across 4 test files. See details below. |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/setup.ts` | .opencode/ symlinks, opencode.json, lstat | ✓ VERIFIED | 193 lines, substantive, exported `setupProject`, imported by commands/setup.ts |
| `src/core/stuck.ts` | computeStuckScoreFast, sampleCpu timeout | ✓ VERIFIED | 523 lines, exports both `computeStuckScore` and `computeStuckScoreFast`, `sampleCpu` has `timeoutMs` param |
| `src/commands/status.ts` | Fast scoring, runner PID exclusion | ✓ VERIFIED | 252 lines, imports `computeStuckScoreFast`, filters `scorablePidEntries` |
| `src/core/runner.ts` | --once wait-for-all, run-command dispatch | ✓ VERIFIED | 818 lines, mainLoop has break→wait-for-all pattern, `launchDirectSpawn` splits args for run-command |
| `src/commands/update.ts` | Explicit remote/branch, upstream tracking | ✓ VERIFIED | 76 lines, `git pull origin <branch>`, `git branch --set-upstream-to` |
| `test/core/setup.test.ts` | Setup regression tests | ✓ VERIFIED | 187 lines, 6 tests: .opencode/ symlinks, opencode.json format, .gitignore, real-dir warning, legacy claude.json skip |
| `test/core/runner.test.ts` | Runner regression tests | ✓ VERIFIED | 249 lines, 3 tests: --once waits for completion, run-command extracts command, single-word run-command |
| `test/commands/status.test.ts` | Status runner PID exclusion test | ✓ VERIFIED | 310 lines, 6 tests incl. "excludes queue runner PID from stuck scoring" at L248 |
| `test/core/stuck.test.ts` | computeStuckScoreFast export test | ✓ VERIFIED | 832 lines, 66 tests incl. "exports computeStuckScoreFast" at L585 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `status.ts` L13 | `stuck.ts` L402 | `import { computeStuckScoreFast }` | ✓ WIRED | Imported and called at L88 |
| `status.ts` L69 | `process.ts` | `readPidFile('queue')` | ✓ WIRED | Returns runner PID, used to filter at L81-83 |
| `runner.ts` L162 | L181-191 | `break` → `while(activeJobs.size > 0)` | ✓ WIRED | --once break lands in wait-for-all block |
| `runner.ts` L375 | `spawn.ts` | `spawnSession(spawnOpts)` | ✓ WIRED | run-command: command = `args.split(' ')[0]`, args = rest |
| `update.ts` L47 | git | `execa('git', ['pull', 'origin', currentBranch])` | ✓ WIRED | Explicit remote/branch, works without upstream |
| `update.ts` L41 | git | `execa('git', ['branch', '--set-upstream-to', ...])` | ✓ WIRED | Best-effort in try/catch before pull |
| `test/status.test.ts` L28 | `stuck.ts` | `vi.mock('computeStuckScoreFast')` | ✓ WIRED | Mock targets correct function name |
| `test/status.test.ts` L248 | test assertion | Runner PID exclusion test | ✓ WIRED | Asserts `computeStuckScoreFast` called once (not for runner PID) |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Fix setup creates wrong directory/config | ✓ SATISFIED | .opencode/ with correct opencode.json |
| Fix status hangs 30s | ✓ SATISFIED | computeStuckScoreFast skips CPU sampling |
| Fix run-command wrong dispatch | ✓ SATISFIED | Args split correctly in launchDirectSpawn |
| Fix --once exits early | ✓ SATISFIED | Wait-for-all block after scan loop |
| Fix update fails without upstream | ✓ SATISFIED | Explicit git pull origin <branch> |
| Regression tests for all fixes | ✓ SATISFIED | 81 tests pass (4 test files) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No anti-patterns detected |

No TODO, FIXME, placeholder, or stub patterns found in any Phase 5 artifact. TypeScript compilation clean.

### Test Results

All 81 tests pass:
- `test/core/setup.test.ts`: 6 tests ✓
- `test/commands/status.test.ts`: 6 tests ✓
- `test/core/stuck.test.ts`: 66 tests ✓
- `test/core/runner.test.ts`: 3 tests ✓

### Human Verification Required

None required. All 6 integration bugs have verifiable code-level fixes with matching regression tests. The UAT file documents the pre-fix state — all issues identified there have been resolved in the actual codebase.

### Note on UAT File

The `05-UAT.md` was written during the bug discovery phase (BEFORE fixes were applied). It documents 14 issues. All 14 have been resolved:
- Issues 1-4 (setup): Fixed in `src/core/setup.ts` — .opencode/, opencode.json, .gitignore, lstat
- Issues 5-7 (status/stuck): Fixed in `src/core/stuck.ts` and `src/commands/status.ts` — computeStuckScoreFast, runner PID exclusion, timeout cap
- Issue 8 (run-command): Already fixed, now has regression test
- Issue 9 (--once): Fixed in `src/core/runner.ts` — wait-for-all block
- Issues 10-11 (update): Fixed in `src/commands/update.ts` — explicit remote/branch, upstream tracking
- Issues 12-15 (tests): All test files created with comprehensive coverage

---

_Verified: 2026-02-21T10:40:00Z_
_Verifier: Claude (gsd-verifier)_
