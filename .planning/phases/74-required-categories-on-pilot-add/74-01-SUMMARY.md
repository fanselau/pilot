---
phase: 74-required-categories-on-pilot-add
plan: 01
subsystem: skills
tags: [skills, manifest, categories, database, types]

requires:
  - phase: 37-skills-system
    provides: Original skills system (addSkill, injectSkills, syncManifest)
provides:
  - CATEGORY_INFO constant with 15 category descriptions
  - Expanded PREDEFINED_CATEGORIES (15 total with deployment, accessibility, architecture)
  - Manifest-only skill registry (registerSkill, unregisterSkill, formatCategoryHelp)
  - Project.defaultCategories field + DB migration
  - New SkillRef { repo, skill, categories } catalog format
affects: [commands/add, commands/skills, commands/setup, runner]

tech-stack:
  added: []
  patterns:
    - "Manifest-only skill registry — no local file cache, no git clone"
    - "SkillRef uses { repo, skill } instead of { install } for monorepo disambiguation"
    - "Backward compat migration in loadManifest() for old source/path entries"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/skills.ts
    - src/core/default-skills.ts

key-decisions:
  - "SkillEntry uses repo+skill fields instead of source+path — supports monorepo skill disambiguation"
  - "loadManifest() auto-migrates old format entries to new shape on read"
  - "installSkillsForJob() uses dynamic import for execa to avoid top-level dependency"
  - "cleanupInstalledSkills() replaces cleanupInjectedSkills() — removes .opencode/skill/ entirely"

patterns-established:
  - "Manifest-only skill registry: no git clone, no filesystem scanning, no local cache"
  - "CATEGORY_INFO alongside PREDEFINED_CATEGORIES for self-documenting category help"

requirements-completed: []

duration: 4min
completed: 2026-03-20
---

# Phase 74 Plan 01: Foundation Summary

**Manifest-only skill registry with CATEGORY_INFO, expanded 15-category PREDEFINED_CATEGORIES, SkillEntry repo+skill shape, Project.defaultCategories DB column, and SkillRef { repo, skill } catalog format**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T16:23:41Z
- **Completed:** 2026-03-20T16:27:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rewrote SkillEntry interface: replaced source/path with repo/skill for manifest-only architecture
- Added CATEGORY_INFO constant with descriptions for all 15 predefined categories (3 new: deployment, accessibility, architecture)
- Rewrote skills.ts: removed addSkill/syncManifest/injectSkills/cleanupInjectedSkills/parseFrontmatter; added registerSkill/unregisterSkill/formatCategoryHelp
- Added Project.defaultCategories field with DB migration and updateProjectDefaultCategories()
- Converted default-skills.ts catalog from {install} to {repo, skill} format; removed bootstrapDefaultSkills/runWithConcurrency

## Task Commits

Each task was committed atomically:

1. **Task 1: Types + DB** - `223b720` (feat)
2. **Task 2: Rewrite skills.ts + default-skills.ts** - `8fb54e5` (feat)

## Files Created/Modified
- `src/core/types.ts` - SkillEntry repo+skill shape, Project.defaultCategories
- `src/core/db.ts` - ProjectRow.default_categories, rowToProject update, migration, updateProjectDefaultCategories()
- `src/core/skills.ts` - Full rewrite: manifest-only registry with CATEGORY_INFO, register/unregister/formatCategoryHelp
- `src/core/default-skills.ts` - SkillRef { repo, skill } format, removed bootstrapDefaultSkills/runWithConcurrency

## Decisions Made
- SkillEntry uses repo+skill fields instead of source+path — supports monorepo skill disambiguation
- loadManifest() auto-migrates old format entries to new shape on read (backward compat)
- installSkillsForJob() uses dynamic import for execa to avoid top-level dependency issues
- cleanupInstalledSkills() replaces cleanupInjectedSkills() — removes .opencode/skill/ entirely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation types, constants, DB schema, and core module rewrites are complete
- Downstream consumers (runner.ts, commands/skills.ts, commands/setup.ts, commands/add.ts) have expected compile errors that Wave 2 plans will fix
- Ready for 74-02 (add command enforcement) and subsequent plans

---
*Phase: 74-required-categories-on-pilot-add*
*Completed: 2026-03-20*
