---
phase: 47-agents-md-integration
plan: 02
subsystem: cli
tags: [agents-md, doctor, lessons, health-check, haiku-tier]

# Dependency graph
requires:
  - phase: 47-agents-md-integration
    plan: 01
    provides: "agents-md.ts module with checkAgentsMdExists + spawnAgentsMdSession"
provides:
  - "Doctor AGENTS.md health check (project-level AI + system-level file coverage)"
  - "pilot lessons command for build learning extraction"
  - "--skip-agents flag for doctor"
affects: [47-03 tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import of agents-md.ts in doctor for lazy loading"
    - "System-level doctor uses lightweight file-existence checks (no AI)"
    - "Project-level doctor uses AI-powered drift detection with 90s timeout"

key-files:
  created:
    - src/commands/lessons.ts
  modified:
    - src/commands/doctor.ts
    - src/index.ts

key-decisions:
  - "AGENTS.md checks use only warn/pass — never fail — doctor exit code unaffected"
  - "System-level doctor enumerates projects for AGENTS.md coverage (file-only, no AI spawn)"
  - "Project-level doctor spawns AI drift detection only in --project mode"
  - "Dynamic import pattern for agents-md.ts in doctor — avoids loading at startup"
  - "Lessons command defaults to process.cwd() matching requirements"
  - "Lessons continues even without AGENTS.md — can still extract and print lessons"

patterns-established:
  - "Warn-only AGENTS.md integration: AI-powered features degrade gracefully to warnings"
  - "Dual-level doctor checks: lightweight for system, AI-powered for specific project"

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 47 Plan 02: Doctor AGENTS.md Health Check + Pilot Lessons Command Summary

**AI-powered AGENTS.md drift detection in doctor (haiku-tier, warn-only, 90s timeout) + new pilot lessons command for build learning extraction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T11:02:22Z
- **Completed:** 2026-03-08T11:06:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added AGENTS.md health check to `pilot doctor --project` — AI-powered drift detection via spawnAgentsMdSession with 90s timeout, haiku-tier model (cheapest via judge/budget resolution)
- Added AGENTS.md coverage summary to system-level doctor — lightweight file-existence check across registered projects, no AI spawn
- Created `pilot lessons [project]` command — defaults to cwd, handles missing .planning/ (exit 0), prints lesson candidates on success, supports JSON mode
- Added `--skip-agents` flag to doctor to bypass all AGENTS.md checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AGENTS.md health check to doctor + --skip-agents flag** - `831c6b8` (feat)
2. **Task 2: Create pilot lessons command + register in index.ts** - `561b1c4` (feat)

## Files Created/Modified
- `src/commands/doctor.ts` — Added AGENTS.md health check section in projectHealthCheck (AI drift detection) and systemHealthCheck (file coverage summary), updated signatures to accept skipAgents
- `src/commands/lessons.ts` — New command: lessonsCommand with cwd default, .planning/ check, session spawning, JSON mode
- `src/index.ts` — Registered lessons command with dynamic import, added --skip-agents option to doctor

## Decisions Made
- AGENTS.md checks use warn/pass only — never fail — ensures doctor exit code is unaffected by AGENTS.md status
- System-level doctor does lightweight file-existence check across registered projects (no AI spawn) to avoid slow system doctor
- Project-level doctor spawns AI drift detection only when --project <path> specified (bounded time)
- Dynamic import for agents-md.ts in doctor — avoids loading the module at startup when it's not needed
- Lessons command defaults to process.cwd() when project argument omitted
- Lessons extraction continues even without AGENTS.md — lessons can still be printed for manual review
- GSD commands stubbed with TODO comments per requirements (gsd-setup-agents check, gsd-lessons)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Doctor AGENTS.md health check ready for testing in Plan 03
- Lessons command ready for testing in Plan 03
- All 769 existing tests continue to pass
- GSD command stubs ready to be replaced when pilot-gsd commands are available

---
*Phase: 47-agents-md-integration*
*Completed: 2026-03-08*
