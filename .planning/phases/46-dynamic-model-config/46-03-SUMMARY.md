---
phase: 46-dynamic-model-config
plan: 03
subsystem: cli
tags: [cli, model-config, interactive, readline, table-display]

# Dependency graph
requires:
  - phase: 46-dynamic-model-config
    plan: 01
    provides: model-store.ts CRUD (getAllEntriesForMode, isCustomized, setModelEntry, resetProviderMode, resetAllToDefaults)
  - phase: 46-dynamic-model-config
    plan: 02
    provides: DB-backed resolve functions, DynamicProviderMode type
provides:
  - "pilot models" CLI command group with show/edit/reset subcommands
  - Table display of model mapping grouped by agent/scope
  - Visual customization markers (* suffix in yellow) for modified entries
  - Interactive readline editor for model reassignment
  - Per-mode and full reset to built-in defaults
affects:
  - 46-04 (custom provider modes visible and editable via CLI)
  - 46-05 (test coverage for command handlers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested command group with default action (same as config, skills)"
    - "readline interactive flow for multi-step editing (same pattern as init.ts)"
    - "Dynamic import for command handlers in index.ts"

key-files:
  created:
    - src/commands/models.ts
  modified:
    - src/index.ts

key-decisions:
  - "Agents and Scopes in separate sections for clarity — _top: prefix entries grouped under Scopes"
  - "Profile selection in edit flow includes 'all' option to change quality+balanced+budget at once"
  - "Default confirm is 'n' (no) for safety in edit flow"
  - "modelsShowCommand shows available provider modes listing when no specific mode requested"

metrics:
  duration: ~2 minutes
  completed: 2026-03-08
---

# Phase 46 Plan 03: Models CLI Command Group Summary

**CLI interface for dynamic model configuration — show/edit/reset via `pilot models`**

## What Was Done

### Task 1: Create models.ts command handlers (14ced64)

Created `src/commands/models.ts` (307 lines) with three command handlers:

1. **`modelsShowCommand`** — Displays the current model mapping as a formatted table:
   - Groups entries by agent (gsd-*) and scope (_top:*) in separate sections
   - Shows quality/balanced/budget columns side by side
   - Marks customized entries with yellow `*` suffix
   - Supports `--json` output mode
   - Lists available provider modes when no specific mode requested
   - Shows error message for unknown provider modes

2. **`modelsEditCommand`** — Interactive model reassignment using readline:
   - Step-by-step flow: provider mode → agent/scope → profile(s) → model → variant → confirm
   - Supports selecting individual profile or "all" to change all three at once
   - Shows before/after diff before applying
   - Graceful Ctrl+C handling via readline close
   - Writes to model_profiles via `setModelEntry()`

3. **`modelsResetCommand`** — Resets model assignments to built-in defaults:
   - Per-mode reset via `resetProviderMode(mode)`
   - Full reset via `resetAllToDefaults()`
   - Confirmation output in both human and JSON formats

### Task 2: Wire models commands into CLI entry point (f6a594c)

Added the `models` command group to `src/index.ts` following the same nested subcommand pattern as `config` and `skills`:

- `pilot models` → default action shows current mapping
- `pilot models show [mode]` → show specific provider mode
- `pilot models edit` → interactive editor
- `pilot models reset [mode]` → reset to defaults
- All commands use dynamic imports for fast startup

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npm run build` passes cleanly
- `pilot models --help` shows all three subcommands with descriptions
- `pilot models` shows hybrid mode table (default from config) with agents and scopes
- `pilot models show claude-only` shows claude-only mode table
- `pilot models reset` resets all modes to built-in defaults
- `--json` mode outputs structured JSON with timestamp

## Key Artifacts

| File | Lines | Purpose |
|------|-------|---------|
| `src/commands/models.ts` | 307 | Show/edit/reset command handlers |
| `src/index.ts` | +34 lines | Command registration (models group) |

## Next Phase Readiness

Plan 04 (export/import) and Plan 05 (tests) can proceed. The CLI surface is complete and functional.
