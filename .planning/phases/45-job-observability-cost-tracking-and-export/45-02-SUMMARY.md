---
phase: 45-job-observability-cost-tracking-and-export
plan: 02
subsystem: core
tags: [observability, pricing, runner, models, tokens, vitest]

# Dependency graph
requires:
  - phase: 45-job-observability-cost-tracking-and-export
    provides: recursive opencode session-tree model and token primitives from 45-01
provides:
  - explicit per-model pricing catalog with estimate/partial/unavailable semantics
  - canonical `buildJobObservability` snapshot for requested vs observed models, tokens, and costs
  - runner terminalization persistence of recursive normalized actual model provenance
affects: [45-03-cli-observability-parity, 45-04-tui-observability-parity, 45-05-export-command]

# Tech tracking
tech-stack:
  added: []
  patterns: [single shared observability snapshot contract, per-model estimate rollup with caveat notes, recursive model persistence before terminal writes]

key-files:
  created: [src/core/pricing.ts, src/core/job-observability.ts, test/core/job-observability.test.ts]
  modified: [src/core/types.ts, src/core/runner.ts, test/core/job-observability.test.ts, test/core/runner-recovery.test.ts]

key-decisions:
  - "Pricing remains explicit and local: unknown model pricing yields unavailable/partial output instead of blended guesses."
  - "`buildJobObservability` degrades running and missing-session data to partial/unavailable with notes instead of fake-final totals."
  - "Runner model persistence now resolves root session IDs and traverses recursive trees with normalized sorted dedupe before terminal status updates."

patterns-established:
  - "Observability semantics contract: requested, observed, tokens, and estimated cost each carry explicit status and caveats."
  - "Best-effort persistence pattern: observability collection failures never block completion/failure state transitions."

# Metrics
duration: 7 min
completed: 2026-03-08
---

# Phase 45 Plan 02: Job Observability Core Summary

**Pilot now has one shared per-job observability snapshot and explicit per-model pricing semantics, plus runner persistence that records recursive ground-truth model usage before terminal transitions.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-08T01:37:58Z
- **Completed:** 2026-03-08T01:45:45Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- Added `src/core/pricing.ts` with `PRICING_CATALOG` and `estimateCostByModel(...)`, including explicit `estimated` / `partial` / `unavailable` behavior and caveat notes for missing pricing or excluded token categories.
- Added `src/core/job-observability.ts` with `buildJobObservability(...)` that composes requested run context, recursive observed models, per-model token usage, estimated cost, and running-job partial-data semantics in one additive snapshot.
- Hardened `collectActualModels(...)` in `src/core/runner.ts` to resolve root session IDs, walk recursive session trees, normalize+dedupe model strings, and persist sorted sets before `markCompleted`/`markFailed`.
- Expanded focused regression coverage in `test/core/job-observability.test.ts` and `test/core/runner-recovery.test.ts` for single-model, multi-model, missing-data, running partial-data, and recursive model persistence behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit pricing catalog and estimation semantics** - `bb75e84` (feat)
2. **Task 2: Build canonical per-job observability snapshot helper** - `15987be` (feat)
3. **Task 3: Persist recursive actual-model usage in runner terminalization flow** - `8823362` (feat)

## Files Created/Modified

- `src/core/pricing.ts` - centralized model pricing assumptions and per-model estimate helpers.
- `src/core/job-observability.ts` - canonical job observability snapshot builder for shared CLI/TUI/export use.
- `src/core/types.ts` - observability and cost estimate type contracts.
- `src/core/runner.ts` - recursive, normalized, deduplicated actual-model persistence.
- `test/core/job-observability.test.ts` - pricing and snapshot behavior coverage for terminal/running/missing-data paths.
- `test/core/runner-recovery.test.ts` - recursive model persistence and best-effort failure behavior coverage.

## Decisions Made

- Kept pricing assumptions explicit per model (with assumption notes) and avoided any blended single-model fallback for mixed-model jobs.
- Represented observability values with explicit status semantics so callers can show requested/observed/estimated/unavailable data honestly.
- Normalized stored actual model identifiers to lowercase `provider/model` and persisted deterministic sorted arrays for stable downstream comparisons.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared observability + pricing core contracts are now stable for CLI parity wiring in 45-03.
- TUI and export surfaces can consume one canonical snapshot shape instead of bespoke per-surface aggregation.
- Runner terminal records now retain recursive model provenance reliably for mismatch and cost narratives.
- Ready for `45-03-PLAN.md`.

---
*Phase: 45-job-observability-cost-tracking-and-export*
*Completed: 2026-03-08*
