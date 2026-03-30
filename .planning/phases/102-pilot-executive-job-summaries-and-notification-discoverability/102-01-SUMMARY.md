---
phase: 102-pilot-executive-job-summaries-and-notification-discoverability
plan: 01
subsystem: core
tags: [summary, notifications, opencode-db, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: deterministic summary-first CLI patterns and commit-delta semantics reused by the shared builder
provides:
  - shared `JobExecutiveSummary` and `StepExecutiveSummary` types plus deterministic builder logic in `src/core/job-summary.ts`
  - focused `getLatestUsefulAssistantTextMessage()` lookup in `src/core/opencode-db.ts` for assistant-authored summary text
  - regression coverage for assistant-message fallback ordering, key artifacts, review commands, and missing-session degradation
affects: [callback notifications, pilot summary command, pilot log --summary]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared deterministic summary builder, assistant-text-first step summaries, capped high-signal artifact extraction]

key-files:
  created: [src/core/job-summary.ts, test/core/job-summary.test.ts]
  modified: [src/core/opencode-db.ts, test/core/opencode-db.test.ts]

key-decisions:
  - "Kept `getLastMessage()` unchanged and added a dedicated assistant-text helper so existing callers preserve last-message semantics."
  - "Made the final useful assistant text from the active/final step the preferred narrative `what`, while leaving `why` and `next` sourced from `buildJobWhy()`."
  - "Limited artifact extraction to verification artifact paths plus obvious path-like tokens from strong assistant summaries to avoid transcript scraping drift."

patterns-established:
  - "Executive summary objects should be built once in core and consumed by downstream CLI/notification renderers."
  - "Step summaries prefer assistant-authored text, then verdict reason, then error, with compact deterministic evidence only."

requirements-completed: [JSUM-01, JSUM-02, JSUM-06, JSUM-07]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 102 Plan 01: Executive Summary Foundation Summary

**Deterministic job and step executive summaries now reuse assistant-authored session text, judge signals, and commit metadata from one shared core builder.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T18:37:35Z
- **Completed:** 2026-03-30T18:44:08Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added `getLatestUsefulAssistantTextMessage()` to the opencode DB layer so summary builders can fetch the latest useful assistant-authored text without changing `getLastMessage()` behavior.
- Created `src/core/job-summary.ts` with shared `StepExecutiveSummary` and `JobExecutiveSummary` types plus deterministic summary, artifact, and drilldown generation.
- Added focused regression coverage for assistant-text extraction, failure/review summary behavior, capped assistant message history, and missing-session fallback paths.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a dedicated useful-assistant-text lookup helper in `opencode-db.ts`** - `ad009bf` (test), `05f19a5` (feat)
2. **Task 2: Create the shared `JobExecutiveSummary` builder and core regression suite** - `5e19581` (test), `1d60e45` (feat)

_Note: TDD tasks used separate red/green commits._

## Files Created/Modified

- `src/core/opencode-db.ts` - adds targeted latest-useful-assistant-text lookup while preserving existing last-message behavior
- `test/core/opencode-db.test.ts` - verifies assistant-text filtering, user-message non-regression, and whitespace/tool-only skips
- `src/core/job-summary.ts` - defines shared executive summary types and deterministic builder logic for downstream consumers
- `test/core/job-summary.test.ts` - locks in summary fallback order, review commands, artifact extraction, and missing-session handling

## Decisions Made

- Added a new DB helper instead of overloading `getLastMessage()` to avoid breaking status/detail callers that need the true latest message regardless of role.
- Reused `buildJobWhy()`, `buildRetryWhy()`, `buildJobObservability()`, and `buildJudgeSignal()` directly so later CLI and notification surfaces inherit the same semantics.
- Kept evidence and artifact extraction intentionally narrow and capped so executive summaries stay high-signal and deterministic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched verification commands from `npx` to `bunx`**
- **Found during:** Task 1 verification
- **Issue:** `npx` is not installed in this environment, so the planned Vitest command could not run.
- **Fix:** Used the available Bun toolchain (`bunx vitest`, `bunx tsc`) for all automated verification in this plan.
- **Files modified:** none
- **Verification:** `bunx vitest run test/core/opencode-db.test.ts test/core/job-summary.test.ts`; `bunx tsc --noEmit`
- **Committed in:** none (execution-only environment adjustment)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; verification used the repository's available runtime tooling.

## Issues Encountered

- The environment lacks `npx`, so verification had to run through Bun instead of npm wrappers.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared summary primitives are now available for `pilot summary`, `pilot log --summary`, and callback notification rendering.
- Core regression coverage protects assistant-message extraction and summary fallback order before downstream command/UI rewiring.
- Ready for `102-02-PLAN.md`.

## Self-Check: PASSED

- Verified required files exist: `src/core/job-summary.ts`, `src/core/opencode-db.ts`, `test/core/job-summary.test.ts`, `test/core/opencode-db.test.ts`
- Verified task commits exist: `ad009bf`, `05f19a5`, `5e19581`, `1d60e45`

---
*Phase: 102-pilot-executive-job-summaries-and-notification-discoverability*
*Completed: 2026-03-30*
