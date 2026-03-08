---
phase: 42-release-hardening-config-isolation-install-story-and-changelog
plan: 02
subsystem: docs
tags: [readme, getting-started, install, npm, bun-link, pilot-doctor]

# Dependency graph
requires:
  - phase: 41
    provides: completed feature set needing accurate install docs
provides:
  - Accurate clone+build install story in README.md
  - Complete getting-started guide without misleading npm references
  - package.json private:true preventing accidental npm publish
affects: [42-03-changelog]

# Tech tracking
tech-stack:
  added: []
  patterns: [clone-build-link install path as canonical]

key-files:
  created: []
  modified:
    - README.md
    - docs/GETTING-STARTED.md
    - package.json

key-decisions:
  - "Removed npm badge entirely rather than replacing with a different badge"
  - "Added private:true to package.json to prevent accidental npm publish to occupied namespace"
  - "Rewrote pilot-gsd fallback descriptions without npm framing"

patterns-established:
  - "Clone+build+link is the only documented install path until npm publish is done"

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 42 Plan 02: Fix Install Story Summary

**Remove all npm install -g pilot-cli references from README and docs; replace with clone+build+link as the only valid install path; add private:true to prevent accidental publish**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T18:08:11Z
- **Completed:** 2026-03-07T18:10:17Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments
- Removed npm badge linking to unrelated pilot-cli package on npmjs.com
- Rewrote README Quick Start with clone → bun install → bun run build → bun link → pilot doctor
- Removed "From npm (recommended)" section from GETTING-STARTED.md, made clone+build the only path
- Added `"private": true` to package.json preventing accidental npm publish
- Fixed pilot-gsd resolution descriptions to remove npm framing

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix README.md install story** - `45a1335` (docs)
2. **Task 2: Fix docs/GETTING-STARTED.md install story** - `d5d8806` (docs)
3. **Task 3: Audit package.json for release-facing install story correctness** - `6f10750` (chore)

## Files Created/Modified
- `README.md` - Removed npm badge, rewrote Quick Start with clone+build install path, fixed standalone install framing
- `docs/GETTING-STARTED.md` - Removed "From npm" section, unified Installation section with clone+build+link, fixed troubleshooting
- `package.json` - Added `"private": true` to prevent accidental npm publish

## Decisions Made
- Removed npm badge entirely (no replacement) since the pilot-cli npm package is unrelated
- Added `private: true` to package.json as the correct signal for pre-publish state
- Kept `name: "pilot-cli"` unchanged since it's needed for `bun link` to work

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 42-03-PLAN.md (changelog)
- All install story references are now consistent across README and docs

---
*Phase: 42-release-hardening-config-isolation-install-story-and-changelog*
*Completed: 2026-03-07*
