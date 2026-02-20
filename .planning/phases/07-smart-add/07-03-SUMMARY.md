---
phase: 07-smart-add
plan: 03
subsystem: core
tags: [smart-add, scope-detection, project-state, requirements-parsing, tdd]

# Dependency graph
requires:
  - phase: 01-scaffolding-core
    provides: types.ts, config.ts, queue-parser.ts, projects.ts
provides:
  - SmartAddScope, ScopeDetectionResult, ProjectStateResult, SmartAddDecision types
  - detectScope heuristic function (milestone/phase/quick classification)
  - detectProjectState async function (dir/opencode/planning/queue checks)
  - parseRequirementsFile pure function (checkbox + header counting)
  - generateRequirementsContent pure function (description → markdown)
  - resolveInternalMode pure function (scope x state → GSD mode)
affects: [07-04 smart-add command layer, future add/build commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [scope detection heuristics, optional config injection for testability]

key-files:
  created: [src/core/smart-add.ts, test/core/smart-add.test.ts]
  modified: [src/core/types.ts]

key-decisions:
  - "detectProjectState accepts optional PilotConfig param for test injection instead of relying solely on getConfig mock"
  - "Multiple Must Have sections (>=2) treated as phase headers indicating milestone scope"
  - "Scope threshold: <3 items = quick, 3-10 = phase, 10+ with headers = milestone"
  - "Uses parseQueueFile from queue-parser.ts (QUEUE.md) since queue-store.ts from Phase 6 does not exist"

patterns-established:
  - "Optional config injection: async functions accept optional config param, fallback to getConfig()"
  - "Pure function + async I/O separation: detectScope/resolveInternalMode are pure, detectProjectState does I/O"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 7 Plan 3: Smart-Add Core Logic Summary

**TDD-driven scope detection, project state analysis, and internal mode resolution using QUEUE.md infrastructure**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T21:07:26Z
- **Completed:** 2026-02-20T21:11:05Z
- **Tasks:** 2 (RED + GREEN, no REFACTOR needed)
- **Files modified:** 3

## Accomplishments
- Built complete smart-add core module (316 lines) with 5 exported functions
- 30 TDD tests covering scope detection, requirements parsing, project state detection, and mode resolution
- All 250 project tests pass with zero regressions
- Correctly adapted for QUEUE.md infrastructure (Phase 6 queue-store.ts never built)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Define types + write failing tests** - `955ff6c` (test)
2. **Task 2: GREEN — Implement smart-add core module** - `17a85c3` (feat)

_No REFACTOR commit needed — code was clean after GREEN._

## Files Created/Modified
- `src/core/types.ts` - Added SmartAddScope, ScopeDetectionResult, ProjectStateResult, SmartAddDecision types
- `src/core/smart-add.ts` - New: scope detection, project state detection, requirements parsing, mode resolution
- `test/core/smart-add.test.ts` - New: 30 TDD tests for all smart-add core functions

## Decisions Made
- detectProjectState accepts optional PilotConfig param for clean test injection (avoids fragile vi.mock on config.js)
- Multiple Must Have sections (>=2) treated as phase headers — indicates milestone-level multi-section scope
- Scope thresholds: <3 items = quick, 3-10 = phase, 10+ with phase headers = milestone
- Uses parseQueueFile from queue-parser.ts since Phase 6 queue-store.ts was never executed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getConfig mock not working through module boundary**
- **Found during:** Task 2 (GREEN — running tests)
- **Issue:** vi.mock for config.js didn't propagate to smart-add.ts internal getConfig() call — returned undefined causing 7 test failures
- **Fix:** Updated detectProjectState tests to pass testConfig explicitly via the optional config parameter instead of relying on hoisted mock
- **Files modified:** test/core/smart-add.test.ts
- **Verification:** All 30 tests pass
- **Committed in:** 17a85c3 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal — used the optional config param that was already in the implementation design. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- smart-add core module ready for command layer integration (Plan 07-04)
- All types exported from types.ts for use by add/build command files
- No blockers

---
*Phase: 07-smart-add*
*Completed: 2026-02-20*
