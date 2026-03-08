---
phase: 45-job-observability-cost-tracking-and-export
plan: 03
subsystem: cli
tags: [observability, info, log, status, cost, vitest]

# Dependency graph
requires:
  - phase: 45-job-observability-cost-tracking-and-export
    provides: shared job observability + pricing snapshot semantics from 45-02
provides:
  - `pilot info <id>` observability section with requested/observed/token/cost semantics and failure insight context
  - `pilot log <id> --summary` observability-rich deterministic summaries for success and failure paths
  - `pilot status` compact observability badges plus additive observability JSON map for quick anomaly detection
affects: [45-04-tui-observability-parity, 45-05-export-command, 45-06-phase-regression]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared observability snapshot consumption across CLI surfaces, additive JSON contracts, live/partial status signaling for running jobs]

key-files:
  created: []
  modified: [src/commands/info.ts, src/commands/log.ts, src/commands/status.ts, test/commands/info.test.ts, test/commands/log.test.ts, test/commands/status.test.ts]

key-decisions:
  - "All three CLI surfaces consume `buildJobObservability(...)` directly so requested/observed/token/cost semantics stay aligned."
  - "Failure insight is exposed as explicit metadata (failed step, completed-before-failure, retry guidance) without transcript dependence."
  - "Status list views use compact `obs` badges with live/partial markers to preserve scanability while surfacing cost/model anomalies."

patterns-established:
  - "Observability parity pattern: info, log summary, and status all render the same requested vs observed vs estimated semantics."
  - "Operator-first failure context: commit-delta + failed-step + retry guidance shown in both human and JSON output."

# Metrics
duration: 8 min
completed: 2026-03-08
---

# Phase 45 Plan 03: CLI Observability Wiring Summary

**CLI observability surfaces now share one high-signal contract for requested lane vs actual models, token/cost semantics, and failure context across `info`, `log --summary`, and `status`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T01:49:26Z
- **Completed:** 2026-03-08T01:58:24Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- Upgraded `pilot info <id>` to render shared observability semantics (requested profile/lane, observed models, token totals + breakdown, estimated cost caveats) and explicit failure insight metadata.
- Extended `pilot log <id> --summary` to include observability snapshot data and failure-context summaries while keeping deterministic metadata-only behavior (no transcript summarization dependency).
- Added compact `obs` badges to `pilot status` active/stale/recent rows and an additive `observability` JSON map so scripts and operators can quickly identify unusual model usage or higher-cost runs.
- Locked new contracts with focused command regressions in info/log/status test suites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade `pilot info` with full observability + failure insight contract** - `e918524` (feat)
2. **Task 2: Upgrade `pilot log --summary` for observability-rich success/failure summaries** - `5104110` (feat)
3. **Task 3: Add compact observability signals to `pilot status` list views** - `f00283c` (feat)

## Files Created/Modified

- `src/commands/info.ts` - switched to shared observability snapshot rendering and added structured failure insight output for human + JSON modes.
- `test/commands/info.test.ts` - added assertions for requested/observed/token/cost semantics and failure-context JSON contract.
- `src/commands/log.ts` - enriched `--summary` with observability and deterministic failure context for both terminal paths.
- `test/commands/log.test.ts` - expanded summary-mode coverage for observability and failure-context payloads.
- `src/commands/status.ts` - added compact observability badges to list views and additive JSON observability map.
- `test/commands/status.test.ts` - added regression coverage for badge rendering and JSON observability output.

## Decisions Made

- Kept observability wiring command-local but source-of-truth shared (`buildJobObservability`) to avoid divergent info/log/status semantics.
- Preserved additive JSON compatibility by extending existing payloads with `observability`/`failureContext` instead of replacing prior fields.
- Used compact status badges (`model/tok/cost + live/partial`) to increase anomaly visibility without degrading queue scanability.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI observability contracts are now aligned on the shared snapshot and ready to mirror in TUI surfaces (`45-04`).
- Export command implementation (`45-05`) can reuse these stabilized observability + failure-context blocks directly.
- Regression plan (`45-06`) can verify cross-surface parity using the new command-level observability fixtures.

---
*Phase: 45-job-observability-cost-tracking-and-export*
*Completed: 2026-03-08*
