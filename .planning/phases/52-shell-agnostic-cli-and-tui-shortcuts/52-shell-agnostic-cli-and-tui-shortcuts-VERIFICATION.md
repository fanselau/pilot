---
phase: 52-shell-agnostic-cli-and-tui-shortcuts
verified: 2026-03-11T14:28:32Z
status: gaps_found
score: 11/13 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 3182, error_summary: "" }
  tests: { pass: true, summary: "891 passed, 0 failed", duration_ms: 14972 }
  build: { pass: true, duration_ms: 3113, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "Service install ExecStart still derives target from process.argv[1] (via realpathSync), not a dedicated stable wrapper script path."
  - "TUI status tests for r/x are not wired to App keyboard handler logic; they assert hardcoded status arrays only."
gaps:
  - truth: "pilot service install produces a unit with a stable wrapper script ExecStart, not baked process.argv[1]"
    status: failed
    reason: "ExecStart is generated from realpathSync(process.argv[1]), so the unit still bakes the runtime argv target instead of a dedicated stable wrapper path."
    artifacts:
      - path: "src/commands/service.ts"
        issue: "Line 33 resolves process.argv[1]; line 67 injects that result directly into ExecStart."
    missing:
      - "Generate/install a stable runner wrapper script at a fixed path (for example under ~/.local/share/pilot/)."
      - "Point ExecStart to that fixed wrapper path instead of a process.argv[1]-derived path."
      - "Add regression coverage asserting ExecStart remains stable even when argv[1] differs between invocations."
  - truth: "TUI r/x shortcuts operate on correct job statuses — verified by test"
    status: partial
    reason: "Current status tests do not execute App keyboard handler logic; they only assert hardcoded status arrays."
    artifacts:
      - path: "test/tui/shortcuts.test.ts"
        issue: "Lines 159-184 validate literal status lists without invoking handler code or an extracted guard function."
    missing:
      - "Test r/x guard behavior through extracted pure functions or simulated key-handler invocation."
      - "Assert cancel/retry DB mutations are called only for allowed statuses and skipped for disallowed statuses."
---

# Phase 52: Shell-Agnostic CLI and TUI Shortcuts Verification Report

**Phase Goal:** Make Pilot reliably invocable from any shell (agent Bash, Fish, systemd) by fixing binary resolution fallback, hardening service unit generation with stable paths, and wire broken TUI shortcuts (retry, cancel) with accurate help overlay.
**Verified:** 2026-03-11T14:28:32Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | resolveOpencodeBinary() falls through to PATH lookup when ~/.opencode/bin/opencode does not exist | ✓ VERIFIED | `src/core/delegate.ts:253` loops candidates; `src/core/delegate.ts:269` uses `which`; fallback behavior covered in `test/core/resolve-binary.test.ts:71`. |
| 2 | pilot service install produces a unit with a stable wrapper script ExecStart, not baked process.argv[1] | ✗ FAILED | `src/commands/service.ts:33` resolves `process.argv[1]`; `src/commands/service.ts:67` bakes that path into `ExecStart`. No wrapper script generation exists. |
| 3 | pilot service install works reliably after bun/node upgrades without stale interpreter paths | ✓ VERIFIED | `src/commands/service.ts:67` uses `/usr/bin/env bun` (not `process.execPath`), reducing stale absolute interpreter risk. |
| 4 | pilot doctor detects stale service ExecStart paths and warns about binary resolution issues | ✓ VERIFIED | `src/commands/doctor.ts:486` reads user service unit; `src/commands/doctor.ts:519` fails on missing binary; `src/commands/doctor.ts:352` checks resolved opencode binary path. |
| 5 | Pressing 'r' on a failed/cancelled job in the TUI retries it and refreshes the queue | ✓ VERIFIED | `src/tui/app.tsx:273` handles `r`; status guard at `src/tui/app.tsx:275`; refresh via `fetchQueueData`/`fetchRecentData` at `src/tui/app.tsx:281`. |
| 6 | Pressing 'x' on a pending job in the TUI cancels it and refreshes the queue | ✓ VERIFIED | `src/tui/app.tsx:296` handles `x`; status guard at `src/tui/app.tsx:298`; refresh at `src/tui/app.tsx:302`. |
| 7 | Help overlay only lists shortcuts that are actually implemented | ✓ VERIFIED | `src/tui/components/help-overlay.tsx:12` includes current shortcuts (`r`, `x`, `K`, `u`) and excludes removed phantoms (`a`, `f`); keyboard handlers exist in `src/tui/app.tsx:273`, `src/tui/app.tsx:296`, `src/tui/app.tsx:257`, `src/tui/app.tsx:315`. |
| 8 | Footer bar hints reflect actually-available shortcuts per view | ✓ VERIFIED | `src/tui/components/footer-bar.tsx:13` dashboard/detail hints include `r/x/K`; these handlers exist and are view-agnostic via `selectedJob()` in `src/tui/app.tsx:273` and `src/tui/app.tsx:296`. |
| 9 | resolveOpencodeBinary() falls through to PATH lookup when hardcoded path missing — verified by test | ✓ VERIFIED | `test/core/resolve-binary.test.ts:71` covers hardcoded-missing PATH fallback; phase-targeted tests passed (3/3 in this file). |
| 10 | Service unit generation uses env-based interpreter, not hardcoded execPath — verified by test | ✓ VERIFIED | `test/commands/service.test.ts:105` asserts `ExecStart=/usr/bin/env bun`; phase-targeted tests passed (9/9 in this file). |
| 11 | Doctor service check detects stale ExecStart paths — verified by test | ✓ VERIFIED | `test/commands/doctor.test.ts:184` asserts stale-path failure and remediation message; phase-targeted tests passed (5/5 in this file). |
| 12 | TUI r/x shortcuts operate on correct job statuses — verified by test | ✗ FAILED | `test/tui/shortcuts.test.ts:159` and `test/tui/shortcuts.test.ts:175` assert literal status arrays, but do not invoke App key handlers or extracted guard logic. |
| 13 | TUI help overlay text contains no phantom shortcuts — verified by test | ✓ VERIFIED | `test/tui/shortcuts.test.ts:61` parses `HELP_TEXT` and checks keys against allowed set; file passed in targeted run (10/10 in this file). |

**Score:** 11/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/delegate.ts` | Binary resolution fallback chain | ✓ VERIFIED | Exists (399 lines), substantive, exported (`resolveOpencodeBinary`), used by runtime + doctor (`src/commands/doctor.ts:352`). |
| `src/commands/service.ts` | Stable service unit generation | ⚠️ PARTIAL | Exists (129 lines), substantive, wired via `src/index.ts:474`; interpreter hardening present, but ExecStart target still argv-derived (`src/commands/service.ts:33`). |
| `src/commands/doctor.ts` | Service/binary doctor checks | ✓ VERIFIED | Exists (605 lines), substantive, wired via `src/index.ts:457`; parses service unit and validates ExecStart binary path. |
| `src/tui/app.tsx` | r/x keyboard wiring + queue refresh | ✓ VERIFIED | Exists (427 lines), substantive, wired in TUI root; status-guarded `r/x` handlers call DB mutations and refresh state. |
| `src/tui/components/help-overlay.tsx` | Accurate help content | ✓ VERIFIED | Exists (59 lines), substantive, exported `HELP_TEXT` used by overlay and tests. |
| `src/tui/components/footer-bar.tsx` | View-specific accurate footer hints | ✓ VERIFIED | Exists (25 lines), substantive, exported `HINTS`, rendered by `FooterBar` in app. |
| `test/core/resolve-binary.test.ts` | Fallback chain tests | ✓ VERIFIED | Exists (81 lines), imports target symbol, covers hardcoded/path/fallback cases. |
| `test/commands/service.test.ts` | Service unit generation tests | ✓ VERIFIED | Exists (195 lines), imports `serviceCommand`, validates env interpreter + path construction. |
| `test/commands/doctor.test.ts` | Doctor stale ExecStart tests | ✓ VERIFIED | Exists (267 lines), imports `doctorCommand`, validates pass/fail/warn service states. |
| `test/tui/shortcuts.test.ts` | TUI shortcut + help regression tests | ⚠️ PARTIAL | Exists (185 lines), imports help/footer artifacts; status tests are not wired to App handler logic. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/delegate.ts` | opencode binary resolution | `accessSync(X_OK)` + `which` fallback | ✓ WIRED | Filesystem path check at `src/core/delegate.ts:263`; PATH check at `src/core/delegate.ts:269`. |
| `src/commands/service.ts` | systemd unit ExecStart | unit template generation | ⚠️ PARTIAL | Uses `/usr/bin/env bun` (`src/commands/service.ts:67`) but still injects argv-derived binary path (`src/commands/service.ts:33`). |
| `src/commands/doctor.ts` | service unit stale path detection | `readFileSync` + parse `ExecStart` + `accessSync` | ✓ WIRED | Parses unit at `src/commands/doctor.ts:490`; stale binary failure at `src/commands/doctor.ts:519`. |
| `src/tui/app.tsx` | DB retry/cancel mutations | key handlers call `retry`/`cancel` | ✓ WIRED | `retry(job.id)` at `src/tui/app.tsx:277`; `cancel(job.id)` at `src/tui/app.tsx:300`; immediate refresh after each. |
| `src/tui/components/help-overlay.tsx` | implemented keyboard shortcuts | `HELP_TEXT` contract | ✓ WIRED | Shortcut entries in `src/tui/components/help-overlay.tsx:12` align with active handlers in `src/tui/app.tsx`. |
| `test/tui/shortcuts.test.ts` | r/x status guards in App handler | status validation tests | ✗ NOT_WIRED | Tests assert local constants (`test/tui/shortcuts.test.ts:159`) without executing/observing `src/tui/app.tsx` handler branches. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| User-provided phase must-haves (13 total) | 11/13 verified | Missing stable wrapper-script ExecStart path; r/x status tests not wired to handler logic |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/doctor.ts` | 273 | `TODO` marker | ⚠️ Warning | Existing deferred AGENTS.md health-check implementation; unrelated to phase goal but indicates incomplete area in modified file. |
| `src/tui/app.tsx` | 391 | "coming soon" placeholder | ℹ️ Info | Split view remains placeholder UI; not introduced by this phase's shortcut wiring. |

### Human Verification Required

No additional human-only checks block this verdict; failures are code-level gaps identifiable statically.

### Gaps Summary

Phase 52 is close but not complete against the declared must-haves. Binary fallback, doctor stale-path detection, and TUI r/x wiring are implemented and covered by tests. However, service installation still embeds an argv-derived binary path instead of a dedicated stable wrapper script path, and the r/x status "verification" tests are not actually connected to keyboard-handler execution logic. These two gaps prevent goal-level PASS.

---

_Verified: 2026-03-11T14:28:32Z_
_Verifier: Claude (gsd-verifier)_
