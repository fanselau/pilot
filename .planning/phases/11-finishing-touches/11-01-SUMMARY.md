---
phase: 11-finishing-touches
plan: 01
subsystem: infra
tags: [health-check, diagnostics, doctor, pid-management, git-gc]

# Dependency graph
requires:
  - phase: 01-project-scaffolding
    provides: core/config.ts, core/process.ts, core/types.ts
  - phase: 03-queue-runner
    provides: core/spawn.ts patterns (binary check, gc disable, memory check)
provides:
  - "pilot doctor command — 9-check health validation"
  - "DoctorCheck/DoctorResult types for structured check output"
  - "ensurePilotDir() standalone helper for ~/.pilot/ creation"
  - "--fix mode for auto-repairing stale PIDs, zombies, gc.auto, pilot dir"
affects: [11-02, 11-03, 11-04, runner, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: ["health check pattern: array of checks with pass/fail/warn status and fix actions"]

key-files:
  created:
    - src/core/doctor.ts
    - src/commands/doctor.ts
    - test/core/doctor.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Reuse spawn.ts patterns (binary check, gc disable, meminfo) without extracting shared helpers — keeps modules independent"
  - "Queue check validates queue.json not legacy QUEUE.md — consistent with Phase 6 migration"
  - "fs.access for binary check on real filesystem — which mock doesn't cover default path fallback"

patterns-established:
  - "Doctor check pattern: each check returns DoctorCheck with name, status, message, fixable, fixAction"
  - "Fix mode: re-runs check after applying fix to confirm success"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 11 Plan 01: Doctor Health Check Summary

**`pilot doctor` command with 9 health checks: binary, gsd_dir, symlinks, git_gc, memory, zombies, stale_pids, queue, pilot_dir — with --fix auto-repair and --json machine output**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T11:24:13Z
- **Completed:** 2026-02-21T11:29:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Core doctor module with 9 health checks returning structured DoctorResult
- Fix mode auto-repairs: stale PIDs (remove files), zombies (SIGKILL), gc.auto (set 0), pilot dir (mkdir)
- JSON output with timestamp, checks array, and summary counts
- Human output with ✓/✗/⚠ icons and fix transition display (✗ → ✓)
- 26 tests covering all check types, fix mode, and structural validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Core doctor module with 9 health checks** - `606457a` (feat)
2. **Task 2: Doctor command + index.ts wiring** - `2c1dbb7` (feat)

## Files Created/Modified
- `src/core/doctor.ts` - 9 health check implementations + runDoctor + ensurePilotDir
- `src/commands/doctor.ts` - CLI rendering (human + JSON) with --fix display
- `test/core/doctor.test.ts` - 26 tests for all checks and fix mode
- `src/index.ts` - doctor command registration + grouped help entry

## Decisions Made
- Reuse spawn.ts patterns (binary check, gc disable, meminfo) without extracting shared helpers — keeps modules independent, avoids refactor scope
- Queue check validates queue.json (not legacy QUEUE.md) — consistent with Phase 6 migration
- Tests account for real filesystem state (binary may exist at default path, snapshot repos may exist)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Doctor command ready for use by runner (pre-flight checks) and users (setup validation)
- ensurePilotDir() exported for use by Phase 11 Plan 02 (notifications config) and Plan 03 (cleanup)
- Ready for 11-02-PLAN.md (notifications + runner logging)

---
*Phase: 11-finishing-touches*
*Completed: 2026-02-21*
