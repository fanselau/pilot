# Plan 083-01: Pilot Web UI Mobile Responsiveness

## Goal
Make the Pilot web UI meaningfully usable on narrow/mobile screens without redesigning the whole app.

## Context
The web UI currently uses fixed `p-8` padding, desktop-only table layouts (session-overview), and rigid row structures in the timeline. The `job-list.tsx` already has a mobile card fallback using a hand-rolled `useMediaQuery` — but it should use the Coss hook from `~/hooks/use-media-query`. The session-overview table has 9 columns and is unusable on mobile. Timeline rows crush text. The header ⌘K hint wastes mobile space.

## Tasks

### Task 1: Fix global layout padding, responsive header, and use Coss useMediaQuery

**Commit:** `fix(web): responsive layout padding, header, and Coss useMediaQuery`

**Changes:**

1. **`web/src/routes/__root.tsx`** — AppHeader:
   - Change `px-8` to `px-4 sm:px-8` on the header inner div
   - Hide the `⌘K Command palette` hint on mobile by adding `hidden sm:flex` to the hint div

2. **`web/src/routes/index.tsx`** — Home page:
   - Change top-level `p-8` to `p-4 sm:p-8` (both loading state and main content)
   - Change the `h1` from `text-3xl` to `text-2xl sm:text-3xl`

3. **`web/src/routes/jobs.$jobId.tsx`** — Job detail page:
   - Change `p-8` to `p-4 sm:p-8` on the outer div and the "not found" div
   - Change `h1 text-2xl` to `text-xl sm:text-2xl`

4. **`web/src/routes/jobs.$jobId.sessions.$sessionId.tsx`** — Session drill-in:
   - Breadcrumb list should get `flex-wrap` to allow wrapping on narrow screens

5. **`web/src/components/job-list.tsx`**:
   - Remove the hand-rolled `useMediaQuery` function (lines 114-129)
   - Import `{ useIsMobile }` from `~/hooks/use-media-query` (the Coss hook)
   - Replace `useMediaQuery('(max-width: 768px)')` call with `useIsMobile()`

### Task 2: Add mobile card fallback for session-overview

**Commit:** `fix(web): mobile card fallback for session overview table`

**Changes:**

1. **`web/src/components/session-overview.tsx`**:
   - Import `{ useIsMobile }` from `~/hooks/use-media-query`
   - Import `{ Card, CardContent }` from `~/components/ui/card`
   - In `SessionOverview`, add `const isMobile = useIsMobile()`
   - Create a `SessionCard` component for mobile rendering:
     - Shows session title, status badge, role badge in a flex-wrap row
     - Shows duration, messages, tokens, children as compact stats
     - Shows model badges below
   - Conditionally render: if `isMobile`, render cards; else render the existing table

### Task 3: Improve timeline/activity row density and job-detail metadata grid on narrow screens

**Commit:** `fix(web): timeline and detail responsiveness on narrow screens`

**Changes:**

1. **`web/src/components/timeline-stream.tsx`** — ActivityRow:
   - Change the outer `flex items-start gap-2` to `flex flex-wrap items-start gap-x-2 gap-y-0.5`
   - This allows the timestamp + role badge to wrap above the text on very narrow screens

2. **`web/src/components/timeline-stream.tsx`** — ToolSummaryRow:
   - Same flex-wrap treatment on the outer div

3. **`web/src/components/timeline-stream.tsx`** — CompletionRow:
   - Same flex-wrap treatment

4. **`web/src/components/timeline-fork-card.tsx`**:
   - On the outer `flex items-start justify-between gap-3`, add `flex-wrap` so the "View details" button wraps below on narrow screens

5. **`web/src/components/job-detail.tsx`** — JobHeader CardContent:
   - Change the metadata grid from `grid-cols-2 sm:grid-cols-3` to `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` for single-column on tiny screens

6. **`web/src/components/session-activity.tsx`** — PartCard:
   - Add `flex-wrap` to the outer flex div for better wrapping of badges on narrow screens

## Verification
- `cd web && npx tsc --noEmit` should pass
- Run existing tests: `bun test` from project root
- Visual: pages should not overflow or require horizontal scrolling at 375px width
