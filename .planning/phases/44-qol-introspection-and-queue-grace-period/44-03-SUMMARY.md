---
phase: 44-qol-introspection-and-queue-grace-period
plan: 03
subsystem: cli
tags: [introspection, status, retry, queue, grace, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: launch-eligibility grace gating and per-job start-immediately override from 44-02
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: undo/recovery visibility contract used by status tags
provides:
  - Shared JobWhy introspection model with stable codes, badges, what/why/next guidance, and grace remaining seconds
  - `pilot status --why` guidance mode plus structured `why` JSON payload keyed by job ID
  - `pilot retry <id> --why` explain-only retry context with retryable vs needs-revision classification
affects: [44-04-info-log-summary, 44-05-tui-reason-visibility, 44-06-guardrail-copy]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared introspection reason model reused across command surfaces, concise what/why/next guidance contract for operator guardrails]

key-files:
  created: [src/core/job-introspection.ts, test/core/job-introspection.test.ts]
  modified: [src/index.ts, src/commands/status.ts, src/commands/retry.ts, test/commands/status.test.ts, test/commands/cancel-retry-bump.test.ts]

key-decisions:
  - "Status pending-state reasons use one canonical precedence (project blocked -> dependency wait -> project serialization -> grace wait -> launchable)"
  - "Retry --why is explain-only and never mutates queue state so operators can decide before acting"
  - "Status JSON now emits a machine-readable why map keyed by job id for automation and future TUI reuse"

patterns-established:
  - "Reason model first: status/retry surfaces consume shared JobWhy objects instead of ad-hoc string logic"
  - "Guardrail copy format: one-line what, one-line why, one-line next action"

# Metrics
duration: 9min
completed: 2026-03-08
---

# Phase 44 Plan 03: Shared Introspection Why-Model Summary

**A shared JobWhy model now powers concise retry and queue-state explanations, with `status --why` and `retry --why` exposing actionable what/why/next guidance and stable machine-readable reason codes.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-08T00:26:08Z
- **Completed:** 2026-03-08T00:35:40Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Added `src/core/job-introspection.ts` with deterministic `JobWhy` builders for grace wait, blocked project, dependency wait, project serialization wait, retryable vs needs-revision failures, undo safety/guards, and no-op detection
- Added `pilot status --why` wiring with compact per-item what/why/next lines and pending/recent badges sourced from the shared reason model
- Added structured `why` payloads to status JSON output for all visible jobs (active/stale/pending/recent), keyed by job ID
- Added `pilot retry <id> --why` explain-only mode that surfaces last-failure context and retry guidance without mutating queue state
- Added focused regression coverage for shared reason behavior, status why-mode rendering/JSON output, and retry explain-only semantics

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared JobWhy model for queue/guard introspection** - `80f3e08` (feat)
2. **Task 2: Wire `pilot status --why` and consistent badges** - `c643efc` (feat)
3. **Task 3: Add `pilot retry --why` using shared reason-model output** - `5dc6004` (feat)

## Files Created/Modified

- `src/core/job-introspection.ts` - canonical reason/badge/what-why-next helpers for pending, retry, undo, and no-op states
- `test/core/job-introspection.test.ts` - focused coverage for grace, blocked, dependency, serialization, retryability, undo, and no-op reason outputs
- `src/index.ts` - registered `pilot status --why` and `pilot retry --why` flags
- `src/commands/status.ts` - integrated shared reason model into queue/recent labels, why-mode guidance output, and JSON `why` map
- `test/commands/status.test.ts` - added why-mode and JSON reason-map assertions
- `src/commands/retry.ts` - implemented explain-only retry context mode with shared retry guidance
- `test/commands/cancel-retry-bump.test.ts` - added retry --why mutation-safety and guidance assertions

## Decisions Made

- Preserved existing Phase 43 recovery map contract while routing reason/badge copy through shared introspection helpers
- Kept default status rows concise by surfacing short badges, then gated richer guidance behind `--why`
- Used explain-only retry mode for `--why` so operators can inspect failure context without side effects

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared introspection core is now in place for reuse by `pilot info` and `pilot log --summary` in 44-04
- Status and retry surfaces now expose stable reason codes and concise guidance, reducing wording drift risk in upcoming TUI and guardrail-copy plans
- Ready for `44-04-PLAN.md`

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
