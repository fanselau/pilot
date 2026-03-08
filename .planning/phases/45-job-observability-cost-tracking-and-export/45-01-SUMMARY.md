---
phase: 45-job-observability-cost-tracking-and-export
plan: 01
subsystem: database
tags: [opencode-db, observability, models, tokens, recursion, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: triage-first observability surfaces that consume opencode usage primitives
provides:
  - session-id-native recursive model discovery across parent and child opencode sessions
  - per-model recursive token aggregation for input/output/reasoning/cache buckets
  - regression coverage for recursive observability safety defaults and loop guards
affects: [45-02-shared-observability-core, 45-03-cli-observability-parity, 45-04-tui-observability-parity, 45-05-export-command]

# Tech tracking
tech-stack:
  added: []
  patterns: [session-tree traversal with visited-set guards, provider/model-normalized token buckets]

key-files:
  created: []
  modified: [src/core/opencode-db.ts, test/core/opencode-db.test.ts]

key-decisions:
  - "Model lookup now resolves by session ID and traverses child sessions recursively while preserving title-based compatibility."
  - "Per-model token rollups skip malformed provider/model rows and treat missing token fields as zero."
  - "Recursive total-token aggregation now tracks visited sessions to prevent duplicate counting in cyclic graphs."

patterns-established:
  - "Recursive observability helpers pair depth caps with visited-session dedupe for safety and determinism."
  - "Model and token attribution share one normalization contract: provider/model only when both identifiers are valid."

# Metrics
duration: 5 min
completed: 2026-03-08
---

# Phase 45 Plan 01: Recursive Opencode Usage Primitives Summary

**Session-tree model discovery and per-model token rollups now provide deterministic ground-truth usage across parent and subagent sessions for downstream observability surfaces.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T01:27:39Z
- **Completed:** 2026-03-08T01:33:27Z
- **Tasks:** 3/3
- **Files modified:** 2

## Accomplishments

- Added session-id-native model primitives in `opencode-db` (`getSessionModelsById`, `getSessionModelsRecursive`) and rewired title lookup through those internals for compatibility.
- Added grouped per-model token aggregation helpers (`getSessionTokenUsageByModel`, `getSessionTokenUsageByModelRecursive`) with recursive child-session rollup.
- Expanded regression coverage for recursive model/token edge cases: missing model identifiers, missing token fields, cyclic parent links, and deep-tree recursion guards.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add session-id based recursive model collection primitives** - `5d4ef68` (feat)
2. **Task 2: Add per-model token usage aggregation including recursive child sessions** - `f6e664a` (feat)
3. **Task 3: Lock edge-case contracts for recursive observability primitives** - `385afee` (fix)

## Files Created/Modified

- `src/core/opencode-db.ts` - added recursive session-tree model lookup and per-model token bucket aggregation primitives.
- `test/core/opencode-db.test.ts` - added deterministic regression contracts for recursive model/token observability behaviors and safety guards.

## Decisions Made

- Kept `getSessionModels(sessionTitle)` for existing callers but delegated internals to session-id recursion so callers gain child-session awareness without API churn.
- Normalized model identity to strict `provider/model` only when both fields are present and non-empty to avoid misleading synthetic buckets.
- Treated missing/partial token fields as explicit zero values in grouped aggregates rather than inferring unavailable data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented duplicate recursive total-token counting on cyclic parent graphs**
- **Found during:** Task 3 (edge-case contract locking)
- **Issue:** `getSessionTokensRecursive` used only depth capping, which still double-counted usage when parent-child links were cyclic.
- **Fix:** Added visited-session tracking to `getSessionTokensRecursive` alongside depth guarding.
- **Files modified:** `src/core/opencode-db.ts`, `test/core/opencode-db.test.ts`
- **Verification:** `npx vitest run test/core/opencode-db.test.ts` (57 passing)
- **Committed in:** `385afee`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was required for trustworthy recursive totals and aligns directly with observability correctness goals.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core recursive model/token primitives are now stable and test-backed for shared pricing/observability composition in 45-02.
- CLI/TUI/export consumers can now rely on one session-tree-aware source of truth for per-model and total token semantics.
- Ready for `45-02-PLAN.md`.

---
*Phase: 45-job-observability-cost-tracking-and-export*
*Completed: 2026-03-08*
