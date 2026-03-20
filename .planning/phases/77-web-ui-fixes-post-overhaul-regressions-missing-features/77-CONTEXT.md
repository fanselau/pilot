# Phase 77: Web UI Fixes — Post-Overhaul Regressions + Missing Features - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/web-ui-fixes-v2.md)

<domain>
## Phase Boundary

Phase 76 landed the split-pane overhaul but introduced regressions and left gaps. This phase fixes mobile responsiveness, adds delegation step visibility, updates subpages for the new layout, implements sidebar-as-navigation with continuous-scroll main panel, shows grace wait countdown, adds project management pages, and ensures TUI feature parity.

</domain>

<decisions>
## Implementation Decisions

### 1. Mobile Responsiveness
- On viewports < 768px: collapse to single-column layout (no split pane)
- Show timeline as a compact horizontal step indicator or collapsible accordion at the top
- Main content takes full width below the step indicator
- All data remains accessible — nothing hidden on mobile
- Test on common mobile widths (375px, 390px, 414px)

### 2. Delegation Step in Timeline
- Add the delegation session as the first step in the timeline sidebar (before plan-phase)
- Label it "Delegation" with appropriate status badge
- Show delegation duration and token count
- The delegation session data is already available — tracked as sessions with title pattern `pilot-delegate-{jobId}-*`
- Backend: include delegation session in `getJobTimeline()` response as step index 0 (or a special pre-step)
- If multiple delegation sessions exist (re-delegation after gaps), show all in chronological order

### 3. Update Subpages/Children for New Layout
- Session drill-in page (`/jobs/$jobId/sessions/$sessionId`) must work within the new split-pane layout
- Child sessions / subagent cards must render correctly in the main content panel
- Navigation between parent job and child sessions must be seamless
- Breadcrumb or back-navigation from session detail to job detail

### 4. Sidebar = Navigation, Main Panel = Full Content
- Main panel renders ALL steps' content in a single continuous scroll
- Each step's content is rendered as a section with a clear header/divider
- Sidebar step clicks scroll the main panel to the corresponding section (using `scrollIntoView` or equivalent)
- Sidebar highlights which step is currently visible (scroll-spy behavior)
- No content filtering — selecting a step in the sidebar does NOT hide other steps' content
- For running jobs: auto-scroll to bottom of main panel (latest activity), with a "jump to latest" button if user scrolled up

### 5. Grace Wait in Web UI
- When a job is in `pending` status with a grace wait countdown, show the remaining grace time in the dashboard job list
- Display as a subtle countdown or "Starting in Xs" badge next to the job status
- The grace wait info comes from the runner — check if it's exposed via the job detail API or needs a new field
- Once grace expires and job starts, badge disappears naturally

### 6. Project Management in Web UI
- Project detail page: `/projects/$projectPath` showing project status, owner, blocked state, default categories, active/queued/completed job counts
- Block/unblock actions from the web UI (buttons on project page)
- View project's job history filtered to that project
- Edit default categories for a project
- Show project owner and notification route config

### 7. TUI Feature Parity
- Ensure all features available in the web UI are also reflected in the TUI where applicable
- TUI should show delegation step in timeline (same as web UI requirement #2)
- TUI should show model info per step
- TUI should show grace wait countdown for pending jobs
- TUI project management: block/unblock from TUI detail view

### Claude's Discretion
- Implementation details for scroll-spy behavior (IntersectionObserver vs scroll position calculation)
- Exact mobile breakpoint behavior (collapsible accordion vs horizontal step pills)
- Project detail page layout and component structure
- How to compute grace expiry on the client side (derive from job.createdAt + queueGraceSeconds config or add field to API)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Web UI Components
- `web/src/components/split-pane-detail.tsx` — Current split-pane layout
- `web/src/components/step-timeline-sidebar.tsx` — Left sidebar timeline component
- `web/src/components/step-content-pane.tsx` — Right content panel with virtualization
- `web/src/components/timeline-stream.tsx` — Activity stream rendering
- `web/src/components/job-list.tsx` — Dashboard job list with table/card modes
- `web/src/components/projects-list.tsx` — Projects tab component
- `web/src/components/session-activity.tsx` — Session activity component

### Web UI Routes
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail page
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Session drill-in page
- `web/src/routes/jobs.$jobId.tsx` — Job layout wrapper
- `web/src/routes/index.tsx` — Dashboard home page

### Web UI Infrastructure
- `web/src/lib/server-fns.ts` — Server functions (TanStack Start)
- `web/src/lib/sse.ts` — SSE streaming for live updates
- `web/src/hooks/use-media-query.ts` — Responsive breakpoint hooks (useIsMobile)

### Backend Core
- `src/core/job-detail-query.ts` — Backend timeline query functions
- `src/core/types.ts` — Shared types (Job, StepTimelineGroup, etc.)
- `src/core/db.ts` — Database functions (claimNextLaunchable, getJob, etc.)
- `src/core/delegate.ts` — Delegation AI module (pilot-delegate-{jobId}-* pattern)
- `src/core/job-introspection.ts` — Grace period introspection
- `src/core/config.ts` — Config including queueGraceSeconds

</canonical_refs>

<specifics>
## Specific Ideas

- Delegation sessions have titles matching `pilot-delegate-{jobId}-*`. Backend can find via SQL: `SELECT * FROM session WHERE title LIKE 'pilot-delegate-' || ? || '-%'`
- Existing `useIsMobile()` hook at `web/src/hooks/use-media-query.ts` uses 800px breakpoint — requirement says 768px
- Grace period config is available via `queueGraceSeconds` in PilotConfig (default 120s)
- Job.skipGracePeriod boolean available in DB
- `getJobTimeline()` already does step-grouped chronological rendering — delegation sessions just need to be included as step groups

</specifics>

<deferred>
## Deferred Ideas

### Nice to Have (explicitly deferred)
- Smooth scroll animation when clicking sidebar steps
- Sticky step headers in the main panel
- Keyboard shortcut to cycle through steps (j/k or arrow keys)
- Mobile: swipe gesture to expand/collapse timeline

### Do NOT
- Break the desktop split-pane layout while fixing mobile
- Remove any existing functionality from Phase 76
- Add a separate mobile app or PWA — just make the responsive layout work
- Change the timeline data model — just add delegation sessions to the existing step groups

</deferred>

---

*Phase: 77-web-ui-fixes-post-overhaul-regressions-missing-features*
*Context gathered: 2026-03-20 via PRD Express Path*
