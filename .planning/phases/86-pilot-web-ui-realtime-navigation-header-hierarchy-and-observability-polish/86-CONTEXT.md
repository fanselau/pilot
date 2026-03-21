# Phase 86: Pilot Web UI — Realtime, Navigation, Header Hierarchy, and Observability Polish - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-web-ui-realtime-navigation-and-observability.md)

<domain>
## Phase Boundary

This phase improves the Pilot web UI across seven interconnected areas:
1. **Subsession realtime + inline nesting** — Make child/sub-session views update live reliably and feel inline with the main execution flow using multi-level sticky headers and collapsible nesting
2. **Dashboard tab bar + Sessions tab** — Fix mobile overflow, reassess Sessions tab value
3. **Projects page** — Make it more functional and visually stronger
4. **Sticky header rework** — Better visual separation, richer high-signal information, differentiated hierarchy levels
5. **Summary deep-link** — Clicking summary actually navigates/scrolls to relevant content
6. **Grace period visibility** — Clear queue grace/start timing behavior in the web UI
7. **Token accounting across providers** — Fix token calculation for non-Codex/non-OpenAI providers

</domain>

<decisions>
## Implementation Decisions

### Subsession / Inline Nesting
- Subsession nesting must be inline with the main execution flow as the primary product model — not a side-path
- Implement multi-level sticky headers and collapsible nesting for the execution tree
- Replace old separate subsession routing/pages with inline nested execution-tree model
- Clean up stale second-class subsession pages/routes
- Solve nesting/collapse model intentionally: what is expanded vs collapsed by default at each hierarchy level
- Nested rendering must remain understandable on mobile and not regress header/navigation improvements

### Dashboard Navigation
- Fix dashboard tab-bar overflow on mobile
- Reassess the `Sessions` tab role/value and improve its usefulness or framing if it remains visible

### Projects Page
- Improve the Projects page to be both more functional and visually stronger

### Sticky Headers
- Preserve good sticky-header behavior while improving visual separation, information hierarchy, and useful information shown
- Do a fuller sticky-header rework where headers synthesize and surface richer high-signal fields at each level
- Be explicit about which synthesized fields belong in sticky context (e.g. semantic stage, verdict, continuation reason, current branch/session identity, status counters, grace/review/running state, summary presence)
- Sticky headers must feel meaningfully different across hierarchy levels

### Summary Deep-Link
- Clicking summary should actually open/jump/scroll to the relevant summary content

### Grace Period Visibility
- Add/restore clear grace-period visibility so users can tell when a job is intentionally waiting before launch
- Grace period state must be distinguishable from blocked, idle, hung, or actually-running states

### Token Accounting
- Investigate and fix token accounting across providers/models beyond Codex/OpenAI
- Use recent non-Codex jobs (ptq3, efwg, nsrv) as case studies for validation

### Claude's Discretion
- Specific collapse/expand defaults for each nesting level
- Visual design of differentiated sticky headers per hierarchy level
- How to restructure or improve the Sessions tab (hide, merge, or reframe)
- Projects page layout and functionality additions
- Technical approach for inline subsession rendering (inline expansion vs route-based)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Web UI Architecture
- `web/src/routes/__root.tsx` — Root layout, AppHeader, AppShell
- `web/src/routes/index.tsx` — Dashboard with tab bar (Active/Queued/Recent/Sessions/Projects)
- `web/src/routes/jobs.$jobId.tsx` — Job detail layout with polling
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail content (split-pane)
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Session drill-in page (REPLACE with inline model)
- `web/src/components/split-pane-detail.tsx` — Split-pane layout with sidebar + content pane
- `web/src/components/step-timeline-sidebar.tsx` — Step sidebar with metadata cards
- `web/src/components/step-content-pane.tsx` — Main content rendering steps and timeline items
- `web/src/components/session-activity.tsx` — Session activity renderer
- `web/src/components/timeline-stream.tsx` — Timeline stream component
- `web/src/components/projects-list.tsx` — Projects table
- `web/src/components/session-overview.tsx` — Sessions tab content
- `web/src/components/job-list.tsx` — Job list used in all dashboard tabs

### Server Functions / Data Layer
- `web/src/lib/server-fns.ts` — All server function definitions
- `web/src/lib/step-semantics.ts` — Step label and semantic helpers
- `web/src/lib/format.ts` — Duration and formatting utilities
- `web/src/lib/time-utils.ts` — Timestamp parsing

### Core Data Layer
- `src/core/types.ts` — All shared types (JobDetailSnapshot, StepTimelineGroup, SessionSummary, etc.)
- `src/core/job-detail-query.ts` — Job detail query functions
- `src/core/job-observability.ts` — Token/cost/model observability builder
- `src/core/opencode-db.ts` — OpenCode DB queries (session state, tokens, models)
- `src/core/config.ts` — Config including queueGraceSeconds
- `src/core/db.ts` — Pilot DB (jobs, projects, queue)

### UI Components
- `web/src/components/ui/status-badge.tsx` — StatusBadge and SourceBadge
- `web/src/components/ui/collapsible.tsx` — Collapsible component (for nesting)
- `web/src/components/ui/tabs.tsx` — Tab components
- `web/src/components/observability-card.tsx` — Token/cost observability card
- `web/src/components/verdict-card.tsx` — Judge verdict card

</canonical_refs>

<specifics>
## Specific Ideas

- Use case study jobs ptq3, efwg, nsrv for token validation across non-Codex providers
- Multi-level sticky headers should use collapsible nesting similar to IDEs/file trees
- Consider reducing or merging the Sessions tab to reduce low-signal tab-bar entries
- Grace period countdown badge already exists in job-list (from Phase 77/78) — ensure it's prominently visible and distinguishable from other states

</specifics>

<deferred>
## Deferred Ideas

### Nice to Have (from PRD — implement if time allows)
- Improve top-level navigation framing for more intentional mobile experience
- Reduce low-signal UI chrome in favor of actionable/status-rich information
- Small affordances to distinguish queued/grace/running/review states at a glance
- Tighten empty states on Sessions/Projects

</deferred>

---

*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Context gathered: 2026-03-21 via PRD Express Path*
