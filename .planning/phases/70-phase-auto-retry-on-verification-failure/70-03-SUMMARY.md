---
phase: 70-phase-auto-retry-on-verification-failure
plan: 03
subsystem: cli
tags: [commander, config, retry-budget, add-command, vitest]

# Dependency graph
requires:
  - phase: 70-phase-auto-retry-on-verification-failure
    provides: retry metadata persistence defaults and addJob retry_budget support
provides:
  - config-level retry budget parsing via defaults.retry_budget with fallback 2
  - queue-time retry budget controls via pilot add --retries / --no-retry
  - CLI wiring for pilot log --chain flag acceptance
affects: [phase-70-04-log-chain]

# Tech tracking
tech-stack:
  added: []
  patterns: ["retry budget precedence resolution", "config snake_case with compatibility alias"]

key-files:
  created: [.planning/phases/70-phase-auto-retry-on-verification-failure/70-03-SUMMARY.md]
  modified: [src/core/config.ts, src/core/types.ts, src/commands/add.ts, src/index.ts, test/core/config.test.ts, test/commands/add.test.ts]

key-decisions:
  - "Retry budget precedence is explicit --retries > --no-retry (0) > config retryBudget > fallback 2."
  - "Config parsing accepts defaults.retry_budget and compatibility alias defaults.retryBudget."
  - "pilot log --chain is registered now as parsing surface only; rendering behavior remains for Plan 70-04."

patterns-established:
  - "Queue-time controls always persist retry budget directly on addJob writes."
  - "Retry-budget validation is strict integer >= 0 at config parse time and CLI flag parse time."

# Metrics
duration: 7 min
completed: 2026-03-16
---

# Phase 70 Plan 03: Retry Budget CLI + Config Wiring Summary

**Configurable retry budgets now flow from config and add flags into queued jobs, with deterministic precedence and chain-flag CLI surface for logs.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T03:25:49Z
- **Completed:** 2026-03-16T03:33:19Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `defaults.retry_budget` parsing/validation (plus `retryBudget` alias) and surfaced `retryBudget` via `getConfigFileDefaults()`.
- Wired `pilot add --retries <n>` and `--no-retry` to resolve and persist an effective retry budget into `addJob(...)` with operator-visible output.
- Registered `pilot log --chain` at CLI parsing level and added regression tests for retry-budget precedence, validation, and add-command persistence arguments.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add config default support for retry budget** - `cea3f44` (feat)
2. **Task 2: Wire queue-time retry flags and command registration** - `0b19d7b` (feat)
3. **Task 3: Add command/config regressions for retry-budget precedence** - `bed9988` (test)

**Plan metadata:** pending (added in docs commit for this plan execution)

## Files Created/Modified
- `src/core/config.ts` - Validates and parses config retry budget defaults.
- `src/core/types.ts` - Extends config default types with retry budget fields.
- `src/commands/add.ts` - Resolves retry budget precedence and persists to `addJob(...)`.
- `src/index.ts` - Registers `--retries`, `--no-retry`, and `--chain` command flags.
- `test/core/config.test.ts` - Covers retry-budget parsing, alias support, fallback, and validation errors.
- `test/commands/add.test.ts` - Covers retry flag precedence, invalid values, and persisted addJob retry argument.

## Decisions Made
- Kept strict precedence order exactly as requirement contract: explicit retries override all other signals, then no-retry, then config default, then hard fallback.
- Kept config compatibility tolerant by accepting both snake_case and camelCase retry-budget keys.
- Kept `--chain` implementation as registration-only in this plan to avoid bleeding into Plan 70-04 rendering scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `ConfigFileDefaults` typing to include retry budget fields**
- **Found during:** Task 1 (config parsing implementation)
- **Issue:** `getConfigFileDefaults()` could not expose `retryBudget` without updating shared config types, causing type-contract mismatch.
- **Fix:** Added `defaults.retry_budget` / `defaults.retryBudget` on `ConfigFileSchema` and `retryBudget` on `ConfigFileDefaults`.
- **Files modified:** `src/core/types.ts`
- **Verification:** `npm run build` and config/add test suites pass.
- **Committed in:** `cea3f44` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type-surface update was required to make planned config exposure compile safely; no scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Retry-budget CLI/config wiring is complete and verified (`npm test -- test/core/config.test.ts test/commands/add.test.ts`, `npm run lint`).
- `pilot log --chain` flag is now parse-ready for Plan 70-04 chain rendering behavior.

---
*Phase: 70-phase-auto-retry-on-verification-failure*
*Completed: 2026-03-16*
