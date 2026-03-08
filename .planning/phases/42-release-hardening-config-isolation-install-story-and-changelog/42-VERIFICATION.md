---
phase: 42-release-hardening-config-isolation-install-story-and-changelog
verified: 2026-03-07T18:25:00Z
status: passed
score: 18/18 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2604, error_summary: "" }
  tests: { pass: true, summary: "601 passed, 0 failed", duration_ms: 5100 }
  build: { pass: true, duration_ms: 2544, error_summary: "" }
verdict: PASS
blocking_issues: []
gaps: []
---

# Phase 42: Release Hardening — Config Isolation, Install Story, and Changelog Verification Report

**Phase Goal:** Make the test suite deterministic on any machine, remove the false npm install story, and ship a real CHANGELOG so Pilot is ready for soft launch.
**Verified:** 2026-03-07T18:25:00Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** Yes — initial verification found 2 gaps, both closed by orchestrator corrections (commit `8e0ef4a`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Full test suite passes on any machine regardless of `~/.pilot/config.json` content | ✓ VERIFIED | `npx vitest run` passed: 24 files, 601 tests, 0 failed |
| 2 | Tests that do NOT set `PILOT_CONFIG_FILE` cannot see developer real config | ✓ VERIFIED | `test/setup.ts:24` applies sentinel path when env var is unset |
| 3 | Config test "missing file returns null" does not see prior cached config | ✓ VERIFIED | `test/core/config.test.ts:201` resets cache in `beforeEach`; test at `test/core/config.test.ts:216` |
| 4 | `db.test.ts` default modelProfile tests return `balanced` even if host config has `quality` | ✓ VERIFIED | Isolation in `test/core/db.test.ts:46`; assertions at `test/core/db.test.ts:101` and `test/core/db.test.ts:103`; suite green |
| 5 | Explicit `PILOT_CONFIG_FILE` path is honored over `~/.pilot/config.json` | ✓ VERIFIED | Precedence in `src/core/config.ts:49`; regression test at `test/core/config.test.ts:748` |
| 6 | Every test file gets HOME + `PILOT_CONFIG_FILE` isolation via shared setupFiles | ✓ VERIFIED | `test/setup.ts` isolates both HOME and PILOT_CONFIG_FILE; restores HOME in afterEach |
| 7 | Malformed config errors include file path, parse cause, actionable next-step | ✓ VERIFIED | Error includes path, cause, and "Fix the JSON syntax or run 'pilot config init'" guidance |
| 8 | README Quick Start shows clone+build install, not `npm install -g pilot-cli` | ✓ VERIFIED | `README.md:40`-`README.md:55` contains clone/build/link flow |
| 9 | `docs/GETTING-STARTED.md` Installation shows clone+build as primary path | ✓ VERIFIED | `docs/GETTING-STARTED.md:103`-`docs/GETTING-STARTED.md:122` |
| 10 | No copy-paste command in README/docs instructs `npm install -g pilot-cli` | ✓ VERIFIED | Repo grep for `npm install -g pilot-cli` in docs returned 0 matches |
| 11 | README npm badge is removed/replaced with non-misleading badge | ✓ VERIFIED | Header badges at `README.md:7`-`README.md:9` contain bun/typescript/license only |
| 12 | Install instructions include prerequisites, clone submodules, bun install/build/link, `pilot doctor` | ✓ VERIFIED | Prereqs at `README.md:95` and `docs/GETTING-STARTED.md:7`; install flow at `README.md:42` and `docs/GETTING-STARTED.md:107`; doctor at `README.md:54` and `docs/GETTING-STARTED.md:138` |
| 13 | Getting-started flow ends with `pilot doctor` verification | ✓ VERIFIED | `docs/GETTING-STARTED.md:138` and checklist verification at `docs/GETTING-STARTED.md:566` |
| 14 | `package.json` has no misleading publish/install hints against clone+build story | ✓ VERIFIED | `package.json:27` has `private: true`; no `publishConfig` key present |
| 15 | `CHANGELOG.md` has a real pre-release section for shipped capabilities | ✓ VERIFIED | `CHANGELOG.md:5` pre-release section with substantive content |
| 16 | Changelog covers queue/runner, delegation, model routing, judge, skills, notifications/hooks, setup/init | ✓ VERIFIED | Section headers at `CHANGELOG.md:9`, `CHANGELOG.md:18`, `CHANGELOG.md:25`, `CHANGELOG.md:33`, `CHANGELOG.md:40`, `CHANGELOG.md:50`, `CHANGELOG.md:59` |
| 17 | Changelog is concise/readable, not a commit dump | ✓ VERIFIED | 80-line structured release summary (`CHANGELOG.md`) |
| 18 | Pre-release section is clearly dated and labeled | ✓ VERIFIED | `CHANGELOG.md:5` includes version, date, and `(Pre-release)` label |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `test/setup.ts` | Shared setup isolating config behavior | ✓ VERIFIED | Isolates both HOME and PILOT_CONFIG_FILE; restores HOME in afterEach |
| `vitest.config.ts` | Global `setupFiles` wiring | ✓ VERIFIED | `setupFiles: ['test/setup.ts']` at `vitest.config.ts:6` |
| `test/core/config.test.ts` | Cache/isolation regressions + malformed config assertions | ✓ VERIFIED | 5-case isolation block + malformed error asserts path, prefix, and 'pilot config init' guidance |
| `test/core/db.test.ts` | DB defaults remain isolated from host config | ✓ VERIFIED | `PILOT_CONFIG_FILE` isolation + cache reset in hooks (`test/core/db.test.ts:46`) |
| `src/core/config.ts` | Config precedence and clear parse errors | ✓ VERIFIED | Env override precedence correct, parse error includes remediation guidance |
| `README.md` | Clone/build/link quick start, no npm install story | ✓ VERIFIED | Updated install path and no npm badge/reference |
| `docs/GETTING-STARTED.md` | Primary clone/build install walkthrough | ✓ VERIFIED | Installation + verification flow present, includes `pilot doctor` |
| `package.json` | Pre-release-safe metadata | ✓ VERIFIED | `private: true`; no misleading publish config |
| `CHANGELOG.md` | Real pre-release release notes | ✓ VERIFIED | Dated/labeled section with major capability coverage |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `vitest.config.ts` | `test/setup.ts` | `setupFiles` | ✓ WIRED | `vitest.config.ts:6` |
| `test/setup.ts` | `src/core/config.ts` | `_resetConfigCache()` in hooks | ✓ WIRED | Import + calls at `test/setup.ts:17`, `test/setup.ts:27`, `test/setup.ts:34` |
| `test/core/db.test.ts` | `src/core/config.ts` | Env override + cache reset | ✓ WIRED | `test/core/db.test.ts:46`-`test/core/db.test.ts:47` |
| `README.md` | `docs/GETTING-STARTED.md` | Quick Start link | ✓ WIRED | `README.md:89` |
| `src/core/config.ts` | `test/core/config.test.ts` | malformed parse error quality check | ✓ WIRED | Test asserts path, prefix, and 'pilot config init' remediation |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Must Have — Test Isolation and Config Hardening | ✓ SATISFIED | None |
| Must Have — Installation Story for Public Launch | ✓ SATISFIED | None |
| Must Have — Changelog / Release Notes | ✓ SATISFIED | None |
| Must Have — README Quality | ✓ SATISFIED | None |
| Must Have — Verification (`full suite passes`) | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| _None in phase-modified files_ | - | No TODO/FIXME/placeholder stub patterns found | Info | No blocker from stub artifacts |

### Human Verification Required

Not required for this phase. CLI-focused project with no web UI to browser-verify.

### Gaps Summary

All 18 must-haves verified. Both gaps from initial verification (HOME isolation, actionable error message) were closed by orchestrator corrections in commit `8e0ef4a`. Full test suite passes (601/601).

---

_Verified: 2026-03-07T18:25:00Z_
_Verifier: Claude (gsd-verifier) + orchestrator corrections_
