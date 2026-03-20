# Phase 60 Plan 02: Clean Up UX Surfaces and Tests — Remove All Dirty-Guard Blocking

Remove dirty-guard blocking from undo/info/status commands, job introspection, and all tests. After this plan, dirty worktree state is purely informational — it never blocks any operator flow.

## Tasks Completed

### Task 1: Simplify undo/info/status dirty-start references — make informational only
- **undo.ts:** Deleted `startedDirty` blocking branch (lines 137-141). Converted `startedDirty && force` warning to unconditional informational note when `job.startedDirty` is true.
- **job-introspection.ts:** Deleted `'undo-guarded-dirty-start'` from `JobWhyCode` type. Removed the `if (job.startedDirty)` block in `buildUndoWhy()` — dirty-start jobs now fall through to `undo-safe`.
- **info.ts:** Removed `'dirty-start'` from `RecoveryInfo['reason']` union and the `if (job.startedDirty)` guard block that set state to `'guarded'`.
- **status.ts:** Removed `'dirty-start'` from `RecoveryTag['reason']` union and the dead `undo-guarded-dirty-start` branch in `getRecoveryTag()`.
- **queue-panel.tsx (deviation):** Removed dead `undo-guarded-dirty-start` badge check at line 65 — always-false comparison that TypeScript didn't flag.
- **Commit:** `f56286c`

### Task 2: Update all tests — remove dirty-guard blocking references from 20 test files
- **test/commands/add.test.ts:** Removed `_allowDirtyStart` from mock factory, deleted 2 allowDirtyStart tests, fixed all `addJob` call expectations (removed old `allowDirtyStart=false` positional arg from 17 call sites), removed `allowDirtyStart: false` from fakeJob fixture.
- **test/core/db.test.ts:** Removed `upsertProjectDirtyBaseline`/`getLatestProjectDirtyBaseline` imports, deleted `stores allowDirtyStart=true` test, deleted entire `project dirty baseline persistence` describe block (3 tests), removed `allowDirtyStart` from recovery metadata tests, fixed `addJob` positional args for `skipGracePeriod` tests.
- **test/core/git-recovery.test.ts:** Removed `classifyDirtyStart`, `getPorcelainStatus`, `getBranchOrNull` imports and all 3 test blocks.
- **test/core/runner-recovery.test.ts:** Removed `getLatestProjectDirtyBaseline`/`upsertProjectDirtyBaseline` from mock factory and db mock wiring. Replaced 6 dirty-guard tests with 1 "launches on dirty without blocking" test.
- **test/core/job-introspection.test.ts:** Changed `undo-guarded-dirty-start` test to expect `undo-safe`.
- **test/commands/undo.test.ts:** Replaced blocking+force tests with single informational note test.
- **test/commands/status.test.ts:** Changed dirty-start tag test to expect `undo:safe`.
- **test/commands/info.test.ts:** Changed expectation from `undo:guarded-dirty-start` to `undo:safe`.
- **test/commands/log.test.ts:** Changed badge expectation from `undo:guarded-dirty-start` to `undo:safe`.
- **11 additional test files** (callback, job-observability, notify-route, judge-signal, delegate, detail-header, cancel-retry-bump, export, shortcuts, completed-panel, queue-panel): Removed `allowDirtyStart: false` from makeJob() helpers.
- **Commit:** `124e69f`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dead `undo-guarded-dirty-start` badge check in queue-panel.tsx**
- **Found during:** Task 1
- **Issue:** Line 65 of `queue-panel.tsx` had an always-false comparison against `'undo-guarded-dirty-start'` that TypeScript didn't flag as error.
- **Fix:** Removed the dead code branch.
- **Files modified:** `src/tui/components/queue-panel.tsx`
- **Commit:** `f56286c`

**2. [Rule 1 - Bug] Missing `undo:guarded-dirty-start` → `undo:safe` update in log.test.ts**
- **Found during:** Task 2
- **Issue:** `test/commands/log.test.ts` still expected `badge: undo:guarded-dirty-start` in summary output. This test was listed as "Done" by the prior executor but the badge expectation was not updated.
- **Fix:** Changed expectation to `badge: undo:safe` and renamed test to "surfaces safe undo/no-step fallback state".
- **Files modified:** `test/commands/log.test.ts`
- **Commit:** `124e69f`

**3. [Rule 3 - Blocking] Stale mock stubs for deleted DB functions in runner-recovery.test.ts**
- **Found during:** Task 2
- **Issue:** `test/core/runner-recovery.test.ts` still had mock stubs and db mock wiring for `getLatestProjectDirtyBaseline` and `upsertProjectDirtyBaseline` (functions deleted in plan 60-01). These were functional no-ops but blocked grep verification.
- **Fix:** Removed mock definitions and db mock wiring entries.
- **Files modified:** `test/core/runner-recovery.test.ts`
- **Commit:** `124e69f`

## Verification

- [x] `npm test` passes — 940 tests, 0 failures
- [x] `npx tsc --noEmit` passes — 0 errors
- [x] `grep -rn "classifyDirtyStart|allowDirtyStart|ProjectDirtyBaseline|force.dirty|undo-guarded-dirty-start|captureProjectDirtyBaseline|upsertProjectDirtyBaseline|getLatestProjectDirtyBaseline" src/ test/` — no matches
- [x] `startedDirty` still exists in Job type and test fixtures (informational)
- [x] Current-worktree-dirty guard in undo still works (protecting uncommitted work)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep `startedDirty` throughout all interfaces, DB schema, and test fixtures | Informational metadata — records whether worktree was dirty at launch for observability |
| Dirty-start jobs now return `undo:safe` instead of `undo:guarded-dirty-start` | Dirty state is no longer a guard condition — undo checkpoints are equally valid regardless |
| Remove `allowDirtyStart` from all positional `addJob` call expectations | The parameter was removed from `addJob()` in plan 60-01, shifting `skipGracePeriod` and `notifyRoute` positions |

## Duration

~15 minutes (Task 1 was pre-committed, Task 2 completed in this session)
