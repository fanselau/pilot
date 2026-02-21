---
phase: 05-integration-fixes
plan: 01
subsystem: setup
tags: [opencode, symlinks, config-validation, lstat, backward-compat]

# Dependency graph
requires:
  - phase: 01-05
    provides: Original setup.ts with symlink creation
  - phase: 12-02
    provides: opencode.json format and opencode binary references
provides:
  - Real-file detection for .opencode/ directory entries
  - Legacy claude.json detection to avoid overwriting
  - Correct opencode.json format matching spawn.ts validateConfig()
affects: [05-04, e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lstat for symlink vs real directory detection"
    - "Legacy config detection before creating new config"

key-files:
  created: []
  modified:
    - src/core/setup.ts

key-decisions:
  - "Use lstat to distinguish symlinks from real directories before creating symlinks"
  - "Skip opencode.json creation if legacy claude.json exists (backward compat)"

patterns-established:
  - "Real-file safety: warn instead of overwrite when .opencode/ contains real dirs"

# Metrics
duration: 1min
completed: 2026-02-21
---

# Phase 5 Plan 1: Fix setup .opencode/ symlinks + opencode.json format Summary

**Added lstat real-file detection and claude.json legacy check to setup.ts — prevents data loss on re-setup and respects legacy configs**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-21T10:20:56Z
- **Completed:** 2026-02-21T10:22:09Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `lstat` import and real-directory detection before symlink creation — warns if `.opencode/` subdirs are real directories instead of silently overwriting
- Added `claude.json` legacy detection — skips `opencode.json` creation if legacy config exists
- Verified `opencode.json` format already matches `spawn.ts:validateConfig()` expectations (from Phase 12 fix)
- Confirmed all `.claude` references already replaced with `.opencode` (from Phase 12 fix)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite core/setup.ts — .opencode/ directory, opencode.json, real-file detection** - `7bf4a4a` (fix)
2. **Task 2: Update commands/setup.ts references from .claude to .opencode** - No changes needed (file already clean)

## Files Created/Modified
- `src/core/setup.ts` - Added lstat import, real-file detection for symlink paths, claude.json legacy detection

## Decisions Made
- Use `lstat()` to distinguish symlinks from real directories before creating symlinks — `isSymbolicLink()` check prevents data loss
- Skip `opencode.json` creation if legacy `claude.json` exists — backward compatibility without overwriting user configs

## Deviations from Plan

None — plan executed exactly as written. The IMPORTANT CONTEXT note correctly identified that most changes (`.claude` → `.opencode` rename, correct `opencode.json` format) were already done in Phase 12. This plan added the remaining real-file detection and legacy config checks.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Setup module complete with all safety checks
- Ready for 05-02-PLAN.md (fix status: skip queue runner PID, fast stuck scoring)
- No blockers

---
*Phase: 05-integration-fixes*
*Completed: 2026-02-21*
