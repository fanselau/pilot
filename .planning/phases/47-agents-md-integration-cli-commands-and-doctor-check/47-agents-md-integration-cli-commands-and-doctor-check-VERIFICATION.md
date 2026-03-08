---
phase: 47-agents-md-integration-cli-commands-and-doctor-check
verified: 2026-03-08T11:22:47Z
status: gaps_found
score: 19/20 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2875, error_summary: "" }
  tests: { pass: true, summary: "799 passed, 0 failed", duration_ms: 14885 }
  build: { pass: true, duration_ms: 2784, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "Must-have test gap: setup AGENTS.md prompt lacks interactive TTY yes/no branch coverage."
gaps:
  - truth: "setup.ts AGENTS.md prompt is tested (TTY yes/no/JSON-mode)"
    status: partial
    reason: "AGENTS.md prompt tests cover non-TTY and JSON mode, but not interactive TTY accept/decline flows."
    artifacts:
      - path: "test/commands/setup.test.ts"
        issue: "AGENTS.md tests only set process.stdin.isTTY=false or jsonMode=true; no readline-driven yes/no assertions."
    missing:
      - "Add TTY 'yes' test with mocked readline answer and assert spawnAgentsMdSession is called."
      - "Add TTY 'no' test with mocked readline answer and assert spawnAgentsMdSession is not called."
---

# Phase 47: AGENTS.md Integration - CLI Commands & Doctor Check Verification Report

**Phase Goal:** Integrate AGENTS.md management into the Pilot CLI - setup prompts to generate it, doctor validates health via AI session, and a new `pilot lessons` command extracts build learnings. All three features spawn opencode sessions using established patterns, with GSD commands stubbed until available.
**Verified:** 2026-03-08T11:22:47Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `pilot setup` shows AGENTS.md opt-in prompt when file is missing | VERIFIED | `src/commands/setup.ts:158`, `src/commands/setup.ts:164` |
| 2 | Confirming AGENTS.md generation shows completion summary | VERIFIED | `src/commands/setup.ts:169`, `src/commands/setup.ts:173`, `src/commands/setup.ts:176` |
| 3 | AGENTS.md generation is never auto-committed by setup flow | VERIFIED | No git add/commit calls in `src/commands/setup.ts`; prompt explicitly says review before committing at `src/commands/setup.ts:173` |
| 4 | AGENTS.md prompt only appears in non-JSON + TTY flow | VERIFIED | Guard `!isJsonMode()` at `src/commands/setup.ts:152` and TTY gate at `src/commands/setup.ts:159` |
| 5 | Setup does not fail if AGENTS.md generation errors | VERIFIED | AGENTS block wrapped in non-fatal catch at `src/commands/setup.ts:185` |
| 6 | `spawnAgentsMdSession` resolves judge/budget model (haiku-tier path) | VERIFIED | `resolveTopLevelModel('judge', 'budget', providerMode)` at `src/core/agents-md.ts:58` |
| 7 | `pilot doctor --project` runs AGENTS.md AI health check | VERIFIED | AI check spawn in project mode at `src/commands/doctor.ts:276` |
| 8 | `pilot doctor --project --skip-agents` skips AGENTS.md AI check | VERIFIED | Guard at `src/commands/doctor.ts:259`; CLI pass-through at `src/index.ts:445`, `src/index.ts:448` |
| 9 | Missing AGENTS.md in doctor is warn-level suggestion, never fail | VERIFIED | Warn check at `src/commands/doctor.ts:265` |
| 10 | AGENTS drift findings are warn/pass only; exit code unaffected by these checks | VERIFIED | Status assignment at `src/commands/doctor.ts:290`; exit fails only on `status==='fail'` at `src/commands/doctor.ts:528` |
| 11 | Doctor AGENTS AI check is timeout-bounded (90s) | VERIFIED | `timeoutMs: 90_000` at `src/commands/doctor.ts:279`; timeout handling in helper at `src/core/agents-md.ts:54`, `src/core/agents-md.ts:120` |
| 12 | System-level doctor shows AGENTS.md coverage across registered projects | VERIFIED | Coverage loop and summary check at `src/commands/doctor.ts:473`, `src/commands/doctor.ts:489` |
| 13 | `pilot lessons [project]` defaults to `process.cwd()` | VERIFIED | Default path resolution at `src/commands/lessons.ts:22` |
| 14 | `pilot lessons` prints extracted candidates on success | VERIFIED | Success output branch at `src/commands/lessons.ts:76`, `src/commands/lessons.ts:80` |
| 15 | `pilot lessons` exits with helpful message (exit 0) when `.planning/` missing | VERIFIED | Early return branch at `src/commands/lessons.ts:34`, `src/commands/lessons.ts:41`; no `process.exit` calls in file |
| 16 | `lessonsCommand` is exported and command is wired in CLI | VERIFIED | Export at `src/commands/lessons.ts:87`; registration at `src/index.ts:452`, `src/index.ts:456` |
| 17 | `agents-md.ts` helpers are unit tested with mocked spawning dependencies | VERIFIED | Mocked deps + tests in `test/core/agents-md.test.ts:14`, `test/core/agents-md.test.ts:24`, `test/core/agents-md.test.ts:87` |
| 18 | Doctor AGENTS check is tested for exists/missing/timeout/skip | VERIFIED | Cases at `test/commands/doctor-agents.test.ts:144`, `test/commands/doctor-agents.test.ts:155`, `test/commands/doctor-agents.test.ts:179`, `test/commands/doctor-agents.test.ts:191` |
| 19 | Lessons command is tested for no `.planning`, success, timeout-path, JSON mode | VERIFIED | Cases at `test/commands/lessons.test.ts:74`, `test/commands/lessons.test.ts:100`, `test/commands/lessons.test.ts:116`, `test/commands/lessons.test.ts:134` |
| 20 | Setup AGENTS prompt tests include TTY yes/no and JSON mode | FAILED (partial) | JSON mode covered (`test/commands/setup.test.ts:291`), but no `isTTY=true` test and no readline yes/no assertions in `test/commands/setup.test.ts` |

**Score:** 19/20 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/agents-md.ts` | Shared AGENTS.md helpers + exports | VERIFIED | Exists (153 lines), substantive session orchestration, exports present at `src/core/agents-md.ts:153`, used by setup/doctor/lessons |
| `src/commands/setup.ts` | AGENTS.md setup prompt section | VERIFIED | Exists (205 lines), AGENTS block present at `src/commands/setup.ts:151` and wired to spawn helper |
| `src/commands/doctor.ts` | AGENTS.md health checks in project/system doctor | VERIFIED | Exists (534 lines), project check + system coverage check implemented and wired |
| `src/commands/lessons.ts` | `lessonsCommand` implementation/export | VERIFIED | Exists (87 lines), full command flow and export at `src/commands/lessons.ts:87` |
| `src/index.ts` | lessons registration + `--skip-agents` flag | VERIFIED | Exists (516 lines), doctor option and lessons command wired at `src/index.ts:445`, `src/index.ts:452` |
| `test/core/agents-md.test.ts` | Unit tests for AGENTS helpers (>=40 lines) | VERIFIED | Exists (259 lines), mocks + success/timeout/death/error coverage |
| `test/commands/doctor-agents.test.ts` | Doctor AGENTS check tests (>=30 lines) | VERIFIED | Exists (228 lines), required exists/missing/timeout/skip paths covered |
| `test/commands/lessons.test.ts` | Lessons command tests (>=30 lines) | VERIFIED | Exists (194 lines), required no-planning/success/null/json/default-cwd paths covered |
| `test/commands/setup.test.ts` | Setup AGENTS prompt branch coverage | PARTIAL | Exists (316 lines) but AGENTS section lacks interactive TTY yes/no prompt tests |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/agents-md.ts` | `src/core/delegate.ts` | `resolveOpencodeBinary` import | WIRED | Import at `src/core/agents-md.ts:19`, call at `src/core/agents-md.ts:61` |
| `src/core/agents-md.ts` | `src/core/opencode-db.ts` | `findSessionByTitle` + `isSessionDone` polling | WIRED | Imports at `src/core/agents-md.ts:21`, polling usage at `src/core/agents-md.ts:104`, `src/core/agents-md.ts:115` |
| `src/commands/setup.ts` | `src/core/agents-md.ts` | dynamic import + `spawnAgentsMdSession` | WIRED | Import at `src/commands/setup.ts:154`, call at `src/commands/setup.ts:170` |
| `src/commands/doctor.ts` | `src/core/agents-md.ts` | dynamic import + health session spawn | WIRED | Import at `src/commands/doctor.ts:261`, call at `src/commands/doctor.ts:276` |
| `src/commands/lessons.ts` | `src/core/agents-md.ts` | static import + `gsd-lessons` spawn | WIRED | Import at `src/commands/lessons.ts:18`, call at `src/commands/lessons.ts:63` |
| `src/index.ts` | `src/commands/doctor.ts` | `--skip-agents` option pass-through | WIRED | Option at `src/index.ts:445`, argument pass at `src/index.ts:448` |
| `src/index.ts` | `src/commands/lessons.ts` | dynamic import in command action | WIRED | Registration/import at `src/index.ts:452`, `src/index.ts:456` |
| `test/core/agents-md.test.ts` | `src/core/agents-md.ts` | direct import + execution of exports | WIRED | Import at `test/core/agents-md.test.ts:52`, function calls across suite |
| `test/commands/doctor-agents.test.ts` | `src/commands/doctor.ts` | `doctorCommand` JSON assertions | WIRED | Import at `test/commands/doctor-agents.test.ts:92`, checks asserted per AGENTS path |
| `test/commands/lessons.test.ts` | `src/commands/lessons.ts` | `lessonsCommand` invocation matrix | WIRED | Import at `test/commands/lessons.test.ts:53`, branch coverage cases |
| `test/commands/setup.test.ts` | `src/commands/setup.ts` AGENTS TTY prompt | PARTIAL | AGENTS tests present, but no readline/TTY yes-no prompt branch assertions |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| `requirements/agents-md-integration.md` - `pilot setup` integration | SATISFIED | None |
| `requirements/agents-md-integration.md` - `pilot doctor` AGENTS check | SATISFIED | None |
| `requirements/agents-md-integration.md` - `pilot lessons` command | SATISFIED | None |
| Plan 47-03 test completeness must-haves | BLOCKED | Missing interactive TTY yes/no AGENTS setup tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/core/agents-md.ts` | 73 | TODO stub command note | INFO | Expected by phase goal (GSD commands intentionally stubbed) |
| `src/commands/doctor.ts` | 272 | TODO stub health-check command | INFO | Expected temporary stub pending pilot-gsd command availability |
| `src/commands/lessons.ts` | 62 | TODO stub lessons command | INFO | Expected temporary stub pending pilot-gsd command availability |
| `src/index.ts` | 454 | "coming soon" `--approve` description | INFO | Matches nice-to-have deferral; not a blocker |

### Human Verification Required

### 1. Interactive setup TTY flow with real readline

**Test:** Run `pilot setup <project>` in a real terminal with missing `AGENTS.md`, answer `y` and `n` in separate runs.
**Expected:** `y` triggers generation call and summary output; `n` skips generation cleanly.
**Why human:** Current automated suite does not exercise interactive readline path.

### 2. End-to-end AGENTS session behavior against real opencode/pilot-gsd

**Test:** Run `pilot setup`, `pilot doctor --project <path>`, and `pilot lessons <path>` in an environment with real GSD commands.
**Expected:** Sessions spawn, timeout behavior is graceful, and outputs are operator-friendly.
**Why human:** Current tests mock spawning and DB polling, so external integration behavior is not fully validated.

### Gaps Summary

Phase 47 runtime goal is largely achieved in code: setup, doctor, and lessons AGENTS.md integrations exist, are substantive, and are wired through shared `spawnAgentsMdSession` patterns with timeout safeguards and skip controls. Automated checks also pass (`tsc`, full `vitest`, `build`).

The blocking gap is test completeness for Plan 47-03: AGENTS setup prompt tests do not cover interactive TTY yes/no branches. This leaves one must-have unmet.

---

_Verified: 2026-03-08T11:22:47Z_
_Verifier: Claude (gsd-verifier)_
