---
phase: 41-openclaw-skill-rewrite-and-bundle-with-pilot
plan: 02
subsystem: cli
tags: [openclaw, skill-install, init, update, npm-distribution]

# Dependency graph
requires:
  - phase: 41-01
    provides: Bundled SKILL.md at skills/openclaw-pilot/SKILL.md
provides:
  - installOpenClawSkill() function for auto-installing OpenClaw skill
  - pilot init OpenClaw skill integration
  - pilot update OpenClaw skill sync
  - npm package includes skills/ directory
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone module pattern — openclaw-skill.ts has zero pilot core dependencies"
    - "getSkillSourcePath() export for testability of path resolution"

key-files:
  created:
    - src/core/openclaw-skill.ts
    - test/core/openclaw-skill.test.ts
  modified:
    - src/commands/init.ts
    - src/commands/update.ts
    - package.json

key-decisions:
  - "pkgRoot resolves two levels up from import.meta.dirname (core/ → src/dist → root)"
  - "installOpenClawSkill() is standalone — no getConfig() or pilot core imports"
  - "getSkillSourcePath() exported separately for test mocking flexibility"
  - "update.ts only prints on successful install (silent skip when OpenClaw absent)"

patterns-established:
  - "OpenClaw skill install as side-effect of init/update, not a separate command"

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 41 Plan 02: installOpenClawSkill Module + Wiring Summary

**Standalone installOpenClawSkill() module wired into pilot init and update, with npm bundling via package.json files array and 9 tests covering install, skip, overwrite, and path resolution**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T12:44:37Z
- **Completed:** 2026-03-06T12:47:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `installOpenClawSkill()` detects `~/.openclaw/` presence, copies bundled SKILL.md to `~/.openclaw/skills/pilot-pipeline/SKILL.md`
- `pilot init` calls the function after config write and prints success/skip message
- `pilot update` calls the function after git pull, prints only on success
- `package.json` files array includes `"skills"` for npm distribution
- 9 tests covering all behaviors: install, skip, nested dir creation, content match, overwrite, path resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Create openclaw-skill.ts module + update package.json** - `ec28649` (feat)
2. **Task 2: Wire into init.ts and update.ts + add tests** - `0571738` (feat)

## Files Created/Modified
- `src/core/openclaw-skill.ts` - installOpenClawSkill() and getSkillSourcePath() exports
- `test/core/openclaw-skill.test.ts` - 9 tests for OpenClaw skill installation
- `src/commands/init.ts` - Added installOpenClawSkill() call after config write
- `src/commands/update.ts` - Added installOpenClawSkill() call after git pull
- `package.json` - Added "skills" to files array for npm bundling

## Decisions Made
- **pkgRoot two levels up:** `import.meta.dirname` is `src/core/` or `dist/core/`, so need `../..` to reach package root (not `..` as plan suggested)
- **Standalone module:** No dependency on `getConfig()` or any pilot core module — function works during init before config exists
- **Exported getSkillSourcePath():** Allows tests to verify path resolution independently
- **Silent skip in update:** Only prints "OpenClaw skill updated" on success; silent when OpenClaw not present (cleaner output)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pkgRoot resolution depth**
- **Found during:** Task 1 (openclaw-skill.ts creation)
- **Issue:** Plan specified `path.resolve(import.meta.dirname, '..')` but `import.meta.dirname` for files in `src/core/` or `dist/core/` is two levels deep, not one
- **Fix:** Changed to `path.resolve(import.meta.dirname, '..', '..')` to correctly reach package root
- **Files modified:** src/core/openclaw-skill.ts
- **Verification:** getSkillSourcePath() test confirms path resolves to existing file
- **Committed in:** 0571738

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct path resolution. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 41 complete — both plans executed successfully
- OpenClaw skill bundled and auto-installed via pilot init/update
- No blockers

---
*Phase: 41-openclaw-skill-rewrite-and-bundle-with-pilot*
*Completed: 2026-03-06*
