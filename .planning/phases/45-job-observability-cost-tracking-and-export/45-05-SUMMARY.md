---
phase: 45-job-observability-cost-tracking-and-export
plan: 05
subsystem: cli
tags: [export, markdown, observability, commander, vitest]

# Dependency graph
requires:
  - phase: 45-job-observability-cost-tracking-and-export
    provides: shared observability and pricing snapshot core from 45-02
provides:
  - reusable markdown artifact builder for success and failure job exports
  - first-class `pilot export <id>` command with default file output, explicit path control, and stdout mode
  - regression coverage for success, failure, and missing-observability export semantics
affects: [45-06-docs-and-regression-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [curated export artifact generation from shared observability snapshot, explicit requested/observed/estimated/unavailable wording]

key-files:
  created: [src/core/job-export.ts, src/commands/export.ts, test/commands/export.test.ts]
  modified: [src/index.ts, test/commands/export.test.ts]

key-decisions:
  - "Default export destination is `~/.pilot/exports/job-<id>.md` to avoid polluting project roots while staying predictable."
  - "Export markdown remains transcript-free by default and only uses bounded step/failure context from structured metadata."
  - "Command output controls enforce mutual exclusivity between --output and --stdout to keep behavior unambiguous."

patterns-established:
  - "Portable artifact contract: identity, requested vs observed models, token/cost observability, outcome context, commit signals, and references."
  - "Export error UX: missing jobs and file-write failures exit with actionable guidance."

# Metrics
duration: 8 min
completed: 2026-03-08
---

# Phase 45 Plan 05: Export Command Summary

**Pilot now ships a first-class `pilot export <job-id>` flow that produces portable markdown artifacts with explicit observability semantics for both success and failure outcomes.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T01:49:44Z
- **Completed:** 2026-03-08T01:57:50Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- Added `buildJobExportMarkdown(...)` in `src/core/job-export.ts` to generate curated markdown artifacts including requested vs observed model usage, token/cost snapshot semantics, outcome/failure context, commit delta signals, retry guidance, and requirement/phase references.
- Implemented `pilot export <id>` in `src/commands/export.ts` with default output to `~/.pilot/exports/job-<id>.md`, explicit `--output <path>`, and `--stdout` mode plus clear missing-job/write-failure handling.
- Wired top-level CLI registration in `src/index.ts` and expanded `test/commands/export.test.ts` to cover success artifacts, failure artifacts, output controls, and missing-observability semantics.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build reusable markdown export artifact generator** - `aa68754` (feat)
2. **Task 2: Add `pilot export <id>` command with sensible defaults and output controls** - `942946e` (feat)
3. **Task 3: Cover success/failure/missing-observability export scenarios** - `856314e` (test)

## Files Created/Modified

- `src/core/job-export.ts` - reusable markdown artifact builder that composes shared observability data with outcome and commit context.
- `src/commands/export.ts` - export command implementation with default path behavior, `--output` override, `--stdout` streaming, and actionable error handling.
- `src/index.ts` - CLI registration for `pilot export <id>` and option wiring.
- `test/commands/export.test.ts` - regression tests for builder contracts, command output controls, and missing-observability caveat semantics.

## Decisions Made

- Kept exports markdown-only and transcript-light for MVP portability and readability.
- Reused shared `buildJobObservability(...)` and `buildJobWhy`/`buildRetryWhy`/`buildUndoWhy` signals to avoid export-only observability forks.
- Treated unavailable/partial data as explicit labels and caveats rather than backfilling guessed values.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Export command and artifact contract are now stable for documentation and full-phase regression validation in 45-06.
- Shared observability semantics are now consumable across CLI, TUI, and export surfaces with consistent wording.
- Ready for `45-06-PLAN.md`.

---
*Phase: 45-job-observability-cost-tracking-and-export*
*Completed: 2026-03-08*
