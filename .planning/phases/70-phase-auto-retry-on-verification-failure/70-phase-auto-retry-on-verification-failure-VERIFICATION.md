---
phase: 70-phase-auto-retry-on-verification-failure
verified: 2026-03-16T04:00:58Z
status: passed
score: 13/13 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2584, error_summary: "" }
  tests: { pass: false, summary: "1107 passed, 0 failed (3 suites failed)", duration_ms: 15155 }
  build: { pass: true, duration_ms: 2795, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "tests failed: 3 suites (test/commands/doctor.test.ts, test/commands/update.test.ts, test/web/actions.test.ts)"
  - "test/commands/doctor.test.ts: vi.mock hoisting error (Cannot access '__vi_import_0__' before initialization)"
  - "test/commands/update.test.ts: vi.mock hoisting error (Cannot access 'mockExeca' before initialization)"
  - "test/web/actions.test.ts: missing module ~/components/ui/toast in web/src/lib/actions.ts"
---

# Phase 70: Phase Auto-Retry on Verification Failure Verification Report

**Phase Goal:** Automatically retry phase jobs when verification/judge outcomes are retryable (`fail`/`partial`/null), using persisted retry budgets and fingerprint-based same-failure escalation, while surfacing retry lineage in CLI (`pilot info`, `pilot log --chain`).
**Verified:** 2026-03-16T04:00:58Z
**Status:** passed
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Job rows persist retry state (`retry_budget`, `retry_count`, `retry_hint`, `last_failure_fingerprint`) | ✓ VERIFIED | `src/core/db.ts:61`, `src/core/db.ts:312`, `src/core/db.ts:314`, `src/core/db.ts:315` |
| 2 | Default retry budget is 2 unless explicitly overridden | ✓ VERIFIED | `src/core/db.ts:61`, `src/core/db.ts:486`, `test/core/db.test.ts:1306`, `test/core/db.test.ts:198` |
| 3 | Attempt lineage is archived before reset clears live fields | ✓ VERIFIED | `src/core/db.ts:1188`, `src/core/db.ts:1212`, `src/core/db.ts:1217`, `test/core/db.test.ts:769` |
| 4 | Judge `fail`/`partial`/null outcomes route into retry policy (not synthetic success) | ✓ VERIFIED | `src/core/runner.ts:1150`, `src/core/runner.ts:1172`, `src/core/runner.ts:1176`, `test/core/runner-recovery.test.ts:557`, `test/core/runner-recovery.test.ts:580` |
| 5 | `retry-resume` is gated by valid VERIFICATION evidence (>100 bytes, structured), otherwise forced to `retry-full` | ✓ VERIFIED | `src/core/runner.ts:200`, `src/core/runner.ts:216`, `src/core/runner.ts:1159`, `test/core/runner-recovery.test.ts:603` |
| 6 | Same failure fingerprint escalates immediately without consuming retry budget | ✓ VERIFIED | `src/core/runner.ts:990`, `src/core/runner.ts:1018`, `test/core/runner-recovery.test.ts:638`, `test/core/runner-recovery.test.ts:695` |
| 7 | Retry path avoids blocking until escalation/budget exhaustion path | ✓ VERIFIED | `src/core/runner.ts:995`, `src/core/runner.ts:997`, `src/core/runner.ts:1018`, `test/core/runner-recovery.test.ts:698` |
| 8 | Operators can set per-job retry budget with `pilot add --retries` and disable with `--no-retry` | ✓ VERIFIED | `src/index.ts:55`, `src/index.ts:56`, `src/commands/add.ts:450`, `src/commands/add.ts:460`, `test/commands/add.test.ts:322`, `test/commands/add.test.ts:329` |
| 9 | No retry flags -> queue-time budget comes from config default (`defaults.retry_budget`) with fallback 2 | ✓ VERIFIED | `src/core/config.ts:297`, `src/commands/add.ts:170`, `src/commands/add.ts:463`, `test/core/config.test.ts:556`, `test/commands/add.test.ts:343` |
| 10 | CLI surface accepts `pilot log --chain` | ✓ VERIFIED | `src/index.ts:83`, `src/commands/log.ts:35` |
| 11 | `pilot info <id>` shows attempt lineage and retry hint context | ✓ VERIFIED | `src/commands/info.ts:176`, `src/commands/info.ts:181`, `src/commands/info.ts:557`, `src/commands/info.ts:559`, `test/commands/info.test.ts:207`, `test/commands/info.test.ts:373` |
| 12 | `pilot log <id> --chain` renders archived + current attempt sections | ✓ VERIFIED | `src/commands/log.ts:153`, `src/commands/log.ts:161`, `src/commands/log.ts:936`, `test/commands/log.test.ts:379` |
| 13 | Default `pilot log <id>` remains current-attempt focused when `--chain` is absent | ✓ VERIFIED | `src/commands/log.ts:149`, `src/commands/log.ts:150`, `test/commands/log.test.ts:390` |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/types.ts` | Job retry metadata contract | ✓ VERIFIED | Exists (548 lines), exports retry fields on `Job` (`retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`) |
| `src/core/db.ts` | Retry persistence schema + archive helpers | ✓ VERIFIED | Exists (1670 lines), substantive SQL schema/migration/helpers, exported + consumed by runner/commands |
| `test/core/db.test.ts` | DB retry persistence regressions | ✓ VERIFIED | Exists (1495 lines), includes retry default, hint/fingerprint round-trip, archive ordering/reset tests |
| `src/core/runner.ts` | Verification auto-retry orchestration | ✓ VERIFIED | Exists (2143 lines), implements verdict normalization, evidence gating, retry scheduling, fingerprint escalation |
| `test/core/runner.test.ts` | Verdict parse policy coverage | ✓ VERIFIED | Exists (984 lines), parse coverage includes `pass`/`fail`/`partial` and retry metadata payloads |
| `test/core/runner-recovery.test.ts` | Runner retry orchestration regressions | ✓ VERIFIED | Exists (788 lines), asserts null/partial handling, malformed evidence fallback, same-fingerprint escalation, gaps-only retry path |
| `src/core/config.ts` | Parse `defaults.retry_budget` | ✓ VERIFIED | Exists (421 lines), validates integer >=0 and exposes fallback in `getConfigFileDefaults()` |
| `src/commands/add.ts` | Queue-time retry budget resolution | ✓ VERIFIED | Exists (504 lines), resolves precedence `--retries` > `--no-retry` > config > 2 and passes to `addJob(...)` |
| `src/index.ts` | CLI flag wiring (`--retries`, `--no-retry`, `--chain`) | ✓ VERIFIED | Exists (528 lines), command options registered and forwarded to command handlers |
| `test/core/config.test.ts` | Config retry-budget parsing/validation tests | ✓ VERIFIED | Exists (870 lines), covers fallback, snake/camel alias, invalid values |
| `test/commands/add.test.ts` | Add-command retry precedence tests | ✓ VERIFIED | Exists (1292 lines), verifies retries/no-retry/config precedence and invalid branch |
| `src/commands/info.ts` | Retry lineage in info output | ✓ VERIFIED | Exists (784 lines), computes attempt display + retry hint and emits in human/JSON |
| `src/commands/log.ts` | Retry chain aggregation mode | ✓ VERIFIED | Exists (1062 lines), builds archived/current attempt groups and conditionally emits chain metadata |
| `test/commands/log.test.ts` | Chain/no-chain rendering regressions | ✓ VERIFIED | Exists (423 lines), verifies chain output + default current-only mode + JSON chain payload |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/db.ts` | jobs retry columns | `rowToJob` + `addJob` insert path | ✓ WIRED | `retry_budget/retry_count/retry_hint/last_failure_fingerprint` created + mapped (`src/core/db.ts:61`, `src/core/db.ts:312`) |
| `src/core/db.ts` | `job_retry_attempts` | archive insert inside `resetToPending(...)` | ✓ WIRED | Insert happens before live field clear/delete (`src/core/db.ts:1188` -> `src/core/db.ts:1217`) |
| `src/core/db.ts` | `src/core/runner.ts` | exported retry helpers | ✓ WIRED | Runner imports `canRetry/incrementRetryCount/updateRetryHint/updateLastFailureFingerprint/getRetryAttempts` (`src/core/runner.ts:52`) |
| `src/core/runner.ts` | DB retry state | budget checks + persistence | ✓ WIRED | `canRetry` gate, hint/fingerprint writes, retry count increment (`src/core/runner.ts:995`, `src/core/runner.ts:1000`, `src/core/runner.ts:1018`) |
| `src/core/runner.ts` | GSD gap retry commands | `plan-phase --gaps` + `execute-phase --gaps-only` | ✓ WIRED | Retry intent toggles gap closure and args are constructed accordingly (`src/core/runner.ts:951`, `src/core/runner.ts:956`) |
| `src/core/runner.ts` | `src/core/delegate.ts` | persisted retry context via `resumeHint` -> `retry_context` | ✓ WIRED | Runner writes reset hint (`src/core/runner.ts:1012`), delegate injects `retry_context` from `job.resumeHint` (`src/core/delegate.ts:161`) |
| `src/core/runner.ts` | judge failure fingerprint | same-failure comparison before retry | ✓ WIRED | Immediate escalation on repeated fingerprint (`src/core/runner.ts:990`) |
| `src/core/config.ts` | `src/commands/add.ts` | `getConfigFileDefaults().retryBudget` | ✓ WIRED | Parsed config default used in add-command resolution (`src/core/config.ts:297`, `src/commands/add.ts:170`) |
| `src/index.ts` | `src/commands/add.ts` | `--retries` / `--no-retry` passthrough | ✓ WIRED | Option registration + opts forwarding (`src/index.ts:55`, `src/index.ts:63`) |
| `src/index.ts` | `src/commands/log.ts` | `--chain` flag registration | ✓ WIRED | Option registered and forwarded (`src/index.ts:83`, `src/index.ts:89`) |
| `src/commands/log.ts` | `src/core/db.ts` retry archive | `getRetryAttempts(...)` in chain mode | ✓ WIRED | Archived attempts loaded only when `chain` enabled (`src/commands/log.ts:153`) |
| `src/commands/log.ts` | opencode session parts | attempt sessions -> `getSessionParts(...)` | ✓ WIRED | Parts collected per attempt/session for render/JSON output (`src/commands/log.ts:709`, `src/commands/log.ts:827`) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Persist `retry_budget`, `retry_count`, `retry_hint` on Job | ✓ SATISFIED | None |
| Retry fail/partial/null verdicts via budgeted plan-and-execute orchestration | ✓ SATISFIED | None |
| Enforce `retry-resume` only with valid VERIFICATION evidence (>100 bytes + structured) | ✓ SATISFIED | None |
| Same-failure fingerprint escalation without burning budget | ✓ SATISFIED | None |
| Keep retries within same job and avoid blocking until terminal condition | ✓ SATISFIED | None |
| Queue-time controls: `--retries`, `--no-retry`, config default `defaults.retry_budget` | ✓ SATISFIED | None |
| Operator visibility: `pilot info` attempt lineage + `pilot log --chain` attempt chain | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/index.ts` | 466 | "coming soon" text in unrelated `--approve` help copy | INFO | Not part of Phase 70 functionality; no impact on retry behavior |

### Human Verification Required

None identified for phase-goal wiring. Browser verification is not applicable (CLI-focused phase).

### Gaps Summary

Phase 70 goal wiring is present and substantive across persistence, runner retry policy, and CLI lineage surfaces. No must-have implementation gaps were found.

Overall verdict is **FAIL** only because repository-level automated checks are currently failing in three unrelated test suites (`doctor`, `update`, `web/actions`).

---

_Verified: 2026-03-16T04:00:58Z_
_Verifier: Claude (gsd-verifier)_
