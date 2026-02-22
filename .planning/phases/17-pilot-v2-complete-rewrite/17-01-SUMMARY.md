---
phase: 17-pilot-v2-complete-rewrite
plan: 01
subsystem: infra
tags: [typescript, dependencies, types, config, commander, date-fns]

# Dependency graph
requires:
  - phase: 16 (and earlier)
    provides: v1 codebase (already nuked in prior commit 056b7a2)
provides:
  - v2 type definitions (Job, DelegationPlan, PilotConfig, SessionInfo, PilotStatusJson)
  - v2 config with pilotDbPath and delegation model fields
  - v2 CLI entry point with commander registration for all v2 commands
  - Clean dependency set (no v1 deps)
affects: [17-02 (db.ts uses Job type), 17-03 (opencode-db uses SessionInfo), 17-04 (delegate uses DelegationPlan), 17-06 (commands wire to index.ts)]

# Tech tracking
tech-stack:
  added: [date-fns]
  removed: [ink, react, cli-table3, ora, proper-lockfile, nanoid, tree-kill, @types/react, @types/proper-lockfile, ink-testing-library]
  patterns: [v2 type-first design, stub commands for incremental wiring]

key-files:
  created: [src/core/types.ts, src/index.ts]
  modified: [package.json, src/core/config.ts, src/util/format.ts]

key-decisions:
  - "maxParallel default changed from 2 to 1 per v2 spec"
  - "pollInterval default changed from 3 to 5 per v2 spec"
  - "Removed queueFile, queueJsonFile, logDir from PilotConfig — replaced by pilotDbPath"
  - "Stub commands exit 1 with stderr message, not silent"

patterns-established:
  - "v2 type foundation: all modules import from types.ts"
  - "Stub command pattern: register with commander, real impl in Plans 06-07"

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 17 Plan 01: Nuke v1 deps, establish v2 types + config + entry point

**Clean v2 foundation: updated dependencies (removed 79 v1 packages, added date-fns), v2 types with Job/DelegationPlan/PilotConfig, rewritten config with pilotDbPath, and commander-based CLI stub with all v2 commands**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T20:48:04Z
- **Completed:** 2026-02-22T20:51:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Updated package.json to v2 deps — removed 79 v1 packages, added date-fns
- Created src/core/types.ts with 87 lines of v2 type definitions (Job, JobScope, JobStatus, DelegationPlan, DelegationStep, SessionInfo, SessionMessage, PilotStatusJson, PilotConfig)
- Rewrote src/core/config.ts — removed v1 fields (queueFile, queueJsonFile, logDir), added pilotDbPath, updated defaults
- Added formatRelativeTime to format.ts using date-fns
- Created src/index.ts with v2 commander setup: 12 commands registered as stubs
- Full build (`npm run build`) and compilation (`tsc --noEmit`) pass with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Update package.json dependencies for v2** - `15d619d` (chore)
2. **Task 2: Rewrite types.ts and config.ts for v2** - `974d377` (feat)

## Files Created/Modified
- `package.json` - v2 dependencies (removed 11 v1 deps, added date-fns)
- `src/core/types.ts` - v2 type definitions (Job, DelegationPlan, PilotConfig, SessionInfo, PilotStatusJson)
- `src/core/config.ts` - v2 config with pilotDbPath, removed v1 queue/log fields
- `src/util/format.ts` - Added formatRelativeTime using date-fns
- `src/index.ts` - v2 CLI entry point with 12 stub commands

## Decisions Made
- maxParallel default changed from 2 to 1 per v2 spec (conservative for single-machine use)
- pollInterval default changed from 3 to 5 per v2 spec
- Removed queueFile, queueJsonFile, logDir from PilotConfig — v2 uses SQLite at pilotDbPath
- Stub commands print to stderr and exit 1 — clear signal for unimplemented commands

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v2 types and config are the foundation for all subsequent plans
- src/core/types.ts provides the Job interface needed by Plan 02 (SQLite queue)
- src/core/config.ts provides pilotDbPath needed by Plan 02 (db.ts)
- opencode-db.ts SessionInfo import resolves correctly — ready for Plan 03 extensions
- Ready for 17-02-PLAN.md (SQLite queue database with TDD)

---
*Phase: 17-pilot-v2-complete-rewrite*
*Completed: 2026-02-22*
