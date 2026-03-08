---
phase: 47-agents-md-integration
plan: 01
subsystem: cli
tags: [agents-md, opencode-session, execa, readline, tty]

# Dependency graph
requires:
  - phase: 46-dynamic-model-configuration
    provides: resolveTopLevelModel with DB-backed model resolution
provides:
  - "src/core/agents-md.ts — shared session spawning + AGENTS.md helpers"
  - "setup.ts AGENTS.md generation prompt after skill bootstrap"
affects: [47-02 doctor health check, 47-02 pilot lessons command, 47-03 tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Budget AI session spawning via judge/budget scope resolution"
    - "TTY-aware interactive prompt pattern for optional features"

key-files:
  created:
    - src/core/agents-md.ts
  modified:
    - src/commands/setup.ts

key-decisions:
  - "judge/budget scope for cheapest model — AGENTS.md operations don't need expensive AI"
  - "extractLastAssistantContent is private — internal helper, not a public export"
  - "Separate try/catch block for AGENTS.md section — isolation from skill bootstrap errors"

patterns-established:
  - "spawnAgentsMdSession: reusable opencode session spawner for AGENTS.md features"
  - "Non-fatal optional feature: try/catch wrapping ensures setup never fails due to optional features"

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 47 Plan 01: Core AGENTS.md Module + Setup Prompt Summary

**Shared AGENTS.md session spawning infrastructure (agents-md.ts) + opt-in AGENTS.md generation prompt in pilot setup with TTY/JSON guards**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T10:56:16Z
- **Completed:** 2026-03-08T10:58:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `src/core/agents-md.ts` with `checkAgentsMdExists()` and `spawnAgentsMdSession()` — reusable session spawning for all three AGENTS.md features (setup, doctor, lessons)
- Added AGENTS.md generation prompt to `pilot setup` after skill bootstrap — TTY guard, JSON mode guard, non-fatal error handling
- GSD commands stubbed with TODO comments per requirements (gsd-setup-agents and gsd-lessons don't exist yet)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/core/agents-md.ts** - `293e7e1` (feat)
2. **Task 2: Add AGENTS.md prompt to setup** - `3b0314a` (feat)

## Files Created/Modified
- `src/core/agents-md.ts` — Shared AGENTS.md session helpers: checkAgentsMdExists, spawnAgentsMdSession, extractLastAssistantContent
- `src/commands/setup.ts` — Added AGENTS.md generation prompt section after skill bootstrap

## Decisions Made
- judge/budget scope for model resolution — AGENTS.md operations use cheapest available model (haiku-tier)
- extractLastAssistantContent kept as private helper — only spawnAgentsMdSession needs it
- Separate try/catch for AGENTS.md section in setup.ts — isolates from skill bootstrap errors and from config init
- agentsAnswer variable name avoids collision with existing `answer` in skill prompt scope

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- agents-md.ts module ready for consumption by Plan 02 (doctor health check + pilot lessons command)
- spawnAgentsMdSession pattern established for doctor and lessons features
- All 769 existing tests continue to pass

---
*Phase: 47-agents-md-integration*
*Completed: 2026-03-08*
