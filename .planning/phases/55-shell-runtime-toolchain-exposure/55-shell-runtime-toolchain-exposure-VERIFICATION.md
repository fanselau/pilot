---
phase: 55-shell-runtime-toolchain-exposure
verified: 2026-03-11T17:44:09Z
status: passed
score: 10/10 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 3005, error_summary: "" }
  tests: { pass: true, summary: "917 passed, 0 failed", duration_ms: 14949 }
  build: { pass: true, duration_ms: 3154, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 55: Shell/Runtime Toolchain Exposure Verification Report

**Phase Goal:** Make pilot, node, and pnpm resolve from plain non-interactive Bash/sh shells via stable canonical paths in ~/.local/bin. Add doctor health checks for shell exposure and wire launcher maintenance into pilot setup.
**Verified:** 2026-03-11T17:44:09Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | pilot resolves from bash -lc and sh -lc via a stable canonical path | ✓ VERIFIED | Stable launcher path + symlink creation logic in `src/core/shell-exposure.ts:106` and `src/core/shell-exposure.ts:173`; setup wiring in `src/core/setup.ts:311`; behavior covered by `test/core/shell-exposure.test.ts:122` |
| 2 | node resolves from bash -lc and sh -lc via a stable canonical path | ✓ VERIFIED | Stable launcher path + symlink creation logic in `src/core/shell-exposure.ts:106` and `src/core/shell-exposure.ts:173`; setup wiring in `src/core/setup.ts:311`; behavior covered by `test/core/shell-exposure.test.ts:122` |
| 3 | pnpm resolves from bash -lc and sh -lc via a stable canonical path | ✓ VERIFIED | Stable launcher path + symlink creation logic in `src/core/shell-exposure.ts:106` and `src/core/shell-exposure.ts:173`; setup wiring in `src/core/setup.ts:311`; behavior covered by `test/core/shell-exposure.test.ts:122` |
| 4 | Stable paths survive Node version changes and rebuilds | ✓ VERIFIED | Symlink refresh path implemented in `src/core/shell-exposure.ts:149`; refresh behavior test in `test/core/shell-exposure.test.ts:156` |
| 5 | fnm is documented as not required in plain shells (node/pnpm are the supported interface) | ✓ VERIFIED | Canonical note string in `src/core/shell-exposure.ts:41`; surfaced by doctor in `src/commands/doctor.ts:565` |
| 6 | pilot doctor reports plain-shell resolution status for pilot, node, pnpm | ✓ VERIFIED | Doctor emits per-tool checks in `src/commands/doctor.ts:549`; command wiring in `src/index.ts:456`; coverage in `test/commands/doctor.test.ts:302` |
| 7 | pilot setup creates/refreshes stable launchers in ~/.local/bin | ✓ VERIFIED | Setup calls `ensureShellExposure()` in `src/core/setup.ts:311` and records create/refresh findings in `src/core/setup.ts:315` |
| 8 | pilot doctor catches broken or missing shell exposure as a warning | ✓ VERIFIED | Non-pass findings mapped to warn in `src/commands/doctor.ts:557`; missing/broken failures produced by `verifyShellExposure()` in `src/core/shell-exposure.ts:227` and `src/core/shell-exposure.ts:247`; warning behavior tested in `test/commands/doctor.test.ts:330` |
| 9 | Doctor verifies stable symlink existence and target validity via verifyShellExposure() | ✓ VERIFIED | Doctor uses verify function in `src/commands/doctor.ts:546`; symlink existence and target resolution checks in `src/core/shell-exposure.ts:213` and `src/core/shell-exposure.ts:218` |
| 10 | fnm exclusion is surfaced in doctor output as informational note | ✓ VERIFIED | Doctor adds `shell: fnm` pass check in `src/commands/doctor.ts:567`; explicit assertion in `test/commands/doctor.test.ts:404` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/shell-exposure.ts` | Shell exposure logic - create/verify stable launchers in ~/.local/bin; exports `ensureShellExposure`, `verifyShellExposure`, `ShellExposureResult` | ✓ VERIFIED | Exists; substantive (263 lines); no stub markers; exports present in `src/core/shell-exposure.ts:262` and `src/core/shell-exposure.ts:263`; wired via imports in `src/core/setup.ts:311` and `src/commands/doctor.ts:546` |
| `src/commands/doctor.ts` | Shell exposure health checks in system doctor | ✓ VERIFIED | Exists; substantive (640 lines); shell-exposure section present in `src/commands/doctor.ts:544`; wired to CLI via `src/index.ts:456` |
| `src/core/setup.ts` | `ensureShellExposure` call during setup | ✓ VERIFIED | Exists; substantive (496 lines); setup integration at `src/core/setup.ts:309`; wired via setup command in `src/commands/setup.ts:57` and CLI command registration in `src/index.ts:194` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/shell-exposure.ts` | `~/.local/bin/pilot` | symlink creation | ✓ WIRED | Stable path built in `src/core/shell-exposure.ts:114`; create/refresh at `src/core/shell-exposure.ts:151` and `src/core/shell-exposure.ts:173` |
| `src/core/shell-exposure.ts` | `~/.local/bin/node` | symlink creation | ✓ WIRED | Shared tool loop uses stable `~/.local/bin` path in `src/core/shell-exposure.ts:106`; create/refresh path identical at `src/core/shell-exposure.ts:151` |
| `src/core/shell-exposure.ts` | `~/.local/bin/pnpm` | symlink creation | ✓ WIRED | Shared tool loop + symlink reconciliation in `src/core/shell-exposure.ts:114` and `src/core/shell-exposure.ts:149` |
| `src/commands/doctor.ts` | `src/core/shell-exposure.ts` | dynamic import + verify call | ✓ WIRED | Import in `src/commands/doctor.ts:546`; call in `src/commands/doctor.ts:547`; mapped to doctor checks in `src/commands/doctor.ts:549` |
| `src/core/setup.ts` | `src/core/shell-exposure.ts` | dynamic import + ensure call | ✓ WIRED | Import in `src/core/setup.ts:311`; call in `src/core/setup.ts:312`; result mapping in `src/core/setup.ts:313` |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Phase-mapped requirements in `.planning/REQUIREMENTS.md` | N/A | `.planning/REQUIREMENTS.md` not present in repository |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/doctor.ts` | 273 | TODO comment | ⚠️ Warning | Existing AGENTS.md health-check TODO is unrelated to shell-exposure goal and does not block phase outcomes |

### Human Verification Required

None blocking for this phase-level code verification.

### Gaps Summary

No code-level gaps found against the provided must_haves. Core shell exposure primitives exist, are substantive, and are wired into both doctor and setup flows, with test coverage and passing automated checks.

---

_Verified: 2026-03-11T17:44:09Z_
_Verifier: Claude (gsd-verifier)_
