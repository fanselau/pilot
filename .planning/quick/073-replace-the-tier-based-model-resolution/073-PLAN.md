---
phase: quick
plan: 073
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/types.ts
  - src/core/models.ts
  - src/core/delegate.ts
  - src/core/runner.ts
  - src/commands/info.ts
  - test/core/models.test.ts
  - test/core/delegate.test.ts
  - test/core/runner-lock.test.ts
autonomous: true

must_haves:
  truths:
    - "resolveAgentModel returns a ModelEntry { model, variant? } instead of a bare string"
    - "resolveAllAgentModels returns Record<string, ModelEntry> and patchAgentFrontmatter writes both model: and variant: lines"
    - "resolveTopLevelModel returns ModelEntry and callers destructure model + variant (no resolveVariant call)"
    - "resolveVariant, AGENT_PROFILE_TIERS, PROVIDER_MODELS, and ModelTier no longer exist"
    - "All tests pass with the new return types"
  artifacts:
    - path: "src/core/types.ts"
      provides: "ModelEntry type export"
      contains: "export interface ModelEntry"
    - path: "src/core/models.ts"
      provides: "AGENT_MODELS flat table, updated resolve functions, no resolveVariant"
      exports: ["resolveAgentModel", "resolveAllAgentModels", "resolveTopLevelModel", "patchAgentFrontmatter", "AGENT_MODELS"]
  key_links:
    - from: "src/core/delegate.ts"
      to: "src/core/models.ts"
      via: "resolveTopLevelModel returns ModelEntry, destructured for --model and --variant"
      pattern: "resolveTopLevelModel.*\\.model"
    - from: "src/core/runner.ts"
      to: "src/core/models.ts"
      via: "resolveTopLevelModel returns ModelEntry, no resolveVariant import"
      pattern: "resolveTopLevelModel.*\\.model"
---

<objective>
Replace the two-step tier-based model resolution (AGENT_PROFILE_TIERS → PROVIDER_MODELS → resolveVariant) with a single flat AGENT_MODELS lookup table that maps (providerMode, agent/scope, profile) directly to ModelEntry { model, variant? }. Remove resolveVariant entirely — variant data is baked into each table entry. Update all callers and tests.

Purpose: Eliminate the indirection of tiers + separate variant resolution so the model table is readable, auditable, and directly editable — each cell in the table IS the final answer.
Output: Refactored models.ts with flat lookup, updated callers in delegate.ts/runner.ts/info.ts, updated tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/types.ts
@src/core/models.ts
@src/core/delegate.ts (lines 1-20, 200-230)
@src/core/runner.ts (lines 40-55, 745-760, 890-920)
@src/commands/info.ts (lines 100-195)
@test/core/models.test.ts
@test/core/delegate.test.ts (lines 575-619)
@test/core/runner-lock.test.ts (lines 55-70)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ModelEntry type and rewrite models.ts with flat AGENT_MODELS table</name>
  <files>
    src/core/types.ts
    src/core/models.ts
  </files>
  <action>
**types.ts** — Add after the `ProviderMode` type (around line 78):
```typescript
export interface ModelEntry {
  model: string;
  variant?: string;
}
```

**models.ts** — Complete rewrite. Remove: `ModelTier`, `AGENT_PROFILE_TIERS`, `PROVIDER_MODELS`, `resolveVariant`. Create:

1. `AGENT_MODELS: Record<ProviderMode, Record<string, Record<ModelProfile, ModelEntry>>>` — a flat table mapping (providerMode, agentOrScope, profile) → ModelEntry.

Build the table by expanding the current tier logic. The table must include:
- All 11 agents: gsd-planner, gsd-roadmapper, gsd-executor, gsd-phase-researcher, gsd-project-researcher, gsd-research-synthesizer, gsd-debugger, gsd-codebase-mapper, gsd-verifier, gsd-plan-checker, gsd-integration-checker
- All 4 scopes: phase, quick, milestone, judge

**claude-only entries** — all have NO variant:
- Agent tier opus → `{ model: 'anthropic/claude-opus-4-6' }`
- Agent tier sonnet → `{ model: 'anthropic/claude-sonnet-4-6' }`
- Agent tier haiku → `{ model: 'anthropic/claude-haiku-4-5' }`

**openai-only entries** — all use `openai/gpt-5.3-codex` with variant `'high'`:
- Every agent/scope/profile → `{ model: 'openai/gpt-5.3-codex', variant: 'high' }`
- Note: variant is always 'high' for agent-level entries. The xhigh variant only applied to top-level sessions with specific commands in resolveVariant — but for the flat table we standardize agents to 'high'. Top-level scope entries for quality non-execute would have been xhigh, but since the scope entries in this table feed resolveTopLevelModel (which IS a top-level session), we need to capture that:
  - Scope 'phase' quality: variant 'high' (delegate uses gsd-delegate which is NOT execute-like, BUT the phase scope itself spawns sessions with different commands — the variant should be the DEFAULT for the scope, not command-specific. Use 'high' as default since most phase commands are execute-phase)
  - Actually, re-examining: the variant in the table for scopes replaces the old resolveVariant which took a `command` param. Since the table can't know the command at lookup time, and the current callers in runner.ts and delegate.ts each pass specific commands, we need a different approach.

**IMPORTANT DESIGN DECISION:** For scope-level entries (phase, quick, milestone, judge), the variant in the table should be the MOST COMMON case. The callers (runner.ts spawnAndWait, delegate.ts) can override if needed. However, looking at the actual usage:
- delegate.ts always calls with scope='phase', command='gsd-delegate' → NOT execute-like → quality would be xhigh, non-quality is high
- runner.ts spawnAndWait has varying commands

Since we're REMOVING resolveVariant and baking variants into the table, and the table can't vary by command, we should:
- For scope entries with codex models: use variant 'high' (the most common/safest default)
- The xhigh distinction for quality+non-execute was a minor optimization that can be dropped for simplicity

So ALL openai-only entries get variant 'high'.

**hybrid entries** — Claude models (opus/sonnet tier) get NO variant; codex models (haiku tier) get variant 'high':
- Agents with opus tier → `{ model: 'anthropic/claude-opus-4-6' }`
- Agents with sonnet tier → `{ model: 'anthropic/claude-sonnet-4-6' }`
- Agents with haiku tier → `{ model: 'openai/gpt-5.3-codex', variant: 'high' }`

Scope mappings (apply to all 3 provider modes using the existing tier logic):
- phase: same as gsd-planner tiers (quality=opus, balanced=opus, budget=sonnet)
- milestone: same as gsd-planner tiers
- quick: same as gsd-executor tiers (quality=opus, balanced=sonnet, budget=sonnet)
- judge: always haiku tier

2. Update `resolveAgentModel(agentName, profile, providerMode)` → returns `ModelEntry` (direct table lookup)

3. Update `resolveAllAgentModels(profile, providerMode)` → returns `Record<string, ModelEntry>` (iterate agents only, not scopes)

4. Update `resolveTopLevelModel(scope, profile, providerMode)` → returns `ModelEntry` (direct table lookup using scope as key)

5. Update `patchAgentFrontmatter(projectDir, models: Record<string, ModelEntry>)`:
   - Extract `entry.model` for the model: line (same as before)
   - If `entry.variant` exists, add/update a `variant: "value"` line in frontmatter (same insertion logic as model line — after model line if model exists, or after description)
   - If `entry.variant` is undefined, REMOVE any existing variant: line from frontmatter

6. Update export: remove `resolveVariant` and `PROVIDER_MODELS`, add `AGENT_MODELS`

Export list: `{ resolveAgentModel, resolveAllAgentModels, resolveTopLevelModel, patchAgentFrontmatter, AGENT_MODELS }`
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | head -30` — should show only errors from callers not yet updated (delegate.ts, runner.ts, info.ts, tests), NOT from models.ts or types.ts themselves.
  </verify>
  <done>
models.ts exports AGENT_MODELS flat table, all resolve functions return ModelEntry, resolveVariant/PROVIDER_MODELS/AGENT_PROFILE_TIERS/ModelTier are gone, types.ts exports ModelEntry.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update callers (delegate.ts, runner.ts, info.ts) and all tests</name>
  <files>
    src/core/delegate.ts
    src/core/runner.ts
    src/commands/info.ts
    test/core/models.test.ts
    test/core/delegate.test.ts
    test/core/runner-lock.test.ts
  </files>
  <action>
**delegate.ts** (lines 16, 212-218):
- Remove `resolveVariant` from import (line 16): `import { resolveTopLevelModel } from './models.js';`
- Lines 212-213: Replace:
  ```typescript
  const topLevelModel = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);
  const variant = resolveVariant(topLevelModel, 'phase', job.modelProfile, 'gsd-delegate');
  ```
  With:
  ```typescript
  const { model: topLevelModel, variant } = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);
  ```
- Line 214 log message stays the same (uses topLevelModel and variant)
- Lines 218-219 stay the same (--model topLevelModel, variant spread)

**runner.ts** (lines 47, 757-758, 902-904):
- Line 47: Remove `resolveVariant` from import: `import { patchAgentFrontmatter, resolveAllAgentModels, resolveTopLevelModel } from './models.js';`
- Lines 757-758 (`patchModelsForJob`): No change needed — `resolveAllAgentModels` still returns a record, `patchAgentFrontmatter` still takes it. The type changes but the call site is the same.
- Lines 902-904 (`spawnAndWait`): Replace:
  ```typescript
  const topLevelModel = resolveTopLevelModel(scope, profile, providerMode);
  const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : `gsd-${command}`;
  const variant = resolveVariant(topLevelModel, scope, profile, gsdCommand);
  ```
  With:
  ```typescript
  const { model: topLevelModel, variant } = resolveTopLevelModel(scope, profile, providerMode);
  const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : `gsd-${command}`;
  ```
  (Move gsdCommand after destructure; it's still needed for --command flag later but no longer used for variant resolution)

**info.ts** (lines 109, 170, 190-193):
- Line 109: `resolveAllAgentModels` now returns `Record<string, ModelEntry>`. The `resolvedModels` usage:
  - Line 117 JSON output: passes resolvedModels directly — OK, JSON will serialize ModelEntry objects
  - Line 170: `const resolvedExecutor = resolvedModels['gsd-executor'] ?? '';` — change to `resolvedModels['gsd-executor']?.model ?? ''`
  - Line 171: `!job.actualModels.some(m => m === resolvedExecutor)` — stays same (resolvedExecutor is now the model string)
  - Lines 190-193: `for (const [agentName, modelId] of Object.entries(resolvedModels))` — change to destructure ModelEntry:
    ```typescript
    for (const [agentName, entry] of Object.entries(resolvedModels)) {
      const shortAgent = agentName.replace('gsd-', '');
      const display = entry.variant ? `${entry.model} (variant: ${entry.variant})` : entry.model;
      outputHuman(`    ${dim(shortAgent.padEnd(24))} ${display}`);
    }
    ```
- Add import for ModelEntry if needed (or rely on inference).

**test/core/models.test.ts** — Full rewrite:
- Remove `resolveVariant` import
- Remove the local `AGENT_TIERS` and `PROVIDER_MODELS` reference tables
- Import `AGENT_MODELS` from models.ts to use as reference data
- `resolveAgentModel` test: change `expect(...).toBe(expectedModel)` to `expect(...).toEqual({ model: expectedModel, variant: ... })` — or better, verify against AGENT_MODELS table entries directly:
  ```typescript
  it('resolves all agent/profile/provider combinations from AGENT_MODELS', () => {
    const profiles: ModelProfile[] = ['quality', 'balanced', 'budget'];
    const providers: ProviderMode[] = ['claude-only', 'openai-only', 'hybrid'];
    for (const provider of providers) {
      for (const agentName of Object.keys(AGENT_MODELS[provider])) {
        // Skip scope entries (phase, quick, milestone, judge)
        if (['phase', 'quick', 'milestone', 'judge'].includes(agentName)) continue;
        for (const profile of profiles) {
          const expected = AGENT_MODELS[provider][agentName][profile];
          expect(resolveAgentModel(agentName, profile, provider)).toEqual(expected);
        }
      }
    }
  });
  ```
- `resolveAllAgentModels` test: update to check `.model` property:
  ```typescript
  const models = resolveAllAgentModels('balanced', 'hybrid');
  expect(Object.keys(models)).toHaveLength(11);
  expect(models['gsd-planner'].model).toBe('anthropic/claude-opus-4-6');
  expect(models['gsd-executor'].model).toBe('anthropic/claude-sonnet-4-6');
  ```
- `patchAgentFrontmatter` tests: update call signatures to pass ModelEntry objects:
  - `{ 'gsd-planner': { model: 'openai/gpt-5.2-codex', variant: 'high' } }` — and verify variant line is written
  - `{ 'gsd-executor': { model: 'anthropic/claude-opus-4-6' } }` — no variant, verify no variant line
  - Add a new test: "writes variant line in frontmatter when present" — write an agent file, call patchAgentFrontmatter with a variant, verify `variant: "high"` appears
  - Add a new test: "removes existing variant line when entry has no variant" — write agent file with existing variant line, call patchAgentFrontmatter without variant, verify variant line removed
- Remove entire `describe('resolveVariant', ...)` block (lines 128-163)

**test/core/delegate.test.ts** (lines 583-618):
- Each `resolveTopLevelModel(...)` call now returns ModelEntry. Update assertions:
  ```typescript
  const entry = resolveTopLevelModel('phase', 'balanced', 'claude-only');
  expect(entry.model).toBe('anthropic/claude-opus-4-6');
  ```
- Do this for all 5 test cases in the `attemptDelegation model enforcement` describe block

**test/core/runner-lock.test.ts** (lines 63-66):
- Update mock to return ModelEntry objects:
  ```typescript
  vi.mock('../../src/core/models.js', () => ({
    patchAgentFrontmatter: vi.fn(),
    resolveAllAgentModels: vi.fn(() => ({})),
    resolveTopLevelModel: vi.fn(() => ({ model: 'claude-sonnet-4-5' })),
  }));
  ```
  (Note: resolveVariant mock removal is implicit — it's not in the current mock)
  </action>
  <verify>
Run `npx tsc --noEmit` — zero errors. Then run `npx vitest run test/core/models.test.ts test/core/delegate.test.ts test/core/runner-lock.test.ts` — all pass.
  </verify>
  <done>
All callers destructure ModelEntry, no file imports resolveVariant, all tests pass with new return types, patchAgentFrontmatter tests cover variant writing and removal.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run test/core/models.test.ts test/core/delegate.test.ts test/core/runner-lock.test.ts` — all pass
3. `grep -r 'resolveVariant' src/ test/` — zero hits
4. `grep -r 'PROVIDER_MODELS' src/ test/` — zero hits (except possibly AGENT_MODELS references)
5. `grep -r 'ModelTier' src/ test/` — zero hits
6. `grep -r 'AGENT_PROFILE_TIERS' src/ test/` — zero hits
</verification>

<success_criteria>
- ModelEntry type exported from types.ts
- AGENT_MODELS flat table in models.ts with entries for all 11 agents + 4 scopes × 3 provider modes × 3 profiles
- resolveAgentModel, resolveAllAgentModels, resolveTopLevelModel all return ModelEntry
- patchAgentFrontmatter accepts Record<string, ModelEntry> and writes variant: lines
- resolveVariant, PROVIDER_MODELS, AGENT_PROFILE_TIERS, ModelTier completely removed
- delegate.ts and runner.ts destructure ModelEntry — no separate variant resolution
- info.ts displays variant info for resolved models
- All tests updated and passing
</success_criteria>

<output>
After completion, create `.planning/quick/073-replace-the-tier-based-model-resolution/073-SUMMARY.md`
</output>
