---
phase: 64-gsd-installation-switch
verified: 2026-03-15T20:31:11Z
status: gaps_found
score: 8/12 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2690, error_summary: "" }
  tests: { pass: false, summary: "979 passed, 0 failed tests; 4 suites failed", duration_ms: 14907 }
  build: { pass: true, duration_ms: 2881, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "tests failed: 4 suites failing (doctor/update/setup test mocks crash before test execution; web/actions import resolution failure)"
  - "must-have truth 'All existing tests pass with no regressions' is not achieved"
gaps:
  - truth: "All existing tests pass with no regressions"
    status: failed
    reason: "Full vitest run exits non-zero with 4 failed suites."
    artifacts:
      - path: "test/commands/doctor.test.ts"
        issue: "Suite crashes before running tests due vi.mock hoisting/initialization error."
      - path: "test/commands/update.test.ts"
        issue: "Suite crashes before running tests due vi.mock hoisting/initialization error."
      - path: "test/core/setup.test.ts"
        issue: "Suite crashes before running tests due vi.mock hoisting/initialization error."
      - path: "test/web/actions.test.ts"
        issue: "Fails to resolve ~/components/ui/toast from web/src/lib/actions.ts."
    missing:
      - "Refactor failing vi.mock factories to avoid hoisted references to top-level imports/variables."
      - "Fix unresolved web alias import used by actions tests."
      - "Re-run full suite until vitest exits zero."
  - truth: "Setup tests verify installer invocation, migration cleanup, and error handling"
    status: failed
    reason: "test/core/setup.test.ts contains relevant cases, but zero tests execute because the suite fails at module init."
    artifacts:
      - path: "test/core/setup.test.ts"
        issue: "ReferenceError: Cannot access 'mockExeca' before initialization (vi.mock hoist behavior)."
    missing:
      - "Make execa mock setup hoist-safe so tests collect and execute."
      - "Re-validate installer behavior with passing test assertions."
  - truth: "Update tests verify npm update + per-project installer"
    status: failed
    reason: "test/commands/update.test.ts has good scenario coverage but currently does not execute due hoisted mock initialization failure."
    artifacts:
      - path: "test/commands/update.test.ts"
        issue: "ReferenceError: Cannot access 'mockExeca' before initialization."
    missing:
      - "Adjust update test mocking pattern to avoid vi.mock hoist breakage."
      - "Run and pass all update command scenarios."
  - truth: "Doctor tests verify new upstream GSD checks"
    status: partial
    reason: "doctor tests add get-shit-done-cc system binary checks, but do not assert project-level gsd-help.md/gsd-tools.cjs/VERSION checks from doctor.ts and currently fail to execute due mocking error."
    artifacts:
      - path: "test/commands/doctor.test.ts"
        issue: "Suite init failure plus missing projectHealthCheck assertions for new sentinel checks."
    missing:
      - "Fix doctor test hoist-safe mocks so suite runs."
      - "Add project-mode assertions for gsd-help.md, gsd-tools.cjs, GSD version, and broken symlink warnings."
---

# Phase 64: GSD Installation Switch Verification Report

**Phase Goal:** Replace pilot-gsd symlink-based GSD installation with upstream `get-shit-done-cc` npm package installer. Remove all gsdDir/pilot-gsd infrastructure from types, config, and CLI. All GSD files installed per-project via upstream installer.
**Verified:** 2026-03-15T20:31:11Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `pilot config` no longer exposes/manages `gsdDir` | ✓ VERIFIED | No `gsdDir`/`PILOT_GSD_DIR` references in `src/commands/config.ts`; display/set/get maps exclude it. |
| 2 | Types/config no longer include `gsdDir` plumbing | ✓ VERIFIED | `src/core/types.ts:15` and `src/core/config.ts:170` define config structures and resolver without `gsdDir`/`resolveGsdDir`. |
| 3 | `get-shit-done-cc` is a local dependency binary | ✓ VERIFIED | `package.json:46` includes dependency; `node_modules/.bin/get-shit-done-cc --help` returns v1.24.0 usage output. |
| 4 | `pilot setup` invokes upstream installer in project cwd | ✓ VERIFIED | `src/core/setup.ts:196` runs `execa(installerBin, ['--opencode','--local'], { cwd: absDir, timeout: 60000, reject: false })`. |
| 5 | `pilot setup --refresh` re-runs upstream installer | ✓ VERIFIED | Installer call is in main setup flow after refresh path setup; no refresh guard skipping installer when `package.json` exists (`src/core/setup.ts:190`). |
| 6 | Legacy pilot-gsd symlinks are removed before install | ✓ VERIFIED | Dir/file symlink cleanup occurs before installer invocation (`src/core/setup.ts:134`, `src/core/setup.ts:154`). |
| 7 | Projects without `package.json` are warned and skip installer | ✓ VERIFIED | Missing `package.json` pushes skip warning and continues remaining setup steps (`src/core/setup.ts:182`). |
| 8 | `pilot update` updates package then re-runs installer per registered project | ✓ VERIFIED | `src/commands/update.ts:23` runs `bun update get-shit-done-cc`; `src/commands/update.ts:40` uses `getAllProjects`; `src/commands/update.ts:56` runs installer per project. |
| 9 | `pilot doctor` checks upstream GSD sentinels (`gsd-help.md`, `gsd-tools.cjs`, version) | ✓ VERIFIED | Checks exist in `src/commands/doctor.ts:146`, `src/commands/doctor.ts:155`, `src/commands/doctor.ts:163`; system binary check at `src/commands/doctor.ts:444`. |
| 10 | All existing tests pass with no regressions | ✗ FAILED | Full run failed: 4 suites (`test/commands/doctor.test.ts`, `test/commands/update.test.ts`, `test/core/setup.test.ts`, `test/web/actions.test.ts`). |
| 11 | Setup/update tests verify installer behavior by executing successfully | ✗ FAILED | Both suites collect 0 tests due vi.mock initialization failures during module load. |
| 12 | Doctor tests verify new upstream checks end-to-end | ✗ FAILED | Suite fails at init; additionally lacks project-mode assertions for `gsd-help.md`/`gsd-tools.cjs`/`VERSION` checks. |

**Score:** 8/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/types.ts` | Config/Pilot types without `gsdDir` | ✓ VERIFIED | Exists, substantive (515 lines), exported interfaces, no `gsdDir`. |
| `src/core/config.ts` | `getConfig` without `resolveGsdDir`/`gsdDir` | ✓ VERIFIED | Exists, substantive (406 lines), `PilotConfig` wiring intact, no `gsdDir` fields/maps. |
| `src/commands/config.ts` | CLI config surfaces without `gsdDir` | ✓ VERIFIED | Exists, substantive (516 lines), no display/set/get entries for `gsdDir`. |
| `src/commands/init.ts` | init config generation without `gsdDir` | ✓ VERIFIED | Exists, substantive (229 lines), default config writer omits `gsdDir`. |
| `src/core/setup.ts` | upstream installer + migration + error handling | ✓ VERIFIED | Exists, substantive (504 lines), installer + cleanup + sentinel checks wired. |
| `src/commands/update.ts` | package update + per-project installer rerun | ✓ VERIFIED | Exists, substantive (93 lines), uses `getAllProjects`, skip blocked, continue-on-failure. |
| `src/commands/doctor.ts` | upstream doctor checks | ✓ VERIFIED | Exists, substantive (740 lines), checks binary/sentinels/version/broken symlink. |
| `package.json` | dependency on `get-shit-done-cc` | ✓ VERIFIED | Dependency present at `~1.24.0` (`package.json:46`). |
| `test/core/setup.test.ts` | executable installer-behavior tests | ✗ FAILED | File is substantive but suite crashes before executing any test (mock hoist issue). |
| `test/commands/update.test.ts` | executable update-command behavior tests | ✗ FAILED | File is substantive but suite crashes before executing any test (mock hoist issue). |
| `test/commands/doctor.test.ts` | executable doctor tests for new checks | ⚠ PARTIAL | Adds system binary assertions, but suite crashes and lacks project-mode sentinel assertions. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/config.ts` | `src/core/types.ts` | `PilotConfig` return typing/import | WIRED | Type import and function signature present (`src/core/config.ts:13`, `src/core/config.ts:170`). |
| `src/core/setup.ts` | `node_modules/.bin/get-shit-done-cc` | `execa(installerBin, ['--opencode','--local'])` with `cwd` | WIRED | Invocation and cwd wiring present (`src/core/setup.ts:192`, `src/core/setup.ts:196`). |
| `src/commands/update.ts` | `src/core/db.ts` | `getAllProjects()` import/call | WIRED | Import and loop over projects present (`src/commands/update.ts:15`, `src/commands/update.ts:40`). |
| `src/commands/doctor.ts` | `.opencode/command/gsd-help.md` | `fileExists(helpMd)` check | WIRED | Pass/fail checks for `gsd-help.md` present (`src/commands/doctor.ts:146`). |
| `src/commands/doctor.ts` | `.opencode/get-shit-done/bin/gsd-tools.cjs` | `fileExists(toolsCjs)` check | WIRED | Pass/warn checks present (`src/commands/doctor.ts:155`). |
| `test/core/setup.test.ts` | `src/core/setup.ts` | `import { setupProject, verifySetup }` | PARTIAL | Link exists (`test/core/setup.test.ts:36`) but suite crashes before runtime validation. |
| `test/commands/update.test.ts` | `src/commands/update.ts` | `import { updateCommand }` + assertions | PARTIAL | Link exists (`test/commands/update.test.ts:53`) but suite crashes before runtime validation. |
| `test/commands/doctor.test.ts` | `src/commands/doctor.ts` project checks | assertions for `gsd-help.md`/`gsd-tools.cjs` | NOT_WIRED | No project-mode sentinel assertions found; only system-level binary checks. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Add `get-shit-done-cc` dependency (`~1.24.x`) | ✓ SATISFIED | None |
| `pilot setup` runs upstream installer locally in project | ✓ SATISFIED | None |
| Remove `gsdDir`/`resolveGsdDir` from config/types flow | ✓ SATISFIED | None |
| Remove pilot-gsd symlink install logic (replace with installer) | ✓ SATISFIED | Legacy symlink cleanup remains intentionally for migration only |
| `pilot setup --refresh` re-runs installer | ✓ SATISFIED | None |
| `pilot update` updates package then per-project installer rerun | ✓ SATISFIED | None |
| `pilot doctor` checks `gsd-help.md`, `gsd-tools.cjs`, version | ✓ SATISFIED | None |
| Installer errors surfaced + missing `package.json` skip behavior | ✓ SATISFIED | None |
| Plan-03 must-have: all tests pass/no regressions | ✗ BLOCKED | 4 failing suites in automated tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `test/core/setup.test.ts` | 20 | `vi.mock` factory depends on hoisted top-level variable | 🛑 Blocker | Suite crashes before tests execute |
| `test/commands/update.test.ts` | 21 | `vi.mock` factory depends on hoisted top-level variable | 🛑 Blocker | Suite crashes before tests execute |
| `test/commands/doctor.test.ts` | 63 | `vi.mock` factory references imported module before init | 🛑 Blocker | Suite crashes before tests execute |
| `src/commands/doctor.ts` | 345 | `TODO` placeholder for AGENTS health command | ⚠️ Warning | Non-blocking technical debt in doctor behavior |

### Human Verification Required

No additional human-only checks requested yet; automated blockers already prevent PASS verdict.

### Gaps Summary

Phase 64 implementation wiring is largely present in source: config/types cleanup is done, setup/update/doctor are switched to `get-shit-done-cc`, and sentinel checks exist. The phase does not achieve its full goal because the updated test layer is not executable in current state. Three phase-relevant suites fail during module initialization, and the full test run also fails on an unrelated web import path. Until tests run cleanly, the plan-03 must-haves and phase-level regression goal remain unmet.

---

_Verified: 2026-03-15T20:31:11Z_
_Verifier: Claude (gsd-verifier)_
