# Phase 60 Plan 01: Remove Dirty-Guard Blocking from Runner + Delete Provenance System

Remove dirty-guard launch blocking and --force-dirty CLI flag; dirty worktrees never block job launch. Only real failures block projects. `startedDirty` kept as informational metadata.

## Tasks Completed

### Task 1: Remove dirty-guard blocking from runner + delete provenance system
- **git-recovery.ts:** Deleted `classifyDirtyStart()`, `DirtyStartClassification` interface, `getBranchOrNull()`. Removed `ProjectDirtyBaseline` import. Kept `getPorcelainStatus` as private (used by `isWorktreeDirty`). Cleaned exports.
- **runner.ts:** Removed imports of `getLatestProjectDirtyBaseline`, `upsertProjectDirtyBaseline`, `getBranchOrNull`, `getPorcelainStatus`, `classifyDirtyStart`. Deleted the `if (startedDirty)` blocking check in launch preflight. Deleted `captureProjectDirtyBaseline()` private method and both call sites (success + error paths).
- **types.ts:** Deleted `allowDirtyStart` from Job interface. Deleted `ProjectDirtyBaseline` interface entirely.
- **db.ts:** Deleted `CREATE_PROJECT_DIRTY_BASELINES_TABLE_SQL` DDL and both exec calls (openPilotDb + _getTestDb). Deleted `ProjectDirtyBaselineRow` interface, `rowToProjectDirtyBaseline()`, `upsertProjectDirtyBaseline()`, `getLatestProjectDirtyBaseline()`. Removed `allow_dirty_start` from CREATE TABLE DDL, `addJob()` parameter/SQL/values, `JobRow` interface, `rowToJob()` mapping, ALTER TABLE migration, and exports. Removed `ProjectDirtyBaseline` type import.
- **info.ts (deviation):** Removed `allowDirtyStart` from `RecoveryInfo` interface, `inferRecoveryFromMetadata()` parameter and return value, `buildRecoveryInfo()` parameter type and all call sites, and "Allow dirty" display line. Required for TypeScript compilation.
- **Commit:** `79c7d83`

### Task 2: Remove --force-dirty CLI flag and add command plumbing
- **index.ts:** Removed `--force-dirty` option from add command definition.
- **add.ts:** Removed `forceDirty` from `AddOptions` interface. Removed `opts.forceDirty ?? false` from all 4 `addJob()` call sites. Deleted the `if (opts.forceDirty)` warning output block.
- **Commit:** `68b1889`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed allowDirtyStart from info.ts RecoveryInfo**
- **Found during:** Task 1
- **Issue:** `info.ts` references `allowDirtyStart` in RecoveryInfo interface, inferRecoveryFromMetadata(), buildRecoveryInfo(), and display output. TypeScript would not compile without cleaning these.
- **Fix:** Removed `allowDirtyStart` from all 6 locations in info.ts (interface field, function parameter, 5 call sites, return value, display line).
- **Files modified:** `src/commands/info.ts`
- **Commit:** `79c7d83` (included in Task 1 commit)

## Verification

- [x] `npx tsc --noEmit` passes
- [x] `grep -r "classifyDirtyStart" src/` — no matches
- [x] `grep -r "allowDirtyStart" src/` — no matches
- [x] `grep -r "ProjectDirtyBaseline" src/` — no matches
- [x] `grep -r "captureProjectDirtyBaseline" src/` — no matches
- [x] `grep -r "force-dirty" src/` — no matches
- [x] `isGitWorktree`, `isWorktreeDirty`, `resolveCommitOrNull`, `detectGitConflictState` still exist in git-recovery.ts
- [x] `startedDirty` still exists in types.ts Job interface

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep `getPorcelainStatus` as private function in git-recovery.ts | `isWorktreeDirty()` calls it internally — removing would break the worktree dirty check |
| Remove `allowDirtyStart` from info.ts as part of Task 1 | TypeScript compilation requires consistent type removal across all consumers |
| Keep `startedDirty` throughout all interfaces and DB schema | Informational metadata — records whether worktree was dirty at launch for observability |

## Duration

~6 minutes
