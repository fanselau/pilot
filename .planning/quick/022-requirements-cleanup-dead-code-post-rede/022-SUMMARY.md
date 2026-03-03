---
phase: quick-022
plan: 01
subsystem: core
tags: [cleanup, dead-code, opencode-db, refactor]

dependency-graph:
  requires: [quick-021]
  provides: [lean-opencode-db-exports, clean-phase-dirs]
  affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/core/opencode-db.ts
    - src/core/runner.ts
    - src/core/types.ts
    - test/core/opencode-db.test.ts

decisions:
  - "Removed 6 dead exports plus IsStuckResult type; kept 10 actively-imported exports"
  - "isSessionDone docstring rewritten to avoid naming the deleted isSessionActive()"
  - "getRecentSessions test block removed entirely (no replacement needed)"

metrics:
  duration: "5 minutes"
  completed: "2026-03-03"
---

# Quick Task 022: Dead Code Cleanup Post-Redesign Summary

**One-liner:** Removed 6 dead exports from opencode-db.ts (isSessionActive, isStuck, listSessionsFromDb, findSessionFromDb, getSessionMessageCountFromDb, getRecentSessions), deleted 4 empty duplicate phase directories, and scrubbed stale comments.

## What Was Done

### Task 1: Remove dead exports from opencode-db.ts and their tests

Removed 6 functions that were exported but never imported anywhere in `src/`:

1. `isSessionActive` — deprecated wrapper around `!isSessionDone()`. Deleted function + export.
2. `isStuck` — DB-based stuck detection, replaced by score-based stuck detection in stuck.ts. Deleted function + export.
3. `IsStuckResult` — type only used by `isStuck`. Deleted interface.
4. `listSessionsFromDb` — never imported. Deleted function + export.
5. `findSessionFromDb` — never imported. Deleted function + export.
6. `getSessionMessageCountFromDb` — never imported. Deleted function + export.
7. `getRecentSessions` — never imported. Deleted function + export.

Updated `test/core/opencode-db.test.ts`:
- Removed `isSessionActive` and `getRecentSessions` from imports
- Removed `describe('isSessionActive', ...)` block (5 tests)
- Removed `describe('getRecentSessions', ...)` block (4 tests)
- Removed `isSessionActive` and `getRecentSessions` tests from "safe defaults when DB unavailable" block
- Updated file header comment to reflect current tested functions

Updated `src/core/runner.ts` line 532:
- Removed reference to `isSessionActive()` from comment — replaced with plain description

Updated `src/core/types.ts` line 112:
- Changed `verdictReason` comment from `// reason from evaluateStepResult` to `// reason for the verdict`

Updated `src/core/opencode-db.ts` `isSessionDone` docstring:
- Removed mention of `isSessionActive()` from the historical context comment

### Task 2: Remove duplicate phase directories

Deleted 4 empty duplicate phase directories (no tracked files lost):

| Deleted | Canonical (kept) |
|---------|-----------------|
| `05-integration-fixes-per-requirements-integration-fixes-md/` | `05-integration-fixes/` |
| `11-finishing-touches-per-requirements-finishing-touches-md/` | `11-finishing-touches/` |
| `19-requirements-tui-phase-redo-md/` | `19-tui-phase-redo/` |
| `20-requirements-model-profile-support-md/` | `20-model-profile-support/` |

All canonical directories contained full PLAN + SUMMARY artifacts.

Confirmed TODO/FIXME comments in status.ts and gc.ts reference legitimate future work, not deleted functions — left as-is.

## Verification

- `npx tsc --noEmit` — zero errors ✅
- `npm run test:run` — 279/279 tests pass ✅
- `rg "isSessionActive|isStuck|listSessionsFromDb|findSessionFromDb|getSessionMessageCountFromDb|getRecentSessions" src/core/opencode-db.ts` — zero results ✅
- `rg "isSessionActive|evaluateStepResult|verifyStepArtifacts|verifyWithGraceWindow|patchStepArgs|scanPhaseDirs" src/` — zero results ✅
- No duplicate phase directory pairs remain ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale isSessionActive() reference in isSessionDone docstring**

- **Found during:** Task 1 verification grep
- **Issue:** The `isSessionDone()` function docstring contained "This replaces the broken `isSessionActive()`" — referencing the just-deleted function by name
- **Fix:** Rewrote the paragraph to describe behavior without naming the deleted function
- **Files modified:** src/core/opencode-db.ts
- **Commit:** 7482a48

None other — plan executed as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 7482a48 | `refactor(quick-022): remove dead exports from opencode-db.ts and update tests` |
| Task 2 | 17ec5e0 | `chore(quick-022): remove 4 duplicate empty phase directories` |
