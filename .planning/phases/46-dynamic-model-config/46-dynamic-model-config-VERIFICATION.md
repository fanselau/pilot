---
phase: 46-dynamic-model-config
verified: 2026-03-08T09:22:35Z
status: gaps_found
score: 28/30 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2767, error_summary: "" }
  tests: { pass: true, summary: "769 passed, 0 failed", duration_ms: 6608 }
  build: { pass: true, duration_ms: 2976, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "Must-have test gap: resolve fallback behavior is not covered by tests."
  - "Must-have test gap: modelsEditCommand has no automated CLI test coverage."
gaps:
  - truth: "DB-backed resolve functions are tested with fallback behavior"
    status: failed
    reason: "test/core/models.test.ts verifies DB-seeded and DB-updated paths, but does not exercise fallback branches."
    artifacts:
      - path: "test/core/models.test.ts"
        issue: "No test simulates model-store read failure/DB-unavailable path for resolveAgentModel, resolveAllAgentModels, or resolveTopLevelModel."
    missing:
      - "Add tests that mock model-store reads to throw and assert AGENT_MODELS fallback for all resolve functions."
      - "Add explicit assertions for fallback behavior when built-in mode rows are missing from model_profiles."
  - truth: "CLI commands are tested (show, edit, reset, add-provider, remove-provider)"
    status: partial
    reason: "test/commands/models.test.ts covers show/reset/add/remove/diff/export but not interactive edit."
    artifacts:
      - path: "test/commands/models.test.ts"
        issue: "modelsEditCommand is not imported or exercised in the CLI suite."
    missing:
      - "Add readline-mocked tests for modelsEditCommand apply flow (confirm writes setModelEntry)."
      - "Add readline-mocked tests for modelsEditCommand cancel flow (no write)."
---

# Phase 46: Dynamic Model Configuration Verification Report

**Phase Goal:** Move model assignments from hardcoded AGENT_MODELS constant to SQLite database as first-class data. Users can view, edit, reset, and create custom provider modes through `pilot models` CLI. The hardcoded table becomes seed data for first-run initialization. When a new model drops, `pilot models edit` lets you swap it in — no source code, no config files.
**Verified:** 2026-03-08T09:22:35Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | model_profiles table exists in pilot.db with correct schema | ✓ VERIFIED | `src/core/db.ts:83`, `src/core/db.ts:312` |
| 2 | provider_modes table exists with built-in modes seeded | ✓ VERIFIED | `src/core/db.ts:94`, `src/core/db.ts:276`, `src/core/db.ts:315`, `test/core/model-store.test.ts:56` |
| 3 | Seeding only happens on first run (customizations preserved) | ✓ VERIFIED | `src/core/db.ts:272`, `test/core/model-store.test.ts:72` |
| 4 | model-store module provides CRUD for both tables | ✓ VERIFIED | `src/core/model-store.ts:21`, `src/core/model-store.ts:103`, `src/core/model-store.ts:217` |
| 5 | resolveAgentModel reads from DB instead of hardcoded-only lookup | ✓ VERIFIED | `src/core/models.ts:92` |
| 6 | resolveAllAgentModels reads from DB for agent entries | ✓ VERIFIED | `src/core/models.ts:119`, `src/core/models.ts:123` |
| 7 | resolveTopLevelModel reads from DB for scope entries | ✓ VERIFIED | `src/core/models.ts:159`, `src/core/models.ts:163` |
| 8 | resolve functions fall back to AGENT_MODELS | ✓ VERIFIED | `src/core/models.ts:99`, `src/core/models.ts:134`, `src/core/models.ts:170` |
| 9 | patchAgentFrontmatter remains functional | ✓ VERIFIED | `src/core/models.ts:184`, `test/core/models.test.ts:183` |
| 10 | AGENT_MODELS constant is preserved (seed + fallback source) | ✓ VERIFIED | `src/core/models.ts:18`, `src/core/models.ts:250` |
| 11 | Provider mode typing accepts custom modes | ✓ VERIFIED | `src/core/types.ts:30`, `src/core/types.ts:83`, `src/core/types.ts:111` |
| 12 | `pilot models` shows current mapping as readable table | ✓ VERIFIED | `src/commands/models.ts:157`, `src/commands/models.ts:183`, CLI smoke check (table headers/rows present) |
| 13 | `pilot models` highlights customized entries | ✓ VERIFIED | `src/commands/models.ts:113`, `src/commands/models.ts:195`, `src/commands/models.ts:219` |
| 14 | `pilot models edit` provides interactive reassignment flow | ✓ VERIFIED | `src/commands/models.ts:249`, `src/commands/models.ts:337`, `src/commands/models.ts:346` |
| 15 | `pilot models reset` restores defaults | ✓ VERIFIED | `src/commands/models.ts:397`, `src/core/model-store.ts:157`, CLI smoke check (custom value reset to default) |
| 16 | `pilot models reset <mode>` resets a single provider mode | ✓ VERIFIED | `src/commands/models.ts:389`, `src/core/model-store.ts:133` |
| 17 | `pilot models show <mode>` shows one provider mode | ✓ VERIFIED | `src/index.ts:375`, `src/index.ts:379`, `src/commands/models.ts:99` |
| 18 | `pilot models add-provider` creates a custom mode | ✓ VERIFIED | `src/commands/models.ts:421`, `src/commands/models.ts:461`, CLI smoke check (`created: true`) |
| 19 | `pilot models remove-provider` deletes a custom mode | ✓ VERIFIED | `src/commands/models.ts:518`, `src/commands/models.ts:523`, CLI smoke check (`removed: true`) |
| 20 | built-in modes are protected from removal | ✓ VERIFIED | `src/commands/models.ts:508`, `src/core/model-store.ts:119`, runtime check exits 2 with built-in removal error |
| 21 | `pilot add --provider` accepts custom mode names | ✓ VERIFIED | `src/commands/add.ts:397`, `src/commands/add.ts:403`, `src/commands/add.ts:413`, custom mode dry-run exits 0 |
| 22 | `pilot models diff` shows customized vs defaults | ✓ VERIFIED | `src/commands/models.ts:539`, `src/commands/models.ts:569`, `test/commands/models.test.ts:257` |
| 23 | `pilot models export` dumps config as JSON | ✓ VERIFIED | `src/commands/models.ts:635`, `src/commands/models.ts:661`, `test/commands/models.test.ts:283` |
| 24 | `pilot models import` loads config from JSON file | ✓ VERIFIED | `src/commands/models.ts:687`, `src/commands/models.ts:725`, CLI smoke check (`imported: true`, restored custom mode entries) |
| 25 | model-store CRUD functions are tested | ✓ VERIFIED | `test/core/model-store.test.ts:36`, `test/core/model-store.test.ts:112`, `test/core/model-store.test.ts:351` |
| 26 | resolve functions are tested with fallback behavior | ✗ FAILED | `test/core/models.test.ts` covers DB-seeded/updated/custom cases (`test/core/models.test.ts:338`, `test/core/models.test.ts:343`, `test/core/models.test.ts:377`) but no fallback-path simulation |
| 27 | CLI commands are tested (show/edit/reset/add/remove) | ✗ FAILED | `test/commands/models.test.ts:80` imports show/reset/add/remove/diff/export only; no `modelsEditCommand` test coverage |
| 28 | seeding idempotency is tested | ✓ VERIFIED | `test/core/model-store.test.ts:72` |
| 29 | custom provider mode lifecycle is tested | ✓ VERIFIED | `test/core/model-store.test.ts:385` |
| 30 | all existing tests still pass | ✓ VERIFIED | Automated check: `npx vitest run --reporter=json` passed (`769 passed, 0 failed`), targeted phase suites passed (`85/85`) |

**Score:** 28/30 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/db.ts` | model_profiles/provider_modes schema + first-run seed | ✓ VERIFIED | Exists (1306 lines); table creation + `seedModelTables` + open/test DB wiring present (`src/core/db.ts:83`, `src/core/db.ts:301`, `src/core/db.ts:332`) |
| `src/core/model-store.ts` | CRUD module for model/profile/provider mode data | ✓ VERIFIED | Exists (230 lines); 12 exported functions with DB CRUD + reset/clone/customization logic (`src/core/model-store.ts:21`, `src/core/model-store.ts:217`) |
| `src/core/types.ts` | row types + dynamic provider typing | ✓ VERIFIED | Exists (308 lines); `ModelProfileRow`, `ProviderModeRow`, `DynamicProviderMode` present (`src/core/types.ts:83`, `src/core/types.ts:283`) |
| `src/core/models.ts` | DB-first resolve functions with hardcoded fallback | ✓ VERIFIED | Exists (250 lines); three resolve functions DB-first + fallback, AGENT_MODELS retained/exported (`src/core/models.ts:85`, `src/core/models.ts:113`, `src/core/models.ts:154`, `src/core/models.ts:250`) |
| `src/commands/models.ts` | models show/edit/reset/add/remove/diff/export/import handlers | ✓ VERIFIED | Exists (766 lines); all command handlers implemented and exported (`src/commands/models.ts:97`, `src/commands/models.ts:757`) |
| `src/index.ts` | `pilot models` command group registration | ✓ VERIFIED | Dynamic import wiring for all subcommands (`src/index.ts:364`, `src/index.ts:398`, `src/index.ts:432`) |
| `src/commands/add.ts` | dynamic `--provider` validation against DB modes | ✓ VERIFIED | `validateProvider` checks built-ins + DB custom modes (`src/commands/add.ts:397`, `src/commands/add.ts:403`, `src/commands/add.ts:413`) |
| `test/core/model-store.test.ts` | CRUD + seeding + lifecycle regression coverage | ✓ VERIFIED | Exists (409 lines); broad coverage including idempotency and lifecycle (`test/core/model-store.test.ts:72`, `test/core/model-store.test.ts:385`) |
| `test/core/models.test.ts` | resolve behavior tests including fallback | ⚠ PARTIAL | Exists (392 lines); DB-backed and custom-mode paths covered, fallback path coverage missing (`test/core/models.test.ts:333`) |
| `test/commands/models.test.ts` | CLI command coverage for models command group | ⚠ PARTIAL | Exists (309 lines); show/reset/add/remove/diff/export tested, edit flow untested (`test/commands/models.test.ts:80`) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/db.ts` | `src/core/model-store.ts` | shared DB handle via `getDb()` | ✓ WIRED | `getDb` exported in DB layer and imported/used by model-store (`src/core/db.ts:352`, `src/core/model-store.ts:10`, `src/core/model-store.ts:26`) |
| `src/core/model-store.ts` | `src/core/models.ts` | seed/default source via `AGENT_MODELS` | ✓ WIRED | `AGENT_MODELS` imported and used in reset/customization comparison (`src/core/model-store.ts:11`, `src/core/model-store.ts:137`, `src/core/model-store.ts:181`) |
| `src/core/models.ts` | `src/core/model-store.ts` | DB reads via `getModelEntry` / `getAllEntriesForModeAndProfile` | ✓ WIRED | Direct imports and calls in all resolve functions (`src/core/models.ts:3`, `src/core/models.ts:92`, `src/core/models.ts:119`, `src/core/models.ts:163`) |
| `src/core/models.ts` | `AGENT_MODELS` fallback path | hardcoded fallback branches | ✓ WIRED | Fallback branches present for all resolve functions (`src/core/models.ts:99`, `src/core/models.ts:134`, `src/core/models.ts:170`) |
| `src/index.ts` | `src/commands/models.ts` | dynamic command imports | ✓ WIRED | `models` subcommands all dynamically import command handlers (`src/index.ts:370`, `src/index.ts:404`, `src/index.ts:437`) |
| `src/commands/models.ts` | `src/core/model-store.ts` | CRUD function imports | ✓ WIRED | show/edit/reset/provider/diff/export/import all call model-store functions (`src/commands/models.ts:19`, `src/commands/models.ts:346`, `src/commands/models.ts:518`, `src/commands/models.ts:738`) |
| `src/commands/add.ts` | `src/core/model-store.ts` | custom provider validation | ✓ WIRED | `validateProvider` checks `getProviderMode` + `getProviderModes` (`src/commands/add.ts:18`, `src/commands/add.ts:403`, `src/commands/add.ts:413`) |
| `test/core/model-store.test.ts` | `src/core/model-store.ts` | direct function imports | ✓ WIRED | CRUD tests import and invoke store API directly (`test/core/model-store.test.ts:19`, `test/core/model-store.test.ts:112`) |
| `test/core/models.test.ts` | `src/core/models.ts` | resolve function imports | ✓ WIRED | Resolve API imported and exercised in DB-backed tests (`test/core/models.test.ts:5`, `test/core/models.test.ts:333`) |
| `test/core/models.test.ts` | resolve fallback branches | fallback-path assertions | ✗ NOT COVERED | No tests simulate DB read failures/fallback branch execution |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| 46-01 DB schema + seed + model-store foundation | ✓ SATISFIED | None |
| 46-02 resolve rewiring + fallback + type widening | ✓ SATISFIED | None |
| 46-03 models show/edit/reset CLI | ✓ SATISFIED | None |
| 46-04 provider management + dynamic provider flag + diff/export/import | ✓ SATISFIED | None |
| 46-05 regression testing completeness | ✗ BLOCKED | Fallback path tests and interactive edit CLI test coverage are incomplete |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | - | No TODO/FIXME/placeholder/console-only stub patterns found in phase artifacts | ℹ️ Info | No blocker anti-patterns detected |

### Human Verification Required

### 1. Interactive Edit TTY Flow

**Test:** Run `pilot models edit` in a real terminal, select mode/agent/profile, change model, confirm.
**Expected:** Prompt flow completes and selected row updates in `pilot models show <mode>`.
**Why human:** Interactive readline UX is difficult to fully validate via non-TTY scripted input.

### 2. Table Readability in Real Terminal

**Test:** Run `pilot models` with at least one customized entry and inspect spacing/color markers.
**Expected:** Table columns align and customized entries are visibly marked with `*` and highlight color.
**Why human:** Visual terminal formatting and color readability need human eyes.

### Gaps Summary

Core phase functionality is implemented and wired: DB-backed model config exists, CLI workflows are present, and runtime smoke checks confirm show/reset/add/remove/diff/export/import behavior plus dynamic `--provider` acceptance. The blocking gaps are in test completeness for Plan 46-05: fallback-path coverage for resolve functions is missing, and `modelsEditCommand` has no automated CLI coverage.

---

_Verified: 2026-03-08T09:22:35Z_
_Verifier: Claude (gsd-verifier)_
