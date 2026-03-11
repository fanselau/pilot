---
phase: 51-pilot-notifications-via-openclaw-agent-deliver
verified: 2026-03-10T16:34:24Z
status: human_needed
score: 13/13 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2792, error_summary: "" }
  tests: { pass: true, summary: "852 passed, 0 failed", duration_ms: 14298 }
  build: { pass: true, duration_ms: 2954, error_summary: "" }
verdict: WARN
blocking_issues: []
human_verification:
  - test: "Live Telegram group delivery"
    expected: "Configured group route receives a natural agent-authored completion/failure reply via openclaw deliver"
    why_human: "Requires real OpenClaw runtime and Telegram side effects; unit tests mock subprocess execution"
  - test: "Live Telegram DM delivery"
    expected: "Configured DM route receives a natural agent-authored completion/failure reply via openclaw deliver"
    why_human: "Requires real OpenClaw runtime and direct-chat visibility outside this verifier"
---

# Phase 51: Pilot notifications via `openclaw agent --deliver` Verification Report

**Phase Goal:** Deliver completion/failure notifications to the correct OpenClaw agent chat (group or DM) by invoking `openclaw agent --deliver` with strict route resolution and no `/hooks/wake` fallback for configured deliver targets.
**Verified:** 2026-03-10T16:34:24Z
**Status:** human_needed
**Verdict:** WARN
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pilot can represent a complete OpenClaw deliver route with `kind/agentId/channel/to/accountId`. | ✓ VERIFIED | `OpenClawDeliverRoute` and model fields exist in `src/core/types.ts:90`, `src/core/types.ts:124`, `src/core/types.ts:266`. |
| 2 | Structured routes are persisted on projects and snapshotted onto jobs. | ✓ VERIFIED | DB columns + mapping + writes in `src/core/db.ts:282`, `src/core/db.ts:290`, `src/core/db.ts:420`, `src/core/db.ts:1122`; round-trip tests in `test/core/db.test.ts:132` and `test/core/db.test.ts:1137`. |
| 3 | Route resolution is structured-first, with strict legacy derivation only for known shapes. | ✓ VERIFIED | Resolver order and strict regex in `src/core/notify-route.ts:82` and `src/core/notify-route.ts:112`; precedence test in `test/core/notify-route.test.ts:135`. |
| 4 | Missing or malformed routing data yields explicit configuration errors. | ✓ VERIFIED | Explicit error codes/messages in `src/core/notify-route.ts:28`, `src/core/notify-route.ts:133`; callback error surfacing in `src/core/callback.ts:105`; tests in `test/core/notify-route.test.ts:122` and `test/core/callback.test.ts:132`. |
| 5 | Completion and failure notifications execute `openclaw agent --deliver`. | ✓ VERIFIED | Delivery executor calls execa with `openclaw` in `src/core/openclaw-deliver.ts:29`; runner invokes callback on complete/fail in `src/core/runner.ts:721` and `src/core/runner.ts:740`. |
| 6 | Delivery args always include explicit reply routing (`--reply-channel`, `--reply-to`, optional `--reply-account`). | ✓ VERIFIED | Argument builder in `src/core/openclaw-deliver.ts:15`; account omission behavior covered in `test/core/openclaw-deliver.test.ts:40`. |
| 7 | Group and DM delivery share one transport path and differ by resolved `to`. | ✓ VERIFIED | Single callback execute path in `src/core/callback.ts:112`; both route shapes covered in `test/core/callback.test.ts:100` and `test/core/callback.test.ts:116`. |
| 8 | Invalid configured deliver targets fail with actionable errors and do not fall back to `/hooks/wake`. | ✓ VERIFIED | Route failure logs + return false in `src/core/callback.ts:104`; no `/hooks/wake` usage under `src/` (code search); explicit no-fallback test in `test/core/callback.test.ts:147`. |
| 9 | Notification prompt includes structured job context and natural-response instruction. | ✓ VERIFIED | Prompt contract in `src/core/callback.ts:69`; content assertions in `test/core/callback.test.ts:155`. |
| 10 | Operators can set, clear, and inspect structured project notify routes. | ✓ VERIFIED | Route flags and persistence flow in `src/commands/project.ts:58`, `src/commands/project.ts:82`, `src/commands/project.ts:117`, `src/commands/project.ts:201`; CLI wiring in `src/index.ts:213`; tests in `test/commands/project.test.ts:259`. |
| 11 | Queued jobs snapshot resolved notify route for deterministic runtime delivery. | ✓ VERIFIED | Route resolution + snapshot write in `src/commands/add.ts:328` and `src/commands/add.ts:343`; `addJob(... notifyRoute)` path in `src/commands/add.ts:347`; DB write in `src/core/db.ts:420`. |
| 12 | Add-command notify flow rejects ambiguous or incomplete routing with migration guidance. | ✓ VERIFIED | Mismatch guard in `src/commands/add.ts:319`; explicit route config guidance in `src/commands/add.ts:337`; tests in `test/commands/add.test.ts:820` and `test/commands/add.test.ts:850`. |
| 13 | Legacy notify values remain supported only when safely derivable. | ✓ VERIFIED | Strict legacy parser in `src/core/notify-route.ts:84`; safe legacy success/failure tests in `test/core/notify-route.test.ts:92` and `test/core/notify-route.test.ts:122`; add-command snapshot from legacy key in `test/commands/add.test.ts:697`. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/types.ts` | Typed route model on Job/Project | ✓ VERIFIED | Exists, substantive (318 lines), consumed by core + commands. |
| `src/core/db.ts` | Persist/parse project + job route JSON | ✓ VERIFIED | Exists, substantive (1366 lines), migration + row mapping + write paths implemented. |
| `src/core/notify-route.ts` | Structured-first resolver + strict legacy derive | ✓ VERIFIED | Exists, substantive (142 lines), imported by callback/add/project command flow. |
| `src/core/openclaw-deliver.ts` | Execa-based `openclaw agent --deliver` executor | ✓ VERIFIED | Exists, substantive (53 lines), invoked from callback. |
| `src/core/callback.ts` | Route-first notification flow + prompt contract | ✓ VERIFIED | Exists, substantive (130 lines), called from runner on completion/failure. |
| `src/commands/project.ts` | Route set/clear/show CLI behavior | ✓ VERIFIED | Exists, substantive (220 lines), wired from CLI entrypoint. |
| `src/commands/add.ts` | Queue-time resolve + snapshot + strict failures | ✓ VERIFIED | Exists, substantive (485 lines), writes route snapshots into jobs. |
| `src/index.ts` | CLI flag wiring for route management | ✓ VERIFIED | Exists, substantive (525 lines), route options wired to project command. |
| `test/core/db.test.ts` | DB persistence + malformed JSON behavior | ✓ VERIFIED | Exists, substantive (1259 lines), covers route persistence and safe null fallback. |
| `test/core/notify-route.test.ts` | Resolver success/failure coverage | ✓ VERIFIED | Exists, substantive (157 lines), covers structured, legacy, and invalid paths. |
| `test/core/openclaw-deliver.test.ts` | Deliver args + failure-surface coverage | ✓ VERIFIED | Exists, substantive (89 lines), verifies args and runtime failures. |
| `test/core/callback.test.ts` | Runtime notification behavior + no fallback tests | ✓ VERIFIED | Exists, substantive (195 lines), covers group/DM/no-fallback/prompt contract. |
| `test/commands/project.test.ts` | Route management command coverage | ✓ VERIFIED | Exists, substantive (455 lines), includes set/clear/partial-error/json route cases. |
| `test/commands/add.test.ts` | Snapshot/mismatch/ambiguous notify command coverage | ✓ VERIFIED | Exists, substantive (1127 lines), includes snapshot + strict validation paths. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/db.ts` | `projects.notify_openclaw_route` | migration + JSON parse/write | ✓ WIRED | Column migration (`src/core/db.ts:290`), parse mapper (`src/core/db.ts:211`), update helper (`src/core/db.ts:1124`). |
| `src/core/db.ts` | `jobs.notify_route` | migration + addJob insert + parse | ✓ WIRED | Column migration (`src/core/db.ts:282`), insert (`src/core/db.ts:420`), parse mapper (`src/core/db.ts:249`). |
| `src/commands/add.ts` | `src/core/db.ts:addJob` | pass `notifyRouteSnapshot` | ✓ WIRED | Snapshot resolved (`src/commands/add.ts:343`) and passed into `addJob` call sites (`src/commands/add.ts:362`, `src/commands/add.ts:394`). |
| `src/core/callback.ts` | `src/core/notify-route.ts` | resolve before delivery | ✓ WIRED | Resolver imported and called (`src/core/callback.ts:11`, `src/core/callback.ts:103`). |
| `src/core/callback.ts` | `src/core/openclaw-deliver.ts` | execute deliver with route+prompt | ✓ WIRED | Executor imported and called (`src/core/callback.ts:12`, `src/core/callback.ts:112`). |
| `src/core/openclaw-deliver.ts` | OpenClaw CLI | `execa('openclaw', args)` arg-array | ✓ WIRED | Non-shell argument array with required deliver flags (`src/core/openclaw-deliver.ts:10`, `src/core/openclaw-deliver.ts:29`). |
| `src/index.ts` | `src/commands/project.ts` | route flag options + command action | ✓ WIRED | Route flags declared and action wired (`src/index.ts:213`, `src/index.ts:220`). |
| `src/core/runner.ts` | `src/core/callback.ts` | completion/failure callback trigger | ✓ WIRED | Notify calls on success/failure path (`src/core/runner.ts:721`, `src/core/runner.ts:740`). |

### Requirements Coverage

`.planning/REQUIREMENTS.md` is not present in this repo. Coverage was mapped from Phase 51 requirement IDs listed in `.planning/ROADMAP.md` and validated against the requirement spec + code/tests.

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| OAD-01 | ✓ SATISFIED | None |
| OAD-02 | ✓ SATISFIED | None |
| OAD-03 | ✓ SATISFIED | None |
| OAD-04 | ✓ SATISFIED | None |
| OAD-05 | ✓ SATISFIED | None |
| OAD-06 | ✓ SATISFIED | None |
| OAD-07 | ✓ SATISFIED | None |
| OAD-08 | ✓ SATISFIED | None |
| OAD-09 | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/index.ts` | 463 | "coming soon" text in unrelated `lessons --approve` option | ℹ️ Info | Not in phase-51 delivery path; no effect on notification routing goal. |

### Test Evidence

- Automated checks (project-wide): `npx tsc --noEmit`, `npx vitest run`, and `npm run build` all pass.
- Phase-focused suite executed: `npx vitest run test/core/db.test.ts test/core/notify-route.test.ts test/core/openclaw-deliver.test.ts test/core/callback.test.ts test/commands/project.test.ts test/commands/add.test.ts`.
- Result: **6 files passed, 187 tests passed, 0 failed**.
- Browser verification: N/A (non-web CLI phase).

### Human Verification Required

### 1. Group Delivery End-to-End

**Test:** Configure a project route to a known Telegram group and run one completed job + one failed job.
**Expected:** Target agent posts natural completion/failure replies in that group (not raw hook artifacts).
**Why human:** Requires real OpenClaw/Telegram integration; verifier runs unit tests with mocked subprocesses.

### 2. DM Delivery End-to-End

**Test:** Configure a project route to a known Telegram DM target and run one completed job + one failed job.
**Expected:** Target agent posts natural replies in the DM lane with correct routing.
**Why human:** External runtime/chat effects cannot be validated from static code checks alone.

### Gaps Summary

No code-level or wiring gaps were found against phase must-haves. Status is `human_needed` because final acceptance (correct chat delivery and natural in-chat response in real OpenClaw + Telegram runtime) requires live external-system verification.

---

_Verified: 2026-03-10T16:34:24Z_
_Verifier: Claude (gsd-verifier)_
