---
phase: 64-gsd-installation-switch
plan: 01
subsystem: infra
tags: [gsd, config, types, package-json, cli, get-shit-done-cc]

# Dependency graph
requires: []
provides:
  - PilotConfig and ConfigFileSchema without gsdDir field
  - getConfig() without gsdDir resolution
  - Config CLI display/set/get without gsdDir entries
  - init command without gsdDir in written config
  - get-shit-done-cc npm dependency installed at ~1.24.0
  - Updated CLI help text referencing GSD commands (not pilot-gsd)
affects:
  - 64-02: setup.ts/update.ts/doctor.ts rewrite (depends on clean types from this plan)
  - 64-03: any further GSD installer integration

# Tech tracking
tech-stack:
  added: [get-shit-done-cc ~1.24.0]
  patterns: []

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/config.ts
    - src/commands/config.ts
    - src/commands/init.ts
    - src/index.ts
    - package.json
    - bun.lock

key-decisions:
  - "Remove gsdDir entirely from types/config rather than keeping as deprecated — clean break for Plan 02"
  - "Pin get-shit-done-cc to ~1.24.x (patch-level updates only) per requirements"
  - "Note: setup.ts/update.ts/doctor.ts still have gsdDir TS errors — these are fixed in Plan 02"

patterns-established:
  - "GSD installation goes through upstream npm package, not pilot-gsd submodule"

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 64 Plan 01: GSD Installation Switch Foundation Summary

**Removed gsdDir/pilot-gsd infrastructure from types/config/CLI and added get-shit-done-cc ~1.24.0 as npm dependency**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-15T19:56:47Z
- **Completed:** 2026-03-15T20:04:52Z
- **Tasks:** 2
- **Files modified:** 6 + bun.lock

## Accomplishments

- Removed `gsdDir` from `ConfigFileSchema` and `PilotConfig` interfaces in types.ts
- Deleted `resolveGsdDir()` function and all gsdDir resolution logic from config.ts
- Removed gsdDir from config CLI display, set, get surfaces; removed from config/init default content writers
- Added `get-shit-done-cc ~1.24.0` to package.json dependencies; `bun install` succeeded, binary available at `node_modules/.bin/get-shit-done-cc`
- Updated CLI descriptions: setup → "installs GSD commands", update → "Update GSD commands for all projects"

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove gsdDir from types, config module, and config CLI** - `5d390bf` (refactor)
2. **Task 2: Add get-shit-done-cc dependency and update CLI descriptions** - `1c296d4` (chore)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/core/types.ts` - Removed `gsdDir?: string | null` from ConfigFileSchema; removed `gsdDir: string` from PilotConfig
- `src/core/config.ts` - Deleted resolveGsdDir(), removed gsdDir from getConfig() return, ENV_VAR_MAP, CONFIG_FILE_MAP, AUTO_DETECT_FIELDS
- `src/commands/config.ts` - Removed gsdDir from env var map, CONFIG_DISPLAY, getDefaultConfigFileContent(), CONFIG_FIELD_SPECS, DOT_TO_PILOT_KEY
- `src/commands/init.ts` - Removed `gsdDir: null` from buildConfigContent()
- `src/index.ts` - Updated setup and update command descriptions
- `package.json` - Added `"get-shit-done-cc": "~1.24.0"` to dependencies
- `bun.lock` - Updated lockfile after bun install

## Decisions Made

- Remove gsdDir entirely from types/config (clean break) rather than marking as deprecated — Plan 02 needs the type errors to know exactly what to fix
- Pin to `~1.24.x` (tilde range, patch-level updates) per requirements spec
- `pilot-gsd` submodule directory is left in place — removal is a separate git operation outside code scope (per plan notes)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `bun` was not on PATH; found at `/home/luca/.bun/bin/bun` — used full path for install. Binary resolves fine in project context.
- `bun run build` fails due to gsdDir errors in setup.ts/update.ts/doctor.ts — this is expected per the plan's success criteria ("aside from expected errors in setup.ts/update.ts/doctor.ts which still reference config.gsdDir — those are fixed in Plan 02").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can now proceed: `src/core/setup.ts`, `src/commands/update.ts`, `src/commands/doctor.ts` have type errors for `config.gsdDir` that signal exactly what needs to be rewritten with the upstream installer flow.
- `get-shit-done-cc` binary is available at `node_modules/.bin/get-shit-done-cc` for use in setup/update commands.
- No blockers.

---
*Phase: 64-gsd-installation-switch*
*Completed: 2026-03-15*
