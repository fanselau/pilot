---
phase: quick-012
plan: 01
subsystem: tui
tags: [tui, detail-view, solid-js, opencode-db]
completed: 2026-03-02
duration: ~3m
dependency-graph:
  requires: [quick-009, quick-010, 18-05]
  provides: [tui-detail-view]
  affects: []
tech-stack:
  patterns: [incremental-polling, session-categorization]
key-files:
  created:
    - src/tui/views/detail.tsx
  modified:
    - src/tui/data/opencode-db.ts
    - src/tui/app.tsx
    - src/tui/components/footer-bar.tsx
decisions:
  - "Incremental part fetching via lastSeenMap per session title"
  - "Part formatting inline in detail.tsx (mirrors log.ts but simplified for TUI)"
  - "q navigates back in non-dashboard views, quits only on dashboard"
metrics:
  tasks: 2/2
  commits: 2
---

# Quick 012: TUI Detail View — Job Drill-Down on Enter

**One-liner:** Full detail view with job header, session-sectioned activity stream, auto-scroll, auto-refresh, and escape/q/backspace back navigation.

## What Was Done

### Task 1: DetailView component + fetchJobParts data layer
- Added `fetchJobParts()` to `src/tui/data/opencode-db.ts` — fetches session parts organized by delegation/execution sections
- Added `SessionSection` interface exported from TUI data layer
- Created `src/tui/views/detail.tsx` with:
  - Job header: ID, project, scope, status (color-coded), description, elapsed time, token count
  - Session-sectioned activity stream with labeled separators (`── Delegation ──`, `── Execution: {command} ──`)
  - Part formatting: tool calls (yellow), text (cyan/green), patches (green), reasoning/step-start/step-finish skipped
  - Auto-refresh via 1s poller with incremental part fetching (tracks last-seen timestamp per session)
  - Auto-scroll via `<Scrollable follow={true}>`
  - Elapsed time ticker updating every 1s
  - Token enrichment from session data

### Task 2: App wiring + keyboard navigation
- Imported `DetailView` into `app.tsx`, replaced placeholder
- Updated `q` key handler: navigates back in detail/split views, quits only on dashboard
- Added `backspace`/`delete` key handler for back navigation from non-dashboard views
- `Ctrl-C` always quits regardless of current view
- Updated footer bar hint for detail view: `esc/q back │ auto-following │ ? help`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 2c39429 | feat(quick-012): add DetailView component and fetchJobParts data layer |
| 2 | ebe7b62 | feat(quick-012): wire DetailView into App with keyboard navigation |
