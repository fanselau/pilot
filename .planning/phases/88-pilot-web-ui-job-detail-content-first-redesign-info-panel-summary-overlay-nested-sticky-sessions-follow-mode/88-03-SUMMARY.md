---
phase: 88-pilot-web-ui-job-detail-content-first-redesign
plan: "03"
subsystem: ui
tags: [react, typescript, follow-mode, auto-scroll, live-activity, sse]

requires:
  - phase: 88-01
    provides: Info panel and Summary overlay redesign (tabs removed, unified context surface)
  - phase: 88-02
    provides: Nested child sessions with sticky headers and no card chrome

provides:
  - FollowModeBar component — sticky bottom floating pill for re-engaging follow mode
  - Scroll-direction detection with 80px CANCEL_THRESHOLD in StepContentPane
  - Auto-cancel follow mode on deliberate upward scroll
  - Smooth auto-scroll to latest content when follow is active
  - onFollowCancel + isActive props wired through SplitPaneDetail to StepContentPane

affects:
  - split-pane-detail.tsx
  - step-content-pane.tsx

tech-stack:
  added: []
  patterns:
    - "Sticky-bottom floating button with pointer-events-none container + pointer-events-auto button for click-through"
    - "Cumulative scroll delta accumulation for deliberate-scroll detection (avoids accidental mobile drift)"
    - "useEffect re-enabling follow mode on job status transition to active"

key-files:
  created:
    - web/src/components/follow-mode-bar.tsx
  modified:
    - web/src/components/step-content-pane.tsx
    - web/src/components/split-pane-detail.tsx

key-decisions:
  - "80px CANCEL_THRESHOLD: approximately 5-8mm of deliberate scroll — distinguishes intentional upward scroll from incidental mobile touch drift"
  - "FollowModeBar inside scroll container (sticky bottom-2) rather than absolute-positioned outside — sticks to viewport bottom as user reads older content"
  - "Smooth scrollTo() replaces direct scrollTop assignment for better UX during live auto-scroll"
  - "Re-enable follow effect in SplitPaneDetail: when job transitions to active state, follow automatically re-engages"
  - "Remove old floating Follow button — replaced entirely by FollowModeBar for consistent sticky positioning"

patterns-established:
  - "Sticky bottom floating action pattern: pointer-events-none wrapper + pointer-events-auto button allows click-through to content behind the bar"
  - "Cumulative scroll delta pattern: accumulate |delta| across scroll events, reset on direction reversal — prevents single large swipe from double-triggering"

requirements-completed: [FOLLOW-MODE, CROSS-DEVICE]

duration: 4min
completed: "2026-03-22"
---

# Phase 88 Plan 03: Follow Mode Summary

**Follow mode with sticky "Follow latest" pill, 80px deliberate-scroll auto-cancel, and smooth auto-scroll for live job activity streams**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T23:44:15Z
- **Completed:** 2026-03-22T23:48:38Z
- **Tasks:** 1 auto + 1 checkpoint (auto-approved)
- **Files modified:** 3

## Accomplishments

- New `FollowModeBar` component — sticky bottom pill that appears when follow mode is off for active jobs, re-engages on click
- Scroll-direction detection in `StepContentPane` with 80px cumulative threshold — auto-cancels follow mode on deliberate upward scroll without triggering on small mobile touch drift
- Smooth `scrollTo({ behavior: 'smooth' })` auto-scroll replacing abrupt `scrollTop` assignment
- `onFollowCancel` and `isActive` props fully wired through `SplitPaneDetail` → `StepContentPane` for both desktop and mobile layouts
- `useEffect` in `SplitPaneDetail` re-enables follow mode when a job transitions to active state

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FollowModeBar + implement scroll-direction-based auto-cancel** - `fca6640` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified

- `web/src/components/follow-mode-bar.tsx` — New component: sticky bottom floating pill button for follow-mode re-engagement
- `web/src/components/step-content-pane.tsx` — Added CANCEL_THRESHOLD, scroll handler, onFollowCancel/isActive props, FollowModeBar render, smooth auto-scroll
- `web/src/components/split-pane-detail.tsx` — Added useEffect + onFollowCancel + isActive wiring for both mobile and desktop StepContentPane renders

## Decisions Made

- **80px CANCEL_THRESHOLD**: Chosen as ~5-8mm of deliberate scroll movement, which clearly distinguishes intentional scrolling from accidental touch drift on mobile. Small vibration or incidental touches typically produce <20px of scroll delta.
- **FollowModeBar inside scroll container**: Using `sticky bottom-2` within the scrollable div ensures the bar remains visible at the bottom of the viewport as the user reads older content upward, then disappears when the user scrolls back down to the end.
- **Removed old floating Follow button**: The absolute-positioned `↓ Follow` button in the floating button cluster is removed entirely, replaced by the FollowModeBar which provides better UX with centered sticky positioning.
- **Smooth scroll**: Changed from `parentRef.current.scrollTop = parentRef.current.scrollHeight` to `parentRef.current.scrollTo({ top: ..., behavior: 'smooth' })` for less jarring auto-scroll when new content arrives.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Complete Phase 88 (Plans 01-03 all done): Info panel + Summary overlay + nested sticky sessions + Follow mode
- Visual verification checkpoint auto-approved (auto_advance=true)
- TypeScript compilation clean (zero errors)
- Both desktop and mobile layouts receive onFollowCancel + isActive props

---
*Phase: 88-pilot-web-ui-job-detail-content-first-redesign*
*Completed: 2026-03-22*
