---
phase: 44-qol-introspection-and-queue-grace-period
plan: 02
subsystem: infra
tags: [queue, grace-period, runner, cli, sqlite, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: queueGraceSeconds config and skipGracePeriod schema primitives from 44-01
provides:
  - Queue launch eligibility now enforces minimum queue age by config unless explicitly bypassed
  - `pilot add --start-immediately` stores per-job grace bypass intent with explicit queue-time tradeoff copy
  - Regression coverage for grace wait, age threshold, per-job bypass, global disable, and runner claim wiring
affects: [44-03-shared-why-model, 44-05-tui-grace-visibility, queue-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns: [sqlite epoch-based eligibility gating, explicit fast-start tradeoff messaging at queue time]

key-files:
  created: []
  modified: [src/index.ts, src/commands/add.ts, src/core/db.ts, src/core/runner.ts, test/commands/add.test.ts, test/core/db.test.ts, test/core/runner.test.ts]

key-decisions:
  - "Grace eligibility is enforced directly in claimNextLaunchable with sqlite epoch math to avoid JS timestamp drift"
  - "Add command only sends skipGracePeriod when --start-immediately is chosen so legacy call paths stay stable"
  - "Runner passes queueGraceSeconds from live config into each claim cycle, not as a display-only label"

patterns-established:
  - "Queue safety by default: pending jobs are held until a minimum age unless the operator opts into fast start"
  - "Queue confirmation output communicates launch timing and review-window tradeoffs in plain language"

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 44 Plan 02: Launch Eligibility Grace Gate Summary

**Queue grace now changes real launch eligibility in the runner claim path, while operators can intentionally bypass it per job with `--start-immediately` and explicit speed-vs-safety messaging.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T00:18:36Z
- **Completed:** 2026-03-08T00:23:02Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Added `--start-immediately` to `pilot add` and persisted per-job grace bypass intent via `skipGracePeriod`
- Added queue-time confirmation copy for both default grace wait and immediate-start override paths
- Updated `claimNextLaunchable` to enforce grace-age gating (`skip_grace_period` OR grace disabled OR age threshold met)
- Wired runner dispatch to pass `queueGraceSeconds` into the claim path
- Added deterministic regression tests for fresh/aged/bypass/disabled grace behavior and runner claim wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Add per-job grace override flag and queue confirmation messaging** - `a14af32` (feat)
2. **Task 2: Enforce grace minimum-age gate in claim and runner dispatch** - `608f6ea` (feat)
3. **Task 3: Prove grace scheduling semantics with focused regression cases** - `ec29d38` (test)

## Files Created/Modified

- `src/index.ts` - Added `pilot add --start-immediately` CLI option
- `src/commands/add.ts` - Persisted `skipGracePeriod` override and added grace/immediate queue confirmation copy
- `src/core/db.ts` - Added grace-aware claim SQL condition with sqlite epoch age check
- `src/core/runner.ts` - Passed `queueGraceSeconds` from config into `claimNextLaunchable`
- `test/commands/add.test.ts` - Added assertions for default grace messaging and immediate-start persistence/copy
- `test/core/db.test.ts` - Added deterministic claim-age gate coverage (fresh vs aged vs bypass vs disabled)
- `test/core/runner.test.ts` - Added runner dispatch wiring regression for passing queue grace into claim path

## Decisions Made

- Kept grace eligibility logic inside the existing atomic DB claim transaction so project/dependency/block guards remain unchanged
- Used `strftime('%s','now') - strftime('%s', created_at)` in SQL for deterministic server-side age checks and timezone-safe comparisons
- Kept default add-path DB call shape unchanged by only sending the skip-grace argument when override is explicitly enabled

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed runner wiring test mock contract for dynamic config import**
- **Found during:** Task 3 (runner dispatch regression test)
- **Issue:** New runner test failed because mocked `config` module did not expose `getConfigFileDefaults`, which runner imports during startup checks
- **Fix:** Added `getConfigFileDefaults` to the test mock to match runtime module shape
- **Files modified:** `test/core/runner.test.ts`
- **Verification:** `npx vitest run test/commands/add.test.ts test/core/db.test.ts test/core/runner.test.ts` passes
- **Committed in:** `ec29d38` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking fix only; no scope creep.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Grace launch gating is now real behavior in queue claims, with per-job fast-start override available at queue time
- Operator-facing add output now explains wait-vs-speed tradeoff clearly
- Ready for `44-03-PLAN.md` to add shared reason-model introspection surfaces (`status --why` and `retry --why`)

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
