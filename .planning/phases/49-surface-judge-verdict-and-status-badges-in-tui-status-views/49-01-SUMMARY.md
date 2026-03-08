---
phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views
plan: 01
subsystem: core
tags: [judge, verdict, badges, vitest, status, tui]

# Dependency graph
requires:
  - phase: 48-fix-new-project-setup-critical-bugs
    provides: Stable project setup and test baseline for new phase work
provides:
  - Shared judge verdict normalizer for phase jobs
  - Deterministic judge badge formatter (`judge:pass|fail|doubt|inconclusive`)
  - Core regression tests covering malformed/missing verdict handling
affects: [49-02, 49-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source verdict parsing in src/core/judge-signal.ts for CLI and TUI consumers"

key-files:
  created:
    - src/core/judge-signal.ts
    - test/core/judge-signal.test.ts
  modified: []

key-decisions:
  - "Non-phase jobs return outcome 'none' so judge badges are suppressed outside phase scope"
  - "Invalid/missing verdict payloads and unusable confidence values map to judge:inconclusive"

patterns-established:
  - "Expose buildJudgeSignal + formatJudgeBadge/formatJudgeReason helpers for downstream status/TUI wiring"

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 49 Plan 01: Shared Judge Verdict Formatter Foundation Summary

**Core judge-signal helpers now normalize phase verdict payloads into explicit pass/fail/doubt/inconclusive outcomes with deterministic badge strings for status and TUI consumers.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T21:10:57Z
- **Completed:** 2026-03-08T21:14:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `src/core/judge-signal.ts` with a typed parser for `Job.scope + Job.judgeVerdict` and strict phase-only badge behavior
- Implemented outcome mapping (`succeeded -> pass`, `failed -> fail`, `doubting -> doubt`) plus explicit `judge:inconclusive` fallbacks for malformed/missing/unusable verdict data
- Added dedicated Vitest coverage in `test/core/judge-signal.test.ts` for mapping, inconclusive edge cases, non-phase suppression, and reason fallback (`reason` over `summary`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared judge verdict normalization and badge formatter** - `a6cb986` (feat)
2. **Task 2: Add core unit tests for verdict mapping and inconclusive handling** - `847440b` (test)

## Files Created/Modified
- `src/core/judge-signal.ts` - New shared parser/normalizer + badge/reason helper exports for judge semantics
- `test/core/judge-signal.test.ts` - Regression suite covering required verdict and badge contracts

## Decisions Made
- Treated non-phase scopes as `outcome: 'none'` with empty badge output to prevent judge labels on quick/milestone jobs.
- Normalized confidence into a bounded, positive integer; missing/invalid/zero confidence now resolves to `judge:inconclusive`.
- Preserved backward compatibility for reason text by preferring `reason` and falling back to legacy `summary`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared verdict semantics are now centralized and tested, ready for CLI status/info wiring in 49-02.
- Badge formatting contract is stable for TUI completed/detail integration in 49-03.

---
*Phase: 49-surface-judge-verdict-and-status-badges-in-tui-status-views*
*Completed: 2026-03-08*
