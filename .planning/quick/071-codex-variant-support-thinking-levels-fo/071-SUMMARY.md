---
phase: quick
plan: 071
subsystem: model-resolution
tags: [openai, codex, gpt-5, variant, thinking-levels, models, runner, delegate]

dependency-graph:
  requires: [quick-045, quick-023]
  provides: [resolveVariant, --variant-flag-threading]
  affects: [runner.ts, delegate.ts, all opencode spawn paths]

tech-stack:
  added: []
  patterns: [variant-flag-conditional-spread, scope-to-variant-mapping]

key-files:
  created: []
  modified:
    - src/core/models.ts
    - src/core/runner.ts
    - src/core/delegate.ts
    - test/core/models.test.ts
    - test/core/delegate.test.ts

decisions:
  - "resolveVariant returns null for Claude models — null is the sentinel for 'don't pass --variant'"
  - "Spread ...(variant ? ['--variant', variant] : []) — clean no-op for Claude"
  - "scope judge → 'low', all others → 'high' — consistent with thinking-level semantics"
  - "openai-only all tiers → gpt-5.3-codex — unified Codex model across all quality levels"
  - "hybrid haiku → gpt-5.3-codex, opus/sonnet → Claude — GPT-5 Codex for budget tasks, Claude for orchestration"

metrics:
  duration: "2m 29s"
  completed: "2026-03-06"
---

# Quick Task 071: Codex Variant Support — Thinking Levels Summary

**One-liner:** Added `resolveVariant(model, scope)` returning high/low for Codex/GPT-5 models and null for Claude, threaded as `--variant` flag through both runner.ts and delegate.ts spawn paths, with updated PROVIDER_MODELS.

## Objective

Add `--variant` flag support for OpenAI Codex/GPT-5 models to control thinking depth. Claude models do not receive this flag. Variant is determined by scope: phase/milestone/quick → high, judge → low.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update PROVIDER_MODELS + add resolveVariant | 0ab9087 | src/core/models.ts |
| 2 | Thread --variant through runner.ts + delegate.ts | 697142d | src/core/runner.ts, src/core/delegate.ts |
| 3 | Update tests for new PROVIDER_MODELS + resolveVariant | 5ab9cae | test/core/models.test.ts, test/core/delegate.test.ts |

## What Was Built

### resolveVariant (models.ts)

```typescript
function resolveVariant(model: string, scope: 'phase' | 'quick' | 'milestone' | 'judge'): string | null {
  if (!model.includes('codex') && !model.includes('gpt-5')) return null;
  switch (scope) {
    case 'phase': return 'high';
    case 'milestone': return 'high';
    case 'quick': return 'high';
    case 'judge': return 'low';
    default: return 'high';
  }
}
```

Returns null for Claude/Anthropic models → no `--variant` flag passed. Returns 'high'/'low' for Codex/GPT-5 models.

### PROVIDER_MODELS Changes

- **openai-only**: All three tiers (opus/sonnet/haiku) → `openai/gpt-5.3-codex`
- **hybrid**: opus → `anthropic/claude-opus-4-6`, sonnet → `anthropic/claude-sonnet-4-6`, haiku → `openai/gpt-5.3-codex`

### --variant Threading

Both spawn paths use the same conditional spread pattern:
```typescript
...(variant ? ['--variant', variant] : []),
```

Log messages updated: `Top-level model: openai/gpt-5.3-codex (variant: high)`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| null sentinel for no-variant | Cleanly composable with spread operator; avoids string "none" |
| openai-only all tiers = gpt-5.3-codex | Single Codex model for consistent thinking across quality levels |
| hybrid haiku = gpt-5.3-codex | Budget tasks get Codex thinking; orchestration tiers stay Claude |
| judge → 'low' | Judge only parses transcripts — low thinking depth is sufficient and cheaper |

## Test Coverage

8 new tests in `describe('resolveVariant', ...)`:
- null for Claude models in all scopes
- 'high' for codex in phase/quick/milestone scopes
- 'low' for codex in judge scope
- null for non-codex non-gpt-5 models (gpt-4.1-mini etc.)
- 'high' for gpt-5.1-codex-mini (contains 'gpt-5')

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
npm run build && npm test
✓ Build succeeds with zero type errors
✓ 492 tests pass (all existing + 8 new resolveVariant tests)
✓ resolveVariant defined and imported in all three files
✓ --variant threaded through both spawn paths
```
