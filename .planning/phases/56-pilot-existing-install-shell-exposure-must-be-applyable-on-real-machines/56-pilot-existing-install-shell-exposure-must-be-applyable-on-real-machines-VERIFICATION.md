---
phase: 56-pilot-existing-install-shell-exposure-must-be-applyable-on-real-machines
verified: 2026-03-11T23:21:33Z
status: passed
score: 6/6 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 3268, error_summary: "" }
  tests: { pass: true, summary: "921 passed, 0 failed", duration_ms: 14966 }
  build: { pass: true, duration_ms: 3151, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 56: Pilot Existing-Install Shell Exposure Repair Verification Report

**Phase Goal:** Add `pilot doctor --fix` to repair shell exposure on existing installations - creating/refreshing stable launchers in `~/.local/bin` without requiring a project directory. Update doctor messaging to point to the new repair command.
**Verified:** 2026-03-11T23:21:33Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A supported command exists to apply/repair shell exposure on existing installations without requiring a project directory | ✓ VERIFIED | `--fix` is registered on doctor in `src/index.ts:455` and passed into doctor execution in `src/index.ts:458`; system doctor path (no project required) receives `fix` via `src/commands/doctor.ts:628` and `src/commands/doctor.ts:631`; `node dist/index.js doctor --help` shows `--fix` option |
| 2 | The command is idempotent - running it twice produces same result with no side effects | ✓ VERIFIED | Conditional repair only runs when verify finds non-pass issues (`src/commands/doctor.ts:550`-`src/commands/doctor.ts:553`); core ensure is repeat-safe (`src/core/shell-exposure.ts:101`, `src/core/shell-exposure.ts:139`); test coverage in `test/core/shell-exposure.test.ts:142` and `test/commands/doctor.test.ts:479`; isolated runtime check: first `doctor --fix` produced `Fixed (created)` for 3 launchers, second run produced pass-only shell checks |
| 3 | After running the repair command, bash -lc 'command -v pilot node pnpm' returns usable paths | ✓ VERIFIED | Isolated HOME runtime check after `doctor --fix` returned: `.../.local/bin/pilot`, `.../.local/bin/node`, `.../.local/bin/pnpm` from `bash -lc 'command -v pilot node pnpm'`; launcher creation path is implemented in `src/core/shell-exposure.ts:114` and `src/core/shell-exposure.ts:173` |
| 4 | After running the repair command, sh -lc 'command -v pilot node pnpm' returns usable paths | ✓ VERIFIED | `doctor --fix` creates all 3 stable launchers in `~/.local/bin` (`src/core/shell-exposure.ts:114`, `src/core/shell-exposure.ts:173`) and doctor invokes this flow (`src/commands/doctor.ts:552`, `src/commands/doctor.ts:553`); isolated sh verification confirmed pilot/node/pnpm resolve in sh context (`sh -lc 'command -v pilot; command -v node; command -v pnpm'`) |
| 5 | `pilot doctor` detects missing shell exposure and prints the exact repair command | ✓ VERIFIED | Missing launcher hint in verifier points to `pilot doctor --fix` (`src/core/shell-exposure.ts:252`); doctor warning detail also points to `pilot doctor --fix` (`src/commands/doctor.ts:577`); test assertions in `test/commands/doctor.test.ts:350` and `test/commands/doctor.test.ts:519` |
| 6 | The repair flow works on existing installations, not only fresh setup | ✓ VERIFIED | `doctor --fix` is available on system doctor (no project path) and runs repair from doctor flow (`src/commands/doctor.ts:631`, `src/commands/doctor.ts:552`); tests call system mode with `doctorCommand(undefined, false, true, true)` in `test/commands/doctor.test.ts:462`; isolated runtime check succeeded with only existing-install dirs (`pilot-gsd` and `~/.local/share/pilot`) present |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/commands/doctor.ts` | `--fix` flag handling that calls `ensureShellExposure()` when shell exposure warnings exist | ✓ VERIFIED | Exists; substantive (666 lines); contains conditional `--fix` repair logic and `ensureShellExposure` call in `src/commands/doctor.ts:549`-`src/commands/doctor.ts:553`; wired to command entry in `src/index.ts:458` |
| `src/index.ts` | `--fix` flag registration on doctor command | ✓ VERIFIED | Exists; substantive (526 lines); `--fix` option registered in `src/index.ts:455` and forwarded to `doctorCommand` in `src/index.ts:458` |
| `src/core/shell-exposure.ts` | Updated repair hint pointing to `pilot doctor --fix` | ✓ VERIFIED | Exists; substantive (263 lines); missing-path hint updated to `pilot doctor --fix` in `src/core/shell-exposure.ts:252`; module exports `ensureShellExposure` and `verifyShellExposure` in `src/core/shell-exposure.ts:262` |
| `test/commands/doctor.test.ts` | Tests for `--fix` flag behavior | ✓ VERIFIED | Exists; substantive (537 lines); dedicated `--fix` suite in `test/commands/doctor.test.ts:439`; includes fix/no-fix/partial-failure/hint tests and mocked `ensureShellExposure` at `test/commands/doctor.test.ts:55` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `src/commands/doctor.ts` | `--fix` option passed to `doctorCommand` | ✓ WIRED | Option registration at `src/index.ts:455`; handler passes fourth `fix` arg at `src/index.ts:458`; consumer signature includes `fix` in `src/commands/doctor.ts:628` |
| `src/commands/doctor.ts` | `src/core/shell-exposure.ts` | dynamic import + `ensureShellExposure` call when `--fix` and issues exist | ✓ WIRED | Verify import/call at `src/commands/doctor.ts:546`-`src/commands/doctor.ts:547`; issue gate at `src/commands/doctor.ts:550`; ensure import/call at `src/commands/doctor.ts:552`-`src/commands/doctor.ts:553` |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Phase-mapped requirements in `.planning/REQUIREMENTS.md` | N/A | `.planning/REQUIREMENTS.md` is not present in this repository |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/doctor.ts` | 273 | TODO comment | ⚠️ Warning | Existing AGENTS.md TODO is unrelated to shell exposure repair and does not block phase goal |
| `src/index.ts` | 464 | "coming soon" text | ℹ️ Info | Unrelated lessons option copy; no impact on doctor `--fix` flow |

### Human Verification Required

None blocking for this phase-level verification.

### Gaps Summary

No blocking gaps found. Must-have truths, artifacts, and key wiring for `pilot doctor --fix` are present and functional, and automated checks (`tsc`, tests, build) all pass.

---

_Verified: 2026-03-11T23:21:33Z_
_Verifier: Claude (gsd-verifier)_
