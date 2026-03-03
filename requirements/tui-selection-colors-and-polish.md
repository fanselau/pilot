# TUI Selection Colors & Visual Polish

## Problem

The TUI selection highlighting makes text hard to read. When a row is selected, the background changes to `#1a1a3a` (dark navy) but the foreground colors stay the same (dim gray for pending, blue for running, etc.), creating poor contrast combinations that look "weird."

Additionally:
- Selected row has no clear visual indicator beyond subtle background change
- Project paths are shown in full (`/home/luca/dev/punchlab/pilot`) wasting space
- Token counts in completed panel always show `0 tok` (not wired up)
- No visual distinction between focused panel border and selected row
- The highlight background `#1a1a3a` is too subtle against `#0a0a0a` bg

## Goal

Selection is instantly obvious with good contrast. The TUI looks polished and professional. Information density is high without feeling cramped.

## Requirements

### Must Have

- [ ] **Fix selection colors across all panels**: When a row is selected:
  - Background: use `#1E3A5F` (medium blue) instead of `#1a1a3a` — needs to be visible
  - Foreground: override to `#FFFFFF` (white) regardless of status color — ensures readability
  - The `▸` indicator in queue panel should be bright white when selected
  - Completed panel: selected row should show white text, not status color

- [ ] **Shorten project paths**: Display only the last 2 path segments instead of full path
  - `/home/luca/dev/punchlab/pilot` → `punchlab/pilot`
  - `/home/luca/dev/werkbank/theke` → `werkbank/theke`
  - Helper function: `shortenProject(path)` that splits on `/` and takes last 2 segments

- [ ] **Wire up token counts in completed panel**: The completed panel shows `0 tok` for every job. Fix by:
  - Reading token data from opencode DB for completed job sessions
  - Storing total tokens on the job record when marking complete (cache in DB), OR
  - Fetching from session enrichment in the completed poller

- [ ] **Improve focused panel indicator**: 
  - Focused panel border should be brighter/different from just blue — use `#60A5FA` (lighter blue)
  - Unfocused panels use `#333333` (current) — good contrast
  - Add ` ◆ ` prefix to focused panel title: ` ◆ Queue ` vs ` Queue `

- [ ] **Better completed row layout**: Current layout crams everything on one line. Use 2 lines per row when terminal is wide enough (>100 cols):
  - Line 1: `✓ #id  project  scope  "description"`
  - Line 2: `  ⏱ 5m30s  ◆ 12.3k tok  3 min ago  [failed: reason]`
  - For failed jobs, show truncated error reason on line 2

- [ ] **Add step progress indicator for running jobs**: Show which step the job is on:
  - `Step 2/4: execute-phase` with a simple progress indicator
  - Data source: job's delegation plan steps + current step index from DB

### Nice to Have

- [ ] Pulse animation on the `●` dot for running jobs (alternate between bright/dim blue)
- [ ] Show model profile tag (quality/balanced/budget) on running/completed rows
- [ ] Keyboard shortcut `r` to retry selected failed job from dashboard

## Technical Notes

- TUI uses OpenTUI + SolidJS (`@opentui/solid`)
- Theme constants in `src/tui/theme.ts`
- All panels in `src/tui/components/`
- Selection state managed in `src/tui/state.ts` via SolidJS signals
- Token data comes from `fetchSessionEnrichment()` in `src/tui/data/opencode-db.ts`
- The `text` element supports `fg` and parent `box` supports `backgroundColor`
- Step data: `job.delegationPlan` has the full plan, `job.currentStep` tracks progress

## Do NOT

- Change the overall layout structure (3-panel dashboard)
- Add new npm dependencies
- Change keyboard shortcuts
- Modify the data polling intervals
- Touch non-TUI code (runner, delegate, CLI commands)
