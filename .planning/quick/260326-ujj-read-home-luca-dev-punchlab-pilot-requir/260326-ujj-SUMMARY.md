---
phase: quick
plan: 260326-ujj
subsystem: ui
tags: [timeline, subsessions, opencode-db, task-anchoring, web]

# Dependency graph
requires:
  - phase: 63
    provides: "Step-first grouped timeline sections shared by web and TUI consumers"
  - phase: 90
    provides: "Inline subsession rendering that consumes ordered group.sections output"
provides:
  - "spawnedSessionId on parsed task parts and timeline tool summaries"
  - "exact task-part anchored recursive section stitching for child sessions"
  - "deterministic fallback rendering for parent_id children without parseable task_id markers"
affects: [web-ui, tui, timeline-rendering, job-detail-query]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact anchor first: task_id-derived child mapping drives placement before any parent_id fallback ordering"
    - "Recursive branch stitching: split a session into multiple sections around anchored child branches"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/opencode-db.ts
    - src/core/job-detail-query.ts
    - test/core/opencode-db.test.ts
    - test/core/job-detail-query.test.ts

key-decisions:
  - "task_id output is the primary placement source; parent_id remains a fallback visibility path only"
  - "Multiple children anchored to one task part sort by child session creation time for deterministic output"
  - "Session sections are recursively split around anchored task summaries instead of reordering in the web layer"

patterns-established:
  - "Task tool summaries carry spawnedSessionId end-to-end from DB parsing to grouped timeline items"
  - "Fallback children append only after a parent's anchored stream is exhausted, never overriding an exact anchor"

requirements-completed: [EXACT-ANCHOR-01, EXACT-ANCHOR-02, EXACT-ANCHOR-03, EXACT-ANCHOR-04]

# Metrics
duration: 10min
completed: 2026-03-26
---

# Quick Task 260326-ujj: Exact Task-Anchored Subsession Positioning Summary

**Exact `task_id` anchors now place spawned child timelines immediately after their parent `task` tool calls, with recursive nested stitching and deterministic fallback visibility for older data.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-26T22:03:00Z
- **Completed:** 2026-03-26T22:13:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Parsed `task_id: <session>` markers from task tool output and carried them through shared timeline types
- Replaced child first-activity interleaving with exact task-item anchored recursive section stitching
- Preserved visibility for child sessions that only surface through `session.parent_id` when exact anchors are missing
- Kept web and TUI consumers on the same `group.sections` contract with no UI-only reordering
- Verified focused regressions, root build, and web type-checks all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend task tool parsing/types with exact spawned child session IDs** - `9e16bcd` (test), `6220c90` (feat)
2. **Task 2: Replace heuristic interleaving with exact task-anchored recursive section stitching** - `f73412e` (test), `4e43433` (feat)

_Note: Both tasks followed TDD red/green commits._

## Files Created/Modified
- `src/core/types.ts` - Added `spawnedSessionId` to parsed parts and emitted tool-summary timeline items
- `src/core/opencode-db.ts` - Extracted exact `task_id` anchors from task tool output and preserved the existing tool summary contract
- `src/core/job-detail-query.ts` - Rebuilt section expansion around exact task anchors with recursive branch stitching and fallback child emission
- `test/core/opencode-db.test.ts` - Added parser regressions for exact, multiline, malformed, and non-task output handling
- `test/core/job-detail-query.test.ts` - Added regressions for anchored order, multiple children, nested children, and fallback-only visibility

## Decisions Made
- Used only explicit `task_id:` markers to anchor spawned children; no timestamps, titles, or parent metadata are used to invent anchors
- Sorted multiple children on the same task part by child session creation time to keep shared timeline output deterministic
- Appended unmatched `parent_id` children only after a parent's anchored stream completes so fallback data never overrides exact placement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored the existing bash output summary contract while updating parser coverage**
- **Found during:** Task 1 (parser verification)
- **Issue:** The focused parser suite already expected bash tool summaries to keep only the first two output lines, but `extractToolOutput()` was returning the full bash payload and blocked verification
- **Fix:** Trimmed bash tool summaries back to the first two lines before truncation
- **Files modified:** src/core/opencode-db.ts
- **Verification:** `npx vitest run test/core/opencode-db.test.ts --reporter=verbose`
- **Committed in:** `6220c90`

**2. [Rule 3 - Blocking] Updated the job fixture to match the current shared Job type**
- **Found during:** Task 2 (build and type-check verification)
- **Issue:** The job-detail timeline test fixture omitted `runtimeSkillSnapshot`, which now exists on `Job` and would fail TypeScript verification
- **Fix:** Added `runtimeSkillSnapshot: null` to the shared job factory used by the timeline tests
- **Files modified:** test/core/job-detail-query.test.ts
- **Verification:** `npx vitest run test/core/opencode-db.test.ts test/core/job-detail-query.test.ts --reporter=verbose && npm run build && npx tsc --noEmit -p web/tsconfig.json`
- **Committed in:** `4e43433`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary to complete the requested regression coverage and verification without changing the intended feature scope.

## Issues Encountered
- None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared timeline data now gives both web and TUI renderers an unambiguous child-section order
- Future timeline work can rely on `spawnedSessionId` for tracing/debugging exact sub-session ownership

## Self-Check: PASSED

- Summary file exists at `.planning/quick/260326-ujj-read-home-luca-dev-punchlab-pilot-requir/260326-ujj-SUMMARY.md`
- Task commits verified: `9e16bcd`, `6220c90`, `f73412e`, `4e43433`
