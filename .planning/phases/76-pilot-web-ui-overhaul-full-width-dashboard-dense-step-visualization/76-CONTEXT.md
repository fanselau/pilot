# Phase 76: Pilot Web UI Overhaul — Full-Width Dashboard + Dense Step Visualization - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/web-ui-overhaul.md)

<domain>
## Phase Boundary

Transform the Pilot web UI from a prototype-feel center-column layout into a dense operational dashboard. The job detail page becomes a split-pane control room (GitHub Actions / Vercel build logs style) with full-width layout, selectable steps, no pagination friction, model visibility, and a projects view. Fixes timezone duration bug affecting all timestamp parsing.

</domain>

<decisions>
## Implementation Decisions

### Layout
- Remove `max-w-5xl` constraints from `__root.tsx`, `index.tsx`, and `jobs.$jobId.tsx`
- Dashboard and job detail pages use full viewport width
- Add `max-w-[1800px]` on very wide screens to prevent extreme stretching
- Header adapts to full-width (logo/nav left, actions right)

### Job Detail — Split-Pane Layout
- Replace single-column job detail with horizontal split-pane layout
- Left pane (~34% default, min 300px): Job metadata + step timeline
- Right pane (~66%): Dense step content / activity / logs
- Panes must be resizable (drag handle between them)
- Left pane: job header (compact), model badges, cost summary, step timeline
- Right pane: selected step's full activity stream, all messages/tool calls/patches inline, no pagination
- Use `react-resizable-panels` library for resizable pane implementation

### Selectable Steps + Auto-Scroll
- Steps in left timeline are clickable/selectable
- Selecting a step scrolls right pane to that step's content
- Visual highlight on selected step (accent border/background)
- Keyboard navigation: arrow keys between steps
- Running jobs: auto-follow mode tracking active step
- Auto-follow disabled on manual select/scroll up, re-enabled with "Follow" button or scroll to bottom

### Remove "Load More" — Show Full Activity
- Remove `useInfiniteQuery` pagination from `timeline-stream.tsx`
- Load all timeline data for job in one query (or stream)
- For very large jobs: use `@tanstack/react-virtual` virtualization instead of pagination
- Newest content at bottom, scroll position starts at bottom for running jobs
- Same for `session-activity.tsx` — remove "Load more" button, load all parts

### Force-Load Truncated Messages
- Show "Show full" button when message/tool output is truncated
- New server fn: `getFullMessageFn(sessionId, partId)` returning untruncated content
- Server fn must bypass upstream truncation limits

### Model Visibility
- Show actual models used per job in left pane metadata
- Data source: `job-detail-query.ts` already has `observedModels` on job detail
- Display as compact badges: `claude-opus-4-6` `gpt-5.3-codex`
- Per-step model info: show which model ran each step (from session data)
- Token counts + estimated cost per step if available

### Fix Duration Timezone Bug
- Extract `parseTimestampToEpochSeconds()` from `job-introspection.ts` into shared `src/core/time-utils.ts`
- Replace ALL instances of `new Date(startedAt)` / `Date.parse(startedAt)` with safe parser
- Affected files: `job-detail-query.ts`, `job-list.tsx`, `job-detail.tsx`, `callback.ts`, TUI components
- Add unit tests for shared parser

### Dashboard — Projects View
- Add "Projects" tab to dashboard alongside Active/Queued/Recent
- New backend query: `getProjectsList()` returning projects with path, owner, blocked status, job counts, default categories
- New server fn: `getProjectsListFn()`
- Each project row clickable → filters jobs view to that project
- Show blocked projects with visual indicator

### Remove Comment Section References
- Remove any comment-related placeholder UI, textarea stubs, or references
- No comment backend needed

### Claude's Discretion
- Exact Tailwind classes for visual styling
- Error boundary patterns for the split pane
- Specific virtualization threshold (1000+ items suggested)
- SSE/polling strategy for live updates in split-pane view
- Whether to persist pane sizes in localStorage (nice-to-have)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/web-ui-overhaul.md` — Full requirements document with all must-have and nice-to-have items

### Core Data Layer
- `src/core/job-detail-query.ts` — `getJobTimeline()`, `getJobDetail()`, `computeDurationMs()` — primary query backbone
- `src/core/job-introspection.ts` — `parseTimestampToEpochSeconds()` — safe timestamp parser to extract
- `src/core/job-observability.ts` — `observedModels` computation logic
- `src/core/db.ts` — `getAllProjects()`, `getQueue()`, `getRecent()` — DB primitives
- `src/core/types.ts` — All shared DTO types

### Web UI Components
- `web/src/routes/__root.tsx` — Global header with `max-w-5xl` constraint to remove
- `web/src/routes/index.tsx` — Dashboard with `max-w-5xl` constraint to remove
- `web/src/routes/jobs.$jobId.tsx` — Job layout with `max-w-5xl` constraint to remove
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail page entry
- `web/src/components/job-detail.tsx` — Job header + timeline mount
- `web/src/components/timeline-stream.tsx` — Step-grouped timeline with `useInfiniteQuery` to replace
- `web/src/components/session-activity.tsx` — Session drill-in with "Load more" to remove
- `web/src/components/job-list.tsx` — Dashboard job table with duration formatting
- `web/src/lib/server-fns.ts` — Server functions wrapping query backbone

</canonical_refs>

<specifics>
## Specific Ideas

- Component structure: `<PipelineRunView>` → `<ResizablePanelGroup>` → Left/Right `<ResizablePanel>` with `<ResizableHandle>`
- Use `react-resizable-panels` library (lightweight, works with Tailwind)
- For virtualization: `@tanstack/react-virtual` for jobs with 1000+ timeline items
- Core UX pattern: Overview → Step Timeline → Evidence/Logs
- Flatten step tree into visible rows for virtualization
- Left timeline usually < 20 steps, non-virtualized
- Desktop-first design — this is a dev tool

</specifics>

<deferred>
## Deferred Ideas

- Collapsible left pane on smaller screens (< 1024px) — nice-to-have
- Persist pane sizes in localStorage — nice-to-have
- Step duration micro-bars in timeline — nice-to-have
- Live progress indicator for running steps (pulsing dot) — nice-to-have
- Shareable URLs `/jobs/$jobId?step=3` — nice-to-have
- Dark mode improvements for dense layout — nice-to-have
- Skeleton loading states instead of spinners — nice-to-have

</deferred>

---

*Phase: 76-pilot-web-ui-overhaul-full-width-dashboard-dense-step-visualization*
*Context gathered: 2026-03-20 via PRD Express Path*
