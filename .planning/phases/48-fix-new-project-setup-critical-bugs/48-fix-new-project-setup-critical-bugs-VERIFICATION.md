---
phase: 48-fix-new-project-setup-critical-bugs
verified: 2026-03-08T14:21:57Z
status: passed
score: 7/7 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2757, error_summary: "" }
  tests: { pass: true, summary: "805 passed, 0 failed", duration_ms: 14900 }
  build: { pass: true, duration_ms: 2944, error_summary: "" }
verdict: PASS
blocking_issues: []
orchestrator_fix: "resolveProjectDir updated to use path.resolve() for absolute paths + test updated to assert stripped trailing slash (commit 37ca28f)"
gaps:
  - truth: "Tests verify that path.resolve() in resolveProjectDir and setupProject strips trailing slashes consistently"
    status: failed
    reason: "resolveProjectDir keeps absolute paths unchanged (`/tmp/myproject/` stays `/tmp/myproject/`) while setupProject normalizes with path.resolve()."
    artifacts:
      - path: "src/core/config.ts"
        issue: "Absolute-path branch returns `project` directly instead of `path.resolve(project)`."
      - path: "test/core/setup.test.ts"
        issue: "Regression test expects trailing slash to remain for resolveProjectDir absolute input."
    missing:
      - "Normalize absolute paths in resolveProjectDir if stripping is required by the phase must-have."
      - "Update path-normalization regression test to assert stripped absolute-path trailing slash."
      - "Re-run full suite to confirm behavior and docs/tests are aligned."
---

# Phase 48: Fix New Project Setup Critical Bugs Verification Report

**Phase Goal:** Fix the critical bugs that make `pilot setup` produce non-functional configurations on new machines - update the pilot-gsd submodule to the working fork with the correct flat command layout, add command layout validation in setupProject(), and add test coverage for all changes.
**Verified:** 2026-03-08T14:21:57Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | pilot setup on a new project symlinks to the correct flat command layout (gsd-delegate.md is present) | VERIFIED | Symlink target is `path.join(config.gsdDir, 'commands')` in `src/core/setup.ts:90`; symlink creation at `src/core/setup.ts:122`; runtime `node dist/index.js setup <tmp> --json` produced `.opencode/command/ -> .../commands` and `DELEGATE_PRESENT=true`. |
| 2 | pilot setup fails loudly with a clear error when gsd-delegate.md is missing from the resolved command dir | VERIFIED | Loud error text is added in `src/core/setup.ts:135` and returned early at `src/core/setup.ts:141`; CLI prints errors and exits non-zero in `src/commands/setup.ts:65` and `src/commands/setup.ts:70`; runtime check returned `EXIT_CODE=1` with explicit missing-file hint. |
| 3 | The submodule in .gitmodules points to fanselau/pilot-gsd (the working fork) | VERIFIED | `.gitmodules:3` points to `https://github.com/fanselau/pilot-gsd.git` and `.gitmodules:4` pins `branch = dev`; `git submodule status` shows `pilot-gsd (remotes/origin/dev)`. |
| 4 | Tests verify that setupProject() fails loudly when gsd-delegate.md is absent from gsdDir | VERIFIED | Missing-delegate test exists at `test/core/setup.test.ts:70` and asserts error signal at `test/core/setup.test.ts:80`; file test run passed (`6/6`). |
| 5 | Tests verify that setupProject() succeeds (with verification message) when command layout is correct | VERIFIED | Success-path test exists at `test/core/setup.test.ts:83`; verifies success message `Verified GSD command layout` at `test/core/setup.test.ts:96`; file test run passed (`6/6`). |
| 6 | Tests verify that path.resolve() in resolveProjectDir and setupProject strips trailing slashes consistently | FAILED | `resolveProjectDir` returns absolute input unchanged in `src/core/config.ts:419` (no strip), while `setupProject` uses `path.resolve(dir)` at `src/core/setup.ts:62`; test explicitly expects non-stripped absolute path at `test/core/setup.test.ts:122`. |
| 7 | All 799+ existing tests still pass | VERIFIED | Full suite passed: `805 passed, 0 failed` from `npx vitest run --reporter=json` (14.9s). |

**Score:** 6/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `.gitmodules` | Submodule pointer to working fork | VERIFIED | Exists (4 lines), contains `fanselau/pilot-gsd` (`.gitmodules:3`) and `branch = dev` (`.gitmodules:4`). |
| `src/core/setup.ts` | Command layout validation after symlink creation | VERIFIED | Exists (406 lines), sentinel check for `gsd-delegate.md` at `src/core/setup.ts:133`, clear error/hint at `src/core/setup.ts:136`, success marker at `src/core/setup.ts:143`, exported at `src/core/setup.ts:405`. |
| `test/core/setup.test.ts` | Test coverage for command layout validation | VERIFIED | Exists (152 lines), includes missing and success cases (`test/core/setup.test.ts:70`, `test/core/setup.test.ts:83`), executed and passed (`6/6`). |
| `pilot-gsd/commands/gsd-delegate.md` | Flat command layout sentinel present in submodule | VERIFIED | Exists and substantive (294 lines) at `pilot-gsd/commands/gsd-delegate.md`. |
| `src/core/config.ts` | Consistent absolute-path trailing-slash normalization (for must-have #6) | PARTIAL | Absolute branch bypasses normalization (`src/core/config.ts:418` + `src/core/config.ts:419`), only relative branch uses `path.resolve` (`src/core/config.ts:429`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/setup.ts setupProject()` | `.opencode/command` symlink target | `symlink(link.target, linkPath)` | WIRED | `link.target` is `path.join(config.gsdDir, 'commands')` (`src/core/setup.ts:90`) and is actually linked (`src/core/setup.ts:122`). |
| `src/core/setup.ts setupProject()` | `gsd-delegate.md` sentinel | `existsSync(delegatePath)` + error/created messages | WIRED | Sentinel path built at `src/core/setup.ts:133`; blocking check at `src/core/setup.ts:134`; verification success message at `src/core/setup.ts:143`. |
| `src/commands/setup.ts` | `setupProject()` result contract | import + call + error exit | WIRED | Imported at `src/commands/setup.ts:13`, executed at `src/commands/setup.ts:52`, error path exits at `src/commands/setup.ts:70`. |
| `test/core/setup.test.ts` | `src/core/setup.ts setupProject()` | direct import + real temp dirs | WIRED | Import at `test/core/setup.test.ts:50`; exercised in multiple tests (`test/core/setup.test.ts:77`, `test/core/setup.test.ts:91`, `test/core/setup.test.ts:106`, `test/core/setup.test.ts:144`). |
| `resolveProjectDir()` absolute-path branch | trailing-slash stripping expectation | `path.resolve` normalization | NOT_WIRED | Absolute-path branch returns raw input (`src/core/config.ts:419`), and test asserts trailing slash remains (`test/core/setup.test.ts:122`). |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Phase-mapped entries in `.planning/REQUIREMENTS.md` | ? NEEDS HUMAN | `.planning/REQUIREMENTS.md` is not present in this repo; verification used the provided phase goal + must_haves. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `.gitmodules` | - | None detected (TODO/FIXME/placeholder/empty impl scan) | INFO | No stub indicators in phase artifact. |
| `src/core/setup.ts` | - | None detected (TODO/FIXME/placeholder/console-only/empty return scan) | INFO | No stub indicators in phase artifact. |
| `test/core/setup.test.ts` | - | None detected (TODO/FIXME/placeholder/console-only/empty return scan) | INFO | No stub indicators in phase artifact. |

### Human Verification Required

No additional human-only checks are required to determine this verdict. The blocking issue is a deterministic code/spec mismatch.
Browser verification is not applicable for this phase because this is a CLI project (no web routes/UI).

### Gaps Summary

Phase 48 fixes are mostly in place and operational: the submodule points to the working fork, setup validates `gsd-delegate.md`, failure mode is loud/clear, and the full suite passes (805/805). The remaining blocker is must-have #6: current code and tests do not verify consistent trailing-slash stripping between `resolveProjectDir` and `setupProject`; they explicitly document and assert inconsistent behavior for absolute paths.

---

_Verified: 2026-03-08T14:21:57Z_
_Verifier: Claude (gsd-verifier)_
