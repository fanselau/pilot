---
phase: 55-shell-runtime-toolchain-exposure
plan: 01
subsystem: infra
tags: [symlink, shell, PATH, fnm, node, pnpm, ~/.local/bin]

# Dependency graph
requires:
  - phase: 53-stable-service-wrapper
    provides: resolvePilotBinary pattern for canonical binary resolution
provides:
  - ensureShellExposure() — creates/refreshes stable symlinks in ~/.local/bin
  - verifyShellExposure() — read-only health check of shell exposure
  - ShellExposureResult/ShellExposureFinding types
affects: [setup-refresh, service-install, doctor-checks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable canonical launchers via ~/.local/bin symlinks"
    - "import.meta.url + realpathSync for pilot binary resolution to real file"
    - "fnm excluded from plain shell exposure — node/pnpm are the interface"

key-files:
  created:
    - src/core/shell-exposure.ts
    - test/core/shell-exposure.test.ts
  modified: []

key-decisions:
  - "Use realpathSync to resolve pilot binary through all symlink chains to the actual file"
  - "fnm explicitly not exposed — node and pnpm are the supported interface for non-interactive contexts"
  - "Real files at target paths are never overwritten — only symlinks are managed"

patterns-established:
  - "Stable launcher pattern: resolve binary → symlink in ~/.local/bin → survives version changes"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 55 Plan 01: Shell Exposure Module Summary

**Stable ~/.local/bin symlink management for pilot, node, and pnpm — ensuring plain `bash -lc` and `sh -lc` shells resolve all three tools without fnm dependency**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T17:27:06Z
- **Completed:** 2026-03-11T17:29:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `shell-exposure.ts` with `ensureShellExposure()` and `verifyShellExposure()` exports
- 13 unit tests covering create, refresh, pass-through, fail, and verify-only modes
- Pilot binary resolution uses `import.meta.url` + `realpathSync` to follow symlink chains to real files
- fnm explicitly excluded from shell exposure (documented in fnmNote string)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shell-exposure module** — `e00672f` (feat)
2. **Task 2: Add unit tests for shell-exposure module** — `831a60a` (test)

## Files Created/Modified
- `src/core/shell-exposure.ts` — Shell exposure logic: create/verify stable launchers in ~/.local/bin
- `test/core/shell-exposure.test.ts` — 13 tests with mocked homedir, which, and fs access

## Decisions Made
- **realpathSync for pilot:** Resolves through all symlinks to the actual file, so the stable symlink points to the real binary, not another symlink chain
- **fnm not exposed:** Plain shells get node/pnpm directly — fnm is an interactive-shell convenience, not a runtime dependency
- **Real files preserved:** If ~/.local/bin/node is a real file (not symlink), we return 'pass' and never touch it

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Shell exposure module ready for wiring into `pilot setup --refresh` and `pilot doctor` in plan 55-02
- Module is pure core — no CLI integration yet (that's plan 02's scope)

---
*Phase: 55-shell-runtime-toolchain-exposure*
*Completed: 2026-03-11*
