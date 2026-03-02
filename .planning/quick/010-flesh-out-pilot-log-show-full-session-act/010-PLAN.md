---
phase: quick-010
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - src/core/types.ts
  - src/commands/log.ts
  - test/core/opencode-db.test.ts
autonomous: true
must_haves:
  truths:
    - "pilot log shows tool calls with tool name + brief input/output summary"
    - "pilot log shows patch parts as 'Patched: <filename>'"
    - "pilot log shows delegation sessions as labeled sections"
    - "pilot log shows execution sessions as labeled sections"
    - "pilot log --verbose shows reasoning and full tool output"
    - "pilot log --delegation shows only the delegation session"
    - "pilot log shows 'Waiting for session to start...' when job is active but no sessions yet"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "getSessionParts() function returning typed part data"
      exports: ["getSessionParts"]
    - path: "src/core/types.ts"
      provides: "SessionPart type for typed part data"
      contains: "SessionPart"
    - path: "src/commands/log.ts"
      provides: "Full activity stream rendering with delegation sections"
  key_links:
    - from: "src/commands/log.ts"
      to: "src/core/opencode-db.ts"
      via: "getSessionParts() import"
      pattern: "getSessionParts"
    - from: "src/commands/log.ts"
      to: "src/core/types.ts"
      via: "SessionPart type import"
      pattern: "SessionPart"
---

<objective>
Flesh out `pilot log` to show full session activity — tool calls, patches, delegation sessions — instead of mostly empty lines.

Purpose: Currently `pilot log` only shows `type=text` parts, but 95% of activity is tool calls, patches, and reasoning. This makes the log nearly useless for understanding what a job is doing.
Output: A readable, compact activity stream that shows what an AI dev session is actually doing.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/flesh-out-pilot-log.md
@src/core/opencode-db.ts
@src/core/types.ts
@src/commands/log.ts
@test/core/opencode-db.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getSessionParts() to opencode-db.ts and SessionPart type</name>
  <files>src/core/types.ts, src/core/opencode-db.ts, test/core/opencode-db.test.ts</files>
  <action>
1. Add `SessionPart` type to `src/core/types.ts`:
```typescript
export interface SessionPart {
  id: string;
  messageId: string;
  role: string;          // from parent message's data.role
  type: string;          // text, tool, patch, step-start, step-finish, reasoning
  createdAt: number;     // epoch ms
  // Tool-specific fields (present when type='tool')
  tool?: string;         // bash, read, write, edit, glob, grep, etc.
  toolInput?: string;    // truncated input summary
  toolOutput?: string;   // truncated output summary
  toolStatus?: string;   // running, completed, error
  // Text/reasoning fields
  text?: string;         // text content
  // Patch fields
  patchFiles?: string[]; // filenames from patch operations
}
```

2. Add `getSessionParts()` function to `src/core/opencode-db.ts`:
  - Query: `SELECT p.id, p.message_id, p.data, p.time_created, m.data as message_data FROM part p JOIN message m ON p.message_id = m.id WHERE p.session_id = ? [AND p.time_created > ?] ORDER BY p.time_created ASC`
  - Parse each part's `data` JSON into a `SessionPart`:
    - Extract `role` from `message_data` JSON
    - For `type='tool'`: extract `tool` from `data.tool`, `toolInput` from `data.state.input` (truncate to 200 chars), `toolOutput` from `data.state.output` (truncate to 100 chars), `toolStatus` from `data.state.status`
    - For tool=bash specifically: extract `data.state.input.command` as toolInput, first 2 lines of `data.state.output` as toolOutput
    - For tool=read/write/edit: extract file path from `data.state.input` (look for `filePath` or `path` field)
    - For `type='text'`: extract `data.text` field
    - For `type='reasoning'`: extract `data.text` field
    - For `type='patch'`: extract filenames from `data.operations` array (each op has a `path` field) → store as `patchFiles`
    - For `type='step-start'`/`type='step-finish'`: just set the type, no extra fields
  - Export `getSessionParts` from module

3. Add tests to `test/core/opencode-db.test.ts`:
  - `getSessionParts` returns parts in chronological order with correct types
  - Tool parts extract tool name, input summary, output summary
  - Bash tool parts extract command and first 2 lines of output
  - Read/write/edit tool parts extract file path
  - Patch parts extract filenames from operations
  - Text and reasoning parts extract text content
  - `since` parameter filters correctly
  - Empty/nonexistent session returns empty array
  </action>
  <verify>
Run `npx vitest run test/core/opencode-db.test.ts` — all existing + new tests pass.
Run `npx tsc --noEmit` — no type errors.
  </verify>
  <done>
`getSessionParts()` returns typed part data with tool/text/patch/reasoning extraction. All tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite log.ts to show full activity stream with delegation sections</name>
  <files>src/commands/log.ts</files>
  <action>
Rewrite `src/commands/log.ts` to use `getSessionParts()` instead of `getSessionMessages()` for the activity display.

1. **Add flags:**
  - `--verbose` / `-v`: Show reasoning parts and full tool output (not truncated)
  - `--delegation`: Show ONLY the delegation session

2. **Session categorization:** The job's `sessionTitles` JSON array has delegation titles first (pattern: `pilot-delegate-{jobId}-N`), then execution titles (pattern: `{project}-{command}-{jobId}`). Categorize each title by matching the `pilot-delegate-` prefix.

3. **Rendering structure:** For each session (in order from sessionTitles):
  - Print a section header:
    - Delegation sessions: `── Delegation ──`
    - Execution sessions: `── Execution: {command} ──` (extract command from title, e.g. `resume-roast-quick-ab12` → `quick`)
  - Print parts for that session using `getSessionParts(sessionId)`

4. **Part formatting (compact, one line per part):**
  - `tool` parts:
    - bash: `HH:MM:SS  [assistant] bash $ {command}` (truncate command to 100 chars). If toolOutput exists and non-verbose: show dim `→ {first 2 lines of output}` on next line, indented
    - read: `HH:MM:SS  [assistant] read {filePath}`
    - write: `HH:MM:SS  [assistant] write {filePath}`
    - edit: `HH:MM:SS  [assistant] edit {filePath}`
    - glob/grep: `HH:MM:SS  [assistant] {tool} {truncated input}`
    - Other tools: `HH:MM:SS  [assistant] {tool} {truncated input, 80 chars}`
    - Color: yellow for tool line
  - `text` parts:
    - User: `HH:MM:SS  [user] {text}` (truncate to 200 chars unless --verbose)
    - Assistant: `HH:MM:SS  [assistant] {text}` (truncate to 200 chars unless --verbose)
    - Color: cyan for text, green for user
  - `patch` parts: `HH:MM:SS  [assistant] patch {file1}, {file2}, ...` (green)
  - `reasoning` parts: SKIP by default. With `--verbose`: `HH:MM:SS  [thinking] {text}` (dim)
  - `step-start`/`step-finish`: SKIP entirely

5. **--delegation flag:** If set, only render parts from delegation sessions (skip execution sessions).

6. **"Waiting" state:** If job is running (status === 'running') and session titles is empty or no sessions found in opencode DB, show `Waiting for session to start...` instead of `(no sessions linked to this job)`.

7. **--follow mode:** Keep existing polling behavior but use `getSessionParts()` instead of `getSessionMessages()`. Poll all sessions (delegation + execution), track `lastSeen` per session to avoid duplicates.

8. **JSON output:** When `--json`, include full part data (not truncated) with `{ job, sessions: [{ title, type: 'delegation'|'execution', parts: SessionPart[] }] }`.

9. **DO NOT change the `isStuck()` function.** DO NOT break the existing `--follow` mode flow (Ctrl-C exit, polling interval).
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Run `npx vitest run` — all tests pass (no regressions).
Manually test: `pilot log <running-job-id>` shows tool calls, patches, and session sections.
  </verify>
  <done>
`pilot log` shows a compact activity stream with tool calls (bash commands, file operations), patches, delegation/execution session sections, and supports --verbose and --delegation flags. Follow mode works with part-level data.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `npx vitest run test/core/opencode-db.test.ts` passes (new getSessionParts tests)
- `npx vitest run` passes (no regressions)
- `pilot log <job-id>` shows tool calls, patches, session headers
- `pilot log --verbose <job-id>` shows reasoning and full output
- `pilot log --delegation <job-id>` shows only delegation session
- `pilot log --follow <job-id>` streams new parts in real-time
</verification>

<success_criteria>
- `pilot log` shows readable activity stream with tool names, commands, file paths, and patches
- Delegation and execution sessions are labeled with section headers
- --verbose shows reasoning and full output
- --delegation filters to delegation sessions only
- Active jobs with no sessions show "Waiting for session to start..."
- All existing tests pass, new getSessionParts tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/010-flesh-out-pilot-log-show-full-session-act/010-SUMMARY.md`
</output>
