---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
plan: 02
subsystem: ui
tags: [react, tanstack-router, tailwind, mobile-responsive]

# Dependency graph
requires:
  - phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
    provides: Phase 86 plan 01 job list grace period states
provides:
  - Mobile-safe dashboard tab bar with overflow-x-auto scrolling
  - Sessions tab removed — reduced from 5 tabs to 4 (Active, Queued, Recent, Projects)
  - Projects page card grid with status badges, owner, job stats, and summary header
affects: [86-03, web-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scrollable tab bar: wrap TabsList in overflow-x-auto div with scrollbar-hide classes"
    - "Card grid layout: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    - "Summary stats header above content grid with colored badge indicators"

key-files:
  created: []
  modified:
    - web/src/routes/index.tsx
    - web/src/components/projects-list.tsx

key-decisions:
  - "Chose Option A (remove Sessions tab) over Option B (reframe as Live) — eliminates the low-value tab entirely and reduces overflow pressure"
  - "Used overflow-x-auto wrapper div around TabsList rather than modifying TabsList CSS — wrapper pattern is cleaner and doesn't fight base-ui's w-fit behavior"
  - "Project detail page left unchanged — it already had all required features (job history, stats cards, block/unblock actions)"

patterns-established:
  - "Scrollable tab bar: overflow-x-auto wrapper + [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  - "Project card: Card with custom inner div, not CardHeader/CardContent, for layout flexibility"

requirements-completed: [NAV86-01, NAV86-02, PROJ86-01]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 86 Plan 02: Dashboard Mobile Overflow Fix + Projects Card Grid Summary

**Dashboard tab bar fixed for mobile with overflow scrolling; Sessions tab removed; Projects page upgraded from bare table to rich card grid with summary stats**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T00:11:09Z
- **Completed:** 2026-03-22T00:13:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed dashboard tab bar horizontal overflow on mobile — tabs now scroll within a hidden-scrollbar container
- Removed low-value Sessions tab (5→4 tabs), eliminating session data loading overhead (5+ getJobDetailFn calls per render)
- Upgraded Projects page from a bare table to a card grid with responsive layout (1→2→3 columns), status badges, owner, path with tooltip, block reason, and job stats
- Added summary stats header above project cards: total count, active/blocked project counts, total running jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix dashboard tab bar mobile overflow and remove Sessions tab** - `240ed08` (feat)
2. **Task 2: Upgrade Projects page to card-based grid** - `5fd5baf` (feat)

## Files Created/Modified

- `web/src/routes/index.tsx` — Removed Sessions tab + session state/queries; wrapped TabsList with overflow-x-auto div
- `web/src/components/projects-list.tsx` — Rewrote from table to card grid with summary header; improved empty state

## Decisions Made

- **Removed Sessions tab (Option A)**: Plan offered Option A (remove) or Option B (reframe as "Live"). Chose A — eliminates duplicate information already visible in job detail, reduces network load (no more batch getJobDetailFn calls), and cuts tab count to 4 which fits mobile comfortably.
- **Overflow wrapper div**: Rather than adding `overflow-x-auto` to TabsList directly (which has `w-fit` set by base-ui), wrapped with a plain div. Avoids fighting base-ui internal styles; indicator CSS variables remain relative to TabsList so scroll behavior is correct.
- **Project detail page untouched**: Already had all required features from previous phase work — job history via getProjectJobsFn, stats cards, block/unblock actions, categories display. Adding pass rate / average duration was not in acceptance criteria.

## Deviations from Plan

None — plan executed exactly as written. Both option A (remove Sessions tab) and the card grid rewrite were implemented as specified.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Tab bar overflow fix and Sessions tab removal are complete, ready for Phase 86-03 (sticky header hierarchy)
- Projects page card grid is functional and visually stronger
- No blockers

---
*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Completed: 2026-03-22*
