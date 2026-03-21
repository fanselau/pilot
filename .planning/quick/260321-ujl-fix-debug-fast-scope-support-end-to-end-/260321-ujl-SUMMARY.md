---
phase: 260321-ujl
plan: 01
subsystem: config
tags: [bug-fix, config, scope, validation]
dependency_graph:
  requires: [260321-tdm]
  provides: [SCOPE-CONFIG-01]
  affects: [src/core/config.ts, test/core/config.test.ts]
tech_stack:
  added: []
  patterns: [assertEnum validation, TDD red-green]
key_files:
  created: []
  modified:
    - src/core/config.ts
    - test/core/config.test.ts
decisions:
  - Remove milestone from config defaults allowed list (Phase 85 disabled milestone scope)
  - Align config LOAD validation with types.ts and config SET command
metrics:
  duration: "3 minutes"
  completed: "2026-03-21T22:07:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260321-ujl: Fix Config assertEnum for debug/fast Scope Support

**One-liner:** Fixed `assertEnum` in `src/core/config.ts` to accept `debug` and `fast` scopes, removing stale `milestone` from config defaults validation.

## What 260321-tdm Fixed

Quick task `260321-tdm` resolved the DB-layer and command-layer gaps for debug/fast scope support:
- Added `debug` and `fast` to the DB schema's `scope` CHECK constraint via migration
- Updated `addJob()` to accept the new scope values
- Updated the `pilot add` command to accept `--scope debug` and `--scope fast`
- Updated `src/commands/config.ts` line 143 (SET command enum) to include `debug` and `fast`

## What 260321-tdm Missed

One config-layer gap remained unaddressed: **`src/core/config.ts` line 111** still used the old 3-scope allowed list:

```typescript
// BEFORE (bug) — still used old list after 260321-tdm:
assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'milestone']);
```

This meant users who set `defaults.scope = "fast"` or `defaults.scope = "debug"` in their `~/.pilot/config.json` received a validation error on config load, even though:
- `src/core/types.ts` already had `scope?: 'quick' | 'phase' | 'debug' | 'fast' | null`
- `src/commands/config.ts` SET command already accepted `debug` and `fast`

## What This Task Fixed

Single-line fix in `src/core/config.ts`:

```typescript
// AFTER (fixed):
assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'debug', 'fast']);
```

Changes:
- **Added** `debug` and `fast` to the config LOAD validation enum
- **Removed** `milestone` from the allowed set — Phase 85 disabled milestone scope, so users should not be able to set it as a default in their config file

## Tests Added

Three tests updated/added in `test/core/config.test.ts` under `getConfigFileDefaults scope variations`:

1. **Replaced** `returns scope: "milestone" when set in config` with `rejects scope: "milestone" as no longer valid for config defaults` — verifies the validation error is thrown
2. **Added** `returns scope: "fast" when set in config` — verifies fast scope loads cleanly
3. **Added** `returns scope: "debug" when set in config` — verifies debug scope loads cleanly

## No Post-Merge Steps Required

This is a pure config validation fix. No DB migrations, no schema changes, no command changes. The fix is self-contained to `src/core/config.ts` and test coverage in `test/core/config.test.ts`.

## Alignment After Fix

All three layers now agree on valid config default scopes:

| Layer | Valid Scopes |
|-------|-------------|
| `src/core/types.ts` ConfigFileDefaults | `quick \| phase \| debug \| fast \| null` |
| `src/commands/config.ts` SET enum | `quick, phase, debug, fast` |
| `src/core/config.ts` LOAD assertEnum | `quick, phase, debug, fast` ✅ (was: `quick, phase, milestone`) |

## Commits

- `b260f58` — `test(260321-ujl-01): add failing tests for debug/fast scope in config defaults` (RED)
- `62b7648` — `feat(260321-ujl-01): fix config assertEnum to accept debug/fast scope values` (GREEN)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/core/config.ts` assertEnum uses `['quick', 'phase', 'debug', 'fast']`
- [x] Tests for `fast` and `debug` pass (68/68 tests green)
- [x] `milestone` rejected by config load validation
- [x] DB scope tests still pass (7/7 no regression)
- [x] Commits `b260f58` and `62b7648` exist
