---
phase: 72-cleanup-remove-pilot-gsd-fork
plan: 01
subsystem: infra
tags: [opencode, prompts, agents-md, cleanup, vitest]

# Dependency graph
requires:
  - phase: 64-gsd-installation-switch-replace-pilot-gsd-with-vanilla-gsd
    provides: Upstream get-shit-done-cc installation baseline
  - phase: 47-agents-md-integration-cli-commands-and-doctor-check
    provides: Shared AGENTS session helper and command integration points
provides:
  - Pilot-owned prompt files for AGENTS setup, AGENTS health checks, and lessons extraction
  - Inline prompt execution contract in src/core/agents-md.ts using operation-to-prompt mapping
  - Regression tests that lock prompt mapping, inline invocation shape, and non-throw safety behavior
affects: [72-02 command rewiring, 72-04 docs cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [operation-based prompt loading, inline opencode run prompt payloads]

key-files:
  created: [src/prompts/agents-setup.md, src/prompts/agents-health.md, src/prompts/lessons.md]
  modified: [src/core/agents-md.ts, test/core/agents-md.test.ts]

key-decisions:
  - "Use typed operations (setup/health/lessons) mapped to in-repo prompt files instead of fork-only command invocations."
  - "Keep legacy command-string inference in core helper for transition safety until command callers are rewired in 72-02."

patterns-established:
  - "Prompt assets live under src/prompts and are loaded by core helpers before session spawn."
  - "AGENTS session invocations pass full inline prompt text to opencode run and avoid --command indirection."

# Metrics
duration: 9 min
completed: 2026-03-16
---

# Phase 72 Plan 01: Core AGENTS Prompt Foundation Summary

**Pilot now runs AGENTS setup/health/lessons flows through in-repo prompt assets with an operation-based inline prompt contract in the core session helper.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-16T09:32:20Z
- **Completed:** 2026-03-16T09:41:34Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added `src/prompts/agents-setup.md`, `src/prompts/agents-health.md`, and `src/prompts/lessons.md` with deterministic output formats and explicit edit-policy controls.
- Refactored `spawnAgentsMdSession` in `src/core/agents-md.ts` to resolve prompt files by typed operation and execute via inline `opencode run` prompt payloads.
- Updated `test/core/agents-md.test.ts` to assert operation-to-prompt mapping, inline prompt invocation shape, and regression safety paths (timeout, process death, no-assistant-message, never-throw).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Pilot-owned AGENTS and lessons prompt assets** - `8d79dfd` (feat)
2. **Task 2: Refactor core AGENTS session runner to inline-prompt contract** - `ecfe721` (feat)
3. **Task 3: Update core regression tests for new prompt-based contract** - `2136ca3` (test)

**Plan metadata:** `skipped` (`.planning/` is gitignored in this repository)

## Files Created/Modified
- `src/prompts/agents-setup.md` - Prompt contract for AGENTS.md generation with deterministic output sections.
- `src/prompts/agents-health.md` - Prompt contract for AGENTS.md drift/health analysis.
- `src/prompts/lessons.md` - Prompt contract for lessons extraction from planning artifacts.
- `src/core/agents-md.ts` - Operation-driven prompt loader and inline session execution helper.
- `test/core/agents-md.test.ts` - Regression tests covering prompt mapping and inline spawn behavior.

## Decisions Made
- Moved AGENTS helper orchestration to an explicit `operation -> prompt file` mapping as the canonical runtime contract.
- Embedded invocation context (`Operation`, `Allow file edits`, `Project root`) into prompt payloads to keep prompt assets reusable and deterministic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Existing staged changes in `.planning/STATE.md` were present before execution and were included in Task 1 commit alongside prompt assets.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for `72-02-PLAN.md` to rewire setup/doctor/lessons command call sites to pass typed operations directly.
- No blockers identified for continuing Phase 72.

---
*Phase: 72-cleanup-remove-pilot-gsd-fork*
*Completed: 2026-03-16*
