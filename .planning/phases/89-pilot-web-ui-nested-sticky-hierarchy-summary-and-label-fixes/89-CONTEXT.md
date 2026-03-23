# Phase 89: Pilot Web UI — Nested Sticky Hierarchy, Summary, and Label Fixes - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-web-ui-nested-sticky-hierarchy-summary-and-label-fixes.md)

<domain>
## Phase Boundary

This phase transforms the job detail view into a clear, native, single-scroll execution tree with stacked sticky headers showing `Step → sub-agent → nested sub-agent` hierarchy. It also creates a semantic session type model, fixes the Summary popup empty state, eliminates Unattributed sessions, and replaces internal jargon labels with human-readable semantic names plus Lucide icons.

</domain>

<decisions>
## Implementation Decisions

### Scroll Architecture
- Keep the detail view as ONE continuous scroll context — no nested scroll containers for subjobs or subsessions
- Do NOT add tabs, separate drill-in pages, or nested scroll areas

### Sticky Header Hierarchy
- When user scrolls into a first-level nested sub-agent region, its header sticks BELOW the current step header
- When user scrolls into a nested child inside that region, a third sticky layer appears below the parent child header
- Sticky headers must stack by depth and be pushed away naturally when leaving a region or entering a sibling
- Use `position: sticky` with computed `top` values per depth level (already partially implemented in BranchLifecycleBlock)

### Visual Design — Pastel Color System
- Add a subtle pastel color system for nested regions and headers so depth is visually obvious
- Must not be loud, saturated, or rainbow-like — subtle, premium, calm
- Nested regions use spacing, padding, and section rhythm — not just background color changes
- Subjobs and subsessions must look like part of the same native hierarchy system, not separate card widgets

### Semantic Session Type Model
- Introduce a semantic session type model used consistently by summary cards, sticky headers, and nested session headers
- Every displayed session must resolve to exactly one semantic type
- Required types: Delegation, Add Phase, Planning, Execution, Judge, Continuation Delegation, Gap Planning, Gap Execution, Gap Judge
- Use Lucide icons for semantic session types across summary cards and sticky headers
- Gap variants should be visually related to base type but clearly distinguishable (e.g., via a "Gap" chip/badge)

### Execution Rendering
- `Execution` must render as ONE top-level step with aggregated context/statistics, even when it contains multiple executor child subsessions (e.g., 88-01, 88-02, 88-03). Those child runs must appear as nested children under the single Execution parent
- `Continuation Delegation` must be explicitly represented and correctly attributed whenever it occurs after Judge or Gap Judge
- Gap loop nodes must be labeled distinctly as `Gap Planning`, `Gap Execution`, and `Gap Judge` — not all inherit same vague badge

### Summary/Header Badges
- Summary/header badges must be derived from node's semantic type + status, NOT from raw internal verdict-source strings like `judge:gaps`
- Populate sticky headers with a three-layer content model: (1) icon + semantic label + human title + status, (2) compact context chips, (3) short outcome line when meaningful data exists
- Populate summary cards from the same semantic display model as sticky headers

### Session Attribution
- Fix session attribution at the source so sessions are correctly assigned to their real parent step/agent/nested agent context
- Enforce that no session is rendered as `Unattributed` for job `82bg` or any other job
- Treat remaining unattributed output as a bug, not an acceptable fallback to rename away

### Header Copy
- Replace vague labels like `gap closure` with descriptive human-facing labels explaining what the section actually is
- Header copy must reflect user's mental model of execution tree (step, agent role, nested role, branch purpose)
- Keep useful high-level metadata in headers as secondary context: step/tool aggregation, token count, compact contextual chips

### Validation
- Validate against real data from job `82bg` so the known issues are actually fixed in a representative case

### Claude's Discretion
- Specific Lucide icon choices per semantic type (requirements suggest Route, FolderPlus, Map, Hammer, Scale, Forward or similar)
- Exact pastel color palette values
- CSS implementation approach for stacked sticky headers (CSS-only vs. JavaScript observer)
- How to restructure the DOM to support real nested sticky regions if current flat render is insufficient
- Whether to refactor BranchLifecycleBlock or create new components for the hierarchy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Types
- `src/core/types.ts` — StepTimelineGroup, BranchLifecycleItem, StepTimelineItem, GroupedTimelinePage types
- `src/core/job-detail-query.ts` — computeSemanticLabel(), getJobTimeline(), attribution logic (6-tier resolution)

### Web UI Components (primary targets)
- `web/src/lib/step-semantics.ts` — formatStepLabel, synthesizeHeaderFields, SynthesizedHeaderFields interface
- `web/src/components/timeline-stream.tsx` — StepGroupSection, TimelineItemRenderer, TimelineStream
- `web/src/components/step-content-pane.tsx` — StepContentPane with sticky headers, scroll-spy
- `web/src/components/branch-lifecycle-block.tsx` — BranchLifecycleBlock with recursive nesting + sticky headers
- `web/src/components/branch-lifecycle-block.helpers.ts` — deriveBranchIdentity, BranchIdentity
- `web/src/components/summary-overlay.tsx` — SummaryOverlay (fix empty popup)
- `web/src/components/session-activity.tsx` — SessionActivity (child session content renderer)
- `web/src/components/split-pane-detail.tsx` — SplitPaneDetail (desktop/mobile layout)
- `web/src/components/step-timeline-sidebar.tsx` — StepTimelineSidebar (navigation)
- `web/src/components/job-detail.tsx` — JobDetail, JobHeader, helpers

### Dependencies
- `web/src/lib/server-fns.ts` — Server function calls
- `web/src/components/ui/badge.tsx` — Badge component
- `web/src/components/ui/collapsible.tsx` — Collapsible/CollapsibleTrigger/CollapsibleContent

</canonical_refs>

<specifics>
## Specific Ideas

- Use Lucide icons: Route, FolderPlus, Map, Hammer, Scale, Forward (or clear equivalents) for semantic types
- Different pastel tones for sibling nested regions so switching between children is easier to track (nice-to-have)
- Surface compact human-readable purpose/outcome sentence for each semantic node when enough evidence exists (nice-to-have)
- The execution tree should expose hierarchy and meaning first, while still preserving compact operational context as secondary metadata

</specifics>

<deferred>
## Deferred Ideas

- Nice-to-have: different pastel tones for sibling nested regions (if time permits)
- Nice-to-have: improved header metadata density (if time permits)
- Nice-to-have: compact human-readable purpose/outcome sentence per node (if time permits)

</deferred>

---

*Phase: 89-pilot-web-ui-nested-sticky-hierarchy-summary-and-label-fixes*
*Context gathered: 2026-03-23 via PRD Express Path*
