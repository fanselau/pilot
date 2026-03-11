---
phase: 55-shell-runtime-toolchain-exposure
plan: 02
subsystem: infra
tags: [doctor, setup, shell-exposure, symlink, PATH, ~/.local/bin]

# Dependency graph
requires:
  - phase: 55-shell-runtime-toolchain-exposure
    provides: ensureShellExposure/verifyShellExposure primitives from plan 01
provides:
  - Shell exposure health checks in pilot doctor (shell: pilot/node/pnpm/fnm)
  - Automatic launcher creation/refresh in pilot setup
affects: [service-install, doctor-output, setup-refresh]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for optional shell-exposure integration — graceful degradation"
    - "Best-effort step pattern — shell exposure errors never block setup"

key-files:
  created: []
  modified:
    - src/commands/doctor.ts
    - src/core/setup.ts
    - test/commands/doctor.test.ts
    - test/core/setup.test.ts

key-decisions:
  - "Shell exposure checks use warn (not fail) — missing launchers don't prevent pilot from working"
  - "fnm exclusion surfaced as informational pass note in doctor output"
  - "Shell exposure is best-effort in setup — failures reported but never block setup"
  - "Setup tests mock shell-exposure to prevent real binary resolution in test environment"

patterns-established:
  - "Best-effort integration step: try/catch around optional module, errors go to result.errors"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 55 Plan 02: Doctor + Setup Integration Summary

**Wired shell-exposure into pilot doctor (4 health checks: pilot/node/pnpm/fnm) and pilot setup (automatic launcher creation/refresh as step 8)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T17:33:11Z
- **Completed:** 2026-03-11T17:36:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- pilot doctor now reports shell: pilot, shell: node, shell: pnpm checks with pass/warn status
- fnm exclusion explicitly surfaced as informational pass note in doctor output
- pilot setup creates/refreshes stable launchers via ensureShellExposure() as step 8
- 5 new doctor tests + setup test mock isolation for shell-exposure module

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shell exposure health checks to pilot doctor** — `332d1d8` (feat)
2. **Task 2: Wire ensureShellExposure into setup flow** — `828a7df` (feat)

## Files Created/Modified
- `src/commands/doctor.ts` — Added shell exposure health check section with verifyShellExposure() + fnm note
- `src/core/setup.ts` — Added step 8: ensureShellExposure() in setupProject(), best-effort
- `test/commands/doctor.test.ts` — 5 new tests: pass, warn, multi-fail, module error, fnm note
- `test/core/setup.test.ts` — Added shell-exposure mock to prevent real binary resolution

## Decisions Made
- **warn not fail for missing exposure:** Shell exposure is a convenience for plain-shell callers, not a hard requirement for pilot operation
- **fnm as pass note:** Making the fnm exclusion decision visible and explicit in doctor output satisfies PATH hygiene/truthfulness
- **Best-effort in setup:** Shell exposure failures go to result.errors but never prevent setup from completing
- **Mock in setup tests:** Real filesystem setup tests need shell-exposure mocked because resolveToolBinary can't find binaries in test temp dirs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added shell-exposure mock to setup.test.ts**
- **Found during:** Task 2 (Wire ensureShellExposure into setup flow)
- **Issue:** 6 existing setup tests failed because ensureShellExposure() tried to resolve real binaries (via execSync which/import.meta.url) in temp test directories
- **Fix:** Added vi.mock for shell-exposure.js in setup.test.ts returning pass findings
- **Files modified:** test/core/setup.test.ts
- **Verification:** All 11 setup tests pass, all 917 tests pass
- **Committed in:** 828a7df (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test isolation fix necessary for correct operation. No scope creep.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 55 complete — all shell exposure functionality operational
- pilot doctor reports shell exposure status for pilot, node, pnpm with fnm exclusion note
- pilot setup automatically maintains stable launchers in ~/.local/bin
- bash -lc and sh -lc resolve pilot, node, pnpm after setup

---
*Phase: 55-shell-runtime-toolchain-exposure*
*Completed: 2026-03-11*
