---
phase: quick-018
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - src/core/runner.ts
  - src/commands/status.ts
  - src/tui/data/opencode-db.ts
  - test/core/opencode-db.test.ts
  - test/core/runner.test.ts
autonomous: true

must_haves:
  truths:
    - "Runner detects session completion via step-finish reason='stop', not by checking for running parts"
    - "Long-running tool calls (>60s) no longer trigger premature session-done detection"
    - "evaluateStepResult treats uncertain results as failure (fail-safe), not success"
    - "Patch parsing in parsePartRow reads actual DB patch schema (files[] array)"
    - "isStuck checks for ANY running part in the session, not just the last part"
    - "verifyWithGraceWindow uses isSessionDone for liveness, not isSessionActive+60s message age"
    - "All callers (status.ts, TUI data layer) migrated from isSessionActive to isSessionDone"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "isSessionDone() function replacing isSessionActive()"
      exports: ["isSessionDone"]
    - path: "src/core/runner.ts"
      provides: "Fixed spawnAndWait polling, evaluateStepResult hardening, verifyWithGraceWindow fix"
    - path: "test/core/opencode-db.test.ts"
      provides: "Tests for isSessionDone()"
    - path: "test/core/runner.test.ts"
      provides: "Updated evaluateStepResult tests for fail-safe uncertain behavior"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/opencode-db.ts"
      via: "import isSessionDone"
      pattern: "isSessionDone"
    - from: "src/commands/status.ts"
      to: "src/core/opencode-db.ts"
      via: "import isSessionDone"
      pattern: "isSessionDone"
---

<objective>
Fix premature completion detection and broken heuristics in opencode-db.ts and runner.ts.

Purpose: The runner uses `isSessionActive()` which checks for running tool parts — but between tool calls there are no running parts, causing premature "session done" detection. This is the #1 reliability bug. Also fix `evaluateStepResult()` uncertain→success (should be fail-safe), patch parsing, and `isStuck()` last-part-only check.

Output: Fixed completion detection via `isSessionDone()` (step-finish reason), hardened `evaluateStepResult()`, fixed patch parsing, improved `isStuck()`, all callers migrated.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/fix-premature-completion-detection.md
@src/core/opencode-db.ts
@src/core/runner.ts
@src/commands/status.ts
@src/tui/data/opencode-db.ts
@test/core/opencode-db.test.ts
@test/core/runner.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add isSessionDone() and fix opencode-db.ts heuristics</name>
  <files>src/core/opencode-db.ts, test/core/opencode-db.test.ts</files>
  <action>
  In `src/core/opencode-db.ts`:

  1. **Create `isSessionDone(sessionId): boolean`** — the replacement for `isSessionActive()`. Query the most recent `step-finish` part:
     ```sql
     SELECT json_extract(data, '$.reason') as reason
     FROM part
     WHERE session_id = ?
       AND json_extract(data, '$.type') = 'step-finish'
     ORDER BY time_created DESC
     LIMIT 1
     ```
     - `reason = 'stop'` → return `true` (session is done)
     - `reason = 'length'` → return `true` (hit token limit, treat as done — log warning to stderr)
     - `reason = 'tool-calls'` → return `false` (still working, between steps)
     - No rows → return `false` (just started, still working)

  2. **Keep `isSessionActive()` as deprecated alias** that delegates to `!isSessionDone()`. Add JSDoc `@deprecated Use isSessionDone() instead`.

  3. **Fix `parsePartRow()` patch parsing** (line 459-474): The current code reads `partData.operations[].path` but the DB likely stores patches as `partData.files[]` flat string array. Update to try BOTH formats:
     - Try `partData.files` first (if it's a string array, use it directly)
     - Fall back to `partData.operations[].path` for backward compat
     This way it works regardless of actual schema.

  4. **Fix `isStuck()` to check ANY running part** (line 670-763): Currently queries only the last part (`LIMIT 1`). Change to query for ANY part with `status='running'`:
     ```sql
     SELECT json_extract(p.data, '$.tool') as tool,
            json_extract(p.data, '$.state.status') as status,
            p.time_updated
     FROM part p
     WHERE p.session_id = ?
       AND json_extract(p.data, '$.state.status') = 'running'
     ORDER BY p.time_created DESC
     LIMIT 1
     ```
     Also add detection for `pending` parts with stale timestamps (>120s since time_updated) as killed-session indicators — query separately if no running parts found.

  5. **Add `isSessionDone` to exports.** Keep `isSessionActive` in exports for backward compat.

  In `test/core/opencode-db.test.ts`:

  6. **Add `isSessionDone` tests** — import and test:
     - Session with step-finish reason='stop' → returns true
     - Session with step-finish reason='tool-calls' → returns false
     - Session with step-finish reason='length' → returns true
     - Session with no step-finish parts → returns false
     - Non-existent session → returns false
     - DB unavailable → returns false

  7. **Update `isSessionActive` tests** to note it's deprecated but still works (delegates to `!isSessionDone()`).
  </action>
  <verify>
  Run `npx vitest run test/core/opencode-db.test.ts` — all tests pass including new isSessionDone tests.
  Run `npx tsc --noEmit` — no type errors.
  </verify>
  <done>
  `isSessionDone()` correctly detects session completion via step-finish reason.
  `parsePartRow()` handles both patch formats.
  `isStuck()` checks ALL running parts, not just the last one.
  All existing tests still pass, new tests cover isSessionDone.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix runner.ts polling + evaluateStepResult + migrate all callers</name>
  <files>src/core/runner.ts, src/commands/status.ts, src/tui/data/opencode-db.ts, test/core/runner.test.ts</files>
  <action>
  In `src/core/runner.ts`:

  1. **Update import** (line 42): Replace `isSessionActive` with `isSessionDone` from `./opencode-db.js`. Remove `getLastMessage` from the opencode-db import (still needed for `evaluateStepResult`, but check — it's used in evaluateStepResult so keep it if needed).
     - Actually `getLastMessage` IS used by `evaluateStepResult` (line 722). Keep it imported.
     - Import `isSessionDone` from `./opencode-db.js` instead of `isSessionActive`.

  2. **Rewrite `spawnAndWait()` polling loop** (lines 509-548): Replace the broken `isSessionActive()` + 60s message age check with:
     ```
     Poll loop:
       a. isSessionDone(sessionId) → if true, return (session completed normally)
       b. Check PID liveness: try { process.kill(proc.pid, 0) } catch → dead
          - If process dead: isSessionDone() one final check
          - If done → return
          - If not done → log warning "process died without stop signal", return
       c. Sleep pollMs
     Timeout → throw
     ```
     Key changes:
     - Track `proc.pid` (it's already available from the execa spawn on line 486-503)
     - Remove the `isSessionActive()` call entirely
     - Remove the `getLastMessage()` + 60s age check entirely
     - Add PID liveness check as belt-and-suspenders

  3. **Fix `verifyWithGraceWindow()` liveness check** (lines 630-697): Replace:
     ```typescript
     const active = isSessionActive(sessionId);
     const lastMsg = getLastMessage(sessionId);
     lastMsgAgeMs = lastMsg ? Date.now() - lastMsg.createdAt : null;
     sessionAlive = active || (lastMsgAgeMs !== null && lastMsgAgeMs < 60_000);
     ```
     With:
     ```typescript
     sessionAlive = !isSessionDone(sessionId);
     ```
     Remove the `getLastMessage` import from opencode-db.js IF it's no longer used outside `evaluateStepResult`. Check all usages within runner.ts first. Since `evaluateStepResult` still uses `getLastMessage`, keep the import.

  4. **Harden `evaluateStepResult()`** (lines 721-783):
     - Add failure patterns: `"compilation failed"`, `"build error"`, `"test failed"`, `"syntax error"`, `"I was unable to"`, `"I couldn't"`, `"Unfortunately, I"`, `"fatal error"`
     - Change the uncertain fallback (line 774-782) from `success: true` to `success: false` — fail-safe is better than phantom completion
     - Update the uncertain return object: `{ success: false, reason: 'No success markers detected (uncertain — failing safe)', source: 'semantic-check', certainty: 'uncertain' }`

  In `src/commands/status.ts`:

  5. **Migrate `isJobStale()`** (lines 84-101): Replace `isSessionActive` import with `isSessionDone`. Change line 98 from `return !isSessionActive(sessionId)` to `return isSessionDone(sessionId)`.

  In `src/tui/data/opencode-db.ts`:

  6. **Migrate re-export** (line 184): Replace `isSessionActive` with `isSessionDone` in both the import (line 17) and the re-export (line 184).

  In `test/core/runner.test.ts`:

  7. **Update opencode-db mock** (line 59-63): Replace `isSessionActive` mock with `isSessionDone` mock.

  8. **Update `evaluateStepResult` uncertain test** (line 468-475): Change expected `success` from `true` to `false` — uncertain now returns fail-safe.

  9. **Add new failure pattern tests** for the additional patterns added to `evaluateStepResult`: test that "compilation failed", "I was unable to", "fatal error" etc. are detected as failures.
  </action>
  <verify>
  Run `npx vitest run test/core/runner.test.ts` — all tests pass including updated uncertain behavior.
  Run `npx vitest run test/commands/status.test.ts` — status tests pass.
  Run `npx tsc --noEmit` — no type errors across entire project.
  Run `npx vitest run` — full test suite passes.
  </verify>
  <done>
  - `spawnAndWait()` uses `isSessionDone()` + PID liveness, no more 60s message age heuristic
  - `verifyWithGraceWindow()` uses `isSessionDone()` for liveness
  - `evaluateStepResult()` has expanded failure patterns and fail-safe uncertain behavior
  - All callers (status.ts, TUI data layer) migrated from isSessionActive to isSessionDone
  - All tests updated and passing
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — full test suite passes
3. `grep -r "isSessionActive" src/` — only the deprecated alias definition in opencode-db.ts remains; no active callers
4. `grep -r "isSessionDone" src/` — present in opencode-db.ts (definition), runner.ts, status.ts, tui/data/opencode-db.ts
</verification>

<success_criteria>
- isSessionDone() is the primary completion detection mechanism, using step-finish reason as ground truth
- spawnAndWait() polling no longer uses message age or isSessionActive — uses isSessionDone + PID liveness
- evaluateStepResult() uncertain fallback is fail-safe (success: false)
- evaluateStepResult() has expanded failure patterns covering common error messages
- isStuck() checks ANY running part, not just the last one
- parsePartRow() handles both patch data formats
- All callers migrated from isSessionActive to isSessionDone
- Full test suite passes with no regressions
</success_criteria>

<output>
After completion, create `.planning/quick/018-requirements-fix-premature-completion-de/018-SUMMARY.md`
</output>
