---
phase: 64-gsd-installation-switch
plan: 02
subsystem: infra
tags: [get-shit-done-cc, setup, installer, gsd, pilot-gsd-migration, doctor, update]

# Dependency graph
requires:
  - phase: 64-01
    provides: gsdDir removed from types/config, get-shit-done-cc installed as dependency
provides:
  - setup.ts invokes upstream get-shit-done-cc installer instead of creating pilot-gsd symlinks
  - update.ts refreshes npm package and re-runs installer per registered project
  - doctor.ts validates get-shit-done-cc binary and upstream GSD sentinel files
affects: [future-setup, future-update, future-doctor, pilot-gsd-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upstream GSD installer pattern: execa get-shit-done-cc --opencode --local with cwd=projectDir"
    - "Migration cleanup pattern: detect pilot-gsd symlinks via readlink before running installer"
    - "Sentinel validation: gsd-help.md and gsd-tools.cjs as installation health indicators"

key-files:
  created: []
  modified:
    - src/core/setup.ts
    - src/commands/setup.ts
    - src/commands/update.ts
    - src/commands/doctor.ts

key-decisions:
  - "installer bin path via import.meta.dirname relative to dist/: path.resolve(dirname, '..', '..', 'node_modules/.bin/get-shit-done-cc')"
  - "Migration cleanup runs before installer so installer can create real files/directories"
  - "Missing package.json warns and skips GSD only — rest of setup (opencode.json, .gitignore, git) continues"
  - "verifySetup() now accepts real directories (not just symlinks) as valid GSD state"
  - "bun update get-shit-done-cc (not npm) since pilot uses bun as runtime"

patterns-established:
  - "Pattern: run upstream installer in project cwd with timeout: 60_000 and reject: false"
  - "Pattern: check sentinel files (gsd-help.md, gsd-tools.cjs) after installation"

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 64 Plan 02: GSD Installation Switch — Command Module Rewrites Summary

**Replaced pilot-gsd symlink creation with upstream get-shit-done-cc installer in setup.ts/update.ts/doctor.ts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T20:03:10Z
- **Completed:** 2026-03-15T20:07:44Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `setupProject()` now invokes `get-shit-done-cc --opencode --local` instead of creating pilot-gsd symlinks
- Migration cleanup detects and removes old pilot-gsd symlinks (dir-level and file-level) before installer runs
- `pilot update` runs `bun update get-shit-done-cc` then re-runs installer per registered project
- `pilot doctor` validates `get-shit-done-cc` binary, `gsd-help.md`, `gsd-tools.cjs`, GSD VERSION, and broken symlinks

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite setup.ts — upstream installer + migration cleanup** - `4d49c54` (feat)
2. **Task 2: Rewrite update.ts — npm update + per-project installer re-run** - `71b455d` (feat)
3. **Task 3: Update doctor.ts — upstream GSD health checks** - `2fde561` (feat)

## Files Created/Modified

- `src/core/setup.ts` — Replaced symlink logic with get-shit-done-cc invocation; migration cleanup; verifySetup() updated
- `src/commands/setup.ts` — Updated doc comment only
- `src/commands/update.ts` — Full rewrite: bun update + per-project re-run + getAllProjects
- `src/commands/doctor.ts` — Added gsd-help.md/gsd-tools.cjs/VERSION/broken symlink checks; replaced pilot-gsd check

## Decisions Made

- Used `import.meta.dirname` relative path for installer binary (`path.resolve(dirname, '..', '..', 'node_modules/.bin/get-shit-done-cc')`) — works from `dist/core/` and `dist/commands/` since both are 2 levels up from repo root
- Missing `package.json` in project → warn + skip GSD only, continue with rest of setup (opencode.json, .gitignore, git init, shell exposure)
- `verifySetup()` updated to treat real directories as valid (not just symlinks) — post-migration state is real directories
- `bun update` used in update.ts since pilot uses bun; if bun unavailable the error is surfaced and exits

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled cleanly after each task.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 complete: all three command modules now use upstream get-shit-done-cc
- Plan 03 (if present) can focus on test coverage, README updates, or further cleanup
- `pilot setup`, `pilot update`, and `pilot doctor` are all functional with upstream GSD

---
*Phase: 64-gsd-installation-switch*
*Completed: 2026-03-15*
