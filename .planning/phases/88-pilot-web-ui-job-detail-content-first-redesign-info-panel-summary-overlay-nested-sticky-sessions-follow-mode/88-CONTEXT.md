# Phase 88: Pilot Web UI — Job Detail Content-First Redesign - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-web-ui-job-detail-content-first-info-panel-and-follow-mode.md)

<domain>
## Phase Boundary

Redesign Pilot's job detail UI into a **content-first execution reader** that works on both mobile and desktop. The phase delivers:

1. A unified **Info panel** (sheet/popup) replacing the fragmented actions modal + meta surface
2. Complete **tab bar removal** — timeline/activity becomes the default, Summary becomes a toggleable overlay
3. **Nested child session redesign** — remove card chrome, use normal-flow embedded sessions with sticky headers
4. **Follow mode** for live/running job activity tailing
5. **Top layout re-envisioning** — lighter, more trustworthy, content-first

This is one coherent job-detail redesign, not a bag of micro-fixes. Preserve what already works well (sticky header direction, content-first activity improvements from recent phases).

</domain>

<decisions>
## Implementation Decisions

### Info Panel (Unified Actions + Meta)
- Remove the current conceptual split between top-bar actions modal and separate meta surface
- Introduce a single Info panel/popup/sheet as the canonical secondary detail surface
- Info panel must contain: status/verdict/review state, local-time timestamps (correct timezone), job id, scope/profile/provider/model summary, token/cost summary, recovery/undo/review context, execution/observability details, actually useful job actions
- Meta must no longer exist as a separate destination once absorbed into Info
- Eliminate low-value duplication between top bar, actions modal, and meta panel
- Fix UTC-vs-local time behavior — user-facing times rendered on coherent local/user-time basis
- Only meaningful, working actions: review approve/reject, retry, cancel/kill, undo dry-run/recovery, copy job id/copy command
- Do not preserve weak or decorative actions

### Tab Bar Removal
- Remove the job-detail tab bar entirely on both desktop and mobile
- Sessions must not remain as a dedicated tab or equivalent persistent navigation
- Default detail surface is the main activity/timeline/transcript view
- Summary available as a toggleable secondary surface (overlay/popup/sheet), not a permanent tab
- Summary affordance lives near the top layout close to Info affordance
- Summary must be quickly accessible without forcing user to leave reading flow

### Nested Child Sessions
- Replace current nested child card treatment with normal-flow embedded session presentation
- No heavy card chrome, large boxed containers, or width-wasting framing
- Nested sessions at essentially the same density as top-level session content
- No indentation as the main hierarchy mechanism
- Use subtle hierarchy styling: pastel/soft background treatment, light border treatment, low-noise visual grouping
- Child sessions must remain collapsible/foldable
- Collapsed state preserves enough identity/context for glance understanding
- Nested sticky headers are mandatory — first-class structural behavior
- Hierarchy understandable through sticky structure even without indentation or card framing
- Must work on both desktop and mobile viewport sizes

### Follow Mode
- Explicit toggleable Follow mode in job detail for running/live jobs
- When enabled, detail view stays pinned to latest meaningful content automatically
- Designed for passive monitoring / tailing behavior
- User scrolling upward with clear intent auto-cancels Follow mode
- Auto-cancel not overly sensitive to tiny incidental touch drift
- When canceled, UI makes that state understandable
- When off and new content arrives, provide clear low-friction way to jump back to latest
- Must work on both desktop and mobile

### Top Layout
- Content-first transcript body
- Info affordance
- Summary affordance
- Optional Follow affordance/state for live jobs
- Lighter and more trustworthy, not more crowded
- Remove layout decisions that exist to support obsolete tabs/meta/actions fragmentation
- Compact on mobile, clear on desktop

### Cross-Device Quality
- Intentionally designed for both desktop and mobile
- Same information architecture across breakpoints
- Responsive differences adapt presentation, not invent two unrelated UX models

### Claude's Discretion
- Specific component library choices within existing Coss UI system
- Animation/transition details for sheet/popup surfaces
- Exact sticky header stacking behavior z-index strategy
- Follow mode scroll threshold sensitivity tuning
- Info panel layout/ordering of fields within the panel
- Mobile bottom sheet vs popup pattern choice

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/pilot-web-ui-job-detail-content-first-info-panel-and-follow-mode.md` — Full PRD with acceptance criteria and technical notes

### Existing Web UI Architecture
- `web/src/routes/jobs.$jobId.tsx` — Job layout route with polling
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail index page with SSE
- `web/src/components/split-pane-detail.tsx` — Current split-pane with mobile tabs
- `web/src/components/job-detail.tsx` — Job header + shared helpers
- `web/src/components/step-timeline-sidebar.tsx` — Left sidebar with metadata + step list
- `web/src/components/step-content-pane.tsx` — Content pane with scroll-spy + virtualization
- `web/src/components/timeline-stream.tsx` — Timeline rendering (TimelineItemRenderer)
- `web/src/components/timeline-fork-card.tsx` — Current nested child card treatment
- `web/src/components/session-activity.tsx` — Session activity rendering

### UI Primitives
- `web/src/components/ui/sheet.tsx` — Sheet/bottom-sheet component
- `web/src/components/ui/dialog.tsx` — Dialog/popup component
- `web/src/components/ui/tabs.tsx` — Tabs (being removed)
- `web/src/components/ui/badge.tsx` — Badge component
- `web/src/components/ui/collapsible.tsx` — Collapsible component
- `web/src/components/ui/status-badge.tsx` — Status badge

### Observability Cards
- `web/src/components/observability-card.tsx` — Token/cost card
- `web/src/components/verdict-card.tsx` — Verdict card
- `web/src/components/git-checkpoint-card.tsx` — Git checkpoint card

### Server Functions
- `web/src/lib/server-fns.ts` — Server functions (getJobDetailFn, getFullJobTimelineFn, etc.)
- `web/src/lib/sse.ts` — SSE streaming hook (useJobDetailStream)
- `web/src/lib/step-semantics.ts` — Step label/semantic helpers
- `web/src/lib/time-utils.ts` — Timestamp parsing (parseSqliteTimestamp)
- `web/src/lib/format.ts` — Format helpers (formatCompactDuration)
- `web/src/lib/use-actions.ts` — Action model (useActions hook)

</canonical_refs>

<specifics>
## Specific Ideas

- PRD suggests implementation sequencing: (1) unified Info surface + top-layout cleanup + timezone correctness, (2) tab-bar removal + summary overlay/toggle, (3) nested child normal-flow redesign + nested sticky hierarchy + collapsibility refinement, (4) follow mode + jump-to-latest behavior polish
- Sticky headers should feel like layered editor/document headers as the user scrolls
- Favor fewer, stronger surfaces rather than adding more drawers, tabs, or chrome
- This phase builds on work done in Phases 76-86 (web UI overhaul, premium, attribution, sticky headers, realtime)

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 88-pilot-web-ui-job-detail-content-first-redesign-info-panel-summary-overlay-nested-sticky-sessions-follow-mode*
*Context gathered: 2026-03-22 via PRD Express Path*
