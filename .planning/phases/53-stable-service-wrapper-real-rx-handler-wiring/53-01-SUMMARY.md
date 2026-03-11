---
phase: 53-stable-service-wrapper-real-rx-handler-wiring
plan: 01
subsystem: service
tags: [binary-resolution, systemd, service-unit, import-meta-url, canonical-path]

requires:
  - phase: 52
    provides: Service unit generation with /usr/bin/env bun + realpathSync + stable PATH
provides:
  - Canonical pilot binary resolution via import.meta.url → which → throw chain
  - Service ExecStart no longer uses process.argv[1]
  - Regression tests proving argv is never used
affects: [service-reliability, daemon-stability]

tech-stack:
  added: []
  patterns:
    - "import.meta.url for package-root-relative binary resolution"
    - "accessSync(X_OK) + execSync('which') fallback chain for binary discovery"
    - "fileURLToPath for ESM-safe path derivation"

key-files:
  created: []
  modified:
    - src/commands/service.ts
    - test/commands/service.test.ts

key-decisions:
  - "Primary resolution uses import.meta.url to find dist/index.js relative to package root — survives rebuilds and relinks"
  - "Fallback uses execSync('which pilot') for globally linked installs"
  - "Hard throw when nothing resolves — no silent fallback to argv"
  - "Comment mentioning argv removed to satisfy strict grep verification"

duration: 3min
completed: 2026-03-11
---

# Phase 53 Plan 01: Stable Service Binary Resolution Summary

**Replace argv-derived ExecStart with resolvePilotBinary() using import.meta.url → which → throw chain, with 4 regression tests proving argv is never used**

## Performance
- **Duration:** 3 min
- **Started:** 2026-03-11T14:45:56Z
- **Completed:** 2026-03-11T14:48:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `resolvePilotBinary()` function in service.ts with deterministic 3-step resolution chain
- Service unit ExecStart now derives pilot binary from package root (import.meta.url) or PATH lookup, never process.argv[1]
- 4 new regression tests cover: dist/index.js resolution, which fallback, throw on failure, argv never leaks into unit
- Existing 9 service tests updated to work with new mock infrastructure (accessSync, execSync)
- Doctor tests unchanged and passing — service unit validation still works correctly
- Full suite: 895 tests, all passing

## Task Commits

1. **Task 1: Replace process.argv[1] with resolvePilotBinary()** - `5b26921` (feat)
2. **Task 2: Add regression tests for stable service resolution** - `30af183` (test)

## Files Created/Modified
- `src/commands/service.ts` — Added resolvePilotBinary() with import.meta.url → which → throw chain; replaced argv usage; exported function for testing
- `test/commands/service.test.ts` — Added 4 new resolvePilotBinary tests; updated mock infrastructure for accessSync, execSync, constants; removed argv dependency from install tests

## Decisions Made
- Primary resolution uses `import.meta.url` → `fileURLToPath` → package root → `dist/index.js` — this is the most reliable canonical path since it's relative to the source file, not how the binary was invoked
- Fallback uses `execSync('which pilot')` for globally linked installs where dist path might differ
- Hard throw with clear message when nothing resolves — no silent degradation to argv
- Existing `realpathSync` wrapping preserved — resolves symlinks on top of canonical path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Service binary resolution is now canonical and stable across rebuilds/relinks
- Doctor service check still validates ExecStart binary correctly (no changes needed)
- Ready for plan 02 if additional work is needed in this phase

---
*Phase: 53-stable-service-wrapper-real-rx-handler-wiring*
*Completed: 2026-03-11*
