---
phase: 18-pilot-v2-tui-with-opentui
plan: 03
subsystem: tui
tags: [opentui, solidjs, keyboard, tui-shell, alternate-screen]

requires:
  - phase: 18-01
    provides: Bun runtime + OpenTUI/SolidJS dependencies
  - phase: 18-02
    provides: Theme constants, reactive state store, data polling layer
provides:
  - TUI entry point (startTui) with OpenTUI/Solid renderer
  - Root App component with keyboard routing and view switching
  - StatusBar, FooterBar, HelpOverlay chrome components
  - Data pollers wired to pilot.db for queue/running/completed
  - CLI `pilot tui` command with lazy dynamic import
affects: [18-05, 18-06, 18-07]

tech-stack:
  added: []
  patterns:
    - "ts-ignore for OpenTUI/Solid hooks (Node16 can't resolve bare .d.ts chain)"
    - "Local TuiKeyEvent interface instead of @opentui/core KeyEvent import"
    - "Dynamic import in commands/tui.ts for lazy TUI loading"

key-files:
  created:
    - src/tui/index.ts
    - src/tui/app.tsx
    - src/tui/components/status-bar.tsx
    - src/tui/components/footer-bar.tsx
    - src/tui/components/help-overlay.tsx
    - src/commands/tui.ts
  modified:
    - src/index.ts

key-decisions:
  - "ts-ignore for @opentui/solid hook imports — Node16 moduleResolution can't resolve through bare .d.ts chain in src/elements/"
  - "Local TuiKeyEvent interface matches OpenTUI KeyEvent shape without unresolvable import"
  - "Stub components created in Task 1 for import resolution, filled out in Task 2"

patterns-established:
  - "TSX components use lowercase JSX intrinsics (box/text/scrollbox) per OpenTUI/Solid convention"
  - "Components import theme.ts for consistent colors"
  - "render(App, config) pattern for mounting SolidJS component tree into OpenTUI renderer"

duration: 8min
completed: 2026-03-02
---

# Phase 18 Plan 03: TUI Shell Summary

**OpenTUI/Solid TUI shell with renderer, root App, keyboard routing, status/footer bars, help overlay, and `pilot tui` CLI command**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T12:17:33Z
- **Completed:** 2026-03-02T12:25:12Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- TUI entry point creates OpenTUI renderer with alternate screen, 30fps, custom Ctrl+C handling
- Root App component with view routing (dashboard/detail/split), data pollers (1s queue, 5s completed), and global keyboard handler
- Full keyboard navigation: q/Ctrl+C quit, ? help toggle, Esc back, Tab panel cycle, s split, 1/2/3 views, j/k scroll, Enter detail
- StatusBar shows "Pilot v2" title and aggregate counts (queued/running/done)
- FooterBar shows context-sensitive key hints per view
- HelpOverlay shows all keyboard shortcuts grouped by Global/Dashboard/Detail
- `pilot tui` command with `--interval` flag, lazy dynamic import

## Task Commits

Each task was committed atomically:

1. **Task 1: TUI renderer entry point and root App component** - `dd546d2` (feat)
2. **Task 2: StatusBar, FooterBar, HelpOverlay + CLI command** - `43ca784` (feat)

## Files Created/Modified
- `src/tui/index.ts` - TUI entry point with startTui(), creates OpenTUI/Solid renderer
- `src/tui/app.tsx` - Root App component with keyboard routing, data pollers, view layout
- `src/tui/components/status-bar.tsx` - Top bar with title and aggregate stats
- `src/tui/components/footer-bar.tsx` - Bottom bar with context-sensitive key hints
- `src/tui/components/help-overlay.tsx` - Absolute-positioned bordered modal with shortcuts
- `src/commands/tui.ts` - CLI command with dynamic import for lazy loading
- `src/index.ts` - Registered `pilot tui` command

## Decisions Made
- Used `@ts-ignore` for OpenTUI/Solid hook imports because tsc with Node16 moduleResolution cannot resolve through the bare `.d.ts` chain in `@opentui/solid/src/elements/`. The hooks are exported correctly at runtime.
- Defined local `TuiKeyEvent` interface in app.tsx matching `@opentui/core`'s `KeyEvent` shape, avoiding the same resolution issue for the type import.
- Created stub components in Task 1 (needed for app.tsx import resolution to pass lint), then filled them out in Task 2.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- OpenTUI/Solid's `.d.ts` type chain (index.d.ts → src/elements/index.d.ts → src/elements/hooks.d.ts) doesn't resolve under tsc's Node16 moduleResolution because the intermediate `.d.ts` files lack corresponding `.js` files. Solved with `@ts-ignore` — types are available at runtime via Bun.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TUI shell is complete with working keyboard navigation and chrome
- View slots show placeholders ready for Plans 05 (Dashboard panels) and 06 (Detail/Split)
- Data pollers running; state store wired
- No blockers

---
*Phase: 18-pilot-v2-tui-with-opentui*
*Completed: 2026-03-02*
