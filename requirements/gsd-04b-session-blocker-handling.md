# Session Blocker Handling — DB-Based Hung Detection

## Problem

GSD commands can hang on interactive prompts even with `--auto` + `mode: "yolo"`. The current runner uses PID liveness + `isSessionDone()` to detect completion, but a session waiting on an unanswered `question` tool call keeps its PID alive and never finishes — the runner polls forever.

## Goal

Use the opencode DB (which has full session state) to deterministically detect hung sessions. No wall-clock timeouts needed — the DB tells us exactly what happened.

## Requirements

### Must Have

#### DB-Based State Detection

The opencode DB has `session`, `message`, and `part` tables. Every tool call, tool result, assistant message, and step-finish is recorded. Use this to detect session state:

- [ ] New helper: `getSessionState(sessionId)` returns one of:
  - `'done'` — `step-finish` part exists with `reason: 'stop'` or `reason: 'length'`
  - `'working'` — latest part is a tool result, assistant text, or `step-finish` with `reason: 'tool-calls'` AND new tool calls are being processed (tool call has matching tool result)
  - `'hung-on-prompt'` — latest assistant message contains a `question` (or `AskUserQuestion`) tool call with NO corresponding tool result. The session is waiting for user input that will never come.
  - `'hung-on-tool'` — latest part is a tool call with no tool result, but it's NOT a `question` tool (could be a stuck bash command, etc.)
  - `'crashed'` — PID is dead AND no `step-finish` part exists

- [ ] Detection logic for `'hung-on-prompt'`:
  1. Query the latest message with `role: 'assistant'` for the session
  2. Check its `part` rows for tool calls (type `tool-call` or similar)
  3. If any tool call's `name` is `question` (OpenCode's equivalent of `AskUserQuestion`) AND there's no subsequent `tool-result` part for that call ID → session is hung on interactive prompt
  4. This is deterministic — no timing heuristics needed

- [ ] Replace `isSessionDone()` in `spawnAndWait()` with `getSessionState()`. The poll loop now checks:
  ```
  state = getSessionState(sessionId)
  if state === 'done' → return (success)
  if state === 'hung-on-prompt' → kill process, throw HungSessionError
  if state === 'hung-on-tool' → wait longer (might be a long build/test), apply wall timeout as safety net
  if state === 'crashed' → throw (existing behavior)
  if state === 'working' → continue polling
  ```

- [ ] `hung-on-prompt` detection is IMMEDIATE — as soon as the DB shows a pending `question` tool call with no result, kill the session. No need to wait for any timeout.

- [ ] For `hung-on-tool`, keep a modest wall timeout as safety net (e.g., 90 min for execute-phase) since long-running bash commands are legitimate. But this is rare and the default should be generous.

#### HungSessionError

- [ ] New error subclass:
  ```typescript
  class HungSessionError extends Error {
    hungReason: 'interactive-prompt' | 'stuck-tool' | 'unknown';
    lastToolCall?: string; // name of the tool that's pending
    sessionTitle: string;
  }
  ```

- [ ] On `hung-on-prompt`: log the tool call name and the question content (from the part's JSON data) for debugging
- [ ] On `hung-on-tool`: log the tool name and how long it's been pending

#### Kill Behavior

- [ ] When `hung-on-prompt` detected: SIGTERM → 5s wait → SIGKILL
- [ ] Remove PID from `sessionPids` map
- [ ] FIX existing bug: current timeout path does NOT kill the process. It only throws, leaving the process orphaned.

#### Retry Integration (extends gsd-07)

- [ ] `HungSessionError` caught at same level as judge `fail` verdict in workflow functions
- [ ] Hung retries share the SAME `retry_budget` as judge-fail retries
- [ ] `interactive-prompt` hang → retry with `--gaps` if phase had progress, else retry same command. Fresh session won't hit the same prompt if context changed.
- [ ] `stuck-tool` hang → retry same command (transient)
- [ ] Same-error detection: if two consecutive hangs are both `interactive-prompt` on the same tool, escalate immediately
- [ ] `hung_count` field on Job for observability

#### Notification

- [ ] Do NOT notify on each hung retry — only on budget exhaustion
- [ ] Budget exhaustion notification includes: hung reason, tool that blocked, session title

### Nice to Have

- [ ] `pilot log <id>` highlights the pending tool call that caused the hang
- [ ] `pilot info <id>` shows "Hung on: question tool (interactive prompt)" when applicable
- [ ] Wall timeout as absolute safety net (configurable, default 2 hours) for truly stuck sessions that don't trigger DB-based detection

## Technical Notes

- The opencode DB schema: `session` → `message` (role, session_id) → `part` (message_id, type, data JSON)
- Tool calls are `part` rows with type containing tool-call data. Tool results are separate parts.
- The `question` tool is OpenCode's equivalent of Claude Code's `AskUserQuestion`
- `getAssistantMessageCount()` and `getLastMessage()` already exist in `opencode-db.ts` — extend this module
- PID liveness check (`kill(pid, 0)`) remains as a complement for crash detection
- Parallel to `isSessionDone()` which checks `step-finish` — the new helper checks tool call state too

## Do NOT

- Do NOT use wall-clock timeouts as the primary detection mechanism — the DB knows the exact state
- Do NOT wait N minutes before checking for hung prompts — detect immediately on each poll
- Do NOT kill sessions with long-running legitimate tool calls (bash builds, test suites) — only kill on pending `question` tool calls
- Do NOT retry indefinitely — hung retries share gsd-07's budget
