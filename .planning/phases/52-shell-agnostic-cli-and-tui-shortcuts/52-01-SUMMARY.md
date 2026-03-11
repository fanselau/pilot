---
phase: 52-shell-agnostic-cli-and-tui-shortcuts
plan: 01
subsystem: cli
tags: [binary-resolution, systemd, service-unit, doctor, shell-agnostic]

# Dependency graph
requires:
  - phase: 17
    provides: delegate.ts with resolveOpencodeBinary and runner.ts consuming it
provides:
  - Robust binary resolution chain with filesystem + PATH fallback
  - Hardened service unit generation with stable /usr/bin/env bun interpreter
  - Doctor service health check detecting stale ExecStart paths
affects: [52-03-tests, service-reliability, daemon-stability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "accessSync(X_OK) for binary executability checks"
    - "/usr/bin/env bun pattern for shell-agnostic interpreter resolution"
    - "realpathSync for symlink-stable binary paths in service units"
    - "Stable minimal PATH construction for systemd units"

key-files:
  created: []
  modified:
    - src/core/delegate.ts
    - src/commands/service.ts
    - src/commands/doctor.ts

key-decisions:
  - "Used execSync('which') for bare command PATH resolution instead of adding execa dependency to delegate.ts sync path"
  - "Service unit uses /usr/bin/env bun instead of absolute interpreter path — survives bun/node upgrades"
  - "Stable PATH includes ~/.opencode/bin alongside system bins and user-local dirs"
  - "Doctor service check parses ExecStart line to validate pilot binary path still exists"

patterns-established:
  - "Binary resolution: accessSync(X_OK) for absolute paths, execSync('which') for bare commands"
  - "Service unit generation: realpathSync + /usr/bin/env + stable PATH + timestamp comment"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 52 Plan 01: Binary Resolution Fallback Chain + Service Unit Hardening Summary

**Robust opencode binary resolution with filesystem/PATH fallback, hardened systemd service unit using /usr/bin/env bun + realpath-resolved pilot binary, doctor service health check**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T13:58:13Z
- **Completed:** 2026-03-11T14:02:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `resolveOpencodeBinary()` now properly checks candidates with `accessSync(X_OK)` for absolute paths and falls through to PATH lookup via `which` for bare command names
- Service unit generation uses `/usr/bin/env bun` and `realpathSync`-resolved pilot binary path, with a stable minimal PATH
- Doctor system check now validates the service unit's ExecStart binary path and warns on stale paths or missing service installation

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix resolveOpencodeBinary() fallback chain + harden doctor binary check** - `85860e0` (feat)
2. **Task 2: Harden service unit generation with stable exec path + add doctor service check** - `e60d27d` (feat)

## Files Created/Modified
- `src/core/delegate.ts` — Fixed resolveOpencodeBinary() to check filesystem existence before returning candidates
- `src/commands/service.ts` — Hardened unit generation with /usr/bin/env bun, realpathSync, stable PATH, and timestamp comment
- `src/commands/doctor.ts` — Used resolveOpencodeBinary() for binary check, added service unit ExecStart path validation

## Decisions Made
- Used `execSync('which')` from `node:child_process` for PATH resolution in delegate.ts — avoids adding `execaSync` import just for this one synchronous call
- Service unit interpreter is `/usr/bin/env bun` (not absolute path) — survives bun upgrades at the same PATH location
- Stable PATH includes `~/.opencode/bin` alongside standard system and user-local directories
- Doctor service check does X_OK validation on the pilot binary extracted from ExecStart line

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Binary resolution and service unit generation are hardened
- Ready for 52-02-PLAN.md (TUI retry/cancel shortcuts + help overlay)
- Ready for 52-03-PLAN.md (tests for binary resolution, service generation, doctor checks)

---
*Phase: 52-shell-agnostic-cli-and-tui-shortcuts*
*Completed: 2026-03-11*
