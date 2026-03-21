# Phase 78: Web UI Premium — Data-Rich, Dense, Modern Dashboard - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/web-ui-premium.md)

<domain>
## Phase Boundary

Transform the pilot web UI from a basic job viewer into a **premium build pipeline control room** with data-rich inline observability, judge verdict visualization, step enrichment, tool call summaries, session state badges, git checkpoint info, queue enrichment, micro-interactions, and mobile experience improvements. All data already exists in the backend — this phase surfaces it in the frontend.

</domain>

<decisions>
## Implementation Decisions

### Design System
- Dense but quiet — lots of data, minimal visual noise. Subdued chrome, semantic color only for state changes
- Data inside rows — duration bars, token sparklines, cost badges, model chips INLINE, not in separate panels
- Progressive disclosure — essentials inline, depth in tooltips/expand, raw data on drill-in
- Mobile = selective, not crippled — stacked cards + bottom sheets + swipeable tabs
- Live feel — status transitions animate, elapsed time ticks live, new activity highlights then fades

### Semantic Color Palette
- Success: `emerald`
- Failed: `rose`
- Running: `sky/blue` with pulse
- Queued: `amber`
- Cancelled: `zinc`
- Gaps found: `orange`
- Chrome: `slate/zinc` subdued

### Component Architecture
- Use existing 50+ coss UI components from `web/src/components/ui/`
- Use Base UI (`@base-ui/react`) for tooltips, popovers, dialogs, tabs, switches — already installed
- Use `@tanstack/react-virtual` for virtualization — already installed
- Use `react-resizable-panels` for split pane — already installed
- Use inline SVG for sparklines/mini-bars (5-10 line components) — NO charting libraries
- Add `motion/react` (Framer Motion) for micro-interactions, status transitions, expand/collapse — GPU-composited only
- Add `shiki` for syntax highlighting in log output — lazy-load only when viewing logs
- Do NOT use Chart.js, D3, Recharts, vaul, or any heavy charting/dataviz library
- Do NOT add components that duplicate existing ui/ components
- Do NOT use shadcn/radix when Base UI has the equivalent

### Tailwind Patterns
- Status colors: `data-[status=running]:text-sky-400 data-[status=failed]:text-rose-400`
- Animations: `transition-all duration-200 ease-out`
- Pulse: `animate-pulse` on running badges
- Dense rows: `py-1.5 px-3 text-sm`
- Hover: `hover:bg-white/[0.03]`
- Selected: `ring-1 ring-sky-400/30 bg-sky-500/5`

### 1. Job Observability Card
- New `ObservabilityCard` component in job detail left pane showing token breakdown (input/output/reasoning/cache read/cache write/total), per-model breakdown, estimated cost (total USD, per-model, cost notes), intended vs actual model
- Compact mode for job list rows: tiny cost badge + token count
- Per-step token/cost aggregates in step sidebar rows
- New server fn: `getJobObservabilityFn(jobId)` wrapping existing `getJobObservability()` from `src/core/job-observability.ts`

### 2. Judge Verdict Card
- Parse and display `judgeVerdict` JSON payload: verdict label with semantic color, confidence percentage with visual indicator (bar or ring), gap list as expandable bullet points (when verdict = gaps_found), verdict reason as readable text
- Per-step `verdictReason` shown in step header or sidebar tooltip
- Verdict history across gap-closure iterations (show progression: 62% → 78% → 88% → pass)
- New server fn: `getJobVerdictHistoryFn(jobId)`

### 3. Step Enrichment
- Duration with mini-bar visualization in sidebar
- Source badge: `delegation` / `judge:gaps` / `judge:hung` / `operator` — color coded
- Reason text: why this step was appended
- Error: inline alert in step content if step failed
- Model badge: which model ran this step
- Token count: compact inline number
- Session link: "Open session →" button for drill-in
- Timing: start/end timestamps in tooltip, inter-step wait time

### 4. Tool Call Summaries
- Aggregated tool chips per step: `bash ×12` `read ×34` `edit ×8` `task ×3`
- Tool summary in sidebar per step (most-used tool icon/badge)
- On hover/expand: top tool calls with truncated input/output

### 5. Session State Badges
- Replace binary active/done with: `working` (blue pulse), `hung-on-prompt` (amber with pending question preview), `hung-on-tool` (amber with tool name), `crashed` (red), `done` (green check)
- For `hung-on-prompt`: show the pending question text inline (from `getSessionState()`)

### 6. Git Checkpoint / Recovery Info
- Show `gitBaseCommit` and `gitHeadCommit` as short SHAs with copy button
- `startedDirty` warning badge
- Derived status: no-op / changed / dirty
- Future: "View diff" link (deferred — requires server fn)

### 7. Queue Enrichment
- Queue position number, grace wait countdown, priority indicator, depends-on badge, categories as colored chips, timeout display, `skipGracePeriod` indicator

### 8. Micro-Interactions
- Status transitions: smooth color morph on status change
- Running indicator: pulse animation on active step dot
- New activity highlight: latest log line briefly highlights (`bg-sky-500/10`) then fades over 1s
- Row hover: subtle background lift `hover:bg-white/[0.03]`
- Selected step: left accent strip + contrast background
- Expand/collapse: smooth height transition 150-200ms
- Copy feedback: tiny "Copied" toast on SHA/log copy

### 9. Mobile Experience
- < 768px: replace split pane with stacked layout (already exists)
- Sticky compact summary card at top
- Swipeable tabs: Steps | Timeline | Logs | Meta
- Filter bar as horizontally scrollable chips
- Bottom sheets for metadata/actions
- Job list as card rows (already exists)
- Live mode: pinned compact banner with pulsing dot
- Tap-to-focus instead of hover-dependent interactions

### 10. Log/Activity Improvements
- No pagination anywhere — load all activity, virtualize if long (partially done)
- Expand truncated messages — "Show full" button per message with server fn (partially done)
- Fix subagent message count parity bug
- Consistent refresh rate — 3s for active, 30s for completed
- Child session live data — same freshness as parent
- Tool output syntax highlighting via shiki (detect JSON, shell, stack traces)
- Jump to first error button in log stream

### Claude's Discretion
- Exact pixel dimensions for sparkline/mini-bar SVGs
- Specific shiki themes and grammars to bundle
- Animation easing curves beyond the specified `ease-out`
- Internal state management patterns (React Query vs local state)
- Exact breakpoints for mobile tabs/sheets
- Tool chip color assignments
- Tooltip delay timing

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend Data Layer
- `src/core/job-observability.ts` — JobObservabilitySnapshot computation (tokens, cost, models)
- `src/core/job-detail-query.ts` — All query functions for job detail, timeline, sessions, activity
- `src/core/types.ts` — All shared interfaces (JobDetailSnapshot, StepTimelineGroup, JobObservabilitySnapshot, SessionState, etc.)
- `src/core/db.ts` — Queue/recent queries, Job type
- `src/core/opencode-db.ts` — Session state detection (getSessionState), token queries

### Frontend (existing)
- `web/src/lib/server-fns.ts` — All existing server functions
- `web/src/components/split-pane-detail.tsx` — Split pane layout (react-resizable-panels)
- `web/src/components/step-timeline-sidebar.tsx` — Step sidebar with job metadata
- `web/src/components/step-content-pane.tsx` — Content pane with virtualization
- `web/src/components/job-list.tsx` — Job list (table + mobile cards)
- `web/src/components/timeline-stream.tsx` — Timeline item rendering
- `web/src/components/session-activity.tsx` — Session activity rendering
- `web/src/routes/jobs.$jobId.index.tsx` — Job detail route
- `web/src/routes/index.tsx` — Dashboard route
- `web/src/lib/time-utils.ts` — Duration/timestamp helpers
- `web/src/lib/actions.ts` — Action model
- `web/src/hooks/use-media-query.ts` — useIsMobile hook

### Requirements
- `requirements/web-ui-premium.md` — Full PRD with component architecture, Tailwind patterns, data sources

</canonical_refs>

<specifics>
## Specific Ideas

- Component stack reference in PRD: 50 components in `web/src/components/ui/` including accordion, badge, button, card, collapsible, dialog, drawer/sheet, empty, tabs, table, tooltip, toast, progress, meter, etc.
- Existing Tailwind patterns: `data-[status=X]:text-{color}` for status-driven coloring
- `@base-ui/react/drawer` for mobile bottom sheets with `swipeDirection="down"` — no extra dependency
- Inline SVG pattern for sparklines: 5-10 line components, no charting library
- Lazy-load shiki only when viewing logs (code-split)
- GPU-composited animations only: transform/opacity properties via `motion/react`
- All job observability data already computed in `src/core/job-observability.ts` — just needs server fn wrapper and UI

</specifics>

<deferred>
## Deferred Ideas

- Waterfall/trace view for step execution (Datadog-inspired time-aligned bars)
- Critical path highlighting
- Cross-run analytics tab (success rate, median duration, cost trends)
- Saved filter presets
- Dark mode refinements for dense layout
- Keyboard shortcuts (j/k for steps, / for search, r for refresh)
- SSE for truly live updates instead of polling
- Log search with highlighting
- Export logs as text/JSON
- "View diff" link for git checkpoints (requires new server fn with git operations)

</deferred>

---

*Phase: 78-web-ui-premium-data-rich-dense-modern-dashboard*
*Context gathered: 2026-03-21 via PRD Express Path*
