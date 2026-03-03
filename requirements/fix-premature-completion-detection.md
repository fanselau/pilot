# Fix Opencode DB Heuristics — Completion Detection & Session Queries

## Problem
Multiple functions in `opencode-db.ts` and `runner.ts` use broken heuristics to query the opencode DB, causing premature job completion, false stuck detection, and phantom "patch unknown" logs.

**Full audit:** `~/.openclaw/workspace/research/pilot-opencode-heuristics-audit.md`
**DB schema research:** `~/.openclaw/workspace/research/opencode-db-session-lifecycle.md`

## 🔴 CRITICAL Fixes

### 1. Replace `isSessionActive()` with `isSessionDone()`

**Bug:** `isSessionActive()` checks for `part.state.status = 'running'` tool parts. Between tool calls / during AI thinking, no parts are "running" → returns false → runner thinks session is done while it's still working.

**Fix:** Create `isSessionDone(sessionId): boolean` that checks the **most recent `step-finish` part**:
```sql
SELECT json_extract(data, '$.reason') as reason
FROM part
WHERE session_id = ?
  AND json_extract(data, '$.type') = 'step-finish'
ORDER BY time_created DESC
LIMIT 1
```
- `reason = 'stop'` → session is DONE ✅
- `reason = 'tool-calls'` → still working (between steps)
- `reason = 'length'` → hit token limit (treat as done with warning)
- No rows → just started, still working

Keep `isSessionActive()` as a deprecated alias if needed, but all callers must migrate to `isSessionDone()`.

### 2. Rewrite `spawnAndWait()` polling loop (runner.ts ~line 510)

**Bug:** Uses broken `isSessionActive()` + 60s message age check. A session running a long tool (>60s) gets declared done.

**Fix — new polling logic:**
```
1. Spawn opencode, save proc.pid
2. Poll loop:
   a. isSessionDone(sessionId) → if true, return (success)
   b. kill(pid, 0) → if process dead:
      - isSessionDone() one final time
      - If still not done → return with warning ("process died without stop signal")
   c. Sleep pollMs
3. Timeout → throw
```

Remove the `isSessionActive()` + `getLastMessage()` age check entirely. The `step-finish` reason is the ground truth, PID liveness is belt-and-suspenders.

### 3. Fix `verifyWithGraceWindow()` liveness check

**Bug:** Uses `isSessionActive(sessionId) || (lastMsgAge < 60_000)` — same two broken signals.

**Fix:** Replace with `!isSessionDone(sessionId)` for the "session still alive" check.

## 🟡 IMPORTANT Fixes

### 4. Fix patch parsing in `parsePartRow()` (opencode-db.ts)

**Bug:** Reads `partData.operations[].path` but DB stores patches differently (likely `partData.files[]` as flat string array). Results in empty `patchFiles` arrays → "patch unknown" in logs.

**Fix:** Query a live patch part to verify schema:
```sql
SELECT data FROM part WHERE json_extract(data, '$.type') = 'patch' LIMIT 1
```
Then update parsing to match actual structure. This is a one-line fix once the schema is confirmed.

### 5. Harden `evaluateStepResult()`

**Bug:** Treats "uncertain" (no success or failure markers matched) as `success: true`. Narrow regex patterns miss common failures.

**Fixes:**
- Add failure patterns: `"compilation failed"`, `"build error"`, `"test failed"`, `"syntax error"`, `"I was unable to"`, `"I couldn't"`, `"Unfortunately, I"`, `"fatal error"`
- Check if ANY tool parts have `status='error'` as an additional failure signal
- Change uncertain from `success: true` to `success: false` (fail-safe — better to retry than to silently skip)
- Or at minimum: when uncertain AND `step-finish` reason was `stop`, treat as success; when uncertain AND reason was `tool-calls`/`length`, treat as failure

### 6. Fix `isStuck()` — check ANY running part

**Bug:** Only checks the last part. If the last part is `text` or `step-start`, returns NOT_STUCK even if a previous tool part is still running.

**Fix:** Query for ANY part with `status='running'` in the session, not just the last one. Also detect `pending` parts with stale timestamps (>120s) as killed-session indicators.

## 🟢 MINOR Fixes (do if time permits)

### 7. `getLastMessage()` — filter by role
Add `getLastAssistantMessage()` variant that filters `WHERE json_extract(data, '$.role') = 'assistant'` for use in `evaluateStepResult()`.

### 8. `waitForDelegationResult()` — add completion check
Check `isSessionDone()` before attempting to parse delegation output, preventing race on partial output.

## Technical Notes
- All changes in `src/core/opencode-db.ts` and `src/core/runner.ts`
- `isSessionDone()` should be exported for use in runner, TUI data layer, and verifyWithGraceWindow
- The `proc.pid` from `execa()` in `spawnAndWait()` is already available — just need to track it
- For PID check: `try { process.kill(pid, 0); return true; } catch { return false; }` 
- Update tests in `test/core/runner.test.ts` and `test/core/opencode-db.test.ts` — mock `isSessionDone` instead of `isSessionActive`

## Do NOT
- Keep `isSessionActive()` as a primary signal anywhere — it's fundamentally broken
- Use message timestamps (60s gap) as a completion signal — long tool runs exceed this
- Add IPC between runner and opencode — DB + PID is sufficient
- Remove `evaluateStepResult()` — it's a useful secondary check, just needs hardening
- Skip the patch parsing fix — "patch unknown" floods the logs
