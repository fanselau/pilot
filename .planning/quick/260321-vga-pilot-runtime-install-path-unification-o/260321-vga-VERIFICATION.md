---
phase: 260321-vga
verified: 2026-03-21T22:57:57Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "Run bun run build && pilot reload on a Linux systemd host, then run pilot doctor"
    expected: "service unit check is pass and binary drift check is pass with matching canonical path"
    why_human: "Requires live daemon + systemd restart behavior that cannot be proven from static code inspection"
  - test: "Force a stale ExecStart path (shadow path) and run pilot doctor"
    expected: "binary drift check is warn, includes both paths, and suggests bun run build && pilot service install && pilot reload"
    why_human: "Needs real unit-file/runtime state mutation not reproducible in this verification environment"
---

# Phase 260321-vga: Pilot Runtime / Install Path Unification + Operator Documentation Verification Report

**Phase Goal:** Pilot Runtime / Install Path Unification + Operator Documentation
**Verified:** 2026-03-21T22:57:57Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | pilot doctor warns when the systemd service ExecStart binary differs from current build output (shadow path drift detection) | VERIFIED | Drift check compares normalized service/build paths and warns on mismatch in `src/commands/doctor.ts:624` and `src/commands/doctor.ts:640`; behavior covered by tests in `test/commands/doctor.test.ts:624` and `test/commands/doctor.test.ts:653` |
| 2 | Operator documentation explains canonical binary path, command semantics (`pilot update`, `pilot setup --refresh`), and rebuild workflow | VERIFIED | Canonical path + `resolvePilotBinary()` + workflow documented in `docs/RUNTIME.md:11`, `docs/RUNTIME.md:13`, `docs/RUNTIME.md:33`, `docs/RUNTIME.md:62`, and `docs/RUNTIME.md:70`; cross-link added in `docs/GETTING-STARTED.md:686` |
| 3 | Operator can run `bun run build && pilot reload` and use doctor to confirm runtime alignment | VERIFIED (code-level) | Canonical service path is baked from `resolvePilotBinary()` in `src/commands/service.ts:67` and `src/commands/service.ts:101`; doctor confirms/flags drift in `src/commands/doctor.ts:630`; operator flow documented in `docs/RUNTIME.md:35` and `docs/RUNTIME.md:55` |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/commands/doctor.ts` | Shadow path drift detection in system health check | VERIFIED | Exists; substantive drift check added after service unit check (`src/commands/doctor.ts:620`); wired through `doctorCommand` execution path in `src/commands/doctor.ts:733` and CLI dispatch in `src/index.ts:441` |
| `test/commands/doctor.test.ts` | Tests for drift detection doctor check | VERIFIED | Exists; includes pass/warn/actionable-message/skip coverage in `test/commands/doctor.test.ts:608` through `test/commands/doctor.test.ts:670`; targeted test run passed (21 tests) |
| `docs/RUNTIME.md` | Operator documentation for runtime/install path unification | VERIFIED | Exists; includes canonical path, shadow path explanation, command behavior matrix, rebuild/reinstall workflows, and troubleshooting (`docs/RUNTIME.md:5`, `docs/RUNTIME.md:21`, `docs/RUNTIME.md:60`, `docs/RUNTIME.md:99`) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/commands/doctor.ts` | `src/commands/service.ts` | `resolvePilotBinary()` shared canonical resolution | WIRED | Import and usage present in `src/commands/doctor.ts:22` and `src/commands/doctor.ts:626`; source function exported in `src/commands/service.ts:163` |
| `docs/RUNTIME.md` | `src/commands/service.ts` | Documents canonical path the service uses | WIRED | Docs explicitly describe `dist/index.js` canonical path and `resolvePilotBinary()` behavior (`docs/RUNTIME.md:11`, `docs/RUNTIME.md:13`, `docs/RUNTIME.md:19`) matching service implementation (`src/commands/service.ts:34`) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `RUNTIME-UNIFY` | `260321-vga-PLAN.md` | Runtime/install path unification with drift detection and operator docs | SATISFIED | Must-haves verified across `src/commands/doctor.ts`, `test/commands/doctor.test.ts`, `docs/RUNTIME.md`, and `docs/GETTING-STARTED.md` |

Note: `RUNTIME-UNIFY` is declared in `260321-vga-PLAN.md` but not found in `.planning/REQUIREMENTS.md`; treated here as a quick-task-local requirement contract.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/doctor.ts` | n/a | No TODO/FIXME/placeholder/empty-implementation patterns found | INFO | No stub indicators in implemented drift check |
| `test/commands/doctor.test.ts` | n/a | No placeholder/console-only test stubs found in drift test block | INFO | Drift behavior assertions are concrete |
| `docs/RUNTIME.md` | n/a | No placeholder documentation patterns found | INFO | Documentation appears complete and actionable |

Additional test context:
- Targeted verification tests passed: `npm test -- "test/commands/doctor.test.ts" "test/commands/service.test.ts"` (34/34 passing).
- Full suite currently has unrelated baseline failures outside this quick-task scope (`test/core/opencode-db.test.ts`, `test/core/runner-lock.test.ts`, `test/tui/shortcuts.test.ts`).

### Human Verification Required

### 1. End-to-End Reload Path

**Test:** On a Linux host with user systemd, run `bun run build && pilot reload` and then `pilot doctor`.
**Expected:** `service unit` and `binary drift` both report pass; reported binary path matches current `dist/index.js` realpath.
**Why human:** Requires real daemon lifecycle + systemd restart semantics.

### 2. Shadow Path Drift Detection in Real Unit

**Test:** Make `pilot-runner.service` point to a non-canonical pilot binary, reload daemon, then run `pilot doctor`.
**Expected:** `binary drift` reports warn, includes both service/build paths, and fix command text.
**Why human:** Requires modifying real unit state and observing live runtime behavior.

### Gaps Summary

No implementation gaps found against declared must-haves. Remaining validation is operational (live systemd/daemon behavior), so final closure requires human runtime checks.

---

_Verified: 2026-03-21T22:57:57Z_
_Verifier: Claude (gsd-verifier)_
