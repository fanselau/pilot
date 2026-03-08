---
phase: 44-qol-introspection-and-queue-grace-period
plan: 04
subsystem: cli
tags: [info, log, summary, introspection, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: shared JobWhy reason model and status/retry guidance primitives from 44-03
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: base/head checkpoint metadata and undo guard semantics used by summary surfaces
provides:
  - `pilot log --summary` compact deterministic summaries for completed and failed jobs in human and JSON modes
  - `pilot info <id>` triage-first header answering what happened and what to do next before deep diagnostics
  - Regression coverage for retryable failures, no-op commit deltas, guarded undo states, and missing-step fallbacks
affects: [44-05-tui-reason-visibility, 44-06-guardrail-copy]

# Tech tracking
tech-stack:
  added: []
  patterns: [metadata-first deterministic summary rendering, shared reason-model wording reused across info/log output]

key-files:
  created: [test/commands/log.test.ts]
  modified: [src/index.ts, src/commands/log.ts, src/commands/info.ts, test/commands/info.test.ts, test/commands/log.test.ts]

key-decisions:
  - "`pilot log --summary` remains purely metadata-derived (job row + job steps + checkpoints), with no transcript/LLM summarization"
  - "`pilot info` keeps full deep-detail sections, but prepends a compact triage block to reduce first-screen noise"
  - "Summary JSON surfaces expose an explicit triage/summary object for scripting while preserving existing command contracts"

patterns-established:
  - "Summary-first operator flow: what happened, why, next action appears before verbose diagnostics"
  - "Outcome signal extraction uses deterministic verdict-text heuristics (build/test pass-fail) with fail-dominant aggregation"

# Metrics
duration: 6min
completed: 2026-03-08
---

# Phase 44 Plan 04: Compact Info and Log Summary Surfaces Summary

**Pilot now exposes deterministic triage summaries in both `info` and `log --summary`, making retry/no-op/undo decisions visible without transcript spelunking.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T00:39:36Z
- **Completed:** 2026-03-08T00:46:24Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- Added `pilot log --summary` CLI wiring and summary-mode rendering with compact deterministic metadata for steps, verdicts, build/test signals, commit delta state, and failure reasons
- Added summary-mode JSON payloads for automation plus focused `test/commands/log.test.ts` coverage for completed no-op, failed retry guidance, and guarded fallback branches
- Reworked `pilot info <id>` to start with a triage block (`what this is`, `what happened`, `what next`) plus provider/profile, attempts, step status, checkpoint delta, retryability, and undo safety
- Extended info/log command tests to lock in high-signal behavior across failure/no-op/guarded/missing-step scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `pilot log --summary` with deterministic summary output** - `ef586fa` (feat)
2. **Task 2: Refine `pilot info <id>` into compact high-signal triage output** - `7e4cfe0` (feat)
3. **Task 3: Validate summary surfaces across failure and no-op scenarios** - `81fe9b8` (test)

## Files Created/Modified

- `src/index.ts` - wired `pilot log --summary` flag in command registration
- `src/commands/log.ts` - implemented summary-mode synthesis, deterministic signal extraction, and compact human/JSON output paths
- `test/commands/log.test.ts` - added regression suite for completed, failed, guarded, and fallback summary branches
- `src/commands/info.ts` - added triage-first info block and JSON `triage` payload while preserving deep detail sections
- `test/commands/info.test.ts` - asserted triage content, JSON compatibility, retry guidance, no-op state, and guarded undo visibility

## Decisions Made

- Kept `log --summary` deterministic by deriving everything from existing queue/job-step metadata instead of transcript parsing
- Reused shared `job-introspection` reason phrasing to keep copy consistent between status/retry/info/log surfaces
- Added triage payloads to JSON output rather than replacing existing fields to avoid breaking automation consumers

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI summary/triage contracts are now stable and test-backed for reuse in TUI detail/queue reason surfacing (44-05)
- Shared reason-model wording is consistently represented in status/retry/info/log, reducing copy drift risk for guardrail hardening (44-06)
- Ready for `44-05-PLAN.md`

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
