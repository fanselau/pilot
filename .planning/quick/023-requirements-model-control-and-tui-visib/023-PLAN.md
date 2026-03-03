---
phase: quick-023
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/models.ts
  - src/core/runner.ts
  - src/tui/views/detail.tsx
  - src/tui/components/running-panel.tsx
  - src/tui/components/completed-panel.tsx
  - src/tui/components/queue-panel.tsx
  - src/commands/info.ts
autonomous: true
must_haves:
  truths:
    - "Runner passes --model flag to opencode run for every spawned session"
    - "TUI detail view shows resolved model names below the profile/provider line"
    - "TUI list panels show a model badge when profile is not balanced"
    - "pilot info shows resolved model mapping for the job"
  artifacts:
    - path: "src/core/models.ts"
      provides: "resolveTopLevelModel() function for scope→tier→model resolution"
      exports: ["resolveTopLevelModel", "resolveAllAgentModels"]
    - path: "src/core/runner.ts"
      provides: "--model flag passed to opencode run in spawnAndWait()"
    - path: "src/tui/views/detail.tsx"
      provides: "Resolved models line in detail header"
    - path: "src/commands/info.ts"
      provides: "Resolved Models section in pilot info output"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/models.ts"
      via: "resolveTopLevelModel() called in spawnAndWait to get --model value"
      pattern: "resolveTopLevelModel"
    - from: "src/tui/views/detail.tsx"
      to: "src/core/models.ts"
      via: "resolveAllAgentModels() to display resolved model names"
      pattern: "resolveAllAgentModels"
---

<objective>
Implement model control enforcement and TUI model visibility per requirements/model-control-and-tui-visibility.md.

Purpose: Ensure per-job model config controls both the top-level session agent (via `--model` flag on `opencode run`) AND sub-agents (via existing `patchAgentFrontmatter`). Make the resolved model assignments visible to operators in TUI detail view, list panels, and `pilot info`.

Output: Full model enforcement + visibility across runner, TUI, and CLI.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/model-control-and-tui-visibility.md
@src/core/models.ts
@src/core/runner.ts (spawnAndWait at line 490, patchModelsForJob at line 432)
@src/core/types.ts
@src/tui/views/detail.tsx
@src/tui/components/running-panel.tsx
@src/tui/components/completed-panel.tsx
@src/tui/components/queue-panel.tsx
@src/commands/info.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add resolveTopLevelModel() + pass --model to opencode run</name>
  <files>
    src/core/models.ts
    src/core/runner.ts
  </files>
  <action>
**In `src/core/models.ts`:**

Add a new exported function `resolveTopLevelModel()` that resolves the model ID for the top-level opencode session based on job scope:

```typescript
/**
 * Resolve the top-level session model for --model flag based on scope.
 * - phase scope: orchestrator agent = uses planner tier (opus/sonnet per profile)
 * - quick scope: executor tier (opus/sonnet per profile)
 * - judge sessions: always haiku tier
 * - milestone: same as phase (orchestrator)
 */
function resolveTopLevelModel(
  scope: 'phase' | 'quick' | 'milestone' | 'judge',
  profile: ModelProfile,
  providerMode: ProviderMode,
): string {
  // Map scope to the equivalent agent tier lookup
  const SCOPE_TIER_MAP: Record<string, Record<ModelProfile, ModelTier>> = {
    'phase': AGENT_PROFILE_TIERS['gsd-planner'],     // Orchestrator = planner tier
    'milestone': AGENT_PROFILE_TIERS['gsd-planner'],  // Same as phase
    'quick': AGENT_PROFILE_TIERS['gsd-executor'],     // Direct executor
    'judge': { quality: 'haiku', balanced: 'haiku', budget: 'haiku' },  // Always cheapest
  };

  const tiers = SCOPE_TIER_MAP[scope];
  if (!tiers) {
    // Fallback: use executor tier for unknown scopes
    const fallbackTiers = AGENT_PROFILE_TIERS['gsd-executor'];
    const tier = fallbackTiers[profile];
    return PROVIDER_MODELS[providerMode][tier];
  }

  const tier = tiers[profile];
  return PROVIDER_MODELS[providerMode][tier];
}
```

Export `resolveTopLevelModel` alongside existing exports. Also export `PROVIDER_MODELS` (needed by TUI/info for display without re-resolving).

**In `src/core/runner.ts`:**

1. Import `resolveTopLevelModel` from `./models.js`.

2. In `spawnAndWait()`, after the safety checks and before the `execa` call (around line 507-518), resolve the top-level model and add `--model` to the args array:

```typescript
// Resolve top-level model for --model flag
// Determine scope: judge sessions use 'judge', everything else uses job scope from activeJobs
const isJudge = command === 'pilot-judge';
const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
const scope = isJudge ? 'judge' as const : (jobEntry?.job.scope ?? 'quick');
const profile = jobEntry?.job.modelProfile ?? 'balanced';
const providerMode = jobEntry?.job.providerMode ?? 'claude-only';
const topLevelModel = resolveTopLevelModel(scope, profile, providerMode);
```

Then modify the execa args array to include `'--model', topLevelModel`:
```typescript
const proc = execa(opencodeBin, [
  'run',
  '--format', 'default',
  '--model', topLevelModel,      // ← NEW: enforce model at session level
  '--title', title,
  '--command', gsdCommand,
  ...(args ? [args] : []),
], { ... });
```

3. Log the resolved model: `process.stderr.write(dim(\`Top-level model: ${topLevelModel}\`) + '\n');`
  </action>
  <verify>
    `npx tsc --noEmit` compiles cleanly. Manually verify: `node -e "import('./dist/core/models.js').then(m => console.log(m.resolveTopLevelModel('phase', 'balanced', 'claude-only')))"` should output `anthropic/claude-opus-4-6`.
  </verify>
  <done>
    - `resolveTopLevelModel()` exported from models.ts, correctly maps scope→tier→model
    - `spawnAndWait()` passes `--model <resolved>` to every `opencode run` invocation
    - Judge sessions always get haiku model regardless of profile
    - Existing `patchAgentFrontmatter()` remains untouched (still patches sub-agents)
  </done>
</task>

<task type="auto">
  <name>Task 2: TUI model visibility — detail view resolved models + list panel badges</name>
  <files>
    src/tui/views/detail.tsx
    src/tui/components/running-panel.tsx
    src/tui/components/completed-panel.tsx
    src/tui/components/queue-panel.tsx
  </files>
  <action>
**In `src/tui/views/detail.tsx`:**

1. Import `resolveAllAgentModels` from `../../core/models.js`.

2. After the existing line 5 (Model line, around line 362-363):
```tsx
<text content={`Model: ${currentJob()!.modelProfile}/${currentJob()!.providerMode}`} fg={theme.muted} />
```

Add a new line showing resolved model names. Only show when profile is NOT `balanced` (to reduce noise for default config):

```tsx
{/* Line 5b: resolved models (only for non-default profiles) */}
<Show when={currentJob()!.modelProfile !== 'balanced'}>
  <text
    content={(() => {
      const models = resolveAllAgentModels(currentJob()!.modelProfile, currentJob()!.providerMode);
      // Deduplicate: show unique tiers → model mappings
      const uniqueModels = new Map<string, string>();
      for (const [, model] of Object.entries(models)) {
        const shortName = model.split('/')[1] ?? model;
        uniqueModels.set(shortName, model);
      }
      return `Models: ${[...uniqueModels.keys()].join('  ')}`;
    })()}
    fg={theme.muted}
  />
</Show>
```

3. Also update `buildHeaderLines()` (the testable helper around line 86-100) to include the resolved models line when profile is not balanced:
```typescript
if (job.modelProfile !== 'balanced') {
  const models = resolveAllAgentModels(job.modelProfile, job.providerMode);
  const uniqueModels = new Map<string, string>();
  for (const [, model] of Object.entries(models)) {
    const shortName = model.split('/')[1] ?? model;
    uniqueModels.set(shortName, model);
  }
  lines.push(`Models: ${[...uniqueModels.keys()].join('  ')}`);
}
```

**In `src/tui/components/running-panel.tsx`:**

Add a model profile badge on the first line of each job card, AFTER the scope text, when `modelProfile !== 'balanced'`:

```tsx
{/* Line 1: ● #id  project  scope  [profile] */}
<box flexDirection="row">
  <PulseDot active={true} />
  <text
    content={` #${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}`}
    fg={statusColors.running}
  />
</box>
```

**In `src/tui/components/completed-panel.tsx`:**

Add model badge after scope in the job identity text, when profile is not balanced:

Change line ~195:
```tsx
<text
  content={`#${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}  `}
  fg={contentFg()}
/>
```

**In `src/tui/components/queue-panel.tsx`:**

Add model badge after scope in the queue row, when profile is not balanced:

Change the `line` computation (~line 42-43):
```typescript
const line = () =>
  `${indicator()} #${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}  "${truncate(job.description, 30)}"`;
```
  </action>
  <verify>
    `npx tsc --noEmit` compiles cleanly. Build succeeds with `npm run build`. Visually inspect TUI with `npx tsx src/index.ts tui` — detail view should show resolved model names for non-balanced jobs, list panels should show `[quality]` or `[budget]` badges.
  </verify>
  <done>
    - TUI detail view shows resolved model names below Model: line for non-balanced profiles
    - Running panel shows `[quality]` or `[budget]` badge after scope
    - Completed panel shows model badge after scope
    - Queue panel shows model badge after scope
    - `balanced` profile (the default) shows NO badge to keep display clean
  </done>
</task>

<task type="auto">
  <name>Task 3: pilot info — resolved models section</name>
  <files>
    src/commands/info.ts
  </files>
  <action>
1. Import `resolveAllAgentModels` from `../core/models.js`.

2. In the human output section, after the Model/Attempts/Created block (around line 151, after the `outputHuman('');`), add a "Resolved Models" section:

```typescript
// Resolved models (when not default)
if (job.modelProfile !== 'balanced') {
  outputHuman(`  ${bold('Resolved Models')}`);
  outputHuman(`  ${hr()}`);
  const models = resolveAllAgentModels(job.modelProfile, job.providerMode);
  for (const [agentName, modelId] of Object.entries(models)) {
    const shortAgent = agentName.replace('gsd-', '');
    outputHuman(`    ${dim(shortAgent.padEnd(24))} ${modelId}`);
  }
  outputHuman('');
}
```

3. In the JSON output section (around line 109-122), add `resolvedModels` to the output object:

```typescript
const resolvedModels = resolveAllAgentModels(job.modelProfile, job.providerMode);

if (isJsonMode()) {
  outputJson({
    job,
    delegationPlan,
    steps,
    sessions: sessionTokens,
    resolvedModels,        // ← NEW
    tokenUsage: { ... },
  });
  return;
}
```
  </action>
  <verify>
    `npx tsc --noEmit` compiles cleanly. Run `npx tsx src/index.ts info <some-job-id>` — should show Resolved Models section for non-balanced jobs. Run with `--json` flag — output should include `resolvedModels` field.
  </verify>
  <done>
    - `pilot info <id>` shows "Resolved Models" section with agent→model mapping for non-balanced profiles
    - `pilot info <id> --json` includes `resolvedModels` in JSON output (always, for programmatic consumers)
    - Default `balanced` profile skips the section in human output (reduces noise)
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npm run build` — clean build
3. `npm test` — existing tests pass (no regressions)
4. Verify `resolveTopLevelModel` returns correct models:
   - `('phase', 'quality', 'claude-only')` → `anthropic/claude-opus-4-6`
   - `('quick', 'balanced', 'claude-only')` → `anthropic/claude-sonnet-4-6`
   - `('judge', 'quality', 'claude-only')` → `anthropic/claude-haiku-4-5`
5. Runner's `spawnAndWait` includes `--model` in the execa args
</verification>

<success_criteria>
- Every `opencode run` invocation from the runner passes `--model <resolved-model>` flag
- Judge sessions always use haiku-tier model
- TUI detail view displays resolved model names for non-default profiles
- All three TUI list panels (running, completed, queue) show `[quality]`/`[budget]` badges for non-default profiles
- `pilot info` shows resolved agent→model mapping
- No regressions in existing tests
</success_criteria>

<output>
After completion, create `.planning/quick/023-requirements-model-control-and-tui-visib/023-SUMMARY.md`
</output>
