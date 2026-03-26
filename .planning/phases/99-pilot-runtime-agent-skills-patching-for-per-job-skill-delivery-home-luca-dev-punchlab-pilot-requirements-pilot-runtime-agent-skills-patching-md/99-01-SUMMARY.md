---
phase: 99-runtime-agent-skills-patching
plan: 01
subsystem: skills
tags: [agent_skills, runtime-patching, gsd-config, sqlite, vitest]

# Dependency graph
requires:
  - phase: 65-gsd-config-pre-seeding-for-autonomous-execution
    provides: lock-safe atomic `.planning/config.json` mutation patterns
  - phase: 69-model-system-agent-frontmatter-patching
    provides: discovered `gsd-*.md` targeting patterns for installed agents
  - phase: 74-required-categories-on-pilot-add
    provides: project-local JIT skill installation under `.opencode/skill`
provides:
  - Job-scoped runtime skill snapshot persistence on Pilot jobs
  - Shared `mutatePlanningConfig()` for safe runtime config patching
  - Deterministic apply/restore helper for per-job `agent_skills`
affects: [runner, info, runtime-skills]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Persist runtime skill injection metadata as structured job JSON"
    - "Mutate `.planning/config.json` through a shared lock-safe atomic helper"
    - "Build runtime `agent_skills` only from discovered agents and real installed skill directories"

key-files:
  created:
    - src/core/runtime-agent-skills.ts
    - test/core/runtime-agent-skills.test.ts
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - test/core/db.test.ts
    - src/core/gsd-config.ts

key-decisions:
  - "Runtime skill snapshots persist categories, selected skills, invalid skills, merged agent maps, and restore state on the job row"
  - "Runtime config writes reuse a single mutatePlanningConfig() lock+tmp-file flow instead of duplicating runner-side JSON mutation"
  - "Pilot merges user-defined agent skill arrays first, appends normalized project-local skill paths second, and restores the exact pre-run block afterward"

patterns-established:
  - "Runtime skill patch handles capture previous `agent_skills` state plus whether the key originally existed"
  - "Invalid or missing skill directories are reported by skill name and skipped without blocking execution"

requirements-completed: [ASKILL-01, ASKILL-02, ASKILL-05]

# Metrics
duration: 3 min
completed: 2026-03-26
---

# Phase 99 Plan 01: Runtime Agent Skills Foundation Summary

**Runtime `agent_skills` now persist on jobs, patch `.planning/config.json` through a shared atomic helper, and apply/restore deterministic per-agent skill maps from real project-local skill directories.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T15:24:30Z
- **Completed:** 2026-03-26T15:27:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `RuntimeAgentSkillsSnapshot` to the job contract and database layer, including nullable persistence and backward-compatible parsing for older rows.
- Added `mutatePlanningConfig()` so runtime config writes reuse the same proper-lockfile plus tmp-file atomic mutation path as autonomous config seeding.
- Added `applyRuntimeAgentSkillsPatch()` and `restoreRuntimeAgentSkillsPatch()` to discover allowlisted `gsd-*` agents, merge user and Pilot skill paths deterministically, skip invalid directories safely, and restore exact prior config state.
- Added focused unit coverage for snapshot round-tripping, null clearing, merge behavior, invalid skill rejection, no-op apply cases, and exact restore behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add runtime skill snapshot persistence contracts per D-02 and D-09** - `a2c1d55` (feat)
2. **Task 2: Create the runtime agent_skills apply/restore helper per D-04 through D-08** - `f44f8ac` (feat)

## Files Created/Modified

- `src/core/types.ts` - Adds the persisted runtime snapshot contract and job field.
- `src/core/db.ts` - Stores, parses, migrates, and updates runtime skill snapshot JSON on jobs.
- `test/core/db.test.ts` - Covers snapshot round-trip, null clearing, and backward-compatible reads.
- `src/core/gsd-config.ts` - Exposes shared lock-safe config mutation for runtime patching.
- `src/core/runtime-agent-skills.ts` - Builds, applies, and restores runtime `agent_skills` maps from installed skill paths.
- `test/core/runtime-agent-skills.test.ts` - Verifies merge policy, invalid path filtering, no-op behavior, and exact restore.

## Decisions Made

- Persisted runtime skill injection as a structured job snapshot instead of transient logs so later runner and info surfaces can inspect applied categories, selected skills, invalid skills, agent maps, and restore outcome.
- Reused the existing config lock and atomic write pattern through `mutatePlanningConfig()` so all runtime `.planning/config.json` changes share one safe mutation primitive.
- Scoped runtime delivery to discovered allowlisted `gsd-*` agents and project-local `.opencode/skill/<name>` directories so Pilot does not rely on global skill locations or write broken paths.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The task files already contained the planned implementation changes in the working tree when execution began, so execution focused on validating acceptance criteria and committing the task-complete state atomically.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runner integration can now apply and restore runtime `agent_skills` using a persisted snapshot handle and shared config mutation helper.
- Operator-facing introspection can read `runtimeSkillSnapshot` from jobs without adding new storage plumbing.
- Ready for `99-02-PLAN.md`.

## Self-Check: PASSED

- Summary file exists on disk.
- Task commit `a2c1d55` exists in git history.
- Task commit `f44f8ac` exists in git history.

---
*Phase: 99-runtime-agent-skills-patching*
*Completed: 2026-03-26*
