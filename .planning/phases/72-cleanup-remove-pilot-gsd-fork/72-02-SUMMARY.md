---
phase: 72-cleanup-remove-pilot-gsd-fork
plan: 02
subsystem: infra
tags: [commands, agents-md, lessons, vitest, cleanup]

# Dependency graph
requires:
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: Core operation-based AGENTS/lessons prompt execution in src/core/agents-md.ts
provides:
  - Setup command AGENTS generation rewired to typed operation calls
  - Doctor command AGENTS health checks rewired to typed operation calls
  - Lessons command rewired to typed lessons operation with command-layer regression guards
affects: [72-03 submodule cleanup, 72-04 docs and active-surface audit]

# Tech tracking
tech-stack:
  added: []
  patterns: [operation-based command wiring, legacy-command regression guards in command tests]

key-files:
  created: []
  modified: [src/commands/setup.ts, src/commands/doctor.ts, src/commands/lessons.ts, test/commands/setup.test.ts, test/commands/doctor.test.ts, test/commands/lessons.test.ts]

key-decisions:
  - "Use spawnAgentsMdSession operation args (`setup`/`health`/`lessons`) at command call sites rather than legacy command strings."
  - "Add explicit no-legacy-command assertions in command tests to prevent fork coupling regressions."

patterns-established:
  - "Command layer calls AGENTS helper via typed operation contract, not fork command names."
  - "Regression tests assert operation payloads and absence of `gsd-setup-agents`/`gsd-lessons` in command args."

requirements-completed: []

# Metrics
duration: 4 min
completed: 2026-03-16
---

# Phase 72 Plan 02: Setup/Doctor/Lessons Command Rewiring Summary

**Pilot command entrypoints now invoke AGENTS setup/health/lessons through typed operations, preserving non-fatal UX while removing fork-command coupling from runtime command flows.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T09:47:55Z
- **Completed:** 2026-03-16T09:52:51Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Rewired `pilot setup` AGENTS generation from `command` strings to `operation: 'setup'` without changing best-effort behavior.
- Rewired `pilot doctor` AGENTS health checks from legacy command strings to `operation: 'health'` with existing timeout and warning semantics.
- Rewired `pilot lessons` to `operation: 'lessons'` and updated command-level tests to assert operation-based contracts and legacy-command absence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Update setup and doctor AGENTS flows to operation-based calls** - `348bfec` (feat)
2. **Task 2: Update lessons command to prompt-based extraction** - `cbd5fab` (feat)
3. **Task 3: Refresh command-level regression tests for decoupled behavior** - `39b4eda` (test)

**Plan metadata:** skipped (`.planning/` is gitignored in this repository)

## Files Created/Modified
- `src/commands/setup.ts` - Setup AGENTS generation now uses `operation: 'setup'`.
- `src/commands/doctor.ts` - Doctor AGENTS health check now uses `operation: 'health'`.
- `src/commands/lessons.ts` - Lessons extraction now uses `operation: 'lessons'` and updated inline docs.
- `test/commands/setup.test.ts` - Added TTY-path assertion for setup operation payload and legacy-command guard.
- `test/commands/doctor.test.ts` - Added project-health assertion for doctor operation payload and legacy-command guard.
- `test/commands/lessons.test.ts` - Updated operation assertion and explicit no-legacy-command guards.

## Decisions Made
- Kept AGENTS/lessons call-site behavior and timeout posture intact while changing only invocation contract from `command` strings to typed operations.
- Added direct regression guards on session call payloads (`command` absent, operation present) to prevent accidental fallback to fork-only commands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated stale lessons test contract during Task 2 verification**
- **Found during:** Task 2 (Update lessons command to prompt-based extraction)
- **Issue:** Task 2 verification failed because `test/commands/lessons.test.ts` still asserted `command: 'gsd-lessons'` after call-site migration.
- **Fix:** Updated the test assertion to operation-based payload (`operation: 'lessons'`) so verification reflected the new contract.
- **Files modified:** `test/commands/lessons.test.ts`
- **Verification:** `npm test -- test/commands/lessons.test.ts` passed after the update.
- **Committed in:** `cbd5fab` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking fix was required to validate the migrated contract; no scope creep.

## Issues Encountered
- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for `72-03-PLAN.md` and `72-04-PLAN.md` cleanup work with command-layer fork coupling removed.
- No blockers identified.

---
*Phase: 72-cleanup-remove-pilot-gsd-fork*
*Completed: 2026-03-16*
