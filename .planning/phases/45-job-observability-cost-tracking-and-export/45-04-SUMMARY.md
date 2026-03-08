---
phase: 45-job-observability-cost-tracking-and-export
plan: 04
subsystem: ui
tags: [tui, observability, models, tokens, cost, vitest]

# Dependency graph
requires:
  - phase: 45-job-observability-cost-tracking-and-export
    provides: canonical job observability snapshots and pricing semantics from 45-02
provides:
  - TUI polling/state wiring for shared per-job observability snapshots
  - Compact running/completed observability cues with live/partial/unavailable semantics and anomaly flags
  - Detail header parity for requested vs actual models, token breakdown hints, and estimated-cost caveats
affects: [45-03-cli-observability-parity, 45-05-export-command, operator-triage]

# Tech tracking
tech-stack:
  added: []
  patterns: [state-level shared observability map for TUI surfaces, compact anomaly badges in list rows, detail header requested/actual/estimated semantic lines]

key-files:
  created: [test/tui/running-panel.test.ts]
  modified: [src/tui/state.ts, src/tui/app.tsx, src/tui/views/dashboard.tsx, src/tui/components/running-panel.tsx, src/tui/components/completed-panel.tsx, src/tui/views/detail.tsx, test/tui/completed-panel.test.ts, test/tui/detail-header.test.ts]

key-decisions:
  - "TUI panels and detail now consume shared `buildJobObservability` snapshots from app-level polling instead of per-component ad-hoc token reads."
  - "Running/completed rows use compact cues (`tok`, `cost`, `model`) plus warning flags (`mismatch`, `multi-model`, `high-cost`, `high-tok`) so expensive or unusual jobs are visible at a glance."
  - "Detail header now always renders requested, actual, and estimated lines with explicit live/partial/unavailable semantics for running jobs."

patterns-established:
  - "Observability parity pattern: list and detail surfaces share one snapshot contract and semantic labels."
  - "Rendering regression pattern: pure helper tests lock compact cue formatting and detail header semantics."

# Metrics
duration: 13 min
completed: 2026-03-08
---

# Phase 45 Plan 04: TUI Observability Parity Summary

**TUI running/completed/detail surfaces now read the shared observability snapshot contract, exposing requested vs actual model usage, live token/cost signals, and anomaly cues directly in list and detail views.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-08T01:49:30Z
- **Completed:** 2026-03-08T02:02:43Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- Wired app/state polling to maintain a per-job observability snapshot map (`buildJobObservability`) on the existing 2s enrichment cadence.
- Updated running and completed rows to render compact token/cost/model cues with explicit live/partial/unavailable semantics and anomaly flags for mismatch, multi-model use, high token volume, and high estimated cost.
- Upgraded detail header contract to show requested lane/model, actual observed models, token totals + breakdown hints, and estimated cost caveats while preserving recovery and reason context lines.
- Added a dedicated running-panel helper regression suite and expanded completed/detail test contracts for observability formatting semantics.
- Verified all required TUI regression commands pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire shared observability snapshots into TUI polling/state** - `037314f` (feat)
2. **Task 2: Add compact observability cues to running and completed panels** - `2f5e91f` (feat)
3. **Task 3: Upgrade detail header for requested/actual/estimated parity** - `b16ca0e` (feat)

## Files Created/Modified

- `src/tui/state.ts` - added shared observability snapshot state and richer token map typing.
- `src/tui/app.tsx` - refreshes observability snapshots and legacy enrichment maps on poll cadence.
- `src/tui/views/dashboard.tsx` - passes shared observability snapshots into running/completed panels.
- `src/tui/components/running-panel.tsx` - compact observability cue/flag helpers and live row rendering.
- `src/tui/components/completed-panel.tsx` - snapshot-driven observability metrics and anomaly highlighting.
- `src/tui/views/detail.tsx` - requested/actual/estimated header helpers with explicit live/partial/unavailable semantics.
- `test/tui/running-panel.test.ts` - new regression coverage for running-panel observability helper contracts.
- `test/tui/completed-panel.test.ts` - added completed-row observability cue regression assertions.
- `test/tui/detail-header.test.ts` - refreshed header contract tests for requested/actual/estimated parity and caveats.

## Decisions Made

- Kept observability snapshot refresh in the existing enrichment poller interval rather than adding a faster DB cadence.
- Preserved `sessionTokens` and `lastMessages` state paths as compatibility fallbacks while making UI rendering consume shared observability semantics first.
- Chose concise anomaly flags in list rows over verbose breakdown lines so operators can still scan dense queues quickly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added dashboard snapshot prop wiring for updated panel contracts**
- **Found during:** Task 2
- **Issue:** Running/completed panel prop signatures changed to require observability snapshots, causing compile failures without dashboard plumbing.
- **Fix:** Passed `observabilitySnapshots` from dashboard state into both panels.
- **Files modified:** `src/tui/views/dashboard.tsx`
- **Verification:** `npx vitest run test/tui/completed-panel.test.ts test/tui/running-panel.test.ts`
- **Committed in:** `2f5e91f`

**2. [Rule 3 - Blocking] Widened TUI session token signal type for fallback token breakdown fields**
- **Found during:** Task 3
- **Issue:** Detail header fallback path reads optional `reasoning/cache` token buckets but state type only declared `input/output`.
- **Fix:** Updated `sessionTokens` signal typing to include optional reasoning/cache fields.
- **Files modified:** `src/tui/state.ts`
- **Verification:** `npx vitest run test/tui/detail-header.test.ts`
- **Committed in:** `b16ca0e`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both changes were required to keep the new observability rendering contract type-safe and compilable; no scope creep.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TUI observability surfaces now share one semantics contract and can stay in sync with CLI upgrades.
- Remaining Phase 45 observability work can focus on CLI summary parity and export artifact generation without redoing TUI token/cost/model logic.
- Ready for the remaining Phase 45 plans.

---
*Phase: 45-job-observability-cost-tracking-and-export*
*Completed: 2026-03-08*
