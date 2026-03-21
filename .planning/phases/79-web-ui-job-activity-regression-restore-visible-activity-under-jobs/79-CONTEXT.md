# Phase 79: Web UI Job Activity Regression — Restore visible activity under jobs - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/web-ui-job-activity-regression.md)

<domain>
## Phase Boundary

Restore visible, trustworthy job activity in the web UI so users can immediately see that jobs have real underlying session activity. The regression is in the web UI layer — core timeline data (`getFullJobTimeline`) returns populated grouped timeline data for real jobs, but the web UI fails to render it.

This phase diagnoses and fixes the exact regression point(s):
1. Dashboard job list — activity preview/snippet under job entries
2. Job detail page — timeline rendering in the split-pane detail view
3. Or both

</domain>

<decisions>
## Implementation Decisions

### Investigation Scope
- Identify the exact regression point in the web UI path for job activity visibility
- Confirm with a real job fixture/data path that backend/core timeline data is non-empty while the web UI fails to show it
- Distinguish between: missing fetch/wiring, wrong query shape / serialization mismatch, filtering logic that hides groups/items, UI component no longer rendering preview/activity blocks after redesign

### Fix Requirements
- Fix the regression so job activity is visibly rendered again in the correct place(s)
- If the dashboard job list previously showed a useful activity snippet/preview under jobs, restore that behavior in a compact, dense format
- If the job detail page currently receives timeline data but renders an empty/no-activity state incorrectly, fix that rendering logic
- Keep polling / live invalidation behavior working for running jobs

### Verification
- Verify with at least one completed job and one active-or-recent job path that visible activity appears in the UI
- Write a clear SUMMARY.md explaining root cause, fix, and verification

### Do NOT
- Do not rewrite the whole job detail UI just because activity is missing
- Do not regress the new visual polish/features that already work
- Do not "fix" by hardcoding fake preview text
- Do not change core timeline extraction unless investigation proves the core layer is actually wrong

### Claude's Discretion
- Exact approach to activity preview on dashboard job list cards/rows (compact format, placement)
- Whether to add a lightweight regression test if test setup makes it practical
- Improved empty-state wording so it only appears when data is truly empty, not when client rendering failed

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/web-ui-job-activity-regression.md` — Full problem statement and constraints

### Core Backend (source of truth)
- `src/core/job-detail-query.ts` — `getFullJobTimeline()`, `getJobTimeline()`, `getJobDetail()` — confirmed working
- `src/core/types.ts` — `StepTimelineGroup`, `StepTimelineItem`, `GroupedTimelinePage`, `JobDetailSnapshot` types

### Web UI Data Layer
- `web/src/lib/server-fns.ts` — `getFullJobTimelineFn`, `getJobsListFn`, `getJobDetailFn` server functions
- `web/src/lib/sse.ts` — SSE-style polling hook for live job updates

### Web UI Components (likely regression sites)
- `web/src/routes/index.tsx` — Dashboard: uses `JobList`, loads via `getJobsListFn`
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail page: uses `SplitPaneDetail`, loads `getFullJobTimelineFn`
- `web/src/components/job-list.tsx` — Job table/card component (no activity preview currently)
- `web/src/components/split-pane-detail.tsx` — Split-pane layout passing `groups` to `StepContentPane`
- `web/src/components/step-content-pane.tsx` — Renders timeline groups with `TimelineItemRenderer`
- `web/src/components/step-timeline-sidebar.tsx` — Step sidebar for navigation
- `web/src/components/timeline-stream.tsx` — `TimelineItemRenderer` for individual items

</canonical_refs>

<specifics>
## Specific Ideas

- Investigation result: `dist/core/job-detail-query.js` returns populated groups for job `rzi7`
- The regression is likely in fetch/wiring, filtering, or component rendering — NOT in core data extraction
- `getJobsListFn` returns plain `Job` objects from `getQueue()`/`getRecent()` — no activity data
- `getFullJobTimelineFn` returns `GroupedTimelinePage` with populated `.groups` — the question is whether the job detail page is calling it and rendering it correctly
- Dashboard job list (`job-list.tsx`) currently renders ONLY job metadata (id, status, scope, description, duration, model) with NO activity preview
- The fix likely involves either: (a) the `getFullJobTimelineFn` call not producing data on the client, (b) the groups being empty due to a serialization/session lookup issue, or (c) the UI having a conditional that hides groups

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 79-web-ui-job-activity-regression-restore-visible-activity-under-jobs*
*Context gathered: 2026-03-21 via PRD Express Path*
