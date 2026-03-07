---
phase: quick-074
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/models.ts
  - test/core/models.test.ts
autonomous: true

must_haves:
  truths:
    - "AGENT_MODELS uses _top:phase, _top:quick, _top:judge keys for scope entries (not bare phase/quick/judge)"
    - "openai-only table uses xhigh variant for quality profile on planner, debugger, researchers, verifier, plan-checker, and top scopes"
    - "resolveTopLevelModel maps 'milestone' to '_top:phase' key and other scopes to '_top:{scope}'"
    - "resolveAllAgentModels excludes _top: prefixed keys (not bare scope keys)"
    - "Build passes and all tests pass"
  artifacts:
    - path: "src/core/models.ts"
      provides: "Updated AGENT_MODELS table with _top: keys and correct openai-only xhigh variants"
    - path: "test/core/models.test.ts"
      provides: "Tests updated for _top: key pattern"
  key_links:
    - from: "src/core/models.ts"
      to: "requirements/hybrid-agent-routing.md"
      via: "AGENT_MODELS table values must match spec exactly"
      pattern: "_top:(phase|quick|judge)"
---

<objective>
Align AGENT_MODELS table with the hybrid-agent-routing spec: rename scope keys to use `_top:` prefix, update openai-only variant assignments to differentiate `xhigh`/`high` per profile, and update resolveTopLevelModel to map scopes to `_top:` keys.

Purpose: The spec defines `_top:phase`, `_top:quick`, `_top:judge` as scope keys and uses `xhigh` variant for quality-tier openai-only agents. Current code uses bare scope keys and `high` everywhere in openai-only.
Output: Updated models.ts matching the spec exactly, passing tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/hybrid-agent-routing.md
@src/core/models.ts
@src/core/types.ts
@test/core/models.test.ts
@src/core/runner.ts (lines 895-918 — spawnAndWait scope/model resolution)
@src/core/delegate.ts (lines 210-232 — delegate model resolution)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update AGENT_MODELS table and resolve functions</name>
  <files>src/core/models.ts</files>
  <action>
In `src/core/models.ts`, make these changes:

1. **Rename scope keys** in all three provider mode tables:
   - `'phase'` → `'_top:phase'`
   - `'milestone'` → remove entirely (milestone maps to `_top:phase` in resolveTopLevelModel)
   - `'quick'` → `'_top:quick'`
   - `'judge'` → `'_top:judge'`

2. **Update `openai-only` table** to use `xhigh` variant for quality profile on these agents/scopes (currently all `high`):
   - `_top:phase`: quality `xhigh`, balanced `high`, budget `high`
   - `_top:quick`: quality `high`, balanced `high`, budget `high`
   - `_top:judge`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-planner`: quality `xhigh`, balanced `xhigh`, budget `high`
   - `gsd-roadmapper`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-executor`: quality `high`, balanced `high`, budget `high` (no change)
   - `gsd-debugger`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-phase-researcher`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-project-researcher`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-research-synthesizer`: quality `high`, balanced `high`, budget `high` (no change)
   - `gsd-codebase-mapper`: quality `high`, balanced `high`, budget `high` (no change)
   - `gsd-verifier`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-plan-checker`: quality `xhigh`, balanced `high`, budget `high`
   - `gsd-integration-checker`: quality `high`, balanced `high`, budget `high` (no change)

3. **Update `hybrid` table** scope keys only (agent values already match spec):
   - Same `_top:` prefix rename as above, remove `milestone`
   - `_top:judge`: quality `{ model: 'openai/gpt-5.3-codex', variant: 'xhigh' }`, balanced `{ model: 'openai/gpt-5.3-codex', variant: 'high' }`, budget `{ model: 'openai/gpt-5.3-codex', variant: 'high' }`
   - Note the hybrid _top:judge changes from `high` to `xhigh` for quality

4. **Update `SCOPE_KEYS`** set:
   - Change from `new Set(['phase', 'quick', 'milestone', 'judge'])` to detect `_top:` prefix instead
   - Replace the Set with a function check: use `key.startsWith('_top:')` in `resolveAllAgentModels`

5. **Update `resolveTopLevelModel`**:
   - Change the function to map scope to key: `const key = scope === 'milestone' ? '_top:phase' : '_top:${scope}';`
   - Look up `providerTable[key]`
   - Fallback to `providerTable['_top:quick']` (was `providerTable['quick']`)

6. **Verify** the `claude-only` table agent values haven't changed (they match spec already).
  </action>
  <verify>Run `bun run build` — must compile with no errors.</verify>
  <done>AGENT_MODELS table matches requirements/hybrid-agent-routing.md exactly. Scope keys use `_top:` prefix. openai-only has xhigh/high differentiation. resolveTopLevelModel maps scopes correctly.</done>
</task>

<task type="auto">
  <name>Task 2: Update tests for new key pattern</name>
  <files>test/core/models.test.ts</files>
  <action>
In `test/core/models.test.ts`:

1. **Update SCOPE_KEYS** constant at top of file:
   - Remove the `const SCOPE_KEYS = new Set(...)` 
   - Replace with a function: `const isScopeKey = (key: string) => key.startsWith('_top:');`
   - Update the `resolveAgentModel` test to use `if (isScopeKey(agentName)) continue;`

2. **Update `resolveAllAgentModels` scope exclusion test**:
   - Change assertions from bare keys to `_top:` keys:
     ```
     expect(models['_top:phase']).toBeUndefined();
     expect(models['_top:quick']).toBeUndefined();
     expect(models['_top:judge']).toBeUndefined();
     ```
   - Remove `expect(models['milestone']).toBeUndefined()` (milestone key no longer exists)

3. **Add test for openai-only xhigh variant differentiation**:
   - Add a test case `'uses xhigh variant for quality profile in openai-only'`
   - Assert `resolveAgentModel('gsd-planner', 'quality', 'openai-only').variant` === `'xhigh'`
   - Assert `resolveAgentModel('gsd-planner', 'balanced', 'openai-only').variant` === `'xhigh'`
   - Assert `resolveAgentModel('gsd-planner', 'budget', 'openai-only').variant` === `'high'`
   - Assert `resolveAgentModel('gsd-executor', 'quality', 'openai-only').variant` === `'high'` (executor stays high)

4. **Add test for resolveTopLevelModel with _top: keys**:
   - Import `resolveTopLevelModel` if not already imported
   - Test `resolveTopLevelModel('phase', 'quality', 'openai-only')` returns `{ model: 'openai/gpt-5.3-codex', variant: 'xhigh' }`
   - Test `resolveTopLevelModel('milestone', 'quality', 'openai-only')` returns same as phase (both map to `_top:phase`)
   - Test `resolveTopLevelModel('quick', 'balanced', 'claude-only')` returns `{ model: 'anthropic/claude-sonnet-4-6' }`
   - Test `resolveTopLevelModel('judge', 'quality', 'hybrid')` returns `{ model: 'openai/gpt-5.3-codex', variant: 'xhigh' }`
  </action>
  <verify>Run `bun test test/core/models.test.ts` — all tests must pass.</verify>
  <done>All model tests pass with new _top: key pattern, xhigh variant assertions, and resolveTopLevelModel coverage.</done>
</task>

<task type="auto">
  <name>Task 3: Full build and test verification</name>
  <files></files>
  <action>
Run the full build and test suite to verify nothing is broken:
1. `bun run build` — must pass with no TypeScript errors
2. `bun test` — all tests must pass

If any test fails in runner.test.ts or delegate.test.ts due to the scope key change, fix those tests. The runner and delegate source code should NOT need changes since they call resolveTopLevelModel with the same scope strings ('phase', 'quick', 'judge', 'milestone') and the function internally maps to `_top:` keys.

Check that no other file imports or references the removed `SCOPE_KEYS` set directly. If something does, update it to use the new `_top:` prefix pattern.
  </action>
  <verify>`bun run build && bun test` — zero errors, zero failures.</verify>
  <done>Build passes, all tests pass. No regressions from scope key rename or variant updates.</done>
</task>

</tasks>

<verification>
1. `bun run build` compiles without errors
2. `bun test` — all tests pass
3. `grep -n '_top:' src/core/models.ts` shows scope keys using `_top:` prefix
4. `grep -n 'xhigh' src/core/models.ts` shows variant differentiation in openai-only table
5. No bare `'phase':`, `'quick':`, `'milestone':`, `'judge':` keys remain in AGENT_MODELS (only in comments)
</verification>

<success_criteria>
- AGENT_MODELS table matches requirements/hybrid-agent-routing.md exactly (all three provider modes)
- Scope keys use `_top:phase`, `_top:quick`, `_top:judge` prefix pattern
- `milestone` scope no longer has its own key (mapped to `_top:phase` in resolveTopLevelModel)
- openai-only table has correct xhigh/high variant per agent/profile per spec
- hybrid `_top:judge` quality uses xhigh variant
- resolveTopLevelModel correctly maps scope strings to `_top:` keys
- resolveAllAgentModels excludes `_top:` keys from agent iteration
- Build passes, all tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/074-replace-tier-system-with-explicit-agent-/074-SUMMARY.md`
</output>
