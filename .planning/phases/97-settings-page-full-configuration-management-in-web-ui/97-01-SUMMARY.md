---
phase: 97-settings-page
plan: 01
subsystem: ui
tags: [react, tanstack-start, server-fns, settings, config]

# Dependency graph
requires: []
provides:
  - 9 settings server functions (getFullConfig, updateConfig, getModelTable, updateModelMapping, getSkillsList, installSkill, removeSkill, updateSkillTags, getSystemInfo)
  - /settings route with sidebar navigation
  - SettingsLayout component (sidebar + content area)
  - SettingsSidebar with IntersectionObserver scroll-spy
  - useSettings hook for data fetching + dirty state tracking
affects: [97-02, 97-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings server functions follow createServerFn pattern (GET for reads, POST for mutations)"
    - "Config dirty tracking via Map<string, boolean> with flat key paths"
    - "IntersectionObserver scroll-spy for sidebar active section"
    - "Atomic config writes via write-to-.tmp then rename"

key-files:
  created:
    - web/src/routes/settings.tsx
    - web/src/components/settings/settings-layout.tsx
    - web/src/components/settings/settings-sidebar.tsx
    - web/src/hooks/use-settings.ts
  modified:
    - web/src/lib/server-fns.ts
    - web/src/routes/__root.tsx
    - web/src/routeTree.gen.ts

key-decisions:
  - "ENV_VAR_NAMES map defined inline in server-fns (ENV_VAR_MAP not exported from config.ts)"
  - "Flat key format for dirty tracking (e.g. 'runner.maxParallel') maps to nested ConfigFileSchema"
  - "useSettings uses staleTime:Infinity — fetch once on mount, refetch on save only"
  - "Settings sidebar uses IntersectionObserver with rootMargin -10% / -80% for clean scroll-spy"
  - "Mobile sidebar renders as horizontal scrollable pill row via MobileSettingsSidebar"

requirements-completed: [SETTINGS-API, SETTINGS-LAYOUT]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 97 Plan 01: Settings Page Foundation Summary

**9 server functions for settings data layer + /settings route scaffold with sticky sidebar navigation, responsive layout, scroll-spy, and useSettings hook with dirty state tracking**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T10:45:02Z
- **Completed:** 2026-03-25T10:49:54Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- 9 new server functions covering full settings CRUD: config read/write, model table, skills management, system info
- Settings route at /settings with two-column layout (sticky sidebar + scrollable content)
- Sidebar with 9 section links, IntersectionObserver scroll-spy, mobile pill row variant
- AppHeader updated with Settings gear icon link
- useSettings hook: fetches all 4 data sources, dirty field tracking, section-aware dirty counts, save flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 9 settings server functions** - `adcf46d` (feat)
2. **Task 2: Create settings route + layout + sidebar + AppHeader link** - `ca023a6` (feat)
3. **Task 3: Create useSettings hook** - `dec50cd` (feat)

## Files Created/Modified
- `web/src/lib/server-fns.ts` - 9 new settings server functions appended
- `web/src/routes/settings.tsx` - New /settings route using createFileRoute
- `web/src/components/settings/settings-layout.tsx` - Responsive two-column settings layout
- `web/src/components/settings/settings-sidebar.tsx` - Sticky sidebar with scroll-spy + mobile pill variant
- `web/src/hooks/use-settings.ts` - Data fetching + dirty state tracking + save flow
- `web/src/routes/__root.tsx` - AppHeader with Settings gear icon nav link
- `web/src/routeTree.gen.ts` - Regenerated to include /settings route

## Decisions Made
- `ENV_VAR_NAMES` defined inline in `server-fns.ts` since `ENV_VAR_MAP` is not exported from `config.ts`
- Flat key format for dirty tracking (e.g. `'runner.maxParallel'`) maps to nested `ConfigFileSchema` structure in save()
- `staleTime: Infinity` on all settings queries — settings rarely change so fetch once, refetch on save
- `IntersectionObserver` scroll-spy uses `rootMargin: '-10% 0px -80% 0px'` for clean active section detection while scrolling
- Mobile sidebar renders as separate `MobileSettingsSidebar` component with horizontal pill row

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation complete: server functions API layer, settings route scaffold, and data hook ready
- Plans 02 and 03 can now add actual section content components that slot into the SettingsLayout content area
- Each section component can call `useSettings()` to access data and dirty state

## Self-Check: PASSED

- FOUND: web/src/lib/server-fns.ts
- FOUND: web/src/routes/settings.tsx
- FOUND: web/src/components/settings/settings-layout.tsx
- FOUND: web/src/components/settings/settings-sidebar.tsx
- FOUND: web/src/hooks/use-settings.ts
- FOUND commit adcf46d (Task 1)
- FOUND commit ca023a6 (Task 2)
- FOUND commit dec50cd (Task 3)

---
*Phase: 97-settings-page-full-configuration-management-in-web-ui*
*Completed: 2026-03-25*
