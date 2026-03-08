---
phase: 46-dynamic-model-config
plan: 04
subsystem: cli
tags: [cli, model-config, provider-modes, export, import, diff]

# Dependency graph
requires:
  - phase: 46-dynamic-model-config
    plan: 01
    provides: model-store CRUD (addProviderMode, removeProviderMode, cloneProviderMode, getProviderMode, getProviderModes)
  - phase: 46-dynamic-model-config
    plan: 02
    provides: DynamicProviderMode type, DB-backed resolve functions
  - phase: 46-dynamic-model-config
    plan: 03
    provides: models.ts command handlers (show/edit/reset), CLI wiring in index.ts
provides:
  - "pilot models add-provider" for custom provider mode creation with --clone
  - "pilot models remove-provider" for safe custom mode deletion (built-in protected)
  - "pilot models diff" for customization visibility
  - "pilot models export" and "pilot models import" for config portability
  - Dynamic --provider flag validation listing all available modes
affects:
  - 46-05 (test coverage for new command handlers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for AGENT_MODELS in diff command (avoids circular)"
    - "Comprehensive error reporting listing all available modes on validation failure"
    - "Export always uses raw JSON stdout (not outputJson/outputHuman)"

key-files:
  created: []
  modified:
    - src/commands/models.ts
    - src/commands/add.ts
    - src/index.ts

key-decisions:
  - "Provider name regex: /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/ — lowercase, hyphens, 2-50 chars"
  - "Import upserts: provider_modes skip if exists, model_profiles always overwrite"
  - "Export format: { version: 1, provider_modes: [...], model_profiles: [...] } — always JSON"
  - "Diff shows current (yellow) vs default for each customized entry"
  - "validateProvider error lists all custom modes from DB alongside built-in modes"

metrics:
  duration: ~3 minutes
  completed: 2026-03-08
---

# Phase 46 Plan 04: Provider Management & Data Portability Summary

**Custom provider mode CRUD, diff/export/import, and dynamic --provider validation**

## What Was Done

### Task 1: Add provider management and data portability commands (a1bf4fa)

Extended `src/commands/models.ts` with 5 new command handlers:

1. **`modelsAddProviderCommand(name, { clone? })`** — Creates custom provider modes:
   - Validates name format (lowercase alphanumeric + hyphens, 2-50 chars)
   - Checks for duplicates via `getProviderMode()`
   - `--clone <mode>` creates mode and clones all entries from source
   - Without clone, creates empty mode with guidance to use `pilot models edit`

2. **`modelsRemoveProviderCommand(name)`** — Deletes custom modes:
   - Checks mode exists and is NOT built-in
   - Built-in rejection: "Cannot remove built-in provider mode. Only custom modes can be removed."
   - Delegates to `removeProviderMode()` which deletes both mode and all entries

3. **`modelsDiffCommand({ providerMode? })`** — Shows customizations:
   - Compares DB entries against AGENT_MODELS defaults
   - Shows before/after for each customized agent/scope+profile combination
   - Reports "No customizations found" when everything matches defaults

4. **`modelsExportCommand()`** — Full config dump:
   - Exports all provider_modes and model_profiles as `{ version: 1, ... }` JSON
   - Always outputs JSON to stdout (data portability format)

5. **`modelsImportCommand(file)`** — Config restore:
   - Reads and validates JSON file structure
   - Upserts provider modes (skip existing) and model entries (overwrite)
   - Reports count of imported modes and entries

All 5 subcommands wired into `src/index.ts` on the `modelsCmd` group.

### Task 2: Dynamic --provider flag validation (74c5be3)

Updated `validateProvider()` in `src/commands/add.ts`:
- Already had DB lookup via `getProviderMode()` with graceful fallback
- Enhanced error message to list all available modes (built-in + custom from DB)
- Updated `--provider` option description to "Provider mode (run pilot models to see available modes)"

## Deviations from Plan

None — plan executed exactly as written. The dynamic --provider validation was already partially implemented in plan 46-02; this plan enhanced it with comprehensive error messaging.

## Verification Results

- `npm run build` passes cleanly
- `npm test` passes (709 tests)
- `pilot models --help` shows all 8 subcommands: show, edit, reset, add-provider, remove-provider, diff, export, import

## Key Artifacts

| File | Changes | Purpose |
|------|---------|---------|
| `src/commands/models.ts` | +310 lines | 5 new command handlers + exports |
| `src/commands/add.ts` | +12 lines | Enhanced validateProvider with mode listing |
| `src/index.ts` | +42 lines | 5 new subcommand registrations |

## Next Phase Readiness

Plan 05 (tests) can proceed. All CLI commands are functional and wired.
