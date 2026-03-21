---
phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure
plan: 03
subsystem: ui
tags: [cli, tui, web-ui, review-states, status-display, amber, badges]

# Dependency graph
requires:
  - phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure
    provides: completed_pending_review and review_hold JobStatus values from Plan 01
affects:
  - all user-facing status displays (CLI, TUI, web)

provides:
  - CLI status command shows review_hold jobs in amber 'Review Hold' section
  - CLI status command shows completed_pending_review in Recent with amber icon and 'review pending' label
  - CLI log command shows review items from resumeHint for review-state jobs
  - CLI info command formatStatusColor handles review states with yellow (not red)
  - TUI theme statusColors includes completed_pending_review (amber #FBBF24) and review_hold (blue #60A5FA)
  - TUI data layer includes review_hold in running panel alongside active jobs
  - Web UI StatusBadge renders review states as warning/info variants with human-readable labels
  - Web UI job list uses statusVariant and statusLabel for review state display

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Review state display: amber/yellow for completed_pending_review, blue/info for review_hold — never red"
    - "Human-readable label transformation: 'review pending' and 'review hold' replace raw DB status strings"

key-files:
  created: []
  modified:
    - src/commands/status.ts
    - src/commands/log.ts
    - src/commands/info.ts
    - src/tui/theme.ts
    - src/tui/data/pilot-db.ts
    - web/src/components/ui/status-badge.tsx
    - web/src/components/job-list.tsx
    - test/commands/status.test.ts

key-decisions:
  - "review_hold in CLI status.ts shown in dedicated 'Review Hold' section (not stale/active) to avoid false stale detection"
  - "review_hold in TUI pilot-db.ts merged into running panel — active pause alongside running jobs"
  - "StatusBadge label transformation handles both status-badge.tsx (used elsewhere) and job-list.tsx independently"
  - "STATUS_ORDER updated to put review_hold near running (1) and completed_pending_review between paused and failed (4)"

patterns-established:
  - "Pattern: Review state colors are amber (#FBBF24) for completed_pending_review and blue (#60A5FA) for review_hold — consistent across CLI, TUI, and web"
  - "Pattern: Human-readable label functions (statusLabel) transform raw DB status strings at render time, not at data layer"

requirements-completed: [REVIEW-13, REVIEW-14, REVIEW-15, REVIEW-16]

# Metrics
duration: 8min
completed: 2026-03-21
---

# Phase 81 Plan 03: Status Display + UI Consistency Summary

**Amber/blue review state display across CLI, TUI, and web: 'review pending' and 'review hold' labels replace raw status strings everywhere with warning/info variants, never red/destructive**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-21T10:58:15Z
- **Completed:** 2026-03-21T11:07:14Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- CLI `pilot status` shows `review_hold` jobs in dedicated amber "Review Hold" section with `yellow('review hold')` label; `completed_pending_review` in Recent with `yellow('◑')` amber icon and "review pending" badge
- CLI `pilot log` shows review items from `job.resumeHint` for `completed_pending_review` jobs and review hold reason for `review_hold` jobs; `--follow` terminates on review states (session is done)
- CLI `pilot info` `formatStatusColor` returns `yellow('review pending')` and `yellow('review hold')` instead of defaulting to cyan (never red)
- TUI `statusColors` extended with `completed_pending_review: '#FBBF24'` (amber) and `review_hold: '#60A5FA'` (blue) for consistent color signaling
- TUI `fetchQueueData()` includes `review_hold` in the running panel so these jobs aren't invisible in the dashboard
- Web `StatusBadge` maps review states to `warning`/`info` variants (not `destructive`) and displays human-readable labels
- Web `job-list.tsx` `statusVariant` and new `statusLabel()` handle both review states; `STATUS_ORDER` updated for correct sort position

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CLI status/log/info display for review states** - `c7a974a` (feat)
2. **Task 2: Update TUI theme + web UI status badges for review states** - `56a4492` (feat)

## Files Created/Modified

- `src/commands/status.ts` — review_hold in Review Hold section, completed_pending_review amber icon + badge in Recent
- `src/commands/log.ts` — review items/hold reason from resumeHint; --follow termination for review states
- `src/commands/info.ts` — formatStatusColor handles review states with yellow (not red/cyan)
- `src/tui/theme.ts` — statusColors extended with completed_pending_review (amber) and review_hold (blue)
- `src/tui/data/pilot-db.ts` — review_hold included in running panel filter
- `web/src/components/ui/status-badge.tsx` — warning/info variant + human-readable label transformation
- `web/src/components/job-list.tsx` — statusVariant, statusLabel(), STATUS_ORDER updated for review states
- `test/commands/status.test.ts` — 2 new tests for review state display (no red/failure styling)

## Decisions Made

- **review_hold in CLI**: Shown in dedicated "Review Hold" section (separate from Active running and Stale sections) to avoid the `isJobStale()` logic incorrectly categorizing these intentionally-paused jobs as stale
- **review_hold in TUI**: Merged into running panel in `pilot-db.ts` — these represent active work-in-progress paused for review, not completed work
- **Label functions**: `statusLabel()` added to `job-list.tsx` since it's separate from `StatusBadge` component; both transform independently at render time
- **STATUS_ORDER**: `review_hold` at position 1 (near running) and `completed_pending_review` at position 4 (after paused, before failed)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified with one enhancement:

**Enhancement: Dedicated "Review Hold" section in status.ts**
- **Found during:** Task 1 implementation
- **Issue:** Plan suggested adding review_hold to active filter, but `isJobStale()` would incorrectly classify review_hold jobs as stale (session IS done by design)
- **Fix:** Created separate `reviewHold` variable and dedicated "Review Hold" display section in the CLI status output — avoids false stale warnings, clearer UX
- **Files modified:** src/commands/status.ts
- **Verification:** Tests pass, no stale warning for review_hold jobs

---

**Total deviations:** 1 minor enhancement (separate Review Hold section instead of merging into Active)
**Impact on plan:** Better UX — review_hold jobs shown clearly without false "stale" label

## Issues Encountered

None — pre-existing `test/tui/shortcuts.test.ts` failure ("b" key in HELP_TEXT) is unrelated to this plan's changes and was failing before these changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All user-facing surfaces (CLI, TUI, web) now display review states with distinct, non-failure styling
- The review state semantic contract is complete: types (Plan 01) → DB functions (Plan 01) → runner integration (Plan 02) → CLI/TUI/web display (Plan 03)
- Phase 81 is complete — pilot human review semantics implementation finished

## Self-Check

- ✅ src/commands/status.ts — exists with `completed_pending_review` and `review pending`
- ✅ src/commands/log.ts — exists with `completed_pending_review` and `Review items:`
- ✅ src/commands/info.ts — exists with `completed_pending_review` and `review_hold`
- ✅ src/tui/theme.ts — exists with amber `completed_pending_review` and blue `review_hold` in statusColors
- ✅ src/tui/data/pilot-db.ts — exists with `review_hold` in running filter
- ✅ web/src/components/ui/status-badge.tsx — exists with `warning`/`info` variants and label transformation
- ✅ web/src/components/job-list.tsx — exists with `statusVariant` and `statusLabel()` for review states
- ✅ Task 1 commit c7a974a — found in git log
- ✅ Task 2 commit 56a4492 — found in git log
- ✅ npx tsc --noEmit — passes
- ✅ test/commands/status.test.ts — 16 tests pass
- ✅ test/commands/log.test.ts — 7 tests pass

## Self-Check: PASSED

---
*Phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure*
*Completed: 2026-03-21*
