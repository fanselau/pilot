---
phase: 20-model-profile-support
plan: 01
subsystem: database, cli
tags: [sqlite, model-profile, provider-mode, cli-flags]

# Dependency graph
requires:
  - phase: 17-pilot-v2-rewrite
    provides: SQLite job schema + addJob function + add command
provides:
  - ModelProfile and ProviderMode types on Job interface
  - model_profile and provider_mode columns in pilot.db
  - --profile and --provider CLI flags on pilot add
  - ALTER TABLE migration for existing databases
affects: [20-02 runner config writing, status display]

# Tech tracking
tech-stack:
  added: []
  patterns: [ALTER TABLE idempotent migration pattern]

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/commands/add.ts
    - src/index.ts
    - test/core/db.test.ts
    - test/commands/add.test.ts

key-decisions:
  - "ALTER TABLE with try/catch for idempotent column addition on existing DBs"
  - "Defaults: balanced / claude-only when flags not provided"
  - "Non-default profile/provider shown as dim tag in human output"

patterns-established:
  - "Migration pattern: migrateSchema() with try/catch per ALTER TABLE"

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 20 Plan 01: DB Schema + Add Command Profile/Provider Flags Summary

**ModelProfile/ProviderMode types + SQLite columns with defaults + --profile/--provider CLI flags on pilot add**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T15:58:02Z
- **Completed:** 2026-03-02T16:02:37Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments
- Added ModelProfile ('quality'|'balanced'|'budget') and ProviderMode ('hybrid'|'claude-only'|'openai-only') types to Job interface
- Added model_profile and provider_mode columns to jobs table with defaults, plus ALTER TABLE migration for existing DBs
- Wired --profile and --provider flags to pilot add command with validation (exit 2 on invalid)
- Non-default profile/provider displayed as dim tag in human output

## Task Commits

Each task was committed atomically:

1. **Task 1: Add model_profile and provider_mode to DB schema + types** - `15f96df` (feat)
2. **Task 2: Wire --profile and --provider flags to add command** - `ce9fe04` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added ModelProfile, ProviderMode types; extended Job interface
- `src/core/db.ts` - New columns in CREATE TABLE, migrateSchema(), updated addJob signature, rowToJob mapping
- `src/commands/add.ts` - --profile/--provider validation, pass-through to addJob, dim tag in output
- `src/index.ts` - Added --profile and --provider options to add command registration
- `test/core/db.test.ts` - Tests for profile/provider storage and defaults
- `test/commands/add.test.ts` - Tests for validation, defaults, invalid input exit codes, output formatting

## Decisions Made
- ALTER TABLE with try/catch for idempotent column addition — handles existing DBs without breaking
- Defaults balanced/claude-only when flags not provided — zero-friction for existing users
- Non-default profile/provider shown as dim tag `[budget/hybrid]` in human output — visible but not noisy

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Pre-existing runner.test.ts failure (multi-step plan test) — not related to this plan's changes, confirmed by running test before changes

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Ready for 20-02-PLAN.md: Runner config writing + status profile display
- model_profile and provider_mode stored on job records, available for runner to read

---
*Phase: 20-model-profile-support*
*Completed: 2026-03-02*
