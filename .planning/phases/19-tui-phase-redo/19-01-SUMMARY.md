---
phase: 19-tui-phase-redo
plan: 01
subsystem: infra
tags: [tsc, bun, build, tsx, import-meta-url, prebuild]

# Dependency graph
requires:
  - phase: 18
    provides: TUI source files (OpenTUI/SolidJS .tsx components)
provides:
  - TUI excluded from tsc compilation
  - Clean dist/ before each build (prebuild script)
  - Dynamic import.meta.url resolution for TUI source files at runtime
affects: [19-02, tui-runtime]

# Tech tracking
tech-stack:
  added: []
  patterns: ["import.meta.url for cross-directory source resolution"]

key-files:
  modified:
    - tsconfig.json
    - package.json
    - src/commands/tui.ts

key-decisions:
  - "import.meta.url approach for TUI source resolution — idiomatic ESM, works from both src/ and dist/"
  - "Combined Task 1 and Task 2 — import path fix was inseparable from tsc exclude (tsc follows dynamic imports)"

patterns-established:
  - "import.meta.url pattern: resolve source .tsx files from compiled .js at runtime"

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 19 Plan 01: Build Setup — Exclude TUI from tsc Summary

**Exclude TUI from tsc compilation, add prebuild dist/ clean, fix import path with import.meta.url for bun-native .tsx loading**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T13:47:05Z
- **Completed:** 2026-03-02T13:49:40Z
- **Tasks:** 2 (combined into 1 commit — Task 2's work was inseparable from Task 1)
- **Files modified:** 3

## Accomplishments
- tsc no longer compiles src/tui/ — dist/tui/ directory no longer generated
- prebuild script cleans dist/ before each build, eliminating stale .jsx files
- TUI command uses import.meta.url to resolve back to source tree at runtime
- Full import chain verified: dist/index.js → dist/commands/tui.js → src/tui/index.ts → renders dashboard

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Exclude TUI from tsc, prebuild clean, fix import paths** - `4f2ce17` (chore)

Tasks were combined because the import path fix (Task 2) was required to make the tsc exclude (Task 1) actually work — tsc follows static dynamic imports regardless of the exclude array.

## Files Created/Modified
- `tsconfig.json` - Added `"src/tui"` to exclude array
- `package.json` - Added `"prebuild": "rm -rf dist"` script
- `src/commands/tui.ts` - Changed import to use `import.meta.url` for source resolution

## Decisions Made
- **import.meta.url over relative path:** `new URL('../../src/tui/index.ts', import.meta.url)` is idiomatic ESM and resolves correctly whether running from src/ or dist/. The relative `../tui/index.js` approach failed because tsc statically analyzed the import and compiled the TUI tree despite the exclude.
- **Tasks combined:** Task 2 (fix import path) was inseparable from Task 1 (exclude TUI) — without fixing the import, tsc still followed the chain into src/tui/ regardless of the exclude array.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tasks 1 and 2 merged — tsc follows dynamic imports despite exclude**
- **Found during:** Task 1 (Exclude TUI from tsc)
- **Issue:** Adding `"src/tui"` to tsconfig exclude array alone was insufficient — tsc still compiled src/tui/ because dist/commands/tui.js imported `'../tui/index.js'`, and tsc follows dynamic import() paths
- **Fix:** Changed import in src/commands/tui.ts to use `new URL('../../src/tui/index.ts', import.meta.url)` which tsc cannot statically analyze
- **Files modified:** src/commands/tui.ts
- **Verification:** After fix, dist/tui/ no longer generated; TUI still launches correctly
- **Committed in:** 4f2ce17 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correctness — tasks were structurally inseparable. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Build setup complete — TUI excluded from tsc, imports resolve correctly
- Ready for 19-02-PLAN.md (TUI launch verification + runtime fixes)
- TUI already launches and renders dashboard (verified during this plan)

---
*Phase: 19-tui-phase-redo*
*Completed: 2026-03-02*
