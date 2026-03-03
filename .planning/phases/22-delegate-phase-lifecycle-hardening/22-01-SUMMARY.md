---
phase: 22-delegate-phase-lifecycle-hardening
plan: 01
subsystem: delegation
tags: [delegate, add-phase, title-extraction, requirement-files, fallback]

# Dependency graph
requires:
  - phase: 17
    provides: delegation AI module with fallback plan functions
  - phase: quick-016
    provides: filesystem-based phase resolution in delegate fallback
provides:
  - extractRequirementTitle helper for reading # Title from requirement files
  - Updated fallback functions passing titles to add-phase instead of file paths
  - Updated gsd-delegate.md prompt with title extraction rules
affects: [22-02, runner, delegate]

# Tech tracking
tech-stack:
  added: []
  patterns: [title-extraction from requirement files for clean phase naming]

key-files:
  created: []
  modified:
    - src/core/delegate.ts
    - test/core/delegate.test.ts
    - ~/dev/punchlab/pilot-gsd/commands/gsd-delegate.md

key-decisions:
  - "extractRequirementTitle uses /^#\\s+(.+)$/m regex to find first # heading"
  - "add-phase gets human-readable title; plan-phase gets @path for GSD context"
  - "Milestone directory fallback derives title from filename when no heading present"

patterns-established:
  - "Title extraction pattern: read requirement file → extract # heading → use for add-phase"
  - "@path syntax reserved for plan-phase/execute-phase context, never for add-phase"

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 22 Plan 01: Delegate Title Extraction Summary

**extractRequirementTitle helper + fallback function fixes to pass human-readable titles to add-phase instead of file paths, preventing ugly slugified directory names**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T11:02:57Z
- **Completed:** 2026-03-03T11:08:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `extractRequirementTitle()` that reads `# Title` heading from requirement files
- Updated `resolvePhaseForFallback` to pass title to add-phase and `@path` to plan-phase
- Updated `buildMilestonePlan` to extract titles per-file for directory milestones
- Updated gsd-delegate.md prompt with explicit title extraction rules and examples
- Added 9 new tests covering title extraction, fallback behavior, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add extractRequirementTitle helper and fix fallback functions** - `a65ca98` (feat)
2. **Task 2: Update gsd-delegate.md prompt + add tests** - `d71868a` (test, pilot) + `e893db8` (docs, pilot-gsd)

## Files Created/Modified
- `src/core/delegate.ts` — Added extractRequirementTitle, updated resolvePhaseForFallback and buildMilestonePlan
- `test/core/delegate.test.ts` — Updated 3 existing tests, added 9 new tests for title extraction and fallback behavior
- `~/dev/punchlab/pilot-gsd/commands/gsd-delegate.md` — Added CRITICAL title extraction rules, updated phase/milestone examples

## Decisions Made
- `extractRequirementTitle` uses `/^#\s+(.+)$/m` regex — matches `# Title` but not `## Subtitle` (the second char after `#` must be whitespace)
- `add-phase` receives human-readable title; `plan-phase` receives `@requirementPath` for GSD context
- When milestone directory files have no `# Title` heading, fallback derives title from filename (strip `.md` and leading digits)
- gsd-delegate.md prompt updated in pilot-gsd repo (separate commit)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Ready for 22-02-PLAN.md (runner inter-step artifact verification + dynamic arg patching)
- extractRequirementTitle is available for any code that needs to read requirement file titles
- The title extraction behavior is now tested comprehensively

---
*Phase: 22-delegate-phase-lifecycle-hardening*
*Completed: 2026-03-03*
