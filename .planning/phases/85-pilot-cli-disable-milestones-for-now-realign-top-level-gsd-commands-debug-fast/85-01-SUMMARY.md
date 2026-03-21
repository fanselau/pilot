---
phase: 85-pilot-cli-disable-milestones-for-now-realign-top-level-gsd-commands-debug-fast
plan: 01
subsystem: api
tags: [types, delegation, cli, job-scope, debug, fast, milestone]

# Dependency graph
requires: []
provides:
  - JobScope type extended with 'debug' and 'fast' variants
  - DelegationIntent type extended with debug and fast union members
  - resolveTopLevelModel routes debug/fast explicitly to _top:quick
  - pilot add --as milestone blocked with clear error and exit(1)
  - Directory inputs route to phase scope (not milestone)
  - Delegation prompt has explicit autonomy guidance for scope selection
affects: [delegation, runner, add-command, config-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Milestone blocking at CLI layer: scope === 'milestone' → exit(1) with helpful message"
    - "Explicit scope routing via switch in resolveTopLevelModel instead of template literal + fallback"
    - "Scope types split: JobScope (all values including disabled milestone) vs ConfigFileDefaults.scope (active scopes only)"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/models.ts
    - src/commands/add.ts
    - src/commands/config.ts
    - src/index.ts
    - src/prompts/delegate.md
    - test/core/models.test.ts
    - test/commands/add.test.ts

key-decisions:
  - "Kept 'milestone' in JobScope union (backward compat with existing DB jobs) but blocked it at CLI add layer"
  - "ConfigFileDefaults.scope removes milestone since it's not a valid default for new jobs"
  - "resolveTopLevelModel switch replaces template literal + fallback for explicit routing of debug/fast"

patterns-established:
  - "Scope blocking pattern: check scope === 'milestone' early in addCommand after scope resolution"
  - "Autonomy guidance table in delegation prompt documents scope selection rules for agents"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-21
---

# Phase 85 Plan 01: Disable Milestones + Add Debug/Fast Scopes Summary

**Extended JobScope with 'debug'/'fast' types, blocked milestone at CLI layer with exit(1), and updated delegation prompt with explicit autonomy guidance for scope selection.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-21T18:07:59Z
- **Completed:** 2026-03-21T18:18:19Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- JobScope type extended: `'quick' | 'phase' | 'milestone' | 'debug' | 'fast'`
- DelegationIntent union extended with `{ type: 'debug'; description: string; symptoms?: string }` and `{ type: 'fast'; description: string }`
- `pilot add --as milestone` now exits with clear error message listing available scopes
- Directory inputs route to `phase` scope (not milestone) — aligns with milestone disabled state
- `resolveTopLevelModel` explicitly routes `debug` and `fast` to `_top:quick` via switch statement
- Delegation prompt has `#### Debug scope`, `#### Fast scope`, `## Autonomy Guidance` sections
- `config.ts` defaults.scope enum removes 'milestone', adds 'debug' and 'fast'

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types, models, and config (TDD)** — `a01768e` (test) + `0fd4377` (feat)
2. **Task 2: Update add command** — `81026c1` (feat)
3. **Task 3: Update delegation prompt** — `1b2bbfb` (feat)

**Plan metadata:** _(pending)_

## Files Created/Modified
- `src/core/types.ts` — Extended JobScope, DelegationIntent, ConfigFileDefaults/Schema.scope
- `src/core/models.ts` — Updated resolveTopLevelModel signature + switch-based routing for debug/fast
- `src/commands/add.ts` — Milestone blocking, directory→phase detection, warning message updates
- `src/commands/config.ts` — defaults.scope enum removes milestone, adds debug/fast
- `src/index.ts` — --as option text updated
- `src/prompts/delegate.md` — Debug/fast scopes, autonomy guidance, milestone disabled caveat
- `test/core/models.test.ts` — Tests for debug/fast scope routing in resolveTopLevelModel
- `test/commands/add.test.ts` — Updated directory detection test (milestone → phase)

## Decisions Made
- Kept 'milestone' in `JobScope` union to preserve backward compatibility with existing DB jobs; only blocked at CLI `add` layer (not in type system)
- `ConfigFileDefaults.scope` removes 'milestone' because it shouldn't be settable as a default for new jobs
- Used explicit switch in `resolveTopLevelModel` instead of relying on fallback: clearer intent, more maintainable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test expecting directory → 'milestone' scope**
- **Found during:** Task 2 (update add command)
- **Issue:** `test/commands/add.test.ts:173` expected `detectScope('src')` to return `'milestone'` — this was the old behavior we explicitly changed
- **Fix:** Updated test description and expectation to `'phase'` matching new behavior
- **Files modified:** test/commands/add.test.ts
- **Verification:** `npx vitest run test/commands/` passes all 272 tests
- **Committed in:** `81026c1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/test update)
**Impact on plan:** Required update to keep test suite aligned with intentional behavior change. No scope creep.

## Issues Encountered
- TDD RED phase note: Test failures manifested as TypeScript LSP errors (test files excluded from tsconfig `include`). Runtime tests passed due to pre-existing fallback in `resolveTopLevelModel`. RED phase confirmed via LSP/type-checker, not vitest.
- 4 pre-existing test failures unconfirmed with my changes (confirmed pre-existing via git stash check): `opencode-db.test.ts`, `runner-lock.test.ts` (×2), `shortcuts.test.ts`

## Next Phase Readiness
- Type system, CLI, and delegation prompt all consistently support debug and fast scopes
- Runner and delegation execution need to wire up debug/fast to appropriate GSD commands (gsd-debug, gsd-fast workflows)
- Phase 85 plan 01 complete; ready for plan 02 (if exists) or phase transition

---
*Phase: 85-pilot-cli-disable-milestones-for-now-realign-top-level-gsd-commands-debug-fast*
*Completed: 2026-03-21*

## Self-Check: PASSED

- SUMMARY.md: ✓ found at expected path
- Commits: ✓ a01768e (test), ✓ 0fd4377 (feat task 1), ✓ 81026c1 (feat task 2), ✓ 1b2bbfb (feat task 3)
