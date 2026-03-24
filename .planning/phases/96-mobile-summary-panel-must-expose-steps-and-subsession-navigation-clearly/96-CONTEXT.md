# Phase 96: Mobile Summary Panel Step & Session Navigation Fix - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/mobile-summary-panel-step-session-navigation-fix.md)

<domain>
## Phase Boundary

This phase fixes the broken mobile navigation experience in the Pilot web UI job-detail view. On mobile, the summary panel currently has no way to see the full step list or navigate between steps/subsessions — the `StepTimelineSidebar` only renders on desktop. This phase adds a mobile step-navigation drawer (bottom sheet) and subsession navigation chips so mobile users can browse all steps and jump to subsessions within the continuous-scroll content pane.

</domain>

<decisions>
## Implementation Decisions

### Mobile Step Navigation Drawer
- Add a "Steps" ghost button to the mobile top bar in `split-pane-detail.tsx`, positioned between the pulse indicator and the Summary button
- Implement a bottom sheet drawer (`<Sheet>` with `side="bottom"`) matching the existing Summary/Info overlay pattern
- The drawer displays a scrollable list of all step groups with step index, semantic icon, command label, status badge, and duration
- Minimum 44px step item height for WCAG 2.5.5 touch targets
- Active step highlighted with `border-l-2 border-sky-400 bg-sky-500/5` + "Live" info badge
- Tapping a step dismisses the drawer and scrolls the content pane via existing `scrollToStepRef`
- Steps with subsessions show a fork icon with count badge
- Drawer height: 60vh default, swipe-dismissible (native Sheet behavior)

### Subsession Navigation Chips
- When a step has subsessions (fork-card items), render a horizontal row of tappable chips below the step header in the content pane
- Only shown on mobile (`isMobile`) and only for steps with ≥ 1 subsession
- Chip label format: `S1`, `S2`, etc. + model short name if available: `S1 · sonnet`
- Chip tap scrolls to the subsession's fork card element using `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- Active chip (running subsession): `variant="info"` + pulse dot
- Horizontal scroll row: `flex gap-1.5 overflow-x-auto py-1 px-3`

### Mobile Top Bar Updates
- Add "Steps" button with optional step count: `Steps (7)` when > 0 steps
- Button spec: `<Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">Steps</Button>`
- Position: after pulse indicator, before Summary button

### Preservation
- Desktop behavior must be preserved unchanged
- Do not redesign the entire job detail UI
- Do not hide subsessions to make the panel look cleaner
- Must work for multi-step jobs (not just trivial single-step)
- Do not rely on hover-only or desktop-only interaction assumptions

### Agent's Discretion
- Internal component file organization (new file vs. inline in split-pane-detail.tsx)
- Exact animation/transition timing for drawer open/close
- How to extract subsessions from StepTimelineGroup items (filter by `kind === 'fork-card'`)
- Whether to create a shared helper for step item rendering between drawer and sidebar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Design Contract
- `.planning/phases/96-mobile-summary-panel-must-expose-steps-and-subsession-navigation-clearly/96-UI-SPEC.md` — Full visual/interaction spec for mobile drawer and chips

### Existing Mobile Layout
- `web/src/components/split-pane-detail.tsx` — Main split-pane layout with mobile branch (lines 76-137)
- `web/src/components/step-timeline-sidebar.tsx` — Desktop sidebar step list (reuse step item rendering patterns)
- `web/src/components/step-content-pane.tsx` — Content pane with scroll-spy and step headers

### Sheet Pattern Reference
- `web/src/components/summary-overlay.tsx` — Existing bottom sheet pattern for mobile
- `web/src/components/job-info-panel.tsx` — Another existing Sheet usage pattern
- `web/src/components/ui/sheet.tsx` — Sheet component API (`SheetContent side="bottom"`)

### Step Semantics & Types
- `web/src/lib/step-semantics.ts` — `SEMANTIC_TYPE_CONFIG`, `resolveSemanticType`, `formatStepLabel`, icons
- `src/core/types.ts` — `StepTimelineGroup`, `BranchLifecycleItem` (fork-card subsessions)

### Mobile Detection
- `web/src/hooks/use-media-query.ts` — `useIsMobile()` hook (viewport < 800px)

</canonical_refs>

<specifics>
## Specific Ideas

- Drawer visual spec: step items with mono index, semantic icon, command label, status badge, duration
- Subsession indicator in drawer: fork icon + count badge
- Subsession chips below step header: `S1 · sonnet`, `S2 · gpt-5.4`
- Step navigation hint text: "Tap a step to jump"
- Empty state: "No steps yet" / "Steps will appear here as the job progresses."
- Active step indicator: "Live" badge next to running step

</specifics>

<deferred>
## Deferred Ideas

- Keyboard navigation in mobile drawer (touch-primary surface)
- Desktop sidebar visual changes (unless shared improvement is clearly beneficial)
- Advanced subsession drill-in from chips (chips only scroll to fork card, not navigate into subsession detail)

</deferred>

---

*Phase: 96-mobile-summary-panel-must-expose-steps-and-subsession-navigation-clearly*
*Context gathered: 2026-03-24 via PRD Express Path*
