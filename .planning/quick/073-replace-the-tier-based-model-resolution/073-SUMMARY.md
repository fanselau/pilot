---
phase: quick
plan: 073
subsystem: core-models
tags: [model-resolution, flat-table, refactoring, type-safety]
completed: 2026-03-06
duration: ~4m
dependency_graph:
  requires: [quick-071]
  provides: [flat-AGENT_MODELS-table, ModelEntry-type, variant-baked-in]
  affects: []
tech_stack:
  added: []
  patterns: [flat-lookup-table, ModelEntry-type-contract]
key_files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/models.ts
    - src/core/delegate.ts
    - src/core/runner.ts
    - src/commands/info.ts
    - test/core/models.test.ts
    - test/core/delegate.test.ts
    - test/core/runner-lock.test.ts
decisions:
  - All openai-only and hybrid codex entries get variant 'high' (xhigh distinction dropped for simplicity)
  - Scope entries use same tier mapping as before (phase=planner, quick=executor, judge=haiku)
  - ModelEntry type added to types.ts alongside ProviderMode
metrics:
  tasks_completed: 2
  tasks_total: 2
  tests_passed: 73
  test_files: 3
---

# Quick Task 073: Replace Tier-Based Model Resolution Summary

**One-liner:** Flat AGENT_MODELS lookup table replacing two-step tier+provider indirection, with ModelEntry { model, variant? } baked into each cell.

## What Changed

### Task 1: Flat AGENT_MODELS table and ModelEntry type

Added `ModelEntry { model: string; variant?: string }` interface to `types.ts`.

Completely rewrote `models.ts` — removed `ModelTier` type alias, `AGENT_PROFILE_TIERS` mapping, `PROVIDER_MODELS` mapping, and `resolveVariant()` function. Replaced with a single flat `AGENT_MODELS` table mapping `(providerMode, agentOrScope, profile) → ModelEntry`.

The table contains entries for:
- 11 GSD agents × 3 provider modes × 3 profiles = 99 agent entries
- 4 scopes (phase, quick, milestone, judge) × 3 provider modes × 3 profiles = 36 scope entries
- Total: 135 cells, each the final answer with no indirection

All resolve functions (`resolveAgentModel`, `resolveAllAgentModels`, `resolveTopLevelModel`) now return `ModelEntry` objects. `patchAgentFrontmatter` accepts `Record<string, ModelEntry>` and writes/updates/removes `variant:` lines in frontmatter.

### Task 2: Updated callers and tests

- **delegate.ts**: Destructures `{ model: topLevelModel, variant }` from `resolveTopLevelModel()`. Removed `resolveVariant` import.
- **runner.ts**: Same destructuring pattern in `spawnAndWait()`. Removed `resolveVariant` import. The `gsdCommand` variable is kept for the `--command` flag but no longer used for variant resolution.
- **info.ts**: Accesses `.model` property for executor mismatch check. Displays variant info in resolved models listing.
- **models.test.ts**: Full rewrite — tests validate against `AGENT_MODELS` table directly. Added tests for variant write, variant removal, and variant update in patchAgentFrontmatter.
- **delegate.test.ts**: Updated 5 model enforcement tests to check `.model` property on returned `ModelEntry`.
- **runner-lock.test.ts**: Updated mock to return `{ model: 'claude-sonnet-4-5' }` instead of bare string.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

1. `npx tsc --noEmit` — zero type errors ✓
2. `npx vitest run test/core/models.test.ts test/core/delegate.test.ts test/core/runner-lock.test.ts` — 73 tests pass ✓
3. `grep -r 'resolveVariant' src/ test/` — zero hits ✓
4. `grep -r 'PROVIDER_MODELS' src/ test/` — zero hits ✓
5. `grep -r 'ModelTier' src/ test/` — zero hits ✓
6. `grep -r 'AGENT_PROFILE_TIERS' src/ test/` — zero hits ✓
