---
phase: 74-required-categories-on-pilot-add
verified: 2026-03-20T16:56:03Z
status: gaps_found
score: 28/30 must-haves verified
gaps:
  - truth: "bootstrapDefaultSkills() is removed from default-skills architecture"
    status: failed
    reason: "Legacy bootstrap API is still present in default-skills.ts, so the manifest-only architecture is not fully enforced."
    artifacts:
      - path: "src/core/default-skills.ts"
        issue: "Still exports BootstrapResult and bootstrapDefaultSkills(), and module docs still advertise bootstrap flow."
    missing:
      - "Remove bootstrapDefaultSkills() and BootstrapResult from src/core/default-skills.ts"
      - "Update module documentation/tests to stop referencing bootstrap behavior"
  - truth: "add command tests verify required categories behavior and project-default fallback"
    status: partial
    reason: "Current add command tests cover explicit --categories and many --no-categories paths, but do not assert the omitted-categories error path or project default fallback behavior."
    artifacts:
      - path: "test/commands/add.test.ts"
        issue: "No test that omits categories and expects formatCategoryHelp/exit(2), and no test with defaultCategories array fallback."
    missing:
      - "Add test: no --categories and no project defaults -> exit(2) with helpful category output"
      - "Add test: project defaultCategories are applied when --categories is omitted"
      - "Add test: explicit --categories overrides project defaults"
---

# Phase 74: Required Categories on pilot add Verification Report

**Phase Goal:** Make `--categories` required on `pilot add` with helpful AI-caller-friendly error, add project-level default categories, rewrite skills to manifest-only architecture (`{ repo, skill }` format, no git-clone/inject/sync), and switch runner to JIT `npx skills add` installation.
**Verified:** 2026-03-20T16:56:03Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | CATEGORY_INFO contains descriptions for all 15 categories | VERIFIED | `src/core/skills.ts:30`, `test/core/skills.test.ts:77` |
| 2 | PREDEFINED_CATEGORIES includes deployment/accessibility/architecture (15 total) | VERIFIED | `src/core/skills.ts:24`, `test/core/skills.test.ts:99` |
| 3 | SkillEntry uses `repo` + `skill` fields instead of `source` + `path` | VERIFIED | `src/core/types.ts:317` |
| 4 | Skill manifest shape is repo/skill-based (no file path fields) | VERIFIED | `src/core/types.ts:326`, `src/core/skills.ts:81` |
| 5 | Project type includes `defaultCategories` | VERIFIED | `src/core/types.ts:311` |
| 6 | `projects` table has `default_categories` column wiring | VERIFIED | `src/core/db.ts:233`, `src/core/db.ts:418` |
| 7 | `addSkill`/`syncManifest`/`injectSkills`/`cleanupInjectedSkills` removed from skills core | VERIFIED | no exported declarations found in `src/core/skills.ts` |
| 8 | `registerSkill`/`unregisterSkill`/`formatCategoryHelp` exported from skills core | VERIFIED | `src/core/skills.ts:141`, `src/core/skills.ts:163`, `src/core/skills.ts:301` |
| 9 | `bootstrapDefaultSkills` removed from default-skills module | FAILED | `src/core/default-skills.ts:252` still exports `bootstrapDefaultSkills` |
| 10 | Default skills catalog uses `{ repo, skill, categories }` entries | VERIFIED | `src/core/default-skills.ts:20`, `src/core/default-skills.ts:38` |
| 11 | `pilot add` without categories exits with helpful category help | VERIFIED | `src/commands/add.ts:213`, `src/core/skills.ts:303` |
| 12 | `pilot add --no-categories` succeeds | VERIFIED | `src/commands/add.ts:195`, `test/commands/add.test.ts:201` |
| 13 | `pilot add --categories frontend,testing` succeeds | VERIFIED | `src/commands/add.ts:198`, `test/commands/add.test.ts:418` |
| 14 | Project default categories are used when `--categories` is omitted | VERIFIED | `src/commands/add.ts:205` |
| 15 | `pilot setup` accepts `--categories` and persists defaults | VERIFIED | `src/index.ts:196`, `src/commands/setup.ts:126` |
| 16 | Project command shows default categories | VERIFIED | `src/commands/project.ts:211` |
| 17 | `pilot skills register` replaces `pilot skills add` | VERIFIED | `src/index.ts:315` |
| 18 | `pilot skills categories` shows CATEGORY_INFO descriptions | VERIFIED | `src/commands/skills.ts:116` |
| 19 | `pilot skills sync` and `pilot skills bootstrap` commands are removed | VERIFIED | no `skills sync/bootstrap` subcommands in `src/index.ts`/`src/commands/skills.ts` |
| 20 | Runner performs JIT installation via `npx skills add` path | VERIFIED | `src/core/runner.ts:653` calls installer; `src/core/skills.ts:260` runs `npx skills add` |
| 21 | Runner cleans `.opencode/skill/` after job completion | VERIFIED | `src/core/runner.ts:768` |
| 22 | Runner no longer uses copy-based inject/cleanup APIs | VERIFIED | no `injectSkills`/`cleanupInjectedSkills` usage in `src/core/runner.ts` |
| 23 | Delegate still uses `resolveSkillsForJob` for prompt skill hints | VERIFIED | `src/core/delegate.ts:22`, `src/core/delegate.ts:441` |
| 24 | Tests were updated for repo/skill SkillEntry shape | VERIFIED | `test/core/skills.test.ts:113`, `test/core/default-skills.test.ts:46` |
| 25 | CATEGORY_INFO has 15-entry test coverage | VERIFIED | `test/core/skills.test.ts:77` |
| 26 | formatCategoryHelp has category-description coverage | VERIFIED | `test/core/skills.test.ts:154` |
| 27 | registerSkill create/update behavior is tested | VERIFIED | `test/core/skills.test.ts:112` |
| 28 | unregisterSkill removal behavior is tested | VERIFIED | `test/core/skills.test.ts:133` |
| 29 | add command tests cover required categories and defaults fallback | FAILED | `test/commands/add.test.ts:418` covers explicit categories, but omitted-categories/default-fallback cases are absent |
| 30 | Full regression suite passes | VERIFIED | `npx vitest run` -> 57 files, 1195 tests passed |

**Score:** 28/30 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/skills.ts` | Manifest-only registry + category help + register/unregister | VERIFIED | Exists, substantive, and wired from add/skills/delegate/runner |
| `src/core/types.ts` | SkillEntry repo/skill shape + Project.defaultCategories | VERIFIED | Exists, substantive, imported broadly |
| `src/core/db.ts` | default_categories DB + row/project mapping + updater | VERIFIED | Exists, substantive, wired by setup/add/project commands |
| `src/core/default-skills.ts` | Repo/skill catalog without bootstrap installer | FAILED | Legacy `bootstrapDefaultSkills()` still present (`src/core/default-skills.ts:252`) |
| `src/commands/add.ts` | Required categories enforcement + fallback cascade | VERIFIED | Exists, substantive, wired from CLI entrypoint |
| `src/commands/setup.ts` | `--categories` -> `updateProjectDefaultCategories` | VERIFIED | Exists, substantive, wired from CLI entrypoint |
| `src/commands/skills.ts` | Register/remove/categories/tag manifest editor | VERIFIED | Exists, substantive, wired from CLI entrypoint |
| `src/index.ts` | Add/setup option wiring + skills register subcommand | VERIFIED | Exists, substantive, routes commands correctly |
| `src/core/runner.ts` | JIT install + post-run cleanup | VERIFIED | Exists, substantive, wired in runner flow |
| `src/core/delegate.ts` | Skill-hint resolution for delegation context | VERIFIED | Exists, substantive, wired in delegation path |
| `test/core/skills.test.ts` | New skills core behavior coverage | VERIFIED | Exists, substantive, executed in full suite |
| `test/commands/add.test.ts` | Categories-required/default-fallback coverage | PARTIAL | Covers explicit categories and no-categories, missing omitted-categories/default-fallback assertions |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/types.ts` | `src/core/db.ts` | Project interface <-> row mapping | WIRED | `defaultCategories` in types and `default_categories` mapping in db |
| `src/core/skills.ts` | `src/core/types.ts` | SkillEntry/SkillManifest imports | WIRED | `import type { SkillEntry, SkillManifest }` present |
| `src/commands/add.ts` | `src/core/skills.ts` | formatCategoryHelp for missing categories | WIRED | Imported and invoked before `exit(2)` |
| `src/commands/add.ts` | `src/core/db.ts` | getProject default-categories fallback | WIRED | `projectRecord?.defaultCategories` used in cascade |
| `src/commands/setup.ts` | `src/core/db.ts` | updateProjectDefaultCategories persistence | WIRED | Dynamic import + call path present |
| `src/commands/skills.ts` | `src/core/skills.ts` | register/unregister/category info usage | WIRED | Imports and command handlers call expected APIs |
| `src/core/runner.ts` | `src/core/skills.ts` | JIT installer hookup | WIRED | Implemented via `installSkillsForJob` helper (not direct `resolveSkillsForJob`) |
| `src/core/runner.ts` | `execa` | `npx skills add` execution | WIRED | Executed inside `installSkillsForJob` at `src/core/skills.ts:260` |
| `test/core/skills.test.ts` | `src/core/skills.ts` | Tests new APIs | WIRED | Imports and exercises register/unregister/help/category logic |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `(none declared)` | `74-01`..`74-04` | All plans declare `requirements: []` | SATISFIED | `74-01-PLAN.md:13`, `74-02-PLAN.md:14`, `74-03-PLAN.md:11`, `74-04-PLAN.md:14` |
| Orphaned phase requirements | `.planning/REQUIREMENTS.md` | IDs mapped to Phase 74 but not claimed by plans | SATISFIED | No Phase 74 mapping found in `.planning/REQUIREMENTS.md` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/core/default-skills.ts` | 252 | Legacy bootstrap API retained (`bootstrapDefaultSkills`) | BLOCKER | Violates manifest-editor-only must-have for Phase 74 |
| `test/commands/add.test.ts` | 418 | Coverage skew: explicit categories tested, missing omitted/default fallback tests | WARNING | Critical add-category enforcement paths can regress unnoticed |
| `test/commands/setup.test.ts` | 20 | Stale mocks for removed default-skills bootstrap/recommend APIs | INFO | Test intent is correct (asserting non-use) but fixture shape is legacy/noisy |

### Human Verification Required

### 1. JIT Install End-to-End

**Test:** Register at least one skill and run a real job with categories through the runner.
**Expected:** Skill installs into project `.opencode/skill/` during run via `npx skills add`, then cleanup removes the directory at completion.
**Why human:** Requires external `skills` CLI/network behavior and live runner execution context.

### 2. AI-Caller Error Usability

**Test:** Run `pilot add <project> <req>` without `--categories` and inspect stderr.
**Expected:** Message is self-correcting for an AI caller (category descriptions, installed skills by category, corrected usage examples).
**Why human:** "Helpfulness" quality is UX/clarity, not purely structural.

### Gaps Summary

Phase 74 mostly delivers the intended architecture and behavior (28/30 must-haves verified): categories are enforced with a helpful fallback flow, project defaults are persisted and consumed, skills CLI is manifest-editor-only, runner JIT installation path is wired, and full vitest regression is green. Two must-have gaps remain: (1) `bootstrapDefaultSkills()` still exists in `src/core/default-skills.ts`, which contradicts the phase's manifest-only removal target, and (2) add-command tests do not currently cover the most critical new paths (omitted `--categories` error and project-default fallback).

Additional note: current working tree contains local edits in `src/commands/add.ts` that make `npx tsc --noEmit` fail; this appears outside the verified must-have set but should be resolved before merge.

---

_Verified: 2026-03-20T16:56:03Z_
_Verifier: Claude (gsd-verifier)_
