---
phase: quick-023
plan: 01
subsystem: runner-model-control
tags: [models, runner, tui, opencode, cli]
dependency-graph:
  requires: [quick-014, quick-021]
  provides: [model-enforcement, tui-model-visibility, info-model-display]
  affects: [tui, runner, cli-info]
tech-stack:
  added: []
  patterns: [scope-to-tier-mapping, top-level-model-resolution]
key-files:
  created: []
  modified:
    - src/core/models.ts
    - src/core/runner.ts
    - src/tui/views/detail.tsx
    - src/tui/components/running-panel.tsx
    - src/tui/components/completed-panel.tsx
    - src/tui/components/queue-panel.tsx
    - src/commands/info.ts
    - test/tui/detail-header.test.ts
decisions:
  - "resolveTopLevelModel() maps scope→tier via AGENT_PROFILE_TIERS reuse"
  - "judge scope always maps to haiku regardless of profile"
  - "PROVIDER_MODELS exported for external consumers (TUI/info)"
  - "balanced profile shows NO badge to reduce display noise"
  - "resolvedModels always included in JSON output; human output gated on non-balanced"
metrics:
  duration: 5m 6s
  completed: 2026-03-03
---

# Quick 023: Model Control Enforcement + TUI Model Visibility Summary

**One-liner:** `resolveTopLevelModel()` maps scope→tier→model, `--model` flag passed to every `opencode run`, TUI list panels show `[quality]`/`[budget]` badges, detail view shows resolved model names for non-balanced profiles.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolveTopLevelModel() + pass --model to opencode run | 398faa1 | src/core/models.ts, src/core/runner.ts |
| 2 | TUI model visibility — detail view + list panel badges | 115397c | src/tui/views/detail.tsx, running-panel.tsx, completed-panel.tsx, queue-panel.tsx |
| 3 | pilot info resolved models section | 8a8fb8b | src/commands/info.ts, test/tui/detail-header.test.ts |

## What Was Implemented

### Task 1: resolveTopLevelModel() + --model flag

Added `resolveTopLevelModel(scope, profile, providerMode): string` to `src/core/models.ts`:

- Scope → tier mapping via `AGENT_PROFILE_TIERS`:
  - `phase` / `milestone` → planner tier (opus for quality/balanced, sonnet for budget)
  - `quick` → executor tier (opus for quality, sonnet for balanced/budget)
  - `judge` → haiku always (cheap transcript parsing, no quality premium needed)
- In `spawnAndWait()` (runner.ts): resolves top-level model from job's `scope`, `modelProfile`, `providerMode` (looked up from `activeJobs` map), then passes `--model <model-id>` in the `opencode run` execa args array
- Judge sessions detected by `command === 'pilot-judge'` → use `judge` scope for resolution
- Logs resolved model to stderr: `Top-level model: anthropic/claude-opus-4-6`
- Also exported: `PROVIDER_MODELS` (for consumers who need the tier→model table)

### Task 2: TUI Model Visibility

**detail.tsx:**
- Imports `resolveAllAgentModels` from `../../core/models.js`
- `buildHeaderLines()` (testable helper): adds a 6th line `Models: <unique-model-names>` when `modelProfile !== 'balanced'`
- JSX render: `<Show when={job.modelProfile !== 'balanced'}>` block showing deduplicated model short-names (e.g., `Models: claude-opus-4-6  claude-sonnet-4-6  claude-haiku-4-5`)

**running-panel.tsx:** Line 1 becomes `● #id  project  scope  [quality]` when non-balanced

**completed-panel.tsx:** Job identity becomes `#id  project  scope  [budget]  ` when non-balanced

**queue-panel.tsx:** Queue row line includes `[quality]`/`[budget]` badge after scope when non-balanced

All four components skip the badge entirely for `balanced` profile (default).

### Task 3: pilot info Resolved Models

**info.ts:**
- Imports `resolveAllAgentModels`
- `resolvedModels` resolved for every job before branching JSON/human
- JSON output: always includes `resolvedModels: { "gsd-planner": "anthropic/...", ... }` field
- Human output: shows `Resolved Models` section with `shortAgent.padEnd(24) → model-id` mapping, only for non-balanced profiles

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `resolveTopLevelModel()` reuses `AGENT_PROFILE_TIERS` entries | Avoids a separate mapping table; scope→agent is a logical alias |
| Judge scope → haiku always | Judge only parses/evaluates a transcript — haiku is sufficient and cheap |
| `PROVIDER_MODELS` exported | TUI/info can display tier tables without re-resolving |
| `balanced` profile shows NO badge | Reduces noise for the 90% case; badges signal non-default config |
| `resolvedModels` always in JSON output | Programmatic consumers shouldn't need profile-conditional logic |
| `detail-header.test.ts` updated for 6-line quality profile | Regression guard for the new resolved models line |

## Deviations from Plan

### Auto-fixed: detail-header test regression

- **Found during:** Task 3 final test run
- **Issue:** Existing `produces valid 5-line header at wide width (160 cols)` test used `modelProfile: 'quality'`, so the new resolved-models line caused it to return 6 lines instead of 5
- **Fix:** Updated test to expect 6 lines and added assertion that `lines[5]` contains `Models:` and `claude-opus-4-6`
- **Rule:** Rule 1 (bug — test would have been a false regression flag)

## Verification

```
✓ npx tsc --noEmit — zero type errors
✓ npm run build — clean build
✓ npm test — 273/279 pass (6 pre-existing runner judge-eval failures, unrelated to this task)
✓ resolveTopLevelModel('phase', 'quality', 'claude-only') → anthropic/claude-opus-4-6
✓ resolveTopLevelModel('quick', 'balanced', 'claude-only') → anthropic/claude-sonnet-4-6
✓ resolveTopLevelModel('judge', 'quality', 'claude-only') → anthropic/claude-haiku-4-5
✓ spawnAndWait includes '--model', topLevelModel in execa args
```
