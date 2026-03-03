# TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix

## Problem
The current `pilot tui` detail page has three usability issues:

1. **Detail header is cramped**
   - High-value metadata is squeezed into too little space.
   - Hard to scan when triaging multiple runs quickly.

2. **Insufficient per-run information density**
   - Operators need faster access to key run diagnostics without opening full logs.
   - Current layout does not surface enough summary data for debugging/decision-making.

3. **Recent completions still show weird hover/overlay behavior**
   - Visual artifact/overlay appears in completed list interactions.
   - Feels unstable and reduces confidence in TUI polish.

## Goal
Improve TUI operational clarity:
- Rework detail header into a structured, readable summary panel.
- Surface richer run-level metadata directly in detail and completed views.
- Eliminate hover/overlay rendering glitches in recent completions.

## Requirements

### Must Have
- [ ] **Detail header layout redesign**
  - Replace cramped single-line/packed layout with structured blocks/rows.
  - Preserve readability in narrow and wide terminal widths.
  - Keep keyboard focus indicators clear and non-overlapping.

- [ ] **Expanded run summary in detail view**
  - Show at least:
    - Job ID, scope, project (short + full path option)
    - Status + elapsed/runtime
    - Current step (`command + args`) and step index/total
    - Session title/id mapping for current execution
    - Model profile/provider mode
    - Attempts / max attempts
    - Start time and last update time
  - For failed runs, also show a compact failure diagnosis block:
    - failed step name (`plan-phase`, `execute-phase`, etc.)
    - artifact-check verdict/reason (if present)
    - semantic verdict source/reason (if present)
    - last meaningful log line/snippet
  - Ensure formatting is stable (no wrapping glitches) on common terminal sizes.

- [ ] **Descendant/subagent visibility clarity**
  - Explicitly show whether descendant sessions exist for selected run.
  - If present, provide count and navigation affordance.
  - Keep behavior consistent with existing task/child expansion in logs.

- [ ] **Recent completions overlay bug fix**
  - Remove hover/focus visual artifact in completed panel/list rows.
  - Ensure selection/focus styles are deterministic (no double-layer color blocks).

- [ ] **TUI cancel/kill action must work end-to-end**
  - Running jobs must be cancellable directly from TUI (panel + detail view paths).
  - Action must invoke backend cancellation/termination path (not UI-only state changes).
  - On success, status should update immediately (running → cancelled/failed as appropriate).
  - On failure, surface explicit error feedback in TUI (not silent no-op).

- [ ] **No regressions in keybindings**
  - Existing navigation/actions in detail and completed panels must still work.

- [ ] **Tests**
  - Snapshot or integration tests for detail header layout in at least 2 terminal widths.
  - Regression test for completed-row focus/selection rendering path.

### Nice to Have
- [ ] Toggle to expand/collapse "advanced metadata" section in detail view.
- [ ] One-key jump from detail header to first descendant session/log section.
- [ ] Optional compact mode for very small terminals.

## Technical Notes
- Reuse existing data polling/store layer; avoid duplicating formatting logic between panels.
- Keep ANSI/color usage centralized in theme constants to avoid style drift.
- If descendant counts require additional DB calls, cache per selected job and invalidate on selection change/refresh.

## Acceptance Criteria
- Detail view header is visibly less cramped and remains readable at 100x30 and 160x45 terminals.
- Operators can inspect run context (status, step, attempts, model/profile, session info) without opening full logs.
- Completed panel no longer shows hover/overlay artifacts during selection/navigation.
- Existing TUI navigation and action bindings behave as before.

## Do NOT
- Do NOT remove descendant visibility support that was added for task/subagent inspection.
- Do NOT introduce mouse-only interactions; keyboard-first UX remains required.
- Do NOT couple style fixes to unrelated command behavior changes.
