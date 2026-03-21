---
phase: quick
plan: 260321-w8r
subsystem: ui
tags: [css, dvh, viewport, ios-safari, tailwind, responsive]

requires: []
provides:
  - dvh-based viewport height across all layout-constraining components
  - CSS custom property --app-dvh with @supports fallback for older browsers
affects: [web-ui, mobile, ios-safari]

tech-stack:
  added: []
  patterns: ["Use 100dvh / h-dvh instead of 100vh / h-screen for full-viewport layouts"]

key-files:
  created: []
  modified:
    - web/src/styles.css
    - web/src/routes/__root.tsx
    - web/src/routes/jobs.$jobId.tsx
    - web/src/components/split-pane-detail.tsx

key-decisions:
  - "Use Tailwind v4 native h-dvh/min-h-dvh utilities rather than a JS-based window.innerHeight approach"
  - "Keep sidebar.tsx using svh (small viewport height) — correct for sidebars; no change needed"
  - "Keep command.tsx vh padding offsets as-is — not constraining height, so no fix needed"
  - "@supports fallback in CSS ensures 100vh for browsers without dvh support"

patterns-established:
  - "All full-viewport height constraints use 100dvh / dvh Tailwind utilities, never 100vh / h-screen"

requirements-completed: [QUICK-260321-w8r]

duration: 5min
completed: 2026-03-21
---

# Quick Task 260321-w8r: iOS Safari Viewport Height Fix Summary

**Replaced all `100vh`/`h-screen` layout constraints with `100dvh`/`h-dvh` across four web UI files, eliminating iOS Safari page-level scroll from browser chrome collapse**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-21T23:10:00Z
- **Completed:** 2026-03-21T23:16:39Z
- **Tasks:** 1 (+ 1 checkpoint:human-verify deferred to user)
- **Files modified:** 4

## Accomplishments
- Added `--app-dvh` CSS custom property with `@supports not (height: 100dvh)` fallback for browsers without dvh support
- Replaced `min-h-screen` → `min-h-dvh` on `<body>` in `__root.tsx`
- Replaced `h-screen` → `h-dvh` and `h-[calc(100vh-3rem)]` → `h-[calc(100dvh-3rem)]` in `jobs.$jobId.tsx`
- Replaced `calc(100vh - 4rem)` → `calc(100dvh - 4rem)` in `split-pane-detail.tsx`
- Build passes with zero errors

## Task Commits

1. **Task 1: Add dvh fallback and replace all 100vh/h-screen** — `6fe716b` (fix)

## Files Created/Modified
- `web/src/styles.css` — Added `--app-dvh` custom property + `@supports` fallback in `@layer base`
- `web/src/routes/__root.tsx` — `min-h-screen` → `min-h-dvh` on body element
- `web/src/routes/jobs.$jobId.tsx` — `h-screen` → `h-dvh`, `h-[calc(100vh-3rem)]` → `h-[calc(100dvh-3rem)]`
- `web/src/components/split-pane-detail.tsx` — inline style `calc(100vh - 4rem)` → `calc(100dvh - 4rem)`

## Decisions Made
- Used Tailwind v4 native `h-dvh`/`min-h-dvh` utilities (no JS polyfill needed)
- Left `sidebar.tsx` untouched — already uses `svh` which is correct for sidebars
- Left `command.tsx` untouched — uses `vh` for padding offsets, not height constraints
- `@supports` fallback in CSS means older browsers gracefully get `100vh`

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None — git required escaping `$` in filename `jobs.$jobId.tsx` when staging; used quotes.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- iOS Safari scroll bounce from browser chrome collapse should be eliminated
- Desktop layout unchanged (dvh === vh on desktop)
- Awaiting human verification on iOS device (Task 2 checkpoint)

---
*Phase: quick*
*Completed: 2026-03-21*
