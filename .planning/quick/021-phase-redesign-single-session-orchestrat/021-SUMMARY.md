---
phase: quick-021
plan: 01
subsystem: runner
tags: [judge, phase-orchestration, delegation, opencode-db, single-session]

requires:
  - phase: quick-019
    provides: blocklist guard and duplicate detection
  - phase: quick-018
    provides: isSessionDone and premature completion fixes
provides:
  - Single-session phase orchestration via gsd-phase command
  - Judge-based evaluation via pilot-judge command
  - Simplified runner with judge verdict parsing
  - resetToPending for retryable failures
  - judge_verdict column in jobs table
affects: [runner reliability, phase success rate, milestone handling]

tech-stack:
  added: []
  patterns: [spawn-phase-then-judge evaluation, JSON verdict parsing, benefit-of-doubt on judge failure]

key-files:
  created:
    - ~/dev/punchlab/pilot-gsd/commands/gsd-phase.md
    - ~/dev/punchlab/pilot-gsd/commands/pilot-judge.md
  modified:
    - src/core/runner.ts
    - src/core/delegate.ts
    - src/core/db.ts
    - src/core/types.ts
    - test/core/runner.test.ts
    - test/core/delegate.test.ts

key-decisions:
  - "Judge failure = benefit of doubt (markCompleted), not hard failure"
  - "Shutdown-interrupted jobs reset to pending via resetToPending, not cancelled"
  - "pilot- prefix commands handled alongside gsd- prefix in spawnAndWait"
  - "Execa mock must be re-initialized per test suite to prevent cross-suite pollution"

patterns-established:
  - "Judge evaluation pattern: spawn work session → spawn judge session → parse JSON verdict → act on verdict"
  - "Single-step phase delegation: resolvePhaseForFallback returns one { command: 'phase' } step"

duration: ~45min (continuation from prior session)
completed: 2026-03-03
---

# Quick Task 021: Phase Redesign — Single-Session Orchestrator + Judge Evaluation

**Replace multi-step delegation → regex evaluation with single gsd-phase session + pilot-judge haiku evaluator, reducing phase mode from 4 separate AI sessions to 2 (phase + judge)**

## Performance

- **Duration:** ~45min (Task 3 continuation — Tasks 1-2 completed in prior session)
- **Tasks:** 3/3
- **Files modified:** 8 (across pilot and pilot-gsd repos)

## Accomplishments

- Created `gsd-phase.md` — single-session phase orchestrator that delegates add→plan→execute via Task() subagents
- Created `pilot-judge.md` — haiku-model evaluator that reads opencode DB transcripts and outputs structured JSON verdicts
- Simplified `delegate.ts` to return single `{ command: 'phase' }` step for all phase-scope jobs (was 3 separate steps)
- Rewrote `runner.ts` launch() with spawn-phase → spawn-judge → act-on-verdict pattern
- Deleted 6 functions from runner.ts: evaluateStepResult, verifyStepArtifacts, verifyWithGraceWindow, patchStepArgs, scanPhaseDirs, findPhaseDir
- Added `resetToPending()` and `updateJudgeVerdict()` to db.ts with judge_verdict column migration
- Net code reduction: 465 lines removed (801 deleted, 336 added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create gsd-phase.md and pilot-judge.md** — `1fa9355` (feat, in pilot-gsd repo)
2. **Task 2: Simplify delegate.ts + add judge DB functions** — `a6f03f1` (feat, in pilot repo)
3. **Task 3: Simplify runner.ts with judge-based evaluation** — `a301bed` (feat, in pilot repo)

## Files Created/Modified

- `~/dev/punchlab/pilot-gsd/commands/gsd-phase.md` — Single-session phase orchestrator command
- `~/dev/punchlab/pilot-gsd/commands/pilot-judge.md` — Phase result evaluator (haiku model, JSON verdict)
- `src/core/runner.ts` — Simplified launch() with judge pattern, deleted 6 heuristic functions
- `src/core/delegate.ts` — Single-step phase delegation via buildPhaseArgs()
- `src/core/db.ts` — resetToPending(), updateJudgeVerdict(), judge_verdict migration
- `src/core/types.ts` — judgeVerdict field on Job interface
- `test/core/runner.test.ts` — Replaced old tests with judge evaluation test suite (13/13 passing)
- `test/core/delegate.test.ts` — Updated expectations for single-step pattern (67/67 passing)

## Decisions Made

- **Judge failure = benefit of doubt:** If pilot-judge crashes or returns unparseable output, the phase job is marked completed (not failed). This prevents judge bugs from blocking all phase work.
- **Shutdown-interrupted jobs reset to pending:** Instead of marking cancelled, jobs interrupted by SIGTERM/SIGINT get `resetToPending()` so they're retried on next runner start.
- **pilot- prefix handling in spawnAndWait:** Added `command.startsWith('pilot-')` check alongside `gsd-` prefix so pilot-judge commands aren't double-prefixed.
- **Execa mock restoration:** Tests must explicitly restore the execa mock factory in `beforeEach` because `vi.clearAllMocks()` only clears call counts, not `mockResolvedValue` overrides from other test suites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed execa mock cross-suite pollution causing proc.unref failures**
- **Found during:** Task 3 (runner tests)
- **Issue:** The reconcileStaleRunning test suite called `vi.mocked(execa).mockResolvedValue(...)` which persisted across `vi.clearAllMocks()` into judge tests, making execa return a plain Promise (no `.unref()` method) instead of the expected `{ pid, unref, catch }` object
- **Fix:** Added explicit `vi.mocked(execa).mockImplementation(...)` in judge test beforeEach to restore the factory that returns objects with `unref`
- **Files modified:** test/core/runner.test.ts
- **Verification:** All 13 runner tests pass
- **Committed in:** a301bed (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for test reliability. No scope creep.

## Issues Encountered

- **spawnAndWait polling loop runs in real-time in tests:** Because `spawnAndWait` is called within `launch()` which is called within `runner.run()`, it executes the real polling loop (not mocked). Tests use `pollInterval: 1` (1s) to minimize wait time, but each judge test still takes ~6s (phase spawn + judge spawn = 2 polling cycles with PID death detection). Accepted as reasonable for integration-level tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase mode now uses 2 sessions (phase + judge) instead of 3-4 separate sessions
- Judge-based evaluation replaces regex heuristics for success/failure detection
- Ready for production testing — the true test will be running phase jobs with the new pattern
- Future improvement: dead code cleanup of references to deleted functions in other files (see requirements/cleanup-dead-code-post-redesign.md)

---
*Quick task: 021-phase-redesign-single-session-orchestrat*
*Completed: 2026-03-03*
