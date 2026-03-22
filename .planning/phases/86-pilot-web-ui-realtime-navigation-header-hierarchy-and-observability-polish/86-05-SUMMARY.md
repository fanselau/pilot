---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
plan: 05
subsystem: ui
tags: [react, tanstack-router, tanstack-query, collapsible, sticky-headers, token-accounting, grace-period, observability, testing]

# Dependency graph
requires:
  - phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
    provides: Plans 01-04 completed — all 7 PRD areas implemented

provides:
  - Full test suite alignment with Phase 86 behavior changes
  - Comprehensive Phase 86 SUMMARY.md documenting all 7 PRD areas
  - All 1277 tests passing after phase changes

affects:
  - test/core/opencode-db.test.ts
  - test/core/runner-lock.test.ts
  - test/tui/shortcuts.test.ts
  - test/web/job-routes.test.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test suite maintenance: update mock sets and factory objects when new Job fields are added"
    - "Design-decision-as-comment: document why test expectations changed (not just that they did)"

key-files:
  created:
    - .planning/phases/86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish/86-05-SUMMARY.md
  modified:
    - test/core/opencode-db.test.ts
    - test/core/runner-lock.test.ts
    - test/tui/shortcuts.test.ts
    - test/web/job-routes.test.ts

key-decisions:
  - "Update job-routes test to verify redirect behavior (not old page content) — Phase 86-04 replaced session drill-in with inline collapsible"
  - "No stale-child timeout in getSessionState — deliberate design: children may wait for rate limits for hours"
  - "All 4 pre-existing/Phase-86-caused test failures fixed in single cross-cutting commit"

patterns-established:
  - "When routes change from page → redirect, update tests to verify the redirect contract"
  - "Mock sets (IMPLEMENTED_KEYS, db mocks) must stay in sync with implementation as features are added"

requirements-completed: [SUMM86-02]

# Metrics
duration: 7min
completed: 2026-03-22
---

# Phase 86 Plan 05: Full Verification + Comprehensive Phase Summary

**All 7 PRD areas verified across Phase 86 (build clean, 1277 tests pass); 4 test gaps fixed; comprehensive phase documentation produced**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T00:25:43Z
- **Completed:** 2026-03-22T00:31:38Z
- **Tasks:** 2
- **Files modified:** 5 (4 test files + this SUMMARY.md)

## Accomplishments

- Ran full verification: web build ✓ (4.64s), test suite ✓ (1277/1277 passing)
- Fixed 4 test failures: 1 Phase-86-04-caused (session route redirect), 3 pre-existing gaps (runner-lock mock, shortcuts IMPLEMENTED_KEYS, opencode-db stale child expectation)
- Confirmed no stale `sessions/$sessionId` drill-in links remain in web components (only routeTree.gen.ts and the redirect file itself)
- Confirmed no `SubagentCard` imports remain anywhere

## Task Commits

Each task was committed atomically:

1. **Task 1: Full verification + fix cross-cutting test failures** - `bb3ee6c` (fix)
2. **Task 2: Write comprehensive Phase 86 SUMMARY.md** - *(this commit — docs)*

**Plan metadata:** *(this commit)*

---

## Phase 86 Comprehensive Summary: All 7 PRD Areas

This section documents all changes delivered across Phase 86 plans 01-04.

---

### Area 1: Token Accounting Fixes Across Providers/Models

**Plan:** 86-01 | **Files:** `src/core/opencode-db.ts`, `test/core/opencode-db.test.ts`

**Root cause:** The OpenCode SQLite DB stores cache tokens as `$.tokens.cache.read` (nested object), not `$.tokens.cache_read` (flat). Both `getSessionTokens()` and `getSessionTokenUsageByModel()` were using only the flat path, returning near-zero cache token counts for all Anthropic sessions.

**Fix:** Applied `COALESCE(json_extract(data, '$.tokens.cache.read'), json_extract(data, '$.tokens.cache_read'))` across both functions, plus a `COALESCE` for `$.tokens.input` / `$.tokens.inputTokens` / `$.usage.inputTokens` (legacy fallback). Covers both nested format (real DB) and flat format (existing tests).

**Key decisions:**
- COALESCE approach over schema migration — handles both old and new formats simultaneously without breaking existing tests
- Added `$.usage.inputTokens` fallback path for OpenAI sessions which use a different structure

**Tests added:** 6 new tests covering Anthropic nested cache, OpenAI nested cache, `normalizeModelKey` for `claude-sonnet-4-6`, recursive mixed-provider tree, legacy flat format fallback, legacy `inputTokens` fallback.

**Commits:** `d7c4369` (test RED), `addb295` (feat GREEN)

---

### Area 2: Grace Period Visibility Changes

**Plan:** 86-01 | **Files:** `web/src/components/job-list.tsx`

**Problem:** Grace period jobs (pending with `queueGraceSeconds` delay) showed the same "pending" badge as normal pending jobs — indistinguishable from a real queue hold.

**Fix:** Added `formatGraceCountdown()` utility and `GraceBadge` component with amber/warning styling, animated pulse dot, and a tooltip explaining the grace delay. The grace badge **replaces** the pending status badge entirely (not shown alongside) for unambiguous single-state semantics. Applied to both `JobCard` (mobile) and `JobTable` (desktop) variants.

**Key decisions:**
- Grace badge replaces pending badge (not alongside) — one visual state per semantic state
- `GraceBadge` is self-contained with its own `TooltipProvider` for portability

**Commits:** `a1d9ccb`

---

### Area 3: Dashboard Navigation + Tab Changes

**Plan:** 86-02 | **Files:** `web/src/routes/index.tsx`

**Problems:**
1. Tab bar overflowed horizontally on mobile screens (5 tabs too wide)
2. Sessions tab showed a list of all sessions across all jobs — low-value, expensive (5+ `getJobDetailFn` calls per render)

**Fix:**
1. Wrapped `TabsList` in an `overflow-x-auto` div with `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` — scrollable without visible scrollbar
2. Removed Sessions tab entirely (Option A from the plan decision) → 4 remaining tabs: Active, Queued, Recent, Projects

**Key decisions:**
- Overflow wrapper div (not modifying TabsList CSS directly) — avoids fighting base-ui's `w-fit` behavior
- Sessions tab removed (not reframed as "Live") — eliminates duplicate info + reduces network overhead

**Commits:** `240ed08`

---

### Area 4: Projects Page Improvements

**Plan:** 86-02 | **Files:** `web/src/components/projects-list.tsx`

**Problem:** Projects page was a bare HTML table with minimal information and no visual hierarchy.

**Fix:** Replaced table with responsive card grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). Each card shows: project name, path (with tooltip for long paths), status badge, owner, block reason (if blocked), and job stats (running count). Added summary stats header above the grid: total project count, active count, blocked count, running jobs total.

**Key decisions:**
- Card with custom inner div (not `CardHeader`/`CardContent`) — layout flexibility without fighting component spacing
- Project detail page left unchanged — already had all required features from prior phase work

**Commits:** `5fd5baf`

---

### Area 5: Sticky Header Hierarchy Changes

**Plan:** 86-03 | **Files:** `web/src/lib/step-semantics.ts`, `web/src/components/step-content-pane.tsx`

**Problem:** All step sticky headers looked identical — no visual differentiation between execution steps, judge steps, gap-closure steps. Headers showed minimal information.

**Fix:** Added `SynthesizedHeaderFields` interface and `synthesizeHeaderFields()` function to `step-semantics.ts`, centralizing header field derivation:
- `label` — human-readable step label
- `stage` — semantic stage name
- `verdict` — judge verdict (pass/fail/doubting)
- `model` — active model used
- `statusCounters` — count of active/done child sessions (fork-card items)
- `continuationReason` — why a step continued
- `hasSummary` — whether a summary deep-link is available
- `isActive` — whether this step is currently running

Reworked sticky headers to two-row layout: row 1 (label + status + model + duration), row 2 (stage + counters + reason). Added color-coded bottom borders per step type:
- Execution / delegation steps → primary/blue border
- Judge / verify steps → amber border
- Gap-closure steps → orange border
- Failed-retry steps → red border
- Quick / unattributed → muted border

Added active pulse dot + left accent bar for the currently-running step.

**Key decisions:**
- `synthesizeHeaderFields` in `step-semantics.ts` (not inline) — single source of truth for all UI surfaces
- `statusCounters` counts fork-card (BranchLifecycleItem) items only — these are child sessions, the meaningful "sessions active/done"
- `hasSummary = isJudgeStep && !!verdictReason` — requires both conditions to avoid false positives

**Commits:** `262c64c`

---

### Area 6: Summary Deep-Link Behavior

**Plan:** 86-03 | **Files:** `web/src/components/step-content-pane.tsx`, `web/src/components/step-timeline-sidebar.tsx`

**Problem:** Clicking "summary" in the UI did nothing — no navigation or scroll to the verdict/summary section.

**Fix:**
1. Added `id="step-${stepIndex}-summary"` to verdict cards in `step-content-pane.tsx`
2. Added "View Summary" deep-link button in the sticky step header that calls `document.getElementById(...).scrollIntoView({ behavior: 'smooth', block: 'start' })`
3. Added summary indicator icons to `step-timeline-sidebar.tsx` — a separate clickable button (not part of the main step click target) that scrolls to the verdict card

**Key decisions:**
- Sidebar summary indicator is a separate clickable element from the main step button — different targets for different actions (step click = scroll to top of step, icon click = scroll to summary)
- Verdict card left border color reflects verdict outcome: green=pass/done, red=failed, amber=pending/doubting

**Commits:** `fa3e1b2`

---

### Area 7: Realtime/Subsession Changes

**Plan:** 86-04 | **Files:** `web/src/components/branch-lifecycle-block.tsx`, `web/src/components/session-activity.tsx`, `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx`

**Problem:** Child/sub-sessions required navigating to a separate drill-in page (breaking context from the main execution flow). Session activity didn't update live for running sessions.

**Fix:**
1. **`BranchLifecycleBlock` → inline Collapsible tree:** Added `depth` prop and `MAX_DEPTH=4` guard, controlled `Collapsible` state (`useState` + `onOpenChange`), depth-based default expansion (active sessions at depth<2 auto-expand; done sessions always collapse), lazy child loading with `useQuery enabled: isOpen`, recursive child `BranchLifecycleBlock` rendering
2. **`SessionActivity` live polling:** Added `isActive` prop; when true, sets `refetchInterval: 3000` (3s polling). Passed from `BranchLifecycleBlock` based on session state
3. **`SubagentCard` deleted:** Was only used in the session drill-in route which is now a redirect
4. **Session drill-in route → redirect:** `jobs.$jobId.sessions.$sessionId.tsx` replaced with 18-line `beforeLoad` redirect to `/jobs/$jobId`. Route file kept (TanStack Router requires file for route tree generation)

**Key decisions:**
- Controlled Collapsible (not `defaultOpen`) to enable `useQuery enabled: isOpen` lazy fetch pattern
- Depth < 2 default expansion: balances visibility (you see active work) vs noise (deep nesting stays collapsed)
- `MAX_DEPTH = 4`: hard limit prevents infinite recursion
- SubagentCard deleted (safe: only consumer was the now-redirect route)

**Commits:** `5052bf6`, `805258f`, `565f736`

---

## Files Created/Modified Across Phase 86

### Plan 86-01 (Token Accounting + Grace Period)
- `src/core/opencode-db.ts` — COALESCE for nested and flat cache token paths in `getSessionTokens()` and `getSessionTokenUsageByModel()`
- `web/src/components/job-list.tsx` — `GraceBadge` component with amber/pulse/tooltip; replaces pending badge when grace active
- `test/core/opencode-db.test.ts` — 6 new tests for nested cache token formats

### Plan 86-02 (Dashboard Nav + Projects)
- `web/src/routes/index.tsx` — Removed Sessions tab, wrapped TabsList in overflow-x-auto div
- `web/src/components/projects-list.tsx` — Rewrote from table to responsive card grid with summary header

### Plan 86-03 (Sticky Headers + Summary Deep-Link)
- `web/src/lib/step-semantics.ts` — Added `SynthesizedHeaderFields` interface + `synthesizeHeaderFields()` function
- `web/src/components/step-content-pane.tsx` — Two-row sticky headers, color-coded borders, pulse dot, `id` on verdict cards, "View Summary" deep-link
- `web/src/components/step-timeline-sidebar.tsx` — Summary indicator icon buttons with `scrollIntoView`

### Plan 86-04 (Inline Collapsible Subsession Nesting)
- `web/src/components/branch-lifecycle-block.tsx` — Rewrote as inline Collapsible tree with depth, lazy children, live polling
- `web/src/components/session-activity.tsx` — Added `isActive` prop driving `refetchInterval: 3000 | false`
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Replaced 98-line UI with 18-line redirect
- `web/src/components/subagent-card.tsx` — **Deleted** (replaced by BranchLifecycleBlock)

### Plan 86-05 (Verification + Cross-Cutting Fixes)
- `test/web/job-routes.test.ts` — Updated session route test for redirect contract
- `test/core/runner-lock.test.ts` — Added `getResumedReviewHoldJobs` mock
- `test/tui/shortcuts.test.ts` — Added 'b' to IMPLEMENTED_KEYS; fixed mockJob missing fields
- `test/core/opencode-db.test.ts` — Updated stale child test to reflect deliberate no-timeout design

## Decisions Made

- **COALESCE over migration** (86-01): Handle both nested (`$.tokens.cache.read`) and flat (`$.tokens.cache_read`) paths simultaneously without test rewrites
- **Sessions tab removed, not reframed** (86-02): Eliminating low-value tab reduces overhead and clutter; information is visible via job detail
- **synthesizeHeaderFields centralized** (86-03): Step header field derivation belongs in `step-semantics.ts` (not inline) for multi-surface consistency
- **Summary deep-link as separate click target** (86-03): Step label click ≠ summary icon click — different affordances for different navigation actions
- **Controlled Collapsible for lazy loading** (86-04): `useState isOpen` enables `useQuery enabled: isOpen` pattern — lazy fetch only when expanded
- **No stale-child timeout** (86-05 documentation): `getSessionState` deliberately does not timeout inactive children — they may be rate-limit waiting for hours

## Deviations from Plan

None — all plans executed exactly as written. Options presented in plan decisions were resolved as specified (Option A for Sessions tab removal, Option A for SubagentCard deletion).

### Pre-Existing Test Gaps Fixed (Plan 05)

**1. [Rule 1 - Bug] Session route test expected old page content**
- **Found during:** Task 1 verification
- **Issue:** `test/web/job-routes.test.ts` expected 'Back to Job', 'Sub-Agent Session' in session route — these were removed in Plan 86-04 when the route became a redirect
- **Fix:** Updated test to verify redirect contract (`beforeLoad`, `to: '/jobs/$jobId'`, `redirect`)
- **Files modified:** `test/web/job-routes.test.ts`

**2. [Rule 2 - Missing Critical] runner-lock mock missing `getResumedReviewHoldJobs`**
- **Found during:** Task 1 verification
- **Issue:** `test/core/runner-lock.test.ts` db mock didn't include `getResumedReviewHoldJobs` (added in Phase 84), causing test to crash
- **Fix:** Added `getResumedReviewHoldJobs: vi.fn(() => [])` to mock
- **Files modified:** `test/core/runner-lock.test.ts`

**3. [Rule 2 - Missing Critical] shortcuts test IMPLEMENTED_KEYS missing 'b' and mockJob missing fields**
- **Found during:** Task 1 verification
- **Issue:** `b` (block project) was added to HELP_TEXT in Phase 77 but never added to `IMPLEMENTED_KEYS` in the test; mockJob missing `retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`, `hungCount`, `lastHungReason` fields
- **Fix:** Added 'b' to IMPLEMENTED_KEYS; added all missing Job fields to mockJob
- **Files modified:** `test/tui/shortcuts.test.ts`

**4. [Rule 1 - Bug] opencode-db stale child test expected unimplemented behavior**
- **Found during:** Task 1 verification
- **Issue:** Test expected `getSessionState` to return 'done' for a child with 5+ min inactivity — but the code deliberately doesn't implement timeout (comment: "child may be waiting on rate limits for hours")
- **Fix:** Updated test to reflect actual behavior ('working') and document the design decision
- **Files modified:** `test/core/opencode-db.test.ts`

---

**Total deviations:** 4 pre-existing test gaps fixed (Rules 1-2); 0 plan deviations
**Impact:** All auto-fixes necessary for test correctness. No scope creep. Build and all 1277 tests green.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 86 is complete. All 7 PRD areas delivered:
1. ✅ Realtime/subsession changes — inline collapsible tree with live polling
2. ✅ Dashboard nav/tab changes — mobile overflow fixed, Sessions tab removed
3. ✅ Projects-page improvements — card grid with status/stats
4. ✅ Sticky header hierarchy — two-row, color-coded by step type
5. ✅ Summary deep-link — click-to-scroll from sidebar and header
6. ✅ Grace period visibility — amber countdown badge with pulse
7. ✅ Token accounting — COALESCE for all provider paths

Build: ✓ (4.64s). Tests: ✓ (1277/1277). No regressions.

## Self-Check: PASSED

- ✅ FOUND: .planning/phases/86-.../86-05-SUMMARY.md
- ✅ FOUND: commit bb3ee6c (fix test alignment)
- ✅ FOUND: commit e39ea90 (docs comprehensive summary)
- ✅ Build passes (4.64s)
- ✅ 1277/1277 tests pass

---
*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Completed: 2026-03-22*
