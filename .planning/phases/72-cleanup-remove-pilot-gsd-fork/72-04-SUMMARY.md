---
phase: 72-cleanup-remove-pilot-gsd-fork
plan: 04
subsystem: docs
tags: [docs, skills, cleanup, audit, gsd]

# Dependency graph
requires:
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: operation-based AGENTS/lessons command wiring without fork command names
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: fork-agnostic setup migration semantics after submodule removal
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: migration-order audit evidence and cleanup preconditions
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: intent payload safeguards and delegation contract audit baseline
provides:
  - README and getting-started docs aligned to upstream get-shit-done-cc installer flow
  - Pilot operator skill guidance updated for intent lifecycle, model patching, and retry lineage
  - Active-surface coupling audit with zero targeted fork-string hits in src/test/README/docs/skills
affects: [phase-72-finalization, operator-docs, onboarding, regression-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [upstream-installer documentation contract, intent-lifecycle operator guidance, active-surface zero-hit audit gating]

key-files:
  created: [.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-ACTIVE-COUPLING-AUDIT.md, .planning/phases/72-cleanup-remove-pilot-gsd-fork/72-04-SUMMARY.md]
  modified: [README.md, docs/GETTING-STARTED.md, skills/openclaw-pilot/SKILL.md, test/core/gsd-config.test.ts, test/commands/setup.test.ts, test/commands/lessons.test.ts, test/commands/doctor.test.ts]

key-decisions:
  - "Use upstream installer language everywhere in operator docs; remove submodule and PILOT_GSD_DIR guidance entirely."
  - "Keep operation-contract assertions in tests and drop explicit legacy string literals to satisfy active-surface audit closure."
  - "Treat missing bun runtime as execution-environment blocker and verify skill sync via node dist/index.js fallback."

patterns-established:
  - "Operator docs map directly to setup/update command behavior and sentinel-based recovery."
  - "Skill guidance documents intent-first runner lifecycle instead of step-plan parsing mental model."
  - "Coupling audits enforce zero fork-string hits in active code/tests/docs/skills before cleanup closeout."

requirements-completed: []

# Metrics
duration: 5 min
completed: 2026-03-16
---

# Phase 72 Plan 04: Operator Docs and Skill Cleanup Summary

**Operator-facing setup docs and pilot-pipeline skill guidance now match the upstream installer + intent-runtime architecture, and active runtime/test/docs/skills surfaces pass a zero-hit fork-coupling audit.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T10:05:24Z
- **Completed:** 2026-03-16T10:10:45Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Rewrote README and getting-started installation/setup sections to remove submodule-era instructions and reflect upstream `get-shit-done-cc` behavior.
- Updated `skills/openclaw-pilot/SKILL.md` for intent-based delegation, autonomous config pre-seeding, model frontmatter patching, and retry lineage operations.
- Executed and documented the final active-surface coupling audit with zero remaining targeted fork-only strings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Update README and getting-started docs for upstream-only GSD flow** - `4765c59` (docs)
2. **Task 2: Update pilot-pipeline SKILL guidance for current architecture** - `5c8b46c` (docs)
3. **Task 3: Run final active-surface fork-coupling audit** - `f19ffca` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified
- `README.md` - Replaced fork/submodule setup text with upstream installer behavior and updated architecture/CLI references.
- `docs/GETTING-STARTED.md` - Reworked setup, env, verification, and troubleshooting sections around installer + sentinel checks.
- `skills/openclaw-pilot/SKILL.md` - Refreshed operator guidance for intent lifecycle, config pre-seeding, model routing, and retry lineage.
- `test/core/gsd-config.test.ts` - Removed remaining fork-era tmpdir naming.
- `test/commands/setup.test.ts` - Removed legacy command-string assertion while preserving operation-contract checks.
- `test/commands/lessons.test.ts` - Removed legacy command-string assertions while preserving operation-contract checks.
- `test/commands/doctor.test.ts` - Removed legacy command-string assertion while preserving operation-contract checks.
- `.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-ACTIVE-COUPLING-AUDIT.md` - Recorded audit commands, remediation, and zero-hit results.

## Decisions Made
- Keep docs tightly anchored to command/runtime behavior (`pilot setup`, `pilot setup --refresh`, `pilot update`) instead of historical migration paths.
- Keep tests focused on operation-based contracts (`operation` present, `command` absent) rather than referencing removed fork command strings.
- Record active-surface cleanup evidence in a dedicated audit artifact for deterministic phase closure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pilot` launcher unavailable due missing bun runtime during skill-sync verification**
- **Found during:** Task 2 (Update pilot-pipeline SKILL guidance for current architecture)
- **Issue:** `pilot skills sync` failed with `/usr/bin/env: 'bun': No such file or directory` in this shell.
- **Fix:** Used the built Node entrypoint fallback: `node dist/index.js skills sync`.
- **Files modified:** none from the blocker itself
- **Verification:** Fallback command returned `Synced: 3 skills found`.
- **Committed in:** `5c8b46c` (task commit context)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fallback preserved required verification without changing feature scope.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 72 documentation/skill cleanup and active coupling audit are complete.
- Ready to mark Phase 72 complete and transition from cleanup execution.

---
*Phase: 72-cleanup-remove-pilot-gsd-fork*
*Completed: 2026-03-16*
