---
phase: quick-079
plan: 01
subsystem: runner-recovery
tags: [git, recovery, provenance, sqlite, dirty-start, tests]

# Dependency graph
requires:
  - phase: 43-02
    provides: git recovery checkpoint metadata and dirty-start guard foundation in runner/db
  - phase: 44-06
    provides: explicit what/why/next guardrail messaging conventions for launch refusals
provides:
  - Per-project dirty baseline persistence in pilot.db with branch/head/porcelain/job attribution
  - Provenance-aware dirty-start classification with explicit allowed:/blocked: reason strings
  - Runner preflight integration that allows continuation-safe dirty retries while blocking unsafe states
  - Regression coverage for baseline match, manual interference, untracked drift, HEAD/branch drift, and conflict states
affects: [runner-preflight, recovery-checkpoints, sqlite-schema, launch-guard-logging, test-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Project-scoped dirty provenance baseline in SQLite paired with conservative launch-time classification"]

key-files:
  created:
    - .planning/quick/079-provenance-aware-dirty-guard-for-pilot-p/079-SUMMARY.md
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/git-recovery.ts
    - src/core/runner.ts
    - test/core/db.test.ts
    - test/core/git-recovery.test.ts
    - test/core/runner-recovery.test.ts

key-decisions:
  - "Persist dirty baselines in pilot.db keyed by project path (single latest baseline per project) rather than external JSON state."
  - "Keep allow_dirty_start persisted for compatibility but remove it as a bypass for provenance/conflict/head-drift blocking causes."

patterns-established:
  - "Only dirty state attributable to the most recent Pilot baseline is launch-allowed; unknown provenance remains blocked by default."
  - "Runner writes a fresh dirty baseline only after terminal runs that passed preflight, avoiding baseline overwrite on preflight refusals."

# Metrics
duration: 13m
completed: 2026-03-10
---

# Phase quick-079 Plan 01: Provenance-Aware Dirty Guard Summary

**Runner dirty-start gating is now provenance-aware: same-project dirty retries are allowed only when current branch/head/porcelain exactly match the latest Pilot baseline, while manual/untracked drift, HEAD movement, and conflict states are explicitly blocked.**

## Performance

- **Duration:** 13m
- **Started:** 2026-03-10T20:16:00Z
- **Completed:** 2026-03-10T20:29:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added `ProjectDirtyBaseline` typing plus SQLite storage (`project_dirty_baselines`) with synchronous upsert/get helpers in `pilot.db`.
- Implemented branch/porcelain/conflict snapshot helpers and `classifyDirtyStart()` with explicit `allowed:`/`blocked:` reason strings.
- Replaced runner blanket dirty refusal with provenance classification against the latest per-project baseline and explicit allow logging.
- Added baseline recording after completed/failed terminal runs that pass preflight, while skipping baseline writes on preflight-blocked launches.
- Expanded recovery guard tests across db/classifier/runner suites for continuation-safe and unsafe dirty-start scenarios.

## Task Commits

1. **Task 1: Add persistent per-project dirty baselines in pilot.db** - `5e4efe1` (feat)
2. **Task 2: Replace blanket dirty-start refusal with provenance classification in runner preflight** - `011c68c` (feat)
3. **Task 3: Add required scenario coverage for continuation-safe and unsafe interference paths** - `4b81ab4` (test)

## Files Created/Modified
- `src/core/types.ts` - added `ProjectDirtyBaseline` contract.
- `src/core/db.ts` - added `project_dirty_baselines` schema and read/write helpers.
- `src/core/git-recovery.ts` - added branch/porcelain/conflict helpers and dirty-start classifier.
- `src/core/runner.ts` - integrated provenance classifier in preflight and post-run baseline persistence.
- `test/core/db.test.ts` - added baseline persistence/replacement attribution tests.
- `test/core/git-recovery.test.ts` - added conflict and deterministic dirty classification tests.
- `test/core/runner-recovery.test.ts` - added end-to-end allow/block scenario coverage with explicit reason assertions.

## Decisions Made
- Dirty-start acceptance now requires exact branch/head/porcelain parity with the latest Pilot baseline for the same project.
- Conflict/in-progress repository states are hard-blocked with `blocked: merge/rebase/conflict state detected` even when other provenance signals match.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Removed baseline `job_id` foreign-key constraint that blocked attribution tests and cleanup safety**
- **Found during:** Task 1 verification
- **Issue:** `upsertProjectDirtyBaseline()` failed with `FOREIGN KEY constraint failed` when storing attribution against synthetic/nonexistent test job IDs.
- **Fix:** Changed `project_dirty_baselines.job_id` to a plain required text field (no FK) so attribution metadata persists independently of job row lifecycle.
- **Files modified:** `src/core/db.ts`
- **Commit:** `5e4efe1`

## Authentication Gates

None.

## Issues Encountered

- Initial Task 1 test run surfaced FK enforcement mismatch for baseline attribution; fixed inline and re-ran the suite successfully.

## User Setup Required

None.

## Next Phase Readiness

- Provenance-aware dirty-start behavior is implemented and covered by focused regression tests.
- No blockers identified for subsequent recovery/undo guardrail work.

---
*Phase: quick-079*
*Completed: 2026-03-10*
