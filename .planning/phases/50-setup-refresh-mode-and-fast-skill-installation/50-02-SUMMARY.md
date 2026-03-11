---
phase: 50-setup-refresh-mode-and-fast-skill-installation
plan: 02
subsystem: infra
tags: [cli, setup, refresh, flags, testing, vitest]

# Dependency graph
requires:
  - phase: 50-setup-refresh-mode-and-fast-skill-installation
    provides: setupProject() refresh/force options, parallel bootstrapDefaultSkills()
provides:
  - CLI flags --refresh, --force, --skip-skills on pilot setup command
  - 10 new tests covering refresh mode and parallel bootstrap
  - Structured refresh summary output in CLI
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "--skip-skills gates both skill and AGENTS.md re-offering in refresh mode"
    - "Structured CLI summary output for refresh vs normal setup mode"

key-files:
  created: []
  modified:
    - src/commands/setup.ts
    - src/index.ts
    - test/core/setup.test.ts
    - test/core/default-skills.test.ts

key-decisions:
  - "--force and --skip-skills are no-ops without --refresh — no errors, just ignored"
  - "--verify takes precedence over --refresh (checked first in existing if-block)"
  - "--skip-skills gates both skill offering AND AGENTS.md generation"
  - "Refresh summary uses bold 'Refreshed:' header with filtered result entries"

patterns-established:
  - "CLI option pass-through: setupOpts constructed conditionally from opts.refresh"

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 50 Plan 02: CLI Wiring + Comprehensive Tests Summary

**--refresh/--force/--skip-skills flags wired to pilot setup command with 10 new tests covering refresh mode and parallel skill bootstrap**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T10:45:01Z
- **Completed:** 2026-03-09T10:48:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `pilot setup --help` shows --refresh, --force, --skip-skills flags
- setupCommand passes refresh/force options through to setupProject()
- Structured "Refreshed:" summary output distinguishes refresh changes from normal setup
- --skip-skills gates both skill recommendation and AGENTS.md generation
- 5 refresh mode tests: symlink re-creation, merge missing fields, force overwrite, data loss protection, backward compat
- 5 parallel bootstrap tests: concurrency detection, single syncManifest, skip installed, tag ordering, failure isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire CLI flags and update setupCommand** - `af63186` (feat)
2. **Task 2: Write tests for refresh mode and parallel bootstrap** - `4a1b0de` (test)

## Files Created/Modified
- `src/index.ts` - Added --refresh, --force, --skip-skills options to setup command registration
- `src/commands/setup.ts` - SetupOptions interface extended, setupOpts conditional pass-through, refresh summary output, skipSkills guard on skills/AGENTS.md sections
- `test/core/setup.test.ts` - 5 new tests in "setupProject — refresh mode" describe block
- `test/core/default-skills.test.ts` - 5 new tests in "bootstrapDefaultSkills — parallel execution" describe block

## Decisions Made
- --force and --skip-skills without --refresh are silently ignored (no error) — these flags only make sense in refresh context
- --verify takes precedence over --refresh since it's checked first in the existing if-block
- --skip-skills also skips AGENTS.md re-offering (both are "optional offer" sections)
- Refresh summary filtering uses string matching on result.created entries ("Refreshed", "Merged", "force-overwritten")

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 50 complete — all 2 plans executed successfully
- Full refresh mode functional: `pilot setup <dir> --refresh` re-links symlinks, merges config, re-offers skills
- `pilot setup <dir> --refresh --force` regenerates opencode.json from scratch
- `pilot setup <dir> --refresh --skip-skills` refreshes without skill re-offering
- 835 tests passing with 10 new tests added

---
*Phase: 50-setup-refresh-mode-and-fast-skill-installation*
*Completed: 2026-03-09*
