---
phase: 40-default-skills-library
verified: 2026-03-06T15:06:39Z
status: gaps_found
score: 14/15 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2582, error_summary: "" }
  tests: { pass: false, summary: "587 passed, 10 failed", duration_ms: 5791 }
  build: { pass: true, duration_ms: 2741, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "tests failed: 10 failing tests in test/core/callback.test.ts (7), test/core/config.test.ts (1), and test/core/db.test.ts (2)"
  - "setup prompt can appear without any 'Detected stack' line when no stack items are detected"
gaps:
  - truth: "Detected stack is displayed to user before prompt"
    status: partial
    reason: "setupCommand prints detected stack only when detectedStack.items.length > 0; prompt still appears for Tier 1-only recommendation when stack is empty."
    artifacts:
      - path: "src/commands/setup.ts"
        issue: "Detected stack line is conditional; no fallback stack summary is shown."
      - path: "test/commands/setup.test.ts"
        issue: "Test explicitly expects no detected stack line when stack is empty."
    missing:
      - "Always render a stack summary before prompt (e.g., 'Detected stack: none')"
---

# Phase 40: Default Skills Library Verification Report

**Phase Goal:** Bundle a curated default skills catalog with Tier 1 (universal) and Tier 2 (stack-specific) skills. During `pilot setup`, detect project stack and offer to install matching skills. `pilot skills bootstrap` command for manual library initialization via `npx skills install`.
**Verified:** 2026-03-06T15:06:39Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | TIER1_SKILLS contains exactly 5 universal coding skills with correct marketplace identifiers | ✓ VERIFIED | `src/core/default-skills.ts:48` defines 5 entries with expected IDs; runtime check showed `TIER1_LEN=5`; covered by `test/core/default-skills.test.ts:79`. |
| 2 | STACK_SKILLS maps 10 stack keys to their recommended marketplace skills | ✓ VERIFIED | `src/core/default-skills.ts:58` defines stack map; runtime check showed `STACK_KEYS_TOTAL=11`, `STACK_KEYS_NON_EMPTY=10` (10 keys with recommended skills). |
| 3 | detectProjectStack scans package.json, tsconfig, wrangler.toml and returns detected stack items | ✓ VERIFIED | `src/core/default-skills.ts:115`, `src/core/default-skills.ts:166`, `src/core/default-skills.ts:172`; runtime smoke check returned `cloudflare,react,typescript`. |
| 4 | recommendDefaultSkills returns deduplicated union of Tier 1 + detected Tier 2 skills | ✓ VERIFIED | Dedup set and tier merge at `src/core/default-skills.ts:213`, `src/core/default-skills.ts:217`, `src/core/default-skills.ts:227`; runtime check showed `TOTAL=8`, `UNIQUE=8`, `TIER1=5`, `TIER2=3`. |
| 5 | bootstrapDefaultSkills installs skills via execa npx, tags categories, continues on per-item failure | ✓ VERIFIED | `execa('npx', ['skills', 'install', ...])` at `src/core/default-skills.ts:272`; tagging at `src/core/default-skills.ts:284`; non-fatal continue in catch at `src/core/default-skills.ts:291`. |
| 6 | pilot skills bootstrap installs recommended skills with progress output | ✓ VERIFIED | Progress lines at `src/commands/skills.ts:297`, per-skill output at `src/commands/skills.ts:302`, summary at `src/commands/skills.ts:314`. |
| 7 | pilot skills bootstrap --yes skips confirmation prompt | ✓ VERIFIED | Prompt branch is gated by `if (!options.yes)` at `src/commands/skills.ts:277`. |
| 8 | pilot skills bootstrap --tier 1 installs only universal skills | ✓ VERIFIED | Tier parsing at `src/commands/skills.ts:197` and propagated into bootstrap call at `src/commands/skills.ts:299`; covered by `test/core/default-skills.test.ts:491`. |
| 9 | pilot skills recommend shows what would be installed without installing | ✓ VERIFIED | `skillsRecommendCommand` calls only `recommendDefaultSkills` (`src/commands/skills.ts:208`) and does not call bootstrap. |
| 10 | Both commands handle failures gracefully with warning output | ✓ VERIFIED | Bootstrap warnings at `src/commands/skills.ts:305`; non-TTY graceful warning at `src/commands/skills.ts:279`; failure-path output covered by `test/commands/skills.test.ts:332`. |
| 11 | pilot setup <dir> offers to install recommended skills after successful setup | ✓ VERIFIED | Offer block starts after successful setup at `src/commands/setup.ts:99`; prompt at `src/commands/setup.ts:121`. |
| 12 | Setup succeeds even if all skill installs fail (non-fatal) | ✓ VERIFIED | No exit-on-bootstrap-failure path; optional flow wrapped in catch at `src/commands/setup.ts:143` with warning only at `src/commands/setup.ts:145`; covered by `test/commands/setup.test.ts:176`. |
| 13 | JSON mode skips skill installation prompt entirely | ✓ VERIFIED | Early JSON return at `src/commands/setup.ts:54`; skill offer block never reached. |
| 14 | Non-TTY mode skips skill installation prompt entirely | ✓ VERIFIED | TTY gate at `src/commands/setup.ts:116`; non-TTY manual hint at `src/commands/setup.ts:140`. |
| 15 | Detected stack is displayed to user before prompt | ⚠ PARTIAL | Detected stack line is conditional (`src/commands/setup.ts:109`) and omitted for empty stack (`test/commands/setup.test.ts:230`). Prompt can still appear. |

**Score:** 14/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/default-skills.ts` | Catalog constants, stack detection, recommendation, bootstrap | ✓ VERIFIED | Exists, substantive (330 lines), exported symbols present, imported by `src/commands/skills.ts:19` and `src/commands/setup.ts:101`. |
| `test/core/default-skills.test.ts` | Unit tests for catalog/detection/recommend/bootstrap | ✓ VERIFIED | Exists, substantive (557 lines), phase-specific behavior covered; targeted run passed (`41 tests`). |
| `src/commands/skills.ts` | `skillsBootstrapCommand` + `skillsRecommendCommand` | ✓ VERIFIED | Exists, substantive (331 lines), exports both commands (`src/commands/skills.ts:329`, `src/commands/skills.ts:330`). |
| `src/index.ts` | CLI wiring for `skills bootstrap` and `skills recommend` | ✓ VERIFIED | Exists, substantive (405 lines), command wiring present at `src/index.ts:321` and `src/index.ts:331`. |
| `src/commands/setup.ts` | Post-setup skill bootstrap integration | ⚠ PARTIAL | Exists and wired, but detected-stack display is conditional and omitted for empty stack before prompt. |
| `test/commands/setup.test.ts` | Tests for setup skill-offer flow | ✓ VERIFIED | Exists, substantive (246 lines), branching covered; targeted run passed (`8 tests`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/default-skills.ts` | `src/core/skills.ts` | `syncManifest` + `tagSkill` import/calls | WIRED | Import at `src/core/default-skills.ts:17`; calls at `src/core/default-skills.ts:277` and `src/core/default-skills.ts:284`. |
| `src/core/default-skills.ts` | Skills marketplace | `execa('npx', ['skills','install', ...])` | WIRED | Install invocation at `src/core/default-skills.ts:272`. |
| `src/commands/skills.ts` | `src/core/default-skills.ts` | `recommendDefaultSkills` + `bootstrapDefaultSkills` | WIRED | Import at `src/commands/skills.ts:19`; calls at `src/commands/skills.ts:208` and `src/commands/skills.ts:299`. |
| `src/index.ts` | `src/commands/skills.ts` | Commander subcommand actions | WIRED | Dynamic imports at `src/index.ts:326` and `src/index.ts:335`; help output confirms command registration. |
| `src/commands/setup.ts` | `src/core/default-skills.ts` | Dynamic import + recommendation/bootstrap calls | WIRED | Dynamic import at `src/commands/setup.ts:101`; calls at `src/commands/setup.ts:103` and `src/commands/setup.ts:126`. |
| `recommendation.detectedStack` | Setup prompt output | Conditional `outputHuman('Detected stack: ...')` | PARTIAL | Emitted only when items exist (`src/commands/setup.ts:109`), absent for empty stack. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Catalog constants with exact Tier 1 + Tier 2 curated entries | ✓ SATISFIED | None |
| Stack detection scans package.json/tsconfig/wrangler and maps to stack skills | ✓ SATISFIED | None |
| `pilot skills bootstrap` + `--yes` + `--tier` + graceful per-item failure handling | ✓ SATISFIED | None |
| `pilot setup` offers optional skill bootstrap flow | ⚠ PARTIAL | Missing unconditional stack summary line before prompt |
| All existing tests pass | ✗ BLOCKED | Full suite failed: 10 tests (`test/core/callback.test.ts`, `test/core/config.test.ts`, `test/core/db.test.ts`) |

Browser verification: N/A (CLI project; no web routes).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/core/default-skills.ts` | 314 | `return null` | ℹ Info | Legitimate helper fallback (`findSkillNameByInstall`) |
| `src/core/default-skills.ts` | 329 | `return null` | ℹ Info | Legitimate no-match path, not placeholder logic |

No TODO/FIXME/HACK/placeholder stubs were found in phase artifacts.

### Human Verification Required

### 1. Real marketplace bootstrap install

**Test:** Run `pilot skills bootstrap --yes <project-dir-with-react>` in a real environment with network access.
**Expected:** Skills install via `npx skills install`, tags are applied, failures are warned but command completes.
**Why human:** External marketplace/network behavior is mocked in unit tests.

### 2. Interactive setup prompt UX

**Test:** Run `pilot setup <dir>` in an interactive TTY and answer prompt with `Y` and `n` in separate runs.
**Expected:** Prompt appears only in TTY, accepts default yes, and remains non-fatal on install errors.
**Why human:** Readline interaction and terminal UX are not fully verifiable via static checks.

### Gaps Summary

Phase 40 implementation is largely substantive and correctly wired: the default skill catalog, stack detection, recommendation builder, bootstrap orchestration, CLI commands, and setup integration all exist and work through phase-targeted tests (`65/65` targeted tests passed). One must-have is only partially met: setup does not always display a detected-stack line before prompting (empty stack case). In addition, the repository fails the automated test quality gate (`10` failing tests in non-phase suites), so the phase cannot be marked PASS.

---

_Verified: 2026-03-06T15:06:39Z_
_Verifier: Claude (gsd-verifier)_
