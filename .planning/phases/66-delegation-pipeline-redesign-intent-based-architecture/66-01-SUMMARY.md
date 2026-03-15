---
phase: 66-delegation-pipeline-redesign-intent-based-architecture
plan: 01
subsystem: delegation
tags: [typescript, delegation-ai, intent-based, opencode, types]

# Dependency graph
requires:
  - phase: 65-gsd-config-preseeding
    provides: runner runtime config pre-seeding that delegate.ts relies on for job context
provides:
  - DelegationIntent union type (7 variants) replacing DelegationStep/DelegationPlan
  - DelegationResult interface (intent + reasoning)
  - src/prompts/delegate.md — full delegation AI prompt with decision tree and JSON examples
  - Rewritten delegate.ts that spawns opencode with inline prompt (not --command gsd-delegate)
  - parseIntentOutput() with per-intent-type validation
  - Parse failure retry with error injection
affects:
  - 66-02 (runner.ts must consume DelegationResult instead of DelegationPlan)
  - 66-03 (any remaining runner integration work)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level prompt loading via import.meta.url for reliable path resolution"
    - "Intent-based delegation: single typed intent object per delegation call"
    - "Parse failure retry: inject error context into second attempt prompt"

key-files:
  created:
    - src/prompts/delegate.md
  modified:
    - src/core/types.ts
    - src/core/delegate.ts
    - src/core/db.ts
    - src/commands/info.ts
    - test/core/delegate.test.ts

key-decisions:
  - "Pass delegation prompt as opencode run message (not --command gsd-delegate)"
  - "Load delegate.md via readFileSync(import.meta.url) at module init for reliable path resolution"
  - "Two-attempt parse retry: first attempt fails → inject error message → retry once → fail"
  - "Fix info.ts and db.ts DelegationPlan→DelegationResult as blocking compile fix (Rule 3)"

patterns-established:
  - "Intent-based AI output: one typed intent per call, runner owns workflow logic"
  - "Prompt-as-module: delegation prompt lives in src/prompts/ and is loaded at module init"

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 66 Plan 01: Delegation Pipeline Redesign — Intent-Based Types & Prompt Summary

**DelegationIntent union type (7 variants) replaces DelegationStep[]/DelegationPlan; delegate.ts spawns opencode with inline prompt from src/prompts/delegate.md instead of --command gsd-delegate**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-15T21:46:18Z
- **Completed:** 2026-03-15T21:55:06Z
- **Tasks:** 2
- **Files modified:** 5 (plus 1 new file created)

## Accomplishments
- Replaced `DelegationStep` and `DelegationPlan` with `DelegationIntent` union type (7 variants) and `DelegationResult` interface in `types.ts`
- Created `src/prompts/delegate.md` (262 lines) with full decision tree, JSON output examples for all 7 intent types, and explicit constraints against step-based output
- Rewrote `delegate.ts` to load prompt via `import.meta.url`, build combined prompt+args, and spawn opencode with the inline message instead of `--command gsd-delegate`
- Added `parseIntentOutput()` with per-intent-type field validation replacing the old `parseDelegationOutput()`
- Implemented parse failure retry: first parse failure → inject error context → one more attempt → fail with doctor hint
- Rewrote `delegate.test.ts` with 49 tests covering all 7 intent types and error cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace delegation types and create delegation prompt** - `295b663` (feat)
2. **Task 2: Rewrite delegate.ts for intent-based delegation** - `d6f330e` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/core/types.ts` — Replaced DelegationStep/DelegationPlan with DelegationIntent union + DelegationResult interface
- `src/prompts/delegate.md` — Complete delegation AI prompt (262 lines) with decision tree and JSON examples
- `src/core/delegate.ts` — Rewritten: inline prompt loading, parseIntentOutput(), retry logic, removed GSD_INSTRUCTION_BLOCKLIST/buildMilestonePlan
- `src/core/db.ts` — Updated updateDelegationPlan() to accept DelegationResult (blocking compile fix)
- `src/commands/info.ts` — Updated delegation display to show intent instead of steps (blocking compile fix)
- `test/core/delegate.test.ts` — Fully rewritten for new parseIntentOutput API (49 tests)

## Decisions Made
- Pass delegation prompt as opencode `run` message (not `--command gsd-delegate`) — opencode `run` takes positional message args, no `--prompt` flag exists
- Load `delegate.md` via `readFileSync(import.meta.url)` at module init — reliable path resolution that works in both dev and production dist
- Two-attempt parse retry: if first parse fails → build second prompt with error context appended → one more attempt → throw with doctor hint
- Fix `info.ts` and `db.ts` to use `DelegationResult` as blocking compile errors under Rule 3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed info.ts and db.ts compile errors from DelegationPlan removal**

- **Found during:** Task 2 (delegate.ts rewrite)
- **Issue:** `npx tsc --noEmit` (excluding runner.ts) showed `info.ts` and `db.ts` still importing `DelegationPlan` which no longer exists in types.ts
- **Fix:** Updated imports and usages — `db.ts` `updateDelegationPlan()` now accepts `DelegationResult`, `info.ts` displays intent object instead of step list
- **Files modified:** src/commands/info.ts, src/core/db.ts
- **Verification:** `npx tsc --noEmit 2>&1 | grep -v runner.ts` returns no errors
- **Committed in:** d6f330e (Task 2 commit)

**2. [Rule 1 - Bug] Rewrote delegate.test.ts to match new API**

- **Found during:** Task 2 (test run after rewrite)
- **Issue:** The existing test file imported `parseDelegationOutput`, `buildMilestonePlan`, `matchesBlocklist`, `GSD_INSTRUCTION_BLOCKLIST` (all removed), and had a temporal dead zone issue with `mockRequirementFileContent` accessed during module init
- **Fix:** Completely rewrote the test to test `parseIntentOutput` and the 7 new intent types (49 tests, same coverage breadth)
- **Files modified:** test/core/delegate.test.ts
- **Verification:** `npx vitest run test/core/delegate.test.ts` shows 49 passed
- **Committed in:** d6f330e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking compile error, 1 broken test suite)
**Impact on plan:** Both fixes necessary for compilation and test correctness. No scope creep.

## Issues Encountered
- The test file's `readFileSync` mock had a temporal dead zone issue: `mockRequirementFileContent` was accessed in the mock factory before it was initialized (because `delegate.ts` now reads `delegate.md` at module load time). Fixed by adding a guard for `prompts/` paths that passes through to actual `readFileSync` before touching `mockRequirementFileContent`.
- Pre-existing test failures in `doctor.test.ts`, `update.test.ts`, and `web/actions.test.ts` were confirmed pre-existing (present on previous commit).

## Next Phase Readiness
- `DelegationIntent` and `DelegationResult` are fully exported and usable
- `delegate()` returns `DelegationResult` — Plan 02 must update `runner.ts` to consume it instead of `DelegationPlan`
- `runner.ts` currently has 5 TypeScript compile errors (expected — it still references `DelegationStep`/`DelegationPlan`) — Plan 02 fixes these
- `src/prompts/delegate.md` is in place and loaded by `delegate.ts`

---
*Phase: 66-delegation-pipeline-redesign-intent-based-architecture*
*Completed: 2026-03-15*
