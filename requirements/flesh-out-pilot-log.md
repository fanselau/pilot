# Flesh Out pilot log — Show Full Session Activity

## Problem
1. `pilot log` shows mostly empty lines for assistant messages — only shows `type=text` parts, but 95% of activity is tool calls, patches, and reasoning
2. Session linking is broken — jobs show "no sessions linked" even while actively running because `updateSessionTitles` was called after spawn, not before (fixed in runner.ts but delegation sessions still not tracked)
3. Delegation sessions are invisible — `pilot log` only shows execution sessions, not the delegation step that decided what to run
4. `pilot status` shows "Active" but `pilot log` shows "no sessions" — inconsistent and confusing

## Actual Part Types in opencode DB (from `part.data`)
- `text` — plain text output (RARE for assistant, common for user)
- `tool` — tool calls: bash, read, write, edit, etc. Has `tool`, `state.input`, `state.output`
- `step-start` — marks beginning of a step (has snapshot hash)
- `step-finish` — marks end of a step
- `reasoning` — model reasoning/thinking (has `text`)
- `patch` — file patches (has diff content)

## Goal
`pilot log <id>` should show a readable, compact activity stream — like watching a dev work. It should work from the moment a job starts (not just after completion), and should include delegation sessions.

## Requirements

### Must Have — Session Linking
- [ ] Verify `updateSessionTitles()` is called BEFORE `spawnAndWait()` in runner.ts (not after)
- [ ] Track delegation session titles: runner should call `updateSessionTitles(job.id, ['pilot-delegate-{id}-{attempt}'])` before calling `delegate()`
- [ ] `pilot log <id>` works immediately when a job starts, not just after completion
- [ ] If a job is active but has no sessions yet, show "Waiting for session to start..." instead of "no sessions linked"

### Must Have — Log Display
- [ ] Show `tool` parts with tool name + brief input/output summary
  - bash: show command + first 2 lines of output
  - read/write/edit: show file path
  - Other tools: show tool name + truncated input
- [ ] Show `text` parts (already working for user messages)
- [ ] Show `patch` parts as "Patched: <filename>" (don't dump full diffs)
- [ ] Skip `step-start`, `step-finish`, `reasoning` by default (noise)
- [ ] Each line compact: `HH:MM:SS [role] tool:bash $ command...` or `HH:MM:SS [role] text...`

### Must Have — Delegation Visibility
- [ ] Show delegation session as a labeled section: `── Delegation ──`
- [ ] Show execution session(s) as labeled sections: `── Execution: gsd-quick ──`
- [ ] If multiple steps, show each step's session separately

### Must Have — Flags
- [ ] `--verbose` flag to show reasoning and full tool output
- [ ] `--delegation` flag to show ONLY the delegation session

### Nice to Have
- [ ] `--tools-only` flag to show only tool calls (skip text)
- [ ] Color-code by part type (cyan=text, yellow=tool, green=patch)
- [ ] Show step boundaries as dim separator lines

## Technical Notes
- Part table: `part.data` is JSON, `part.message_id` links to `message.id`
- Tool part structure: `{"type":"tool","callID":"...","tool":"bash","state":{"status":"completed","input":{"command":"...","description":"..."},"output":"..."}}`
- Patch part structure: `{"type":"patch","operations":[...]}`
- Delegation session title format: `pilot-delegate-{jobId}-{attempt}` (from delegate.ts line 133)
- Execution session title format: `{project}-{command}-{jobId}` (from runner.ts truncateTitle)
- The `getSessionMessages()` function currently returns flat `SessionMessage[]` — needs a new `getSessionParts()` or similar that returns typed part data
- The runner already stores titles in `job.session_titles` as JSON array — the order is: delegation titles first, then execution titles

## Do NOT
- Show full tool output by default (truncate to ~100 chars)
- Show reasoning by default (use --verbose)
- Break the existing `--follow` mode
- Change the `isStuck()` function
