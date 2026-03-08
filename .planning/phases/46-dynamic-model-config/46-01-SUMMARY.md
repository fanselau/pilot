---
phase: 46-dynamic-model-config
plan: 01
subsystem: database
tags: [sqlite, model-config, crud, seed-migration]

# Dependency graph
requires:
  - phase: 17-pilot-v2-rewrite
    provides: pilot.db SQLite infrastructure + getDb()/openPilotDb() patterns
  - phase: 45-job-observability
    provides: AGENT_MODELS flat lookup table with ModelEntry { model, variant? }
provides:
  - model_profiles table with 126 seeded entries (3 modes × 14 agents/scopes × 3 profiles)
  - provider_modes table with 3 built-in modes
  - model-store.ts CRUD module (12 functions)
  - ModelProfileRow and ProviderModeRow type interfaces
affects:
  - 46-02 (resolution rewire reads from model-store)
  - 46-03 (CLI commands use model-store CRUD)
  - 46-04 (provider management uses addProviderMode/removeProviderMode/cloneProviderMode)
  - 46-05 (tests exercise model-store functions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent seed migration — check row count before seeding"
    - "CRUD module per domain table (model-store.ts mirrors db.ts pattern)"

key-files:
  created:
    - src/core/model-store.ts
  modified:
    - src/core/types.ts
    - src/core/db.ts

key-decisions:
  - "seedModelTables checks provider_modes row count — empty means first run"
  - "getDb and seedModelTables exported from db.ts for model-store reuse"
  - "resetAllToDefaults clears everything then re-runs seedModelTables"
  - "AGENT_MODELS cast to generic Record type in model-store to avoid ProviderMode union constraint"

patterns-established:
  - "Domain CRUD modules import getDb from db.ts, follow sync better-sqlite3 patterns"
  - "Seed functions are idempotent — check for existing data before inserting"

# Metrics
duration: 8min
completed: 2026-03-08
---

# Phase 46 Plan 01: DB Schema + Seed Migration + Model Store CRUD

**model_profiles and provider_modes SQLite tables with idempotent seed from AGENT_MODELS, plus 12-function model-store.ts CRUD module**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T08:37:53Z
- **Completed:** 2026-03-08T08:42:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- model_profiles and provider_modes tables created in pilot.db with correct schema and constraints
- 126 model entries + 3 built-in provider modes seeded from AGENT_MODELS on first run
- model-store.ts provides complete CRUD: get/set entries, provider mode management, reset, clone, customization detection
- Seeding is idempotent — re-running openPilotDb() preserves existing user customizations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add types + DB schema + seed migration** - `58ac1c6` (feat)
2. **Task 2: Create model-store.ts CRUD module** - `55ee54b` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added ModelProfileRow and ProviderModeRow interfaces
- `src/core/db.ts` - Added CREATE TABLE SQL, seedModelTables(), table creation + seed calls in openPilotDb() and _getTestDb(), exported getDb and seedModelTables
- `src/core/model-store.ts` - New 230-line CRUD module with 12 exported functions

## Decisions Made
- seedModelTables checks `SELECT COUNT(*) FROM provider_modes` — empty means first run, non-empty means preserve customizations
- Exported getDb and seedModelTables from db.ts so model-store.ts can use them directly
- resetAllToDefaults clears all provider_modes rows (including built-in) then calls seedModelTables to re-seed cleanly
- AGENT_MODELS cast to generic Record type in model-store.ts to avoid ProviderMode union type constraint when indexing dynamically

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- model_profiles and provider_modes tables are ready for Phase 46-02 (rewire resolve functions to read from DB)
- model-store.ts CRUD is ready for Phase 46-03 (CLI commands) and 46-04 (provider mode management)
- All 708 existing tests pass with no regressions

---
*Phase: 46-dynamic-model-config*
*Completed: 2026-03-08*
