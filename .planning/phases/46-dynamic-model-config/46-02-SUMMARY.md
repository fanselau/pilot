---
phase: 46-dynamic-model-config
plan: 02
subsystem: database
tags: [sqlite, model-config, dynamic-resolution, graceful-degradation]

# Dependency graph
requires:
  - phase: 46-dynamic-model-config
    provides: model-store.ts CRUD (getModelEntry, getAllEntriesForModeAndProfile)
  - phase: 45-job-observability
    provides: AGENT_MODELS flat lookup table with ModelEntry { model, variant? }
provides:
  - DB-backed resolveAgentModel with hardcoded fallback
  - DB-backed resolveAllAgentModels with hardcoded fallback
  - DB-backed resolveTopLevelModel with hardcoded fallback
  - DynamicProviderMode type alias for custom provider modes
  - String-typed Job.providerMode for custom mode storage
affects:
  - 46-03 (CLI commands can now edit DB and changes take effect on next resolve)
  - 46-04 (custom provider modes work end-to-end: DB entry → resolve → frontmatter)
  - 46-05 (tests for resolve functions with DB and fallback paths)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Try DB first, catch, fall back to hardcoded constant"
    - "DynamicProviderMode (string) for function parameters, ProviderMode (union) for AGENT_MODELS type"

key-files:
  created: []
  modified:
    - src/core/models.ts
    - src/core/types.ts
    - src/core/config.ts
    - src/core/db.ts
    - src/core/providers.ts
    - src/commands/add.ts
    - src/commands/config.ts
    - test/commands/add.test.ts
    - test/core/config.test.ts

key-decisions:
  - "DynamicProviderMode = string alias, not replacing ProviderMode union — preserves type safety for AGENT_MODELS"
  - "Job.providerMode widened to string — custom modes stored in pilot.db need to round-trip"
  - "Config validation accepts any non-empty string for providerMode — actual validation at resolution time"
  - "add.ts validateProvider checks DB for custom modes with graceful fallback to built-in list"
  - "config set defaults.providerMode changed from enum to string type"
  - "ESM circular dependency (models→model-store→models) works via live bindings — functions access AGENT_MODELS at call time, not import time"

patterns-established:
  - "Resolve functions: try DB → catch → fall through to hardcoded constant"
  - "DynamicProviderMode for function parameters that accept custom modes"

# Metrics
duration: 8min
completed: 2026-03-08
---

# Phase 46 Plan 02: Rewire Model Resolution to Read from DB

**DB-backed resolveAgentModel/resolveAllAgentModels/resolveTopLevelModel with graceful fallback to AGENT_MODELS constant, plus DynamicProviderMode type for custom provider modes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T08:44:02Z
- **Completed:** 2026-03-08T08:52:11Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- All three resolve functions now read from pilot.db first, falling back to AGENT_MODELS when DB is unavailable
- DynamicProviderMode type added — resolve functions accept any string provider mode (custom modes from provider_modes table)
- Job.providerMode widened to string so custom modes persist in job records
- Config validation accepts custom provider mode strings (validated at resolution time, not config parse time)
- `pilot add --provider` validates against both built-in modes and DB custom modes
- AGENT_MODELS constant preserved as seed data and fallback — not deleted
- patchAgentFrontmatter unchanged (consumes ModelEntry regardless of source)

## Task Commits

Each task was committed atomically:

1. **Task 1: Make ProviderMode a validated string type** - `39fc1d4` (feat)
2. **Task 2: Rewire resolve functions to read from DB** - `9dbea0c` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added DynamicProviderMode type, widened Job.providerMode and ConfigFileDefaults.providerMode to string
- `src/core/models.ts` - Added model-store imports, rewired 3 resolve functions with DB-first pattern
- `src/core/config.ts` - Changed providerMode validation from enum assertion to non-empty string check
- `src/core/db.ts` - Changed addJob providerMode param from ProviderMode to string
- `src/core/providers.ts` - Changed checkProviderAvailability param from ProviderMode to string
- `src/commands/add.ts` - Import getProviderMode, validate against DB custom modes
- `src/commands/config.ts` - Changed defaults.providerMode from enum to string type in config set
- `test/commands/add.test.ts` - Updated "Invalid provider" → "Unknown provider" assertion
- `test/core/config.test.ts` - Replaced invalid providerMode throw test with custom mode acceptance + empty string rejection tests

## Decisions Made
- DynamicProviderMode is a `string` alias, keeping ProviderMode union intact for AGENT_MODELS typing — avoids breaking the constant's type while allowing custom modes everywhere else
- Job.providerMode widened to `string` because custom modes stored in pilot.db need to round-trip through Job objects
- Config file providerMode validation changed to "any non-empty string" — actual validation happens at resolution time when the provider mode is used, not at config parse time (DB may not be available during early startup)
- add.ts validateProvider uses direct import of getProviderMode from model-store.ts with try/catch for DB unavailability
- ESM circular dependency (models.ts → model-store.ts → models.ts) is safe because AGENT_MODELS is accessed inside functions at call time, not at import evaluation time — ESM live bindings ensure the value is initialized

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated error message in add.ts validateProvider**
- **Found during:** Task 1 (updating validateProvider)
- **Issue:** Error message said "Invalid provider" but should say "Unknown provider" to match new behavior (checking built-in + DB)
- **Fix:** Changed error message and updated test assertion
- **Files modified:** src/commands/add.ts, test/commands/add.test.ts
- **Committed in:** 39fc1d4 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Widened Job.providerMode and related types to string**
- **Found during:** Task 1 (build errors from type mismatch)
- **Issue:** Job.providerMode was ProviderMode union, but custom modes would fail to store/round-trip
- **Fix:** Widened Job.providerMode, JobObservabilityRequested.providerMode, addJob param, checkProviderAvailability param to string
- **Files modified:** src/core/types.ts, src/core/db.ts, src/core/providers.ts
- **Committed in:** 39fc1d4 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Updated config set command for custom provider modes**
- **Found during:** Task 1 (config set wouldn't accept custom modes)
- **Issue:** `pilot config set defaults.providerMode` used hardcoded enum validation
- **Fix:** Changed from enum type to string type in CONFIG_FIELD_SPECS
- **Files modified:** src/commands/config.ts
- **Committed in:** 39fc1d4 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical)
**Impact on plan:** All auto-fixes necessary for type safety and correctness. No scope creep — these are direct consequences of the ProviderMode→string widening.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 resolve functions read from DB — `pilot models edit` changes (46-03) will take effect immediately on next job spawn
- Custom provider modes work end-to-end: add-provider writes to DB → resolve reads from DB → frontmatter patched
- Ready for 46-03 (CLI commands) and 46-04 (provider mode management)
- All 709 tests pass with no regressions

---
*Phase: 46-dynamic-model-config*
*Completed: 2026-03-08*
