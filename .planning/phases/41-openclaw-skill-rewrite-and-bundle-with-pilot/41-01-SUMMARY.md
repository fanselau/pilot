---
phase: 41-openclaw-skill-rewrite-and-bundle-with-pilot
plan: 01
subsystem: docs
tags: [openclaw, skill, cli-reference, orchestration]

# Dependency graph
requires:
  - phase: 37-skills-system
    provides: Skills CLI commands and injection system
  - phase: 38-hardening
    provides: Stable CLI surface and commands
provides:
  - Complete portable SKILL.md for OpenClaw agents to operate Pilot as CTO
affects: [41-02 (installOpenClawSkill module + wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenClaw skill files in skills/ directory for npm bundling"

key-files:
  created:
    - skills/openclaw-pilot/SKILL.md
  modified: []

key-decisions:
  - "Removed all hardcoded paths, delegation AI internals, and infrastructure table from old skill"
  - "Used plain agent IDs (e.g. main) throughout, not session key format"
  - "Structured as CTO playbook with role framing, not developer reference"
  - "Quick reference table placed at end, not beginning"

patterns-established:
  - "Skill files bundled in skills/ directory at repo root for npm distribution"

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 41 Plan 01: Write Complete SKILL.md Summary

**Portable OpenClaw pilot-pipeline skill with CTO role framing, all commands/flags documented, provider modes, quality profiles, categories, and troubleshooting guide — 461 lines, zero hardcoded paths**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T12:39:52Z
- **Completed:** 2026-03-06T12:41:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Complete SKILL.md rewrite with 11 major sections covering all Pilot CLI capabilities
- CTO role framing that teaches agents to orchestrate, never code directly
- Provider modes, quality profiles, and categories system fully documented with examples
- No machine-specific content — ready for npm bundling

## Task Commits

Each task was committed atomically:

1. **Task 1: Write complete SKILL.md for OpenClaw pilot-pipeline skill** - `6eb480e` (docs)

## Files Created/Modified
- `skills/openclaw-pilot/SKILL.md` - Complete OpenClaw skill for pilot pipeline orchestration (461 lines)

## Decisions Made
- Removed all hardcoded paths (`/home/luca/...`), PATH export, infrastructure table, deprecated commands section, and delegation AI internals from the old skill
- Used `~/dev/myapp` as example project path and `main` as example agent ID throughout for portability
- Structured document as CTO playbook with explicit "Your Role" section and golden rule about never writing code
- Placed Quick Reference command table at the end as a lookup aid, not a primary teaching tool

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SKILL.md is complete and ready for Plan 41-02 which will create `installOpenClawSkill()` module, wire into init/update, and update package.json files array
- No blockers

---
*Phase: 41-openclaw-skill-rewrite-and-bundle-with-pilot*
*Completed: 2026-03-06*
