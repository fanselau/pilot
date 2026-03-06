---
phase: quick
plan: 071
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/models.ts
  - src/core/runner.ts
  - src/core/delegate.ts
  - test/core/models.test.ts
  - test/core/delegate.test.ts
autonomous: true
---

<objective>
Add `--variant` flag support for OpenAI Codex/GPT-5 models to control thinking levels.

Purpose: OpenAI models support a `--variant` flag (high/low) that controls thinking depth. Claude models don't use this flag. The variant is determined by scope (phase/milestone/quick → high, judge → low), not configurable.

Output: resolveVariant function in models.ts, --variant flag threaded through runner.ts and delegate.ts spawn args, updated PROVIDER_MODELS, updated tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/models.ts
@src/core/runner.ts
@src/core/delegate.ts
@test/core/models.test.ts
@test/core/delegate.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update PROVIDER_MODELS and add resolveVariant in models.ts</name>
  <files>src/core/models.ts</files>
  <action>
1. Update PROVIDER_MODELS:
   - `openai-only`: change ALL three tiers (opus, sonnet, haiku) to `'openai/gpt-5.3-codex'`
   - `hybrid`: change opus to `'anthropic/claude-opus-4-6'`, sonnet to `'anthropic/claude-sonnet-4-6'`, haiku to `'openai/gpt-5.3-codex'`

2. Add and export a `resolveVariant` function:
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

3. Add `resolveVariant` to the export statement at the bottom of the file (alongside existing exports).

Do NOT change AGENT_PROFILE_TIERS. Do NOT change resolveTopLevelModel or any other existing function logic.
  </action>
  <verify>`npm run build` succeeds with no type errors.</verify>
  <done>PROVIDER_MODELS updated per spec. resolveVariant exported and returns null for Anthropic models, 'high'/'low' for OpenAI models based on scope.</done>
</task>

<task type="auto">
  <name>Task 2: Thread --variant through runner.ts and delegate.ts</name>
  <files>src/core/runner.ts, src/core/delegate.ts</files>
  <action>
**In src/core/runner.ts:**

1. Update the import from `./models.js` to also import `resolveVariant`:
   ```typescript
   import { patchAgentFrontmatter, resolveAllAgentModels, resolveTopLevelModel, resolveVariant } from './models.js';
   ```

2. In the `spawnAndWait` method, after `const topLevelModel = resolveTopLevelModel(scope, profile, providerMode);` (line ~891), add:
   ```typescript
   const variant = resolveVariant(topLevelModel, scope);
   ```

3. Update the log line (currently line ~892) to include variant:
   ```typescript
   process.stderr.write(dim(`Top-level model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}`) + '\n');
   ```

4. In the `opencodeCmdArgs` array (lines ~896-907), add the variant flag AFTER `'--model', topLevelModel,` and BEFORE `'--title', title,`:
   ```typescript
   ...(variant ? ['--variant', variant] : []),
   ```

**In src/core/delegate.ts:**

1. Update the import to also import `resolveVariant`:
   ```typescript
   import { resolveTopLevelModel, resolveVariant } from './models.js';
   ```

2. In `attemptDelegation` function, after `const topLevelModel = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);` (line ~212), add:
   ```typescript
   const variant = resolveVariant(topLevelModel, 'phase');
   ```

3. Update the log line (line ~213) to include variant:
   ```typescript
   process.stderr.write(`[delegate] Model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}\n`);
   ```

4. In the `execa(opencodeBin, [...])` args array (lines ~214-228), add `--variant` BEFORE `--title`:
   ```typescript
   ...(variant ? ['--variant', variant] : []),
   '--title', title,
   ```

Do NOT change completion detection, judge logic, or any other existing behavior. The spread `...(variant ? ['--variant', variant] : [])` ensures nothing is added for Claude models (resolveVariant returns null).
  </action>
  <verify>`npm run build` succeeds with no type errors.</verify>
  <done>--variant flag is passed to opencode for Codex/GPT-5 models only. Claude models get no --variant flag. Log messages show variant when present.</done>
</task>

<task type="auto">
  <name>Task 3: Update tests for new PROVIDER_MODELS and resolveVariant</name>
  <files>test/core/models.test.ts, test/core/delegate.test.ts</files>
  <action>
**In test/core/models.test.ts:**

1. Update the local `PROVIDER_MODELS` test fixture (lines ~22-38) to match the new values:
   - `openai-only`: all three tiers → `'openai/gpt-5.3-codex'`
   - `hybrid`: opus → `'anthropic/claude-opus-4-6'`, sonnet → `'anthropic/claude-sonnet-4-6'`, haiku → `'openai/gpt-5.3-codex'`

2. Update the import to include `resolveVariant`:
   ```typescript
   import { patchAgentFrontmatter, resolveAgentModel, resolveAllAgentModels, resolveVariant } from '../../src/core/models.js';
   ```

3. Update the `resolveAllAgentModels` assertion (line ~59-62): `'balanced'/'hybrid'` now returns:
   - `gsd-planner` (opus tier in balanced): `'anthropic/claude-opus-4-6'` (unchanged)
   - `gsd-executor` (sonnet tier in balanced): `'anthropic/claude-sonnet-4-6'` (was `openai/gpt-5.1-codex-mini`)
   - `gsd-phase-researcher` (sonnet tier in balanced): `'anthropic/claude-sonnet-4-6'` (was `openai/gpt-5.1-codex-mini`)

4. Update the `patchAgentFrontmatter` test that writes `'openai/gpt-5.2-codex'` (line ~85, 88) — change to `'openai/gpt-5.3-codex'` (or leave as-is since patchAgentFrontmatter accepts any string — only change if the test references PROVIDER_MODELS values for consistency).

5. Add a new `describe('resolveVariant', ...)` block with these tests:
   - `returns null for Claude models` — test with `'anthropic/claude-opus-4-6'` for all scopes
   - `returns 'high' for codex models in phase scope` — test with `'openai/gpt-5.3-codex'`
   - `returns 'high' for codex models in quick scope`
   - `returns 'high' for codex models in milestone scope`
   - `returns 'low' for codex models in judge scope`
   - `returns null for non-codex non-gpt-5 models` — test with `'anthropic/claude-haiku-4-5'`
   - `returns 'high' for gpt-5 models without codex in name` — test with `'openai/gpt-5.1-codex-mini'` (contains 'gpt-5')

**In test/core/delegate.test.ts:**

1. Update the `'openai-only provider mode resolves to openai models for delegation'` test (line ~614-618): The expected model for `balanced/openai-only` planner tier (opus) is now `'openai/gpt-5.3-codex'` (was `'openai/gpt-5.2-codex'`).

2. Existing tests that call `resolveTopLevelModel` and check specific model strings must be verified against the new PROVIDER_MODELS values. The `claude-only` provider tests are unchanged. The `openai-only` and `hybrid` tests need model string updates.

Ensure all existing tests still pass after updates. Run `npm test` to confirm.
  </action>
  <verify>`npm test` passes all tests (492+ existing + new resolveVariant tests). `npm run build` succeeds.</verify>
  <done>All tests updated for new PROVIDER_MODELS. resolveVariant has dedicated test coverage for all scopes and model types. Build and all tests pass.</done>
</task>

</tasks>

<verification>
```bash
npm run build && npm test
```
- Build succeeds with zero type errors
- All existing tests pass (no regressions)
- New resolveVariant tests pass
- `grep -n 'resolveVariant' src/core/models.ts src/core/runner.ts src/core/delegate.ts` shows the function defined and imported in all three files
- `grep -n '\-\-variant' src/core/runner.ts src/core/delegate.ts` shows --variant threaded through both spawn paths
</verification>

<success_criteria>
- resolveVariant returns null for Claude/Anthropic models (no --variant flag passed)
- resolveVariant returns 'high' for codex/gpt-5 models in phase/quick/milestone scopes
- resolveVariant returns 'low' for codex/gpt-5 models in judge scope
- --variant flag appears in opencode spawn args in both runner.ts and delegate.ts only when variant is non-null
- PROVIDER_MODELS updated: openai-only uses gpt-5.3-codex for all tiers; hybrid uses claude-opus-4-6/claude-sonnet-4-6/gpt-5.3-codex
- AGENT_PROFILE_TIERS unchanged
- npm run build succeeds
- npm test passes (all 492+ tests)
</success_criteria>

<output>
After completion, create `.planning/quick/071-codex-variant-support-thinking-levels-fo/071-SUMMARY.md`
</output>
