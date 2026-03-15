---
phase: 65-gsd-config-pre-seeding-for-autonomous-execution
plan: 03
subsystem: infra
tags: [runner, gsd-config, autonomous, lifecycle, vitest]

# Dependency graph
requires:
  - phase: 65-01
    provides: centralized ensureAutonomousGsdConfig helper with lock-safe atomic config writes
provides:
  - runner-level autonomous config assertion before every spawned command session
  - explicit post-new-project config reapply hook for recreated .planning flows
  - regression coverage for assertion ordering, lifecycle reapply, and failure handling
affects: [runner, phase-execution, setup-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runner spawn paths enforce autonomous config via shared helper before every opencode launch"
    - "new-project lifecycle steps immediately reapply config before continuing downstream commands"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - test/core/runner-recovery.test.ts

key-decisions:
  - "Place runtime config assertion inside spawnAndWait so every command path shares the same enforcement point"
  - "Reapply config immediately after successful new-project steps to repair .planning recreation before subsequent steps"
  - "Use runner-recovery tests with mocked gsd-config helper and call-order assertions to verify pre-spawn enforcement and failure safety"

patterns-established:
  - "Pattern: centralized helper enforcement in runner runtime boundaries (not duplicated merge logic)"
  - "Pattern: lifecycle coordination hooks for steps that can recreate planning artifacts"

# Metrics
duration: 6 min
completed: 2026-03-15
---

# Phase 65 Plan 03: Runtime Config Assertion and Lifecycle Reapply Summary

**Runner execution now self-heals autonomous GSD config on every spawn and after new-project lifecycle steps, preventing interactive drift from stalling headless jobs.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-15T21:14:55Z
- **Completed:** 2026-03-15T21:21:18Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Integrated `ensureAutonomousGsdConfig(cwd)` into `spawnAndWait()` so every runner-spawned command path (including judge/verify/pilot-prefixed commands) asserts autonomous config before process launch
- Added a post-`new-project` lifecycle reapply hook in the step loop, ensuring `.planning` recreation flows are repaired before subsequent steps continue
- Extended runner recovery tests to verify helper call ordering before spawn, post-new-project reapply behavior, and failure-path handling when config assertion throws

## Task Commits

Each task was committed atomically:

1. **Task 1: Add runner pre-spawn autonomous config assertion** - `c29d30f` (feat)
2. **Task 2: Add explicit post-new-project config reapply hook** - `05ed6f2` (feat)
3. **Task 3: Add regression tests for assertion/reapply/failure paths** - `9f069aa` (test)

## Files Created/Modified

- `src/core/runner.ts` - Runtime enforcement of autonomous config before spawn plus lifecycle reapply after `new-project`
- `test/core/runner-recovery.test.ts` - Helper-aware regression tests for call ordering, reapply semantics, and assertion failure behavior

## Decisions Made

- Kept config enforcement fully centralized in `ensureAutonomousGsdConfig` and invoked it from runner integration points instead of duplicating merge or write logic in `runner.ts`
- Added a narrow lifecycle hook only for `new-project` step completion because this is the path that can regenerate `.planning` and invalidate previously seeded config
- Validated pre-spawn behavior via mocked helper call-order assertions against opencode spawn calls rather than real process polling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bun CLI unavailable in execution environment**
- **Found during:** Task 1, Task 2, and Task 3 verification
- **Issue:** Required verification commands using `bun` were unavailable (`bun: command not found`)
- **Fix:** Used environment-equivalent fallback commands: `npm run build` and `npx vitest run test/core/runner-recovery.test.ts`
- **Files modified:** None
- **Verification:** Build and focused runner recovery tests passed with equivalent command coverage
- **Committed in:** N/A (execution-environment fallback)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; fallback commands provided equivalent verification.

## Issues Encountered

- `bun` was unavailable in this environment; verification was completed with npm/vitest equivalents.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime config assertion and lifecycle reapply behavior are now implemented and regression-tested
- Runner now protects autonomous execution from config drift and `.planning` recreation paths
- Remaining Phase 65 work is ready to continue with `65-02-PLAN.md`

---
*Phase: 65-gsd-config-pre-seeding-for-autonomous-execution*
*Completed: 2026-03-15*
