# TUI Bugs & Polish: Shortcuts, Detail Header, Model Display, Subagent Nesting

## Problem
Four user-reported TUI issues after the Phase 27 detail header rework and recent changes:

1. **Shortcuts don't work** — keybindings (j/k, enter, tab, s, 1/2/3, g/G, etc.) are non-functional or unreliable. Input handling may be broken or not properly wired to the ink input system.

2. **Detail header breaks after first scroll** — the structured header panel at the top of the detail view stops rendering correctly or overlaps content after the user scrolls the activity stream below it. Likely a layout issue with flexGrow/flexShrink or the Scrollable widget not being constrained properly.

3. **Model specifiers not visible** — the `Model: balanced/claude-only` line and model profile/provider mode info is either not showing or not prominent enough in the detail view. Users can't tell which model profile a job is using from any TUI view (list or detail).

4. **Subagent log sections need visual separation** — subagent entries in the activity stream use plain text headers (`── Subagent: gsd-planner ──`) with just paddingLeft indentation. They blend into the parent session's log output. Need proper visual nesting — bordered box, background color, or clear visual container.

## Goal
Fix all four issues so the TUI is actually usable for monitoring jobs.

## Requirements

### Must Have

- [ ] **Fix keyboard shortcuts**
  - Verify `useInput` or equivalent ink input hook is properly registered in app.tsx
  - All documented shortcuts must work: j/k (nav), Enter (open detail), Escape/q (back), Tab (cycle panels), s (split), 1/2/3 (views), g/G (top/bottom)
  - Detail view shortcuts: Escape (back to dashboard), scroll controls
  - Cancel/kill action shortcut must trigger backend cancellation (not no-op)
  - If ink's input handling changed or has a known bug, work around it

- [ ] **Fix detail header stability on scroll**
  - The header panel (job ID, status, step, model, attempts, timestamps, descendant count) must stay fixed at the top
  - Only the activity stream below should scroll
  - Layout structure: `<box flexDirection="column">` → fixed header `<box>` → scrollable activity `<box flexGrow={1}>`
  - The header must NOT have `flexGrow` or `flexShrink` that lets it collapse
  - Test: scroll down 50+ lines in activity stream, header must remain intact and readable

- [ ] **Show model info prominently**
  - Detail view: model profile + provider mode line must be visible (verify it renders)
  - Detail view: add resolved model name for the primary agent (e.g., `Model: quality/claude-only → claude-opus-4-6`)
  - List view (running/queue panels): show model profile badge when not `balanced`
    - e.g., `● woh3  pilot  quick  "phase-redesign..."  [quality]  19m ago`
    - Skip badge for `balanced` (default) to reduce noise
  - Use the existing `resolveAllAgentModels()` from `src/core/models.ts` or the job's `modelProfile`/`providerMode` fields

- [ ] **Subagent sections in bordered/nested boxes**
  - Replace plain text `── Subagent: gsd-planner ──` headers with a visually distinct container
  - Use ink's `<box borderStyle="single">` or `<box borderStyle="round">` around each subagent section
  - Include the agent name in the border title area (or as a colored header inside the box)
  - Nested subagents (children of children) get additional indentation + lighter border style
  - The visual nesting must make it immediately obvious which log lines belong to which session
  - Color the border using the agent's theme color if available (agents have `color:` in frontmatter)

### Nice to Have
- [ ] Collapsible subagent sections (press Enter on header to expand/collapse)
- [ ] Dimmed/muted styling for completed subagent sections vs active ones
- [ ] Model profile color coding (quality=green, balanced=default, budget=yellow)
- [ ] Sticky breadcrumb showing which subagent you're scrolled into

## Technical Notes
- TUI uses ink (React for CLI) with solid-js-like signals via `src/tui/state.ts`
- Input handling is in `src/tui/app.tsx` around line 180+
- Detail view is `src/tui/views/detail.tsx`
- Scrollable widget is `src/tui/widgets/scrollable.tsx`
- `resolveAllAgentModels()` is in `src/core/models.ts`
- Job type has `modelProfile` and `providerMode` fields
- ink `<box>` supports: `borderStyle`, `borderColor`, `paddingLeft`, `paddingTop`, `marginLeft`
- Available border styles: 'single', 'double', 'round', 'bold', 'singleDouble', 'doubleSingle', 'classic'

## Acceptance Criteria
- All keyboard shortcuts work reliably (j/k/Enter/Escape/Tab/s/1/2/3/g/G)
- Detail header stays fixed during scroll — verified at 100+ activity lines
- Model profile visible in both list and detail views
- Subagent sections are visually boxed/nested — a new user can tell parent from child at a glance
- No rendering glitches at terminal sizes 80x24 through 200x60

## Do NOT
- Rewrite the TUI framework or switch away from ink
- Remove existing functionality (descendant counts, timestamps, step display)
- Add mouse-only interactions — keyboard-first UX required
- Make subagent boxes so heavy they dominate the view — keep it clean
