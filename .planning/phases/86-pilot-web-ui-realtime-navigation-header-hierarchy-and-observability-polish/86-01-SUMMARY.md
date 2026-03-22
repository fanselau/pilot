---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
plan: 01
subsystem: ui
tags: [token-accounting, observability, grace-period, job-list, opencode-db, sqlite, react]

# Dependency graph
requires:
  - phase: 45-job-observability-cost-tracking-and-export
    provides: "getSessionTokenUsageByModelRecursive, buildJobObservability foundation"
  - phase: 78-web-ui-premium
    provides: "job-list.tsx with grace countdown and badge system"
provides:
  - "Fixed token extraction for all providers using nested $.tokens.cache.read path"
  - "Prominent grace period badge replacing pending status badge in job list"
affects:
  - "observability-card.tsx consumers - now show correct cache token counts"
  - "job-list.tsx - grace state unambiguously distinguishable"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "COALESCE across multiple SQLite json_extract paths for provider-agnostic token extraction"
    - "TDD RED-GREEN cycle for SQL query bug fixes with in-memory SQLite test DB"
    - "Self-contained GraceBadge component with local TooltipProvider for portable usage"

key-files:
  created: []
  modified:
    - src/core/opencode-db.ts
    - web/src/components/job-list.tsx
    - test/core/opencode-db.test.ts

key-decisions:
  - "Use COALESCE($.tokens.cache.read, $.tokens.cache_read) to handle both nested (real DB) and flat (legacy test) formats"
  - "Grace badge REPLACES pending status badge entirely (not alongside it) for unambiguous state"
  - "GraceBadge includes self-contained TooltipProvider for use in both JobCard and JobTable"

patterns-established:
  - "Multi-path COALESCE: when DB schema evolves, use COALESCE to handle both old and new paths"
  - "First-class visual states replace generic status badges — pending in grace replaces 'pending'"

requirements-completed: [TOK86-01, TOK86-02, TOK86-03, GRACE86-01, GRACE86-02]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 86 Plan 01: Token Accounting Fix + Grace Period Visual Prominence Summary

**Fixed cache token extraction for Anthropic/OpenAI ($.tokens.cache.read nested format) and made grace period a first-class amber countdown badge replacing the pending status label**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T00:07:26Z
- **Completed:** 2026-03-22T00:13:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Discovered that opencode DB stores cache tokens as `$.tokens.cache.read` (nested object), not `$.tokens.cache_read` (flat), causing near-zero token counts for Anthropic sessions
- Fixed both `getSessionTokens()` and `getSessionTokenUsageByModel()` with COALESCE across nested and flat cache paths + legacy inputTokens/outputTokens fallback
- Made grace period a first-class visual state: amber warning badge with animated pulse dot and countdown timer replaces the "pending" badge when grace is active
- Added 6 new tests covering nested cache format, legacy fallback, and mixed-provider recursive trees

## Task Commits

1. **Task 1 RED: Failing tests for nested cache format** - `d7c4369` (test)
2. **Task 1 GREEN: Fix token extraction for nested cache format** - `addb295` (feat)
3. **Task 2: Grace period first-class visual state** - `a1d9ccb` (feat)

## Files Created/Modified
- `src/core/opencode-db.ts` — Fixed SQL queries: COALESCE for `$.tokens.cache.read` / `$.tokens.cache_read` and `inputTokens`/`outputTokens` fallback in both `getSessionTokens()` and `getSessionTokenUsageByModel()`
- `web/src/components/job-list.tsx` — Added `formatGraceCountdown()`, `GraceBadge` component with warning variant + animate-pulse + tooltip; updated `JobCard` and `JobTable` to replace pending badge with `GraceBadge` when grace is active
- `test/core/opencode-db.test.ts` — Added 6 new tests: Anthropic nested cache, OpenAI nested cache, normalizeModelKey for claude-sonnet-4-6, recursive mixed-provider tree, legacy flat format fallback, legacy inputTokens fallback

## Decisions Made
- Used COALESCE approach (not format migration) to handle both the real DB nested format and existing tests' flat format simultaneously
- Grace badge replaces status badge entirely (not shown alongside) for clear single-state semantics
- GraceBadge is self-contained with its own TooltipProvider for portability across JobCard and JobTable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing test failure: getSessionState stale child detection**
- **Found during:** Baseline test run
- **Issue:** `getSessionState > returns 'done' when parent is done and child session has no activity for 5+ minutes (stale child)` was already failing before this plan
- **Fix:** Not fixed — out of scope for this plan (pre-existing, unrelated to token accounting or grace period)
- **Files modified:** None (deferred)

---

**Total deviations:** 1 pre-existing test failure (out of scope, deferred)
**Impact on plan:** No impact. All planned work completed as specified.

## Issues Encountered
- Pre-existing test failure for `getSessionState` stale child detection unrelated to this plan's changes. Left unmodified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Token observability is now accurate for both Anthropic and OpenAI providers
- Grace period state is prominently visible and unambiguous in the web UI
- Ready for 86-02 and beyond

---
*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Completed: 2026-03-22*
