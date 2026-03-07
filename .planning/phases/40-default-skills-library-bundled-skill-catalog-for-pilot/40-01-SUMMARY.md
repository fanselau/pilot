---
phase: 40-default-skills-library
plan: 01
subsystem: skills
tags: [skills, marketplace, npx, execa, stack-detection, bootstrap]

# Dependency graph
requires:
  - phase: 37-skills-system
    provides: skills.ts (addSkill, tagSkill, syncManifest, manifest I/O)
provides:
  - TIER1_SKILLS constant (5 universal coding skills)
  - STACK_SKILLS constant (11 stack keys → marketplace skills)
  - detectProjectStack() filesystem-based stack detection
  - recommendDefaultSkills() deduplicated recommendation builder
  - bootstrapDefaultSkills() non-fatal npx skills install orchestrator
affects: [40-02 CLI commands, 40-03 setup integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Marketplace install via execa npx skills install (not addSkill/GitHub clone)"
    - "Stack detection from root-level filesystem signals only"
    - "Non-fatal bootstrap: continue on per-item failure, structured BootstrapResult"

key-files:
  created:
    - src/core/default-skills.ts
    - test/core/default-skills.test.ts
  modified: []

key-decisions:
  - "Dedicated default-skills.ts module to keep skills.ts from growing monolithic"
  - "findSkillNameByInstall heuristic to map install IDs to manifest names after npx install"
  - "syncManifest called after each successful install + once final for full consistency"

patterns-established:
  - "SkillRef type for marketplace identifiers (install + categories)"
  - "DetectedStack with items[] + signals{} for transparent detection reporting"

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 40 Plan 01: Default Skills Catalog Foundation Summary

**Curated skill catalog with 5 Tier 1 + 11 stack-keyed Tier 2 entries, filesystem stack detection, recommendation deduplication, and non-fatal bootstrap via `npx skills install`**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T14:39:04Z
- **Completed:** 2026-03-06T14:42:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/core/default-skills.ts` with TIER1_SKILLS (5 universal skills), STACK_SKILLS (11 stack keys), types, detection, recommendation, and bootstrap
- `detectProjectStack` scans package.json deps, tsconfig.json, wrangler.toml/json, prisma/schema.prisma, drizzle configs for stack signals
- `recommendDefaultSkills` returns deduplicated union of Tier 1 + detected Tier 2 with tier filtering support
- `bootstrapDefaultSkills` orchestrates non-fatal installation via execa `npx skills install`, calls syncManifest + tagSkill per install
- 41 comprehensive unit tests covering catalog constants, detection signals, recommendation logic, and bootstrap success/failure paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/core/default-skills.ts** - `6cb50fa` (feat)
2. **Task 2: Create test/core/default-skills.test.ts** - `09f3e0a` (test)

## Files Created/Modified

- `src/core/default-skills.ts` — Catalog constants, stack detection, recommendation builder, bootstrap orchestrator (248 lines)
- `test/core/default-skills.test.ts` — Comprehensive unit tests for all exports (557 lines)

## Decisions Made

- **Separate default-skills.ts module**: Keeps skills.ts focused on library CRUD; default-skills.ts owns catalog and bootstrap concerns
- **findSkillNameByInstall heuristic**: After `npx skills install author/skill-name`, the installed directory name may differ from the install ID; this heuristic maps install IDs to manifest names via the skill-name suffix
- **syncManifest per install + final**: Each successful install gets its own syncManifest call so tagSkill can find the new entry, plus a final sync for consistency

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Core foundation ready for 40-02 (CLI commands: `pilot skills bootstrap` + `pilot skills recommend`)
- Core foundation ready for 40-03 (setup integration: post-setup skill offer)
- Both 40-02 and 40-03 can proceed in parallel (Wave 2)

---
*Phase: 40-default-skills-library*
*Completed: 2026-03-06*
