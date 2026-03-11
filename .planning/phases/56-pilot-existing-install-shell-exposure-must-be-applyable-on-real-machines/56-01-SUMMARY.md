---
phase: 56-pilot-existing-install-shell-exposure-must-be-applyable-on-real-machines
plan: 01
subsystem: infra
tags: [doctor, shell-exposure, symlink, PATH, ~/.local/bin, --fix, repair]

# Dependency graph
requires:
  - phase: 55-shell-runtime-toolchain-exposure
    provides: ensureShellExposure/verifyShellExposure primitives, doctor shell checks, setup integration
provides:
  - pilot doctor --fix for repairing shell exposure on existing installations
  - Updated repair hints pointing to pilot doctor --fix instead of pilot setup --refresh
  - Idempotent shell exposure repair without requiring a project directory
affects: [doctor-output, shell-exposure-hints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional --fix repair: verify first, only call ensureShellExposure when issues detected"
    - "Status mapping: created/refreshed → pass with Fixed prefix, fail → warn with Failed prefix"

key-files:
  created: []
  modified:
    - src/commands/doctor.ts
    - src/index.ts
    - src/core/shell-exposure.ts
    - test/commands/doctor.test.ts
    - test/core/shell-exposure.test.ts

key-decisions:
  - "--fix only runs ensureShellExposure when verify detects non-pass findings — idempotent by design"
  - "Repair hints changed from 'pilot setup --refresh' to 'pilot doctor --fix' in doctor.ts and shell-exposure.ts"
  - "Setup.ts repair hints left unchanged — those are about project-scoped setup, not system-level repair"

patterns-established:
  - "Conditional fix pattern: verify → check for issues → fix only if needed → show Fixed/Failed results"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 56 Plan 01: Doctor --fix Shell Exposure Repair Summary

**Added `pilot doctor --fix` to repair shell exposure on existing installations — idempotent symlink creation/refresh in ~/.local/bin without requiring a project directory**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T23:04:54Z
- **Completed:** 2026-03-11T23:08:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `pilot doctor --fix` creates/refreshes stable launchers when shell exposure issues detected
- `pilot doctor` (without --fix) shows `pilot doctor --fix` as the repair hint for broken exposure
- 4 new tests cover: fix with issues, fix without issues, partial failure, verify-only hint
- All 921 tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --fix flag to doctor command with shell exposure repair** — `0b0b32e` (feat)
2. **Task 2: Add tests for doctor --fix shell exposure repair** — `e9d8082` (test)

## Files Created/Modified
- `src/commands/doctor.ts` — Added fix param to doctorCommand/systemHealthCheck, conditional ensureShellExposure call, summary output
- `src/index.ts` — Added --fix option to doctor command CLI registration
- `src/core/shell-exposure.ts` — Updated verify failure hint from 'pilot setup --refresh' to 'pilot doctor --fix'
- `test/commands/doctor.test.ts` — 4 new tests + updated mock to export ensureShellExposure + hint text updates
- `test/core/shell-exposure.test.ts` — Updated assertion to match new 'pilot doctor --fix' hint text

## Decisions Made
- **--fix is conditional:** Only calls ensureShellExposure when verify detects issues — running twice is truly idempotent (second run verifies all pass, skips ensure)
- **Repair hints scoped:** Only doctor.ts and shell-exposure.ts hints changed to `pilot doctor --fix`; setup.ts references left as-is (project-scoped)
- **Fix status mapping:** created/refreshed → pass with 'Fixed' prefix for clear operator feedback; fail → warn with 'Failed to fix'

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated shell-exposure.test.ts to match new hint text**
- **Found during:** Task 2 (test verification)
- **Issue:** test/core/shell-exposure.test.ts still asserted the old 'pilot setup --refresh' hint text after shell-exposure.ts was changed in Task 1
- **Fix:** Changed assertion from 'pilot setup --refresh' to 'pilot doctor --fix'
- **Files modified:** test/core/shell-exposure.test.ts
- **Verification:** All 921 tests pass
- **Committed in:** e9d8082 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test assertion fix necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 56 complete — `pilot doctor --fix` provides system-level shell exposure repair
- Existing installations can now run `pilot doctor --fix` to create/refresh stable launchers
- `pilot doctor` detects issues and prints the exact repair command

---
*Phase: 56-pilot-existing-install-shell-exposure-must-be-applyable-on-real-machines*
*Completed: 2026-03-11*
