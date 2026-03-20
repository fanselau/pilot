---
phase: "083"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/routes/__root.tsx
  - web/src/routes/index.tsx
  - web/src/routes/jobs.$jobId.tsx
  - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
  - web/src/components/job-list.tsx
  - web/src/components/session-overview.tsx
  - web/src/components/timeline-stream.tsx
  - web/src/components/session-activity.tsx
  - web/src/components/timeline-fork-card.tsx
autonomous: true

must_haves:
  truths:
    - "All pages have comfortable padding on mobile (not 32px)"
    - "Session overview tab is readable on narrow screens via card fallback"
    - "Timeline rows don't overflow or crush content on narrow screens"
    - "Dashboard tabs don't overflow on narrow screens"
    - "The Coss useMediaQuery hook is used consistently (not hand-rolled)"
  artifacts:
    - path: "web/src/routes/__root.tsx"
      provides: "Responsive header padding"
      contains: "px-4 sm:px-8"
    - path: "web/src/components/session-overview.tsx"
      provides: "Mobile card fallback for sessions"
      contains: "useMediaQuery"
    - path: "web/src/components/job-list.tsx"
      provides: "Coss useMediaQuery integration"
      contains: "~/hooks/use-media-query"
  key_links:
    - from: "web/src/components/session-overview.tsx"
      to: "~/hooks/use-media-query"
      via: "import useMediaQuery"
      pattern: "useMediaQuery"
    - from: "web/src/components/job-list.tsx"
      to: "~/hooks/use-media-query"
      via: "import useMediaQuery"
      pattern: "~/hooks/use-media-query"
---

<objective>
Make the Pilot web UI meaningfully usable on mobile and narrow screens without redesigning the app.

Purpose: The web UI is accessed via tunnels, phones, and cramped remote browsers. It must work as a real remote operator surface, not just a desktop-only page.
Output: All core screens (dashboard, job detail, session drill-in) function well on narrow viewports.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/routes/__root.tsx
@web/src/routes/index.tsx
@web/src/routes/jobs.$jobId.tsx
@web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
@web/src/components/job-list.tsx
@web/src/components/session-overview.tsx
@web/src/components/timeline-stream.tsx
@web/src/components/session-activity.tsx
@web/src/components/timeline-fork-card.tsx
@web/src/hooks/use-media-query.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix global layout padding and responsive spacing</name>
  <files>
    web/src/routes/__root.tsx
    web/src/routes/index.tsx
    web/src/routes/jobs.$jobId.tsx
    web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
  </files>
  <action>
Fix excessive padding and layout issues across all pages:

**`__root.tsx` — AppHeader:**
- Change `px-8` to `px-4 sm:px-8` on the inner container.
- Hide the `⌘K Command palette` text hint on small screens (keep Kbd visible). Use `hidden sm:flex` on the hint container, or similar. The command palette still works via keyboard, it's just the hint text that's noisy on mobile.

**`index.tsx` — Home:**
- Change outer `p-8` to `p-4 sm:p-8` on both the loading skeleton wrapper and the main content wrapper.
- On the Dashboard header row (`flex items-start justify-between gap-4`), the "Dashboard" h1 can be `text-2xl sm:text-3xl`.

**`jobs.$jobId.tsx` — JobDetailPage:**
- Change `p-8` to `p-4 sm:p-8` on both the error empty state wrapper and the main content wrapper.

**`jobs.$jobId.sessions.$sessionId.tsx` — SessionDrillIn:**
- The breadcrumb text can get long. Add `overflow-x-auto` or `flex-wrap` to the BreadcrumbList so it wraps on narrow screens instead of overflowing.
  </action>
  <verify>
Visually check at 375px width: pages have ~16px padding, not 32px. Header text doesn't crowd. Breadcrumbs wrap instead of overflowing.
  </verify>
  <done>
All route-level pages use responsive padding (p-4 sm:p-8). Header adapts to narrow screens. Breadcrumbs don't overflow.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add mobile card fallback for session-overview and standardize useMediaQuery</name>
  <files>
    web/src/components/session-overview.tsx
    web/src/components/job-list.tsx
  </files>
  <action>
**`session-overview.tsx` — Add mobile card view:**
The sessions tab currently renders a 9-column table that's completely unusable on narrow screens. Follow the exact pattern from `job-list.tsx` which already has a `JobCard` mobile fallback:

1. Import `useMediaQuery` from `~/hooks/use-media-query` (the Coss hook, NOT a hand-rolled one).
2. Import `Card`, `CardContent` from the UI components.
3. Create a `SessionCard` component (similar to `JobCard` in job-list.tsx):
   - Link wrapping the card (to `/jobs/$jobId/sessions/$sessionId` — but session overview doesn't have jobId in scope currently, so just make it a non-linking card for now showing session info).
   - Show: title (truncated), status badge, role badge, duration, message count, token count.
   - Use `flex items-start justify-between` layout like `SubagentCard`.
4. Create a `SessionSection` component that checks `isMobile` and renders either `SessionCard` list or the existing table.
5. In the main `SessionOverview` component, use `const isMobile = useMediaQuery("max-md")` (Coss breakpoint syntax, not raw media query string).
6. Pass `isMobile` to the rendering decision.

**`job-list.tsx` — Switch to Coss useMediaQuery:**
1. Remove the hand-rolled `useMediaQuery` function (lines 114-129).
2. Import `useMediaQuery` from `~/hooks/use-media-query` instead.
3. Change the call from `useMediaQuery('(max-width: 768px)')` to `useMediaQuery("max-md")` — the Coss hook uses Tailwind-style breakpoint syntax where `max-md` means "below 800px" which is the correct mobile breakpoint.
  </action>
  <verify>
`grep -r "useMediaQuery" web/src/components/` should show imports from `~/hooks/use-media-query` only (no hand-rolled definitions). Session overview should render card layout when viewport is below 800px.
  </verify>
  <done>
Session overview has a usable card-based mobile view. Job-list uses the Coss useMediaQuery hook. Both components share the same responsive breakpoint.
  </done>
</task>

<task type="auto">
  <name>Task 3: Improve timeline and activity row density on narrow screens</name>
  <files>
    web/src/components/timeline-stream.tsx
    web/src/components/session-activity.tsx
    web/src/components/timeline-fork-card.tsx
  </files>
  <action>
Timeline rows currently show timestamp + role badge + text all on one horizontal line. On narrow screens this crushes the text content to almost nothing.

**`timeline-stream.tsx` — ActivityRow and ToolSummaryRow:**
- In `ActivityRow`: Make the timestamp and role badge stack above the text on mobile. Change the row layout to allow wrapping: use `flex flex-wrap items-start gap-x-2 gap-y-0.5` so that on narrow screens the text wraps below the timestamp/badge.
- In `ToolSummaryRow`: Same treatment — allow the timestamp, tool badge, and status badge to wrap. The expandable content area should be `w-full` when it wraps to a new line.
- In `CompletionRow`: Similar — allow flex-wrap so stats don't get crushed.

**`session-activity.tsx` — PartCard:**
- Same pattern as timeline rows: allow `flex-wrap` with `gap-x-2 gap-y-0.5` so timestamp + type badge + role badge can wrap above the content on narrow screens.
- The expanded `<pre>` blocks already have `break-words` and `whitespace-pre-wrap` which is good.

**`timeline-fork-card.tsx` — TimelineForkCard:**
- The "View details →" button is in a right column (`shrink-0`). On very narrow screens this still works because the card layout uses `flex items-start justify-between gap-3`. But make the gap responsive: `gap-2 sm:gap-3`.
- The stats row (`flex flex-wrap items-center gap-3`) is fine but tighten gap on mobile: `gap-2 sm:gap-3`.

These are intentionally light-touch: add flex-wrap and responsive gaps rather than redesigning the components.
  </action>
  <verify>
At 375px viewport width: timeline activity text is readable (not crushed to a few characters). Tool summary rows show their content. Fork cards don't overflow. Session activity parts are readable.
  </verify>
  <done>
Timeline and activity rows degrade gracefully on narrow screens by wrapping rather than crushing content. Fork cards and session activity maintain readability.
  </done>
</task>

</tasks>

<verification>
1. Resize browser to 375px width (iPhone SE). Navigate through: Dashboard → Job detail → Session drill-in.
2. All pages should have ~16px padding on mobile, ~32px on desktop.
3. Session overview tab shows card layout on mobile, table on desktop.
4. Timeline rows are readable — timestamps and badges wrap above content text when needed.
5. No horizontal scroll bars on any page at 375px.
6. `grep -r "useMediaQuery" web/src/components/` shows NO hand-rolled definitions, only imports from `~/hooks/use-media-query`.
</verification>

<success_criteria>
- The web UI is clearly more usable on narrow/mobile screens
- Core screens do not require desktop width to function
- Session overview degrades to cards on mobile
- All useMediaQuery usage comes from the Coss hook
- Mobile/narrow layout choices feel intentional, not broken-by-default
</success_criteria>

<output>
After completion, create `.planning/quick/083-pilot-web-ui-mobile-responsiveness-and-n/083-SUMMARY.md`
</output>
