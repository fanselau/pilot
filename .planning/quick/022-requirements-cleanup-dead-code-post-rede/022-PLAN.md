---
phase: quick-022
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - src/core/types.ts
  - test/core/opencode-db.test.ts
  - .planning/phases/ (duplicate directories removed)
autonomous: true

must_haves:
  truths:
    - "No dead exported functions remain in opencode-db.ts"
    - "No stale comments reference deleted functions"
    - "No duplicate phase directories exist"
    - "tsc --noEmit passes clean"
    - "npm run test:run passes green"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "Clean exports — only actually-imported functions exported"
    - path: "src/core/types.ts"
      provides: "Clean type comments — no references to deleted functions"
    - path: "test/core/opencode-db.test.ts"
      provides: "Tests updated — no tests for deleted functions"
  key_links:
    - from: "src/core/opencode-db.ts"
      to: "all importers"
      via: "named exports"
      pattern: "Only functions actually imported somewhere remain exported"
---

<objective>
Remove dead code accumulated after the phase redesign (quick-021: single-session orchestrator + judge evaluation). Clean exports, delete stale tests, remove duplicate phase directories, resolve stale comments.

Purpose: Reduce codebase noise and confusion. Dead exports, stale comments, and duplicate phase directories make the code harder to understand and maintain.

Output: Leaner opencode-db.ts, cleaner types.ts, updated tests, no duplicate .planning directories.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/cleanup-dead-code-post-redesign.md
@src/core/opencode-db.ts
@src/core/runner.ts
@src/core/types.ts
@test/core/opencode-db.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove dead exports from opencode-db.ts and their tests</name>
  <files>
    src/core/opencode-db.ts
    test/core/opencode-db.test.ts
  </files>
  <action>
**Dead exports identified (exported but NEVER imported in any src/ file):**

1. `isSessionActive` (line 630-632) — deprecated wrapper around `!isSessionDone()`. No importer in src/commands/, src/tui/, or src/core/ besides its own export. Remove the function definition AND its export.
2. `isStuck` (line 725+) — DB-based stuck detection function. Never imported by any src/ file. Remove the function definition AND its export. Also remove the `IsStuckResult` type if defined locally.
3. `listSessionsFromDb` (line 83+) — Never imported by any src/ file. Remove function and export.
4. `findSessionFromDb` (line 119+) — Never imported by any src/ file. Remove function and export.
5. `getSessionMessageCountFromDb` (line 208+) — Never imported by any src/ file. Remove function and export.
6. `getRecentSessions` (line 674+) — Never imported by any src/ file. Remove function and export.

**Keep everything else** — `openDb`, `findSessionByTitle`, `exportSessionFromDb`, `getSessionMessages`, `getSessionParts`, `getChildSessions`, `getLastMessage`, `isSessionDone`, `getSessionTokens`, `_resetDbCache`, `_setTestDb` are all actively imported.

**Update test file:**
- In `test/core/opencode-db.test.ts`: Remove the `isSessionActive` import and its entire `describe('isSessionActive', ...)` block (lines ~490-545 and line ~666-668).
- Remove any test imports/describes for `isStuck`, `listSessionsFromDb`, `findSessionFromDb`, `getSessionMessageCountFromDb`, `getRecentSessions` if they exist.
- Update the file header comment that mentions `isSessionActive`.

**Update stale comment in runner.ts:**
- Line 534: Comment references `isSessionActive()` — update to just say "eliminated the broken premature completion heuristic" without naming the deleted function.

**Update stale comment in types.ts:**
- Line 112: `verdictReason: string | null; // reason from evaluateStepResult` — remove the comment since `evaluateStepResult` no longer exists. Change to `verdictReason: string | null; // reason for the verdict`.
  </action>
  <verify>
    Run `npx tsc --noEmit` — must pass with zero errors.
    Run `npm run test:run` — all tests must pass.
    Grep: `rg "isSessionActive|isStuck|listSessionsFromDb|findSessionFromDb|getSessionMessageCountFromDb|getRecentSessions" src/core/opencode-db.ts` — should return zero results.
  </verify>
  <done>
    All 6 dead exports removed from opencode-db.ts. Corresponding tests removed. Stale comments updated in runner.ts and types.ts. tsc and tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove duplicate phase directories and resolve remaining dead references</name>
  <files>
    .planning/phases/ (duplicate directories)
    src/core/runner.ts (stale comment)
  </files>
  <action>
**Remove duplicate/superseded phase directories:**

These directories have duplicates (one with a requirements-... slug, one without). Verify which is the real one by checking for SUMMARY.md files and plan content, then delete the empty/stale duplicate:

1. `.planning/phases/05-integration-fixes-per-requirements-integration-fixes-md/` — likely the stale duplicate of `05-integration-fixes/`. Check both — the one with SUMMARYs is canonical. Delete the other.
2. `.planning/phases/11-finishing-touches-per-requirements-finishing-touches-md/` — likely the stale duplicate of `11-finishing-touches/`. Same check-and-delete.
3. `.planning/phases/19-requirements-tui-phase-redo-md/` — likely the stale duplicate of `19-tui-phase-redo/`. Same check-and-delete.
4. `.planning/phases/20-requirements-model-profile-support-md/` — likely the stale duplicate of `20-model-profile-support/`. Same check-and-delete.

**For each pair:** `ls` both directories, check which has PLAN.md and SUMMARY.md files. The one with actual artifacts is canonical. Delete the empty/duplicate one via `rm -rf`.

**Scan for TODO/FIXME/HACK referencing old code:**
- `src/commands/status.ts` line 118: `daemon: { active: false }, // TODO: detect daemon via PID/service` — This is a legitimate TODO for future work, leave it.
- `src/commands/gc.ts` line 31: `TODO: Implement cleanup in future iteration` — This is a legitimate TODO, leave it.
- No other TODO/FIXME/HACK comments reference deleted code.

**Final validation:** Run full test suite and type check one more time to confirm nothing broke.
  </action>
  <verify>
    No duplicate phase directory pairs remain: `ls .planning/phases/ | sort | uniq -d` should show nothing.
    `npx tsc --noEmit` passes.
    `npm run test:run` passes.
  </verify>
  <done>
    Duplicate phase directories removed. No stale TODO/FIXME comments reference deleted functions. Full type check and test suite pass clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npm run test:run` — all tests pass
3. `rg "isSessionActive|evaluateStepResult|verifyStepArtifacts|verifyWithGraceWindow|patchStepArgs|scanPhaseDirs" src/` — only legitimate references (not function definitions or exports)
4. No duplicate phase directories in `.planning/phases/`
</verification>

<success_criteria>
- All 6 dead exports removed from opencode-db.ts
- Tests for deleted functions removed
- Stale comments updated (types.ts evaluateStepResult ref, runner.ts isSessionActive ref)
- 4 duplicate phase directories deleted
- tsc --noEmit passes clean
- npm run test:run passes green
</success_criteria>

<output>
After completion, create `.planning/quick/022-requirements-cleanup-dead-code-post-rede/022-SUMMARY.md`
</output>
