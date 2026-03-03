---
phase: quick-025
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tui/app.tsx
  - src/tui/views/detail.tsx
  - src/tui/widgets/scrollable.tsx
  - src/tui/components/running-panel.tsx
  - src/tui/components/queue-panel.tsx
  - src/tui/components/completed-panel.tsx
  - src/tui/index.ts
autonomous: true

must_haves:
  truths:
    - "All keyboard shortcuts work: j/k, Enter, Escape, Tab, s, 1/2/3, g/G, K, q, Ctrl-C, ?, /"
    - "Detail header stays fixed at top while activity stream scrolls"
    - "Model profile visible in running/queue panels (badge for non-balanced) and in detail header"
    - "Subagent sections render inside bordered boxes with agent name as colored header"
  artifacts:
    - path: "src/tui/app.tsx"
      provides: "Keyboard handler with verified key event property access"
    - path: "src/tui/views/detail.tsx"
      provides: "Fixed header + scrollable activity with bordered subagent boxes"
    - path: "src/tui/widgets/scrollable.tsx"
      provides: "Scrollable wrapper with focusable={false} to prevent key capture"
  key_links:
    - from: "src/tui/app.tsx"
      to: "useKeyboard callback"
      via: "KeyEvent property matching (name/sequence/ctrl/shift)"
      pattern: "useKeyboard"
    - from: "src/tui/views/detail.tsx"
      to: "src/tui/widgets/scrollable.tsx"
      via: "Scrollable inside flexGrow container below fixed header"
      pattern: "Scrollable.*follow"
---

<objective>
Fix four TUI bugs: broken keyboard shortcuts, detail header instability on scroll,
missing model info visibility, and visually indistinct subagent sections.

Purpose: Make the TUI actually usable for monitoring jobs — shortcuts, layout stability,
model visibility, and visual hierarchy are all broken/missing.

Output: Updated TUI components with working keyboard input, stable layout, model badges,
and bordered subagent boxes.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/tui-bugs-and-polish.md
@src/tui/app.tsx
@src/tui/views/detail.tsx
@src/tui/views/dashboard.tsx
@src/tui/widgets/scrollable.tsx
@src/tui/components/running-panel.tsx
@src/tui/components/queue-panel.tsx
@src/tui/components/completed-panel.tsx
@src/tui/state.ts
@src/tui/theme.ts
@src/tui/index.ts
@src/core/models.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix keyboard shortcuts + scrollbox focus capture + detail header stability</name>
  <files>
    src/tui/app.tsx
    src/tui/widgets/scrollable.tsx
    src/tui/views/detail.tsx
    src/tui/index.ts
  </files>
  <action>
**Root cause analysis for keyboard issues:**

The OpenTUI `scrollbox` element has `_focusable: boolean` = true by default and its own `handleKeyPress(key: KeyEvent)` method. When a scrollbox gets focus (which can happen via autoFocus or click), it captures keyboard events before the app-level `useKeyboard` handler sees them. The scrollbox consumes arrow keys, page up/down, etc. for its own scrolling.

Additionally, check that `app.tsx`'s `useKeyboard` callback accesses the correct properties on the OpenTUI `KeyEvent` object. The OpenTUI `KeyEvent` has: `name`, `ctrl`, `meta`, `shift`, `option`, `sequence`, `raw`, `eventType`, `repeated`. The current `TuiKeyEvent` interface matches these correctly but verify that the `key.name` values match what OpenTUI emits (e.g., `'return'` for Enter, `'escape'` for Escape, `'up'`/`'down'` for arrows, `'tab'` for Tab, `'backspace'`/`'delete'`).

**Fix scrollable.tsx:**
- Add `focusable={false}` prop to the `<scrollbox>` element to prevent it from capturing keyboard events
- This ensures all keyboard input flows to the app-level `useKeyboard` handler

**Fix detail.tsx header stability:**
The header and scrollable are both inside `<box flexDirection="column" flexGrow={1}>`. The header box has no explicit height constraint. When the scrollbox content grows, layout pressure can cause the header to collapse.

Fix the layout structure:
1. The outer container already has `flexDirection="column"` and `flexGrow={1}` — correct
2. The header `<box flexDirection="column" paddingLeft={1} paddingRight={1}>` must NOT have `flexGrow` or `flexShrink` — verify it doesn't inherit shrinkage. Add `flexShrink={0}` explicitly to the header box to prevent it from being compressed when the scrollable content grows.
3. The activity stream wrapper `<box flexGrow={1}>` is correct — it takes remaining space
4. Inside it, `<Scrollable follow={true}>` wraps a scrollbox — correct

**Fix index.ts:**
Check if `autoFocus: false` in the render options is sufficient. It should prevent initial focus assignment but doesn't prevent later focus changes. The `focusable={false}` fix on scrollbox is the primary fix.

**Verify the keyboard handler works with the key event:**
- For keys like 'j', 'k', 's', '1', '2', '3' — check `key.sequence` (single char)
- For named keys like Enter — check `key.name === 'return'`
- For Shift+G — check `key.sequence === 'G'` or `(key.sequence === 'g' && key.shift)`
- The current code already handles these patterns correctly

If `key.name` for arrow keys is `'up'`/`'down'` in OpenTUI (not `'j'`/`'k'`), both paths must work. Current code checks `key.name === 'j' || key.name === 'down'` — but for single character keys, OpenTUI likely sets `name` to the character itself. Verify by checking: for a single char press like 'j', OpenTUI's parseKeypress sets `name` to 'j' and `sequence` to 'j'. For arrow down, name='down' and sequence='\x1b[B'. So the current handler's checks for `key.name === 'j'` and `key.name === 'down'` are correct.

**No changes needed to app.tsx keyboard handler logic** — the shortcuts are correctly mapped. The issue is that scrollbox captures keystrokes before the app handler sees them. The `focusable={false}` fix on scrollable.tsx is the primary fix.
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors.
Run `npx vitest run` to verify existing tests pass.
Manually verify: launch TUI with `npx tsx src/index.ts tui`, press j/k/Tab/Enter/Escape/1/2/3/g/G and confirm navigation works.
  </verify>
  <done>
All keyboard shortcuts work in dashboard and detail views. Detail header stays fixed while activity scrolls. ScrollBox elements no longer capture keyboard events.
  </done>
</task>

<task type="auto">
  <name>Task 2: Model info prominence + subagent bordered boxes</name>
  <files>
    src/tui/views/detail.tsx
    src/tui/components/running-panel.tsx
    src/tui/components/queue-panel.tsx
    src/tui/components/completed-panel.tsx
    src/tui/theme.ts
  </files>
  <action>
**Model info is already partially implemented** — check the current state:

1. **Running panel** (running-panel.tsx line 121): Already shows `[${job.modelProfile}]` badge when not balanced. ✓ Already done.
2. **Queue panel** (queue-panel.tsx line 43): Already shows `[${job.modelProfile}]` badge when not balanced. ✓ Already done.
3. **Completed panel** (completed-panel.tsx line 195): Already shows `[${job.modelProfile}]` badge when not balanced. ✓ Already done.
4. **Detail header** (detail.tsx lines 376, 384-397): Shows `Model: balanced/claude-only` and resolved models for non-balanced. ✓ Already done.

The requirements say "model profile + provider mode line must be visible (verify it renders)" — the code exists but may not be rendering due to the header layout bug (fixed in Task 1) or because the detail view is unreachable (keyboard bug, also fixed in Task 1).

**Enhancement: Show resolved model name even for `balanced` profile.** The current code only shows the `Models:` line for non-balanced profiles (line 384: `<Show when={currentJob()!.modelProfile !== 'balanced'}`). For balanced, users can't see which concrete model is being used. 

Change the detail header to ALWAYS show the resolved primary model (the executor model, since that's what users care about most):
- In `detail.tsx`, after the `Model: profile/provider` line, always show the resolved executor model: e.g., `Model: balanced/claude-only → claude-sonnet-4-6`
- For non-balanced, keep the full `Models:` line showing all unique resolved models
- Update `buildHeaderLines()` helper to match

**Subagent bordered boxes:**

In `detail.tsx`, replace the plain text section headers for subagent entries with bordered boxes:

For parent-level subagent sections (the `<For each={sections()}>` loop):
- When `section.type === 'subagent'`: wrap the entire section in `<box borderStyle="round" border={true} borderColor={subagentBorderColor} marginLeft={1} marginTop={1} flexDirection="column">`
- Put the agent name as a colored header inside: `<text content={` ${section.agentType ?? 'subagent'} `} fg={subagentHeaderColor} />` with a separator line below
- Keep the parts rendering inside the bordered box

For child subagent sections (the nested `<For each={section.children}>` loop):
- Use `borderStyle="single"` (lighter than parent's "round") with additional `marginLeft={2}`
- Same pattern: agent name header + parts inside

For grandchild sections:
- Use `borderStyle="single"` with `borderColor` set to a dimmer color and `marginLeft={2}`
- Minimal border treatment to avoid visual overload

Add to `theme.ts`:
```typescript
export const subagentColors = {
  border: '#4A9EFF',      // blue border for subagent boxes
  borderChild: '#555555',  // dimmer for nested children
  header: '#4A9EFF',       // bright blue header text
  headerChild: '#888888',  // dimmer for nested
} as const;
```

For execution/delegation sections (non-subagent), keep the existing plain text headers — those are the main session flow and shouldn't be boxed.

The visual hierarchy should be:
- Delegation/Execution sections: plain text headers (they're the "spine")
- Subagent sections: bordered boxes (they're the "branches") 
- Child subagents: lighter bordered boxes, indented (they're "sub-branches")

Make sure bordered boxes have `focusable={false}` to avoid keyboard capture issues.

**Do NOT add collapsible sections or dimmed styling for completed subagents** — those are Nice to Have.
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors.
Run `npx vitest run` to verify existing tests pass.
Visually inspect: the detail view should show bordered subagent sections with clear nesting.
Model info should be visible: `Model: balanced/claude-only → claude-sonnet-4-6` in detail, `[quality]` badges in list panels.
  </verify>
  <done>
Model profile visible in all views — detail header always shows resolved model name, list panels show badge for non-balanced.
Subagent sections render inside bordered boxes with agent name headers. Nested subagents use lighter borders with additional indentation. Visual hierarchy clearly distinguishes parent from child sessions.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx vitest run` — all existing tests pass
3. Launch TUI: `npx tsx src/index.ts tui`
   - Press j/k to navigate between items — cursor moves
   - Press Tab to cycle panels (queue → running → completed)
   - Press Enter on a job to open detail view
   - Press Escape or q to return to dashboard
   - Press 1/2/3 for view shortcuts
   - Press g to jump to top, G to jump to bottom
   - Press ? for help overlay
   - In detail view: header stays fixed while scrolling activity
   - Model info visible in header and list badges
   - Subagent sections have bordered boxes
</verification>

<success_criteria>
- All keyboard shortcuts function reliably (j/k/Enter/Escape/Tab/s/1/2/3/g/G/K/q/Ctrl-C/?//)
- Detail header remains fixed during scroll with 50+ activity lines
- Model profile visible in both list and detail views
- Subagent sections render in bordered boxes with clear parent/child nesting
- No TypeScript errors, all existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/025-requirements-tui-bugs-and-polish-md/025-SUMMARY.md`
</output>
