---
phase: quick-012
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tui/views/detail.tsx
  - src/tui/data/opencode-db.ts
  - src/tui/app.tsx
  - src/tui/state.ts
  - src/tui/components/footer-bar.tsx
autonomous: true

must_haves:
  truths:
    - "Pressing enter on a selected job (queue, running, or completed) opens a detail view"
    - "Detail view shows job header: ID, project, scope, description, status, elapsed time"
    - "Detail view shows live activity stream with tool calls, text, patches — like pilot log"
    - "Delegation sessions shown first, then execution sessions, with labeled separators"
    - "Auto-scrolls to bottom and auto-refreshes with new activity"
    - "Pressing escape, q, or backspace returns to dashboard"
  artifacts:
    - path: "src/tui/views/detail.tsx"
      provides: "Detail view component"
    - path: "src/tui/data/opencode-db.ts"
      provides: "fetchJobParts() wrapper for part-level session data"
  key_links:
    - from: "src/tui/app.tsx"
      to: "src/tui/views/detail.tsx"
      via: "Switch/Match on view() === 'detail'"
    - from: "src/tui/views/detail.tsx"
      to: "src/tui/data/opencode-db.ts"
      via: "fetchJobParts() for live session parts"
    - from: "src/tui/views/detail.tsx"
      to: "src/core/opencode-db.ts"
      via: "getSessionParts() via TUI data layer"
---

<objective>
Implement the TUI detail view — pressing enter on a selected job drills down into a
full activity stream showing session parts (tool calls, text, patches) organized by
delegation → execution sessions with live auto-refresh.

Purpose: The TUI currently shows a placeholder "Detail view — coming soon" when enter
is pressed. This replaces it with the actual detail view per requirements/tui-detail-view.md.

Output: Working detail view with job header, session-sectioned activity stream,
auto-scroll, auto-refresh, and keyboard navigation back to dashboard.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/tui-detail-view.md
@src/tui/app.tsx
@src/tui/state.ts
@src/tui/views/dashboard.tsx
@src/tui/data/opencode-db.ts
@src/core/opencode-db.ts (getSessionParts, findSessionByTitle)
@src/commands/log.ts (formatPart, categorizeSessions — reuse logic)
@src/tui/components/running-panel.tsx (formatTokens, formatElapsed)
@src/tui/widgets/scrollable.tsx
@src/tui/theme.ts
@src/core/types.ts (Job, SessionPart)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add fetchJobParts() to TUI data layer + create DetailView component</name>
  <files>
    src/tui/data/opencode-db.ts
    src/tui/views/detail.tsx
  </files>
  <action>
**1. Add `fetchJobParts()` to `src/tui/data/opencode-db.ts`:**

Add a function that fetches session parts for a job, organized by session:

```typescript
export interface SessionSection {
  title: string;
  type: 'delegation' | 'execution';
  command?: string;       // extracted from execution title
  parts: SessionPart[];
}

export function fetchJobParts(job: Job, since?: number): SessionSection[] {
  // Parse job.sessionTitles JSON → string[]
  // For each title:
  //   - Categorize: starts with "pilot-delegate-" → delegation, else execution
  //   - For execution: extract command from title (second-to-last segment before jobId)
  //   - findSessionByTitle(title) → sessionId
  //   - getSessionParts(sessionId, since) → parts
  // Return sorted: delegation sections first, then execution sections
}
```

Import `getSessionParts` and `findSessionByTitle` from `../../core/opencode-db.js`.
Import `SessionPart` and `Job` from `../../core/types.js`.

**2. Create `src/tui/views/detail.tsx`:**

Build the detail view component with:

**Header section (fixed height ~5-6 lines):**
- Line 1: `#id  project  scope  status` with status colored per statusColors
- Line 2: `"description"` (truncated to terminal width - 10)
- Line 3: `⏱ elapsed  ◆ tokens` (reuse `formatTokens` from running-panel.tsx, same `formatElapsed` pattern)
- Line 4: Separator `────────────────`

**Activity stream (scrollable body, flexGrow=1):**
- Use a `createPoller` (from `../data/poller.js`) at 1000ms interval to fetch parts
- Track `since` timestamp per session to only fetch new parts incrementally
- For each SessionSection, render a separator: `── Delegation ──` or `── Execution: {command} ──` (dim, like log.ts)
- For each part, format as one compact line (reuse the same formatting logic as `pilot log`):
  - Tool parts: `HH:MM:SS  [assistant] bash $ command...` (yellow)
  - Text parts: `HH:MM:SS  [user] text...` or `HH:MM:SS  [assistant] text...` (green for user, cyan for assistant)
  - Patch parts: `HH:MM:SS  [assistant] patch file1, file2` (green)
  - Reasoning: SKIP by default
  - step-start/step-finish: SKIP
- Truncate tool input/output to ~120 chars per line

**Important implementation notes:**
- Use `/* @jsxImportSource @opentui/solid */` pragma at top
- Import `createSignal, createEffect, on, onMount, onCleanup, For, Show` from 'solid-js'
- Use `<Scrollable follow={true}>` for auto-scroll to bottom
- The detail view receives `state: PilotStateStore` as prop (same pattern as Dashboard)
- Look up the job by `state.detailJobId()` from `state.running()`, `state.completed()`, `state.queue()` — check all three lists
- If job not found (e.g. was cancelled while viewing), show "Job not found" message
- Use theme.muted for timestamps and separators, statusColors for status indicators
- Elapsed time should tick every second (same createSignal + setInterval pattern as RunningPanel)

**Part formatting helper** — create a `formatPartLine(part: SessionPart): { text: string; color: string } | null` function:
- type 'tool': yellow color, format as `${time}  [assistant] ${tool} ${toolInput}`
  - For bash: show `bash $ ${toolInput}` and on next line dim `→ ${toolOutput}` (first 120 chars)
  - For read/write/edit: show `${tool} ${toolInput}` (path only)
  - For glob/grep: show `${tool} ${toolInput}` (truncated)
- type 'text': cyan for assistant, green for user, show truncated content (200 chars non-verbose)
- type 'patch': green, show `patch ${patchFiles.join(', ')}`
- type 'reasoning': return null (skip)
- type 'step-start'/'step-finish': return null (skip)

Format timestamp as HH:MM:SS using `new Date(part.createdAt).toLocaleTimeString('en-US', { hour12: false, ... })`.
  </action>
  <verify>
    - `bun run src/tui/index.ts` launches without import errors
    - `bun build --external better-sqlite3 src/tui/views/detail.tsx` compiles successfully
    - The detail.tsx file exports a `DetailView` component
    - opencode-db.ts exports `fetchJobParts` and `SessionSection` type
  </verify>
  <done>
    DetailView component exists with job header, session-sectioned activity stream using
    part-level data from opencode DB, auto-refresh via poller, and auto-scroll via Scrollable.
    fetchJobParts() in TUI data layer wraps core getSessionParts() with session categorization.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire DetailView into App + keyboard navigation</name>
  <files>
    src/tui/app.tsx
    src/tui/state.ts
    src/tui/components/footer-bar.tsx
  </files>
  <action>
**1. Update `src/tui/app.tsx`:**

- Import `DetailView` from `'./views/detail.js'`
- Replace the placeholder `<Match when={state.view() === 'detail'}>` block:
  ```
  <Match when={state.view() === 'detail'}>
    <DetailView state={state} />
  </Match>
  ```
- Add keyboard handling for detail view (inside the existing `useKeyboard` handler):
  - When `state.view() === 'detail'`:
    - `escape` → `state.navigateBack()` (already handled above in existing code)
    - `backspace` → `state.navigateBack()`
    - `q` → `state.navigateBack()` (NOT quit — q means back when in detail)
  - IMPORTANT: The existing `q` handler quits the app. When in detail view, `q` should navigate back instead. Add a view check BEFORE the quit handler:
    ```typescript
    // q — in detail view: go back; in dashboard: quit
    if (key.name === 'q') {
      if (state.view() !== 'dashboard') {
        state.navigateBack();
      } else {
        renderer.destroy();
      }
      return;
    }
    ```
  - Similarly handle `backspace`/`delete` key name for back navigation from detail view

**2. Update `src/tui/components/footer-bar.tsx`:**

- Update the detail view hint string to match actual keybindings:
  ```
  detail: ' esc/q back │ auto-following │ ? help'
  ```

**3. Minor state.ts check:**

- Verify `navigateBack()` clears `detailJobId` and returns to 'dashboard' — it already does this.
- No changes needed to state.ts unless the existing `navigateBack` doesn't reset log-related state properly (it already calls `setLogMessages([])` but we're using parts not messages now — that's fine, the detail view manages its own parts state internally).
  </action>
  <verify>
    - `bun run src/tui/index.ts` launches the TUI dashboard
    - Press j/k to select a job, press Enter — detail view appears with job header and activity stream
    - Press Escape or q — returns to dashboard
    - Press Backspace — returns to dashboard
    - Press q on dashboard — quits the app (not broken)
    - Activity stream auto-updates with new parts appearing at bottom
  </verify>
  <done>
    Detail view is fully wired into the TUI app. Enter opens it, escape/q/backspace returns
    to dashboard. Activity stream shows live session parts with auto-scroll. Footer hints
    updated for detail view context.
  </done>
</task>

</tasks>

<verification>
1. Launch TUI: `bun run src/tui/index.ts`
2. Verify dashboard loads normally with queue/running/completed panels
3. Select a running or completed job with j/k navigation
4. Press enter — detail view appears showing:
   - Job header (ID, project, scope, description, status, elapsed)
   - Session sections (delegation first if present, then execution)
   - Activity stream with tool calls (yellow), text (cyan/green), patches (green)
   - No reasoning or step-start/step-finish shown
5. Verify auto-scroll: new parts appear at bottom
6. Verify auto-refresh: activity updates every ~1s
7. Press escape → back to dashboard
8. Press q on detail → back to dashboard
9. Press backspace on detail → back to dashboard
10. Press q on dashboard → app quits
11. Tab/panel cycling still works on dashboard
</verification>

<success_criteria>
- Enter on any job (queue/running/completed) opens detail view with job metadata and live activity stream
- Activity stream matches `pilot log` format: tool calls, text, patches, with timestamps
- Delegation/execution sections labeled with separators
- Auto-scrolls and auto-refreshes
- Escape, q, and backspace all navigate back to dashboard from detail view
- Dashboard functionality unchanged
- No React/Ink imports — OpenTUI + Solid only
</success_criteria>

<output>
After completion, create `.planning/quick/012-tui-detail-view-job-drill-down-on-enter-/012-SUMMARY.md`
</output>
