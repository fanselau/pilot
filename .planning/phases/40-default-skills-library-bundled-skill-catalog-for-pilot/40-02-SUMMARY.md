---
phase: 40-default-skills-library
plan: 02
subsystem: cli
tags: [skills, bootstrap, recommend, commander, readline]

# Dependency graph
requires:
  - phase: 40-01
    provides: "recommendDefaultSkills, bootstrapDefaultSkills core functions"
provides:
  - "pilot skills bootstrap CLI command with --yes, --tier flags"
  - "pilot skills recommend CLI command with --tier flag"
  - "skillsBootstrapCommand and skillsRecommendCommand exports"
affects: [40-03, setup-integration, user-facing-skills]

# Tech tracking
tech-stack:
  added: []
  patterns: ["readline prompt for interactive confirmation", "parseTierOption shared helper"]

key-files:
  created: []
  modified:
    - "src/commands/skills.ts"
    - "src/index.ts"
    - "test/commands/skills.test.ts"

key-decisions:
  - "parseTierOption shared helper for both commands — DRY tier parsing"
  - "Non-TTY detection via process.stdin.isTTY with graceful exit (not error)"
  - "Bootstrap shows per-skill ✓/⚠ results after complete, not streaming"

patterns-established:
  - "readline prompt pattern: createInterface + question + close for one-shot confirmation"
  - "Tier option parsing: '1'→1, '2'→2, 'all'/undefined→'all'"

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 40 Plan 02: CLI Commands for Default Skills Library Summary

**`pilot skills bootstrap` and `pilot skills recommend` commands with interactive prompt, tier filtering, and progress display**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T14:44:43Z
- **Completed:** 2026-03-06T14:49:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `skillsRecommendCommand` showing recommended skills grouped by Tier 1/Tier 2 with detected stack info
- Added `skillsBootstrapCommand` with interactive confirmation, --yes flag, non-TTY detection, and per-skill progress output
- Wired both commands in CLI with `[project-dir]` optional argument defaulting to `process.cwd()`
- Added 6 focused tests covering recommend output, bootstrap success/failure, and non-TTY behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add skillsBootstrapCommand and skillsRecommendCommand** - `9384c69` (feat)
2. **Task 2: Wire CLI subcommands + add tests** - `a0358be` (feat)

## Files Created/Modified
- `src/commands/skills.ts` - Added skillsRecommendCommand, skillsBootstrapCommand, parseTierOption helper, new imports
- `src/index.ts` - Wired `skills bootstrap` and `skills recommend` subcommands with options
- `test/commands/skills.test.ts` - Added mock for default-skills.ts, 6 new tests for recommend and bootstrap

## Decisions Made
- Used shared `parseTierOption` helper for both commands to avoid duplicating tier parsing logic
- Bootstrap displays all results after completion (not streaming) — matches bootstrapDefaultSkills returning a complete BootstrapResult
- Non-TTY without --yes shows a warning and returns (exit 0) rather than throwing an error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 40-02 complete — CLI commands are wired and tested
- Plan 40-03 (setup integration) runs in parallel and depends on 40-01 only
- All `must_haves` truths validated via tests and manual CLI help verification

---
*Phase: 40-default-skills-library*
*Completed: 2026-03-06*
