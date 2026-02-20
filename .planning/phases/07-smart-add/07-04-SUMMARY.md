---
phase: 07-smart-add
plan: 04
subsystem: commands
tags: [smart-add, add-command, build-command, scope-detection, queue-integration]

# Dependency graph
requires:
  - phase: 07-smart-add
    provides: smart-add.ts core logic (detectScope, detectProjectState, resolveInternalMode, generateRequirementsContent)
  - phase: 01-scaffolding-core
    provides: types.ts, config.ts, lock.ts, queue-parser.ts, setup.ts
provides:
  - Smart add command (pilot add <project> <requirement-or-description>)
  - AddResult interface for composition by build and other commands
  - Build command as add + run convenience wrapper
  - Updated CLI registration with new argument signatures
affects: [future CLI improvements, user-facing documentation]

# Tech tracking
tech-stack:
  added: []
  patterns: [command composition (build delegates to add), smart routing (input → scope → mode)]

key-files:
  created: [test/commands/add.test.ts]
  modified: [src/commands/add.ts, src/commands/build.ts, src/index.ts]

key-decisions:
  - "addCommand returns AddResult so buildCommand can compose JSON output with runner status"
  - "Queue writes use withQueueLock + readFile/writeFile on config.queueFile — no queue-store.ts"
  - "VALID_MODES removed from user-facing code; GSD modes are internal implementation details"
  - "Requirements files generated for non-quick string input to support phase/milestone scopes"
  - "External requirements files copied into project/requirements/ when source is outside projectDir"

patterns-established:
  - "Command composition: buildCommand delegates to addCommand, adds runner logic"
  - "Smart routing: input detection → scope classification → internal mode resolution"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 7 Plan 4: Smart-Add Command Layer Summary

**Rewrite add/build commands with intelligent scope detection, replacing mode-based interface with `pilot add <project> <requirement>`**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T21:15:02Z
- **Completed:** 2026-02-20T21:18:57Z
- **Tasks:** 2
- **Files modified:** 4 (add.ts, build.ts, index.ts, add.test.ts)

## Accomplishments
- Completely rewrote add.ts: 224 lines with smart routing via scope detection + project state + mode resolution
- Rewrote build.ts as thin add + run wrapper (68 lines, delegates entirely to addCommand)
- Updated index.ts command registration: `<requirement>` replaces `<mode>`, `--as` scope override, `Smart add` help text
- 10 integration tests covering all smart add scenarios (file, string, directory, dry-run, override, setup, warnings, errors)
- All 260 project tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite add.ts with smart routing** - `f6df51e` (feat)
2. **Task 2: Update build.ts, index.ts, tests** - `c712fb4` (feat)

## Files Created/Modified
- `src/commands/add.ts` - Complete rewrite: smart add with scope detection, project state handling, QUEUE.md writes via withQueueLock
- `src/commands/build.ts` - Rewrite: delegates to addCommand, adds runner management
- `src/index.ts` - Updated add/build command registration with new argument signatures and help text
- `test/commands/add.test.ts` - New: 10 integration tests for smart add command

## Decisions Made
- addCommand returns AddResult interface for composition by buildCommand and index.ts JSON output
- Queue writes use withQueueLock + readFile/writeFile (matches existing infrastructure, not queue-store.ts)
- VALID_MODES array completely removed from add.ts — GSD modes are internal-only
- External requirements files are copied into project/requirements/ to ensure portability
- Non-quick string descriptions generate a requirements .md file via generateRequirementsContent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 (Smart add) is now complete — all 4 plans executed
- `pilot add <project> <requirement>` works end-to-end with scope detection
- `pilot build` delegates to smart add + runner
- No GSD modes exposed to users
- Ready for UAT verification

---
*Phase: 07-smart-add*
*Completed: 2026-02-20*
