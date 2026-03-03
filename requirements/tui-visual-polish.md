# TUI Visual Polish & Functional Fixes

## Problem
The TUI dashboard works but has ghost features, visual issues, and underutilizes OpenTUI's widget library. It looks like a homework assignment, not a product.

## Goal
Make `pilot tui` genuinely useful and visually polished. Fix broken interactions, use available widgets, improve information density.

## Requirements

### Must Have (P0 — embarrassing without)

- [ ] **Fix ghost action keys**: `a`/`r`/`x`/`b` shown in footer but have no handlers in keyboard handler (App). Either implement cancel/retry/bump or remove from footer display
- [ ] **Fix description truncation**: `pilot add` with a `.md` file stores raw markdown as description. Must extract first `# heading` as clean one-liner. `pilot status` must also replace `\n` with space and hard-truncate descriptions
- [ ] **Fix CompletedPanel token display**: Always shows `formatTokens(0)` — actual token data never passed through. Wire up real token counts from DB
- [ ] **Extract duplicated utils**: `truncate()` defined 4 times, `formatElapsed()` defined twice, `statusColor()` in DetailView should be in theme.ts. Create `src/tui/utils/format.ts`
- [ ] **Fix detail view keyboard nav**: `j`/`k`/`f` handlers only work in dashboard view. Add handlers for detail view (scroll log, toggle follow mode)

### Should Have (P1 — meaningful improvement)

- [ ] **Use TabSelect for panel switching**: Replace invisible Tab cycling with OpenTUI's `TabSelect` renderable — visual tab bar showing Queue/Running/Completed with active indicator
- [ ] **Use the sparkline widget**: It's already built (`src/tui/widgets/sparkline.tsx`) but never used. Show token burn rate for running jobs
- [ ] **Fix panel proportions**: Running panel needs `flexGrow={2}`, Queue gets `flexGrow={1}`. Completed panel should be shorter (`maxHeight={8}` or collapsible)
- [ ] **Add ASCII font header**: OpenTUI has `ASCIIFont` renderable. Use it for "PILOT" branding instead of plain text
- [ ] **Enrich StatusBar**: Add daemon status, current time, total tokens burned today, estimated queue drain time
- [ ] **Add queue position numbers**: Show "#3 of 20" for queued items
- [ ] **Empty state messaging**: When panels are empty, show helpful hints ("No jobs in queue — pilot add <project> <req> to get started")
- [ ] **Fix "running for" vs "ago"**: Active jobs should show "running for 3m42s", not "3 minutes ago" — "ago" implies completion

### Nice to Have (P2 — polish)

- [ ] **Confirmation dialog for cancel**: `x` (cancel) needs [y/N] confirmation before killing a running build
- [ ] **Shift+Tab for reverse panel cycling**
- [ ] **Remove "Split view — coming soon"**: Ship it or remove the placeholder and keybinding
- [ ] **Reduce independent timers**: 7+ `setInterval` timers running. Use a single tick signal from App passed down via context

## Technical Notes
- TUI source: `src/tui/` (19 files, ~1691 lines)
- Runtime: bun (not node) — excluded from tsc build
- OpenTUI renderables available but unused: ASCIIFont, TextTable, TabSelect, Markdown, Slider, Code, Diff, Select
- Don't break existing working features (live polling, PulseDot, flash-on-completion)

## Do NOT
- Rewrite the state management (it's clean Solid, leave it)
- Switch from OpenTUI/Solid to anything else
- Remove the poller architecture (it works)
- Add React/Ink dependencies
