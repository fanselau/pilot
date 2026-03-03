---
phase: quick-025
plan: 01
subsystem: tui
tags: [opentui, keyboard, layout, scrollbox, subagent, model-display]

dependency_graph:
  requires: [quick-023, quick-024, 27-01, 27-02]
  provides: [working-keyboard-shortcuts, stable-detail-header, model-visibility, subagent-bordered-boxes]
  affects: []

tech_stack:
  added: []
  patterns:
    - "scrollbox focusable={false} + ref callback for keyboard passthrough"
    - "flexShrink={0} on fixed header to prevent collapse"
    - "subagentColors theme constants for visual hierarchy"
    - "render helper functions for part indentation levels"

key_files:
  created: []
  modified:
    - src/tui/widgets/scrollable.tsx
    - src/tui/views/detail.tsx
    - src/tui/theme.ts

decisions:
  - id: scrollbox-focusable-false
    summary: "Use both focusable={false} prop and ref callback on scrollbox to prevent keyboard capture"
    rationale: "Belt-and-suspenders: prop may not be applied at construction time for ScrollBox, ref callback guarantees it"
  - id: always-show-executor-model
    summary: "Detail header always shows resolved executor model name even for balanced profile"
    rationale: "Users need to know which concrete model is running their job, not just the profile name"
  - id: rounded-border-parent-single-child
    summary: "Parent subagents use rounded borders, children use single borders, grandchildren use single with dimmest color"
    rationale: "Visual weight decreases with nesting depth — parent boxes stand out, nested ones are lighter"
  - id: render-helpers-not-components
    summary: "Part rendering extracted to renderParts/renderChildParts/renderGrandchildParts functions"
    rationale: "Avoids duplication across section types while keeping JSX readable; not full components since they capture closure state"

metrics:
  duration: "6m42s"
  completed: "2026-03-03"
---

# Quick Task 025: TUI Bugs & Polish Summary

**Fixed scrollbox keyboard capture, detail header stability, model visibility, and subagent visual nesting using focusable={false}, flexShrink={0}, always-resolved executor model, and bordered boxes with depth-aware coloring.**

## Tasks Completed

### Task 1: Fix keyboard shortcuts + scrollbox focus capture + detail header stability
**Commit:** `ee5a7e2`
**Files:** `src/tui/widgets/scrollable.tsx`, `src/tui/views/detail.tsx`

- Added `focusable={false}` prop and `ref` callback to `<scrollbox>` in `Scrollable` widget
- The ref callback imperatively sets `el.focusable = false` as defense-in-depth
- This prevents ScrollBox from intercepting keyboard events (j/k/arrows/Enter/Escape/Tab)
- All keyboard input now flows to the app-level `useKeyboard` handler in app.tsx
- Added `flexShrink={0}` to the detail header box to prevent it from collapsing when the activity stream grows
- The header stays fixed while the scrollable content below it grows

### Task 2: Model info prominence + subagent bordered boxes
**Commit:** `9f252d7`
**Files:** `src/tui/views/detail.tsx`, `src/tui/theme.ts`

- Detail header now always shows resolved executor model: `Model: balanced/hybrid → claude-sonnet-4-6`
- Previously only non-balanced profiles showed the `Models:` line; now all profiles show the primary executor model
- `buildHeaderLines()` updated to always resolve and display the executor model name
- Added `subagentColors` to `theme.ts`: graduated blue→gray→dim-gray for parent→child→grandchild nesting
- Subagent sections render inside bordered boxes with colored agent name header
- Parent subagents: `borderStyle="rounded"`, bright blue border (#4A9EFF)
- Child subagents: `borderStyle="single"`, dimmer gray border (#555555), indented
- Grandchild subagents: `borderStyle="single"`, dimmest gray border (#3a3a3a), further indented
- Delegation/execution sections keep plain text headers — they form the visual "spine"
- All bordered boxes have `focusable={false}` to prevent keyboard capture

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — passes with zero errors
- `npx vitest run` — 301 tests pass (12 test files), including 29 detail-header tests
- All existing tests unaffected by changes
