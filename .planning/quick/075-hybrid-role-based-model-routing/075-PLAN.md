---
phase: quick-075
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
    - "Hybrid build-role agents (planner, roadmapper, executor, debugger, researchers) resolve to exact same models as claude-only"
    - "Hybrid check-role agents (codebase-mapper, verifier, plan-checker, integration-checker) resolve to exact same models as openai-only"
    - "Hybrid _top:judge resolves to codex (mirrors openai-only judge scope)"
    - "No haiku anywhere in the hybrid table"
    - "claude-only and openai-only tables remain completely unchanged"
  artifacts:
    - path: "src/core/models.ts"
      provides: "Updated hybrid section of AGENT_MODELS with role-based routing"
      contains: "role-based separation"
    - path: "test/core/models.test.ts"
      provides: "Tests verifying hybrid mirrors claude-only for builders and openai-only for checkers"
  key_links:
    - from: "test/core/models.test.ts"
      to: "src/core/models.ts"
      via: "AGENT_MODELS import + resolveAllAgentModels assertions"
      pattern: "resolveAllAgentModels.*hybrid"
---

<objective>
Update the hybrid provider mode in AGENT_MODELS to use role-based model routing: build agents mirror claude-only exactly, check agents mirror openai-only exactly.

Purpose: Hybrid mode should give two different AI brains different perspectives — Claude builds, Codex checks. The current hybrid table incorrectly swaps haiku slots with codex/high instead of cleanly separating by role.
Output: Updated AGENT_MODELS hybrid table + comprehensive tests proving role mirroring.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/models.ts
@test/core/models.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update hybrid AGENT_MODELS table with role-based routing</name>
  <files>src/core/models.ts</files>
  <action>
Replace the entire `hybrid` section in `AGENT_MODELS` (lines 54-71) with role-based routing.

Add a comment block above the hybrid section:
```
// ── Hybrid: role-based separation ──
// Build agents (planner, roadmapper, executor, debugger, researchers) → Claude (mirrors claude-only)
// Check agents (verifier, plan-checker, integration-checker, codebase-mapper, judge) → Codex (mirrors openai-only)
// Two different models = two different perspectives on the same code.
```

**Build role (mirrors claude-only exactly, except research-synthesizer budget gets sonnet instead of haiku):**

| Agent | Quality | Balanced | Budget |
|---|---|---|---|
| gsd-planner | opus | opus | sonnet |
| gsd-roadmapper | opus | sonnet | sonnet |
| gsd-executor | opus | sonnet | sonnet |
| gsd-debugger | opus | sonnet | sonnet |
| gsd-phase-researcher | opus | sonnet | sonnet |
| gsd-project-researcher | opus | sonnet | sonnet |
| gsd-research-synthesizer | sonnet | sonnet | sonnet |

Note: research-synthesizer budget = sonnet (not haiku). In claude-only it's haiku, but hybrid keeps it on Claude side where haiku doesn't exist. Phase/project researchers also lose their claude-only haiku budget — they get sonnet.

**Check role (mirrors openai-only exactly):**

| Agent | Quality | Balanced | Budget |
|---|---|---|---|
| gsd-codebase-mapper | codex/high | codex/high | codex/high |
| gsd-verifier | codex/xhigh | codex/high | codex/high |
| gsd-plan-checker | codex/xhigh | codex/high | codex/high |
| gsd-integration-checker | codex/high | codex/high | codex/high |

All codex entries use `{ model: 'openai/gpt-5.3-codex', variant: 'high' }` or `variant: 'xhigh'`.

**Scopes:**

| Scope | Quality | Balanced | Budget |
|---|---|---|---|
| _top:phase | opus | opus | sonnet |
| _top:quick | opus | sonnet | sonnet |
| _top:judge | codex/xhigh | codex/high | codex/high |

These scope values are already correct in the current hybrid table — they should NOT change.

DO NOT touch the claude-only or openai-only sections. Only modify the hybrid section.
  </action>
  <verify>Run `npx tsc --noEmit` to verify no type errors.</verify>
  <done>Hybrid table has clean role-based separation: build agents = Claude models, check agents = Codex models. No haiku anywhere in hybrid.</done>
</task>

<task type="auto">
  <name>Task 2: Update and add tests for hybrid role-based routing</name>
  <files>test/core/models.test.ts</files>
  <action>
1. **Update the existing `resolveAllAgentModels` test** (line 33-38) — the current test checks `resolveAllAgentModels('balanced', 'hybrid')`. Update assertions:
   - `models['gsd-planner'].model` → `'anthropic/claude-opus-4-6'` (unchanged)
   - `models['gsd-executor'].model` → `'anthropic/claude-sonnet-4-6'` (unchanged)
   - `models['gsd-phase-researcher'].model` → `'anthropic/claude-sonnet-4-6'` (unchanged)
   - Add: `models['gsd-codebase-mapper'].model` → `'openai/gpt-5.3-codex'`
   - Add: `models['gsd-codebase-mapper'].variant` → `'high'`
   - Add: `models['gsd-verifier'].variant` → `'high'`

2. **Add a new describe block** `'hybrid role-based routing'` with these tests:

   **Test: "build-role agents in hybrid match their claude-only equivalents"**
   - Define build agents: `['gsd-planner', 'gsd-roadmapper', 'gsd-executor', 'gsd-debugger', 'gsd-phase-researcher', 'gsd-project-researcher']`
   - For each agent and each profile ('quality', 'balanced', 'budget'):
     - `resolveAgentModel(agent, profile, 'hybrid')` must deep-equal `resolveAgentModel(agent, profile, 'claude-only')`
   - Exception: research-synthesizer and both researchers budget profile differ (sonnet vs haiku) — test those separately

   **Test: "research-synthesizer budget in hybrid uses sonnet (not haiku)"**
   - `resolveAgentModel('gsd-research-synthesizer', 'budget', 'hybrid').model` → `'anthropic/claude-sonnet-4-6'`
   - Verify it does NOT match claude-only budget: `resolveAgentModel('gsd-research-synthesizer', 'budget', 'claude-only').model` → `'anthropic/claude-haiku-4-5'`

   **Test: "researcher budget in hybrid uses sonnet (not haiku)"**
   - `resolveAgentModel('gsd-phase-researcher', 'budget', 'hybrid').model` → `'anthropic/claude-sonnet-4-6'`
   - `resolveAgentModel('gsd-project-researcher', 'budget', 'hybrid').model` → `'anthropic/claude-sonnet-4-6'`

   **Test: "check-role agents in hybrid match their openai-only equivalents"**
   - Define check agents: `['gsd-codebase-mapper', 'gsd-verifier', 'gsd-plan-checker', 'gsd-integration-checker']`
   - For each agent and each profile ('quality', 'balanced', 'budget'):
     - `resolveAgentModel(agent, profile, 'hybrid')` must deep-equal `resolveAgentModel(agent, profile, 'openai-only')`

   **Test: "no haiku in hybrid table"**
   - Iterate all keys in `AGENT_MODELS['hybrid']` and all profiles
   - Assert no entry has model containing 'haiku'

3. **Do NOT modify** existing `openai-only xhigh variant differentiation` or `claude-only` test blocks.
  </action>
  <verify>Run `npx vitest run test/core/models.test.ts` — all tests pass, no failures.</verify>
  <done>Tests prove: (1) build agents mirror claude-only (except researcher budgets get sonnet), (2) check agents mirror openai-only exactly, (3) no haiku in hybrid, (4) existing openai-only and claude-only tests unchanged and passing.</done>
</task>

</tasks>

<verification>
```bash
npx vitest run test/core/models.test.ts
npx tsc --noEmit
```
All tests pass. No type errors. Claude-only and openai-only tables untouched.
</verification>

<success_criteria>
- Hybrid build agents resolve to same models as claude-only (with sonnet substituted for haiku on budget researchers)
- Hybrid check agents resolve to same models as openai-only
- No haiku model string appears anywhere in the hybrid section
- All existing tests pass unchanged
- New tests explicitly verify role-based mirroring
</success_criteria>

<output>
After completion, create `.planning/quick/075-hybrid-role-based-model-routing/075-SUMMARY.md`
</output>
