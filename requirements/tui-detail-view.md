# TUI Detail View — Job Drill-Down on Enter

## Problem
The TUI dashboard shows jobs in the queue/running/recent panels, and the footer says "enter detail" — but pressing enter likely does nothing or crashes. We need a detail view that shows the full job info + live log when you select a job and press enter.

## Goal
Pressing enter on a selected job opens a detail view showing job metadata and a live activity stream (same data as `pilot log <id>`).

## Requirements

### Must Have
- [ ] Pressing enter on any job (queue, running, or recent) opens a detail view
- [ ] Detail view header: job ID, project, scope, description, status, elapsed time
- [ ] Detail view body: live activity stream from the job's sessions (same as `pilot log`)
  - Show tool calls: `bash $ command...`, `read path`, `write path`, `edit path`
  - Show text parts (user prompts, assistant responses)
  - Show patches as "Patched: filename"
  - Skip step-start/step-finish/reasoning by default
- [ ] Delegation section shown first, then execution section(s) — labeled with separators
- [ ] Auto-scrolls to bottom (latest activity)
- [ ] Auto-refreshes (new parts appear in real-time, like `--follow`)
- [ ] Press escape or q to go back to dashboard
- [ ] Press backspace to go back to dashboard

### Nice to Have
- [ ] Press v to toggle verbose mode (show reasoning)
- [ ] Press f to toggle follow (auto-scroll vs manual scroll)
- [ ] j/k to scroll through log entries
- [ ] Show token count and cost in header
- [ ] Color-code parts: cyan=text, yellow=tool, green=patch, dim=reasoning

## Technical Notes
- Session data: use `getSessionParts()` from opencode-db.ts (added by b42z log overhaul)
- Session titles: read from `job.sessionTitles` JSON array
- Delegation sessions have title format `pilot-delegate-{jobId}-{attempt}`
- Execution sessions have title format `{project}-{command}-{jobId}`
- The TUI runs under bun from source .tsx files — no tsc compilation needed
- Reuse the same part formatting logic from `pilot log` CLI command if possible
- State management: add a `selectedJob` and `view: 'dashboard' | 'detail'` to TUI state

## Do NOT
- Show full tool output by default (truncate to ~120 chars per line)
- Show reasoning by default
- Break the dashboard view or keyboard navigation
- Use React/Ink — OpenTUI + Solid only
