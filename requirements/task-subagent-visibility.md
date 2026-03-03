# Task/Subagent Visibility in TUI and Logs

## Problem

When GSD orchestrators (execute-phase, quick) spawn subagent tasks via the `task` tool, the log and TUI show only:
```
11:56:48  [assistant] task {"description":"Quick plan for inline editing","subagent_type":"gsd-planner",...}
```

There's no way to see what the subagent actually DID. The child session exists in opencode's DB (linked via `parent_id`), but pilot doesn't fetch or display it. This makes debugging phase failures nearly impossible — you see the orchestrator spawn tasks but can't see if the executor actually wrote code, hit errors, or got stuck.

## Goal

Task subagent sessions are visible in both `pilot log` and the TUI detail view. Users can drill into any task to see the full child session activity.

## Requirements

### Must Have

- [ ] **Detect and resolve child sessions**: In `opencode-db.ts`, add a function `getChildSessions(parentSessionId)` that queries:
  ```sql
  SELECT id, title, time_created, time_updated FROM session 
  WHERE parent_id = ? ORDER BY time_created ASC
  ```
  Returns array of `{id, title, timeCreated, timeUpdated}`.

- [ ] **Expand task parts in fetchJobParts**: When processing parts for a session section, detect parts with `tool === 'task'`. For each task part:
  - Find the child session via `getChildSessions(currentSessionId)` (match by creation time proximity or title)
  - Fetch the child session's parts recursively
  - Nest them as a sub-section within the current section
  - Update `SessionSection` type to support nesting:
    ```typescript
    interface SessionSection {
      title: string;
      type: 'delegation' | 'execution' | 'subagent';
      command?: string;
      agentType?: string;  // 'gsd-planner', 'gsd-executor', etc.
      parts: SessionPart[];
      children?: SessionSection[];  // nested subagent sections
    }
    ```

- [ ] **Display nested sections in TUI detail view**: In `detail.tsx`, render child sections indented under their parent task:
  ```
  ── Execution: quick ──
  11:56:48  [assistant] task spawn: gsd-planner — "Quick plan for inline editing"
    ── Subagent: gsd-planner ──
    11:56:50  [assistant] read .planning/STATE.md
    11:56:52  [assistant] Created plan: 3 steps...
    ── End subagent ──
  11:59:42  [assistant] task spawn: gsd-executor — "Execute inline editing quick task"
    ── Subagent: gsd-executor ──
    11:59:44  [assistant] read 016-01-PLAN.md
    11:59:50  [assistant] edit src/components/Editor.tsx
    12:00:15  [assistant] bash $ pnpm build
    ── End subagent ──
  ```
  Use 2-space indentation and dimmer section headers for nesting.

- [ ] **`pilot log` CLI shows nested tasks**: In the log command output, display child session activity inline (indented) after each `task` part. Add a `--flat` flag to suppress nesting (just show `task {}` like before).

- [ ] **`pilot log <jobId> --task <N>`**: Add ability to view a specific task's child session directly:
  - `pilot log abc1 --task 1` shows the first subagent's full session
  - `pilot log abc1 --task 2` shows the second
  - Numbers correspond to task spawn order within the job

- [ ] **Format task part nicely**: Instead of raw `task {"description":"...","subagent_type":"..."}`, display:
  ```
  11:56:48  [assistant] ▶ task: gsd-planner — "Quick plan for inline editing"
  ```
  Extract `description` and `subagent_type` from the tool input JSON.

### Nice to Have

- [ ] In TUI detail view, allow collapsing/expanding subagent sections with a keypress (e.g., `c` to collapse)
- [ ] Show subagent token usage inline: `▶ task: gsd-planner (2.1k tok, 45s)`
- [ ] In TUI running panel, show "Step 2/4: gsd-executor" with subagent name

## Technical Notes

- opencode DB schema: `session` table has `parent_id` column linking child → parent
- `part` table: when `tool === 'task'`, the `data` JSON contains the task description and subagent type
- `getSessionParts()` in `src/core/opencode-db.ts` is the main data fetcher
- `fetchJobParts()` in `src/tui/data/opencode-db.ts` organizes parts into sections
- `formatPartLines()` in `src/tui/views/detail.tsx` formats individual parts for display
- The log command in `src/commands/log.ts` renders parts to terminal
- Child sessions may spawn their OWN children (executor → sub-executor for parallel waves) — support 2 levels of nesting max
- Recursion depth limit: max 3 levels to prevent infinite loops

## Do NOT

- Modify opencode's DB schema — read-only access
- Change the session spawning mechanism in the runner
- Add new npm dependencies  
- Modify GSD workflow files
- Change keyboard shortcuts in TUI
- Affect the delegation AI or step execution logic
