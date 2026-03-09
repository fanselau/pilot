---
phase: quick-078
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/models.ts
  - src/core/pricing.ts
  - src/core/types.ts
  - test/core/models.test.ts
  - test/core/delegate.test.ts
  - test/core/job-observability.test.ts
  - test/core/runner-recovery.test.ts
  - test/tui/detail-header.test.ts
  - test/tui/running-panel.test.ts
  - test/tui/completed-panel.test.ts
  - /home/luca/.config/opencode/agents/gsd-codebase-mapper.md
  - /home/luca/.config/opencode/agents/gsd-debugger.md
  - /home/luca/.config/opencode/agents/gsd-executor.md
  - /home/luca/.config/opencode/agents/gsd-integration-checker.md
  - /home/luca/.config/opencode/agents/gsd-phase-researcher.md
  - /home/luca/.config/opencode/agents/gsd-plan-checker.md
  - /home/luca/.config/opencode/agents/gsd-planner.md
  - /home/luca/.config/opencode/agents/gsd-project-researcher.md
  - /home/luca/.config/opencode/agents/gsd-research-synthesizer.md
  - /home/luca/.config/opencode/agents/gsd-roadmapper.md
  - /home/luca/.config/opencode/agents/gsd-verifier.md
autonomous: true

must_haves:
  truths:
    - "OpenAI defaults resolve to openai/gpt-5.4 and use remapped variants (old xhigh -> high, old high -> medium)"
    - "Hybrid check-role agents and hybrid _top:judge use the same gpt-5.4 high/medium mapping"
    - "No runtime defaults or tests still reference openai/gpt-5.3-codex"
    - "Comments no longer describe codex/xhigh-high defaults; they describe gpt-5.4 high/medium"
    - "Variant passthrough remains flexible (none/minimal/low/medium/high still valid values)"
    - "Full test suite passes after migration"
  artifacts:
    - path: "src/core/models.ts"
      provides: "Updated AGENT_MODELS defaults for openai-only + hybrid check role/judge"
      contains: "openai/gpt-5.4"
    - path: "src/core/pricing.ts"
      provides: "Pricing catalog key switched to openai/gpt-5.4 with updated assumption text"
    - path: "test/core/models.test.ts"
      provides: "Model-resolution expectations updated to high/medium mapping and gpt-5.4"
    - path: "/home/luca/.config/opencode/agents/gsd-planner.md"
      provides: "GSD agent frontmatter defaults migrated to gpt-5.4 + remapped variants"
  key_links:
    - from: "src/core/models.ts"
      to: "test/core/models.test.ts"
      via: "resolveAgentModel/resolveTopLevelModel assertions"
      pattern: "openai-only|hybrid|_top:judge"
    - from: "src/core/pricing.ts"
      to: "test/core/job-observability.test.ts"
      via: "PRICING_CATALOG and estimateCostByModel checks"
      pattern: "PRICING_CATALOG\\['openai/gpt-5\\.4'\\]"
    - from: "/home/luca/.config/opencode/agents/gsd-*.md"
      to: ".opencode/agents/gsd-*.md"
      via: "project symlinks consume global default agent frontmatter"
      pattern: "model:\\s*\"openai/gpt-5\\.4\""
---

<objective>
Upgrade OpenAI defaults from `openai/gpt-5.3-codex` to `openai/gpt-5.4` and remap default variants from xhigh/high to high/medium across runtime model tables, tests, and GSD default agent frontmatter.

Purpose: Keep provider defaults aligned with current OpenAI model naming while preserving expected thinking-level semantics and test coverage.
Output: Updated runtime mappings (`AGENT_MODELS` + pricing metadata), updated test expectations, updated GSD agent default frontmatter, and a green full test suite.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/core/models.ts
@src/core/pricing.ts
@src/core/types.ts
@test/core/models.test.ts
@test/core/job-observability.test.ts
@test/core/runner-recovery.test.ts
@test/core/delegate.test.ts
@test/tui/detail-header.test.ts
@test/tui/running-panel.test.ts
@test/tui/completed-panel.test.ts
@/home/luca/.config/opencode/agents/gsd-planner.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate runtime OpenAI model tables and comments to gpt-5.4 high/medium defaults</name>
  <files>src/core/models.ts, src/core/pricing.ts, src/core/types.ts</files>
  <action>
Update runtime defaults and metadata to the new OpenAI naming + variant mapping:

1. In `src/core/models.ts`, replace every `openai/gpt-5.3-codex` default entry with `openai/gpt-5.4` in:
   - the entire `openai-only` table (all agents + `_top:phase`, `_top:quick`, `_top:judge`), and
   - only the hybrid check-role entries (`gsd-codebase-mapper`, `gsd-verifier`, `gsd-plan-checker`, `gsd-integration-checker`) plus hybrid `_top:judge`.

2. Apply default variant remap on those same entries:
   - `xhigh` -> `high`
   - `high` -> `medium`

3. Leave all Claude entries untouched, and do not change hybrid build-role agent model assignments.

4. Update comments that still mention codex/xhigh-high differentiation so they describe `gpt-5.4` with `high/medium` defaults.

5. In `src/core/pricing.ts`, rename the OpenAI pricing key to `openai/gpt-5.4` and update assumptions text to reference GPT-5.4 plus high/medium (no xhigh wording).

6. In `src/core/types.ts`, update the variant example comment to reflect current supported values (`none/minimal/low/medium/high` + null storage), without constraining the type to a strict union.

Do not introduce new model-routing behavior beyond this migration.
  </action>
  <verify>Run `npx vitest run test/core/models.test.ts test/core/job-observability.test.ts` and confirm both files pass with updated defaults.</verify>
  <done>Runtime model/pricing/type metadata reflects gpt-5.4 + high/medium mapping, and stale codex/xhigh-high wording is removed.</done>
</task>

<task type="auto">
  <name>Task 2: Update all test expectations and comments for gpt-5.4 + high/medium remap</name>
  <files>test/core/models.test.ts, test/core/delegate.test.ts, test/core/job-observability.test.ts, test/core/runner-recovery.test.ts, test/tui/detail-header.test.ts, test/tui/running-panel.test.ts, test/tui/completed-panel.test.ts</files>
  <action>
Update every test reference to `openai/gpt-5.3-codex` so it uses `openai/gpt-5.4`.

In `test/core/models.test.ts`, also update variant expectations to match the remapped defaults:
- any assertion expecting default `xhigh` should now expect `high`
- any assertion expecting default `high` (from old default table values) should now expect `medium`
- rename/refresh test names and comments that explicitly mention "xhigh variant differentiation" to "high/medium" terminology.

Apply the same wording cleanup in other tests/comments that still mention codex/xhigh naming (for example delegate test comments).

Keep generic passthrough behavior tests intact (custom variants are still allowed); only migrate assertions tied to default mappings.
  </action>
  <verify>Run `npx vitest run test/core/models.test.ts test/core/delegate.test.ts test/core/job-observability.test.ts test/core/runner-recovery.test.ts test/tui/detail-header.test.ts test/tui/running-panel.test.ts test/tui/completed-panel.test.ts`.</verify>
  <done>All affected tests use gpt-5.4 strings and high/medium default expectations; no stale xhigh-default assumptions remain.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate GSD agent default frontmatter and run full suite</name>
  <files>/home/luca/.config/opencode/agents/gsd-codebase-mapper.md, /home/luca/.config/opencode/agents/gsd-debugger.md, /home/luca/.config/opencode/agents/gsd-executor.md, /home/luca/.config/opencode/agents/gsd-integration-checker.md, /home/luca/.config/opencode/agents/gsd-phase-researcher.md, /home/luca/.config/opencode/agents/gsd-plan-checker.md, /home/luca/.config/opencode/agents/gsd-planner.md, /home/luca/.config/opencode/agents/gsd-project-researcher.md, /home/luca/.config/opencode/agents/gsd-research-synthesizer.md, /home/luca/.config/opencode/agents/gsd-roadmapper.md, /home/luca/.config/opencode/agents/gsd-verifier.md</files>
  <action>
Update GSD agent default frontmatter for all affected agents:

- `model: "openai/gpt-5.3-codex"` -> `model: "openai/gpt-5.4"`
- `variant: "xhigh"` -> `variant: "high"`
- `variant: "high"` -> `variant: "medium"`

Apply this only where the model is OpenAI; do not alter non-OpenAI model entries.

Then run a verification sweep and full suite:
1. Confirm there are zero remaining `openai/gpt-5.3-codex` and default `xhigh` entries in these agent files.
2. Run the full test suite (`npm test`).
  </action>
  <verify>Run `npm test` and ensure all tests pass after the defaults migration.</verify>
  <done>Agent defaults use gpt-5.4/high-medium mapping and the repository test suite is green.</done>
</task>

</tasks>

<verification>
```bash
npx vitest run test/core/models.test.ts test/core/job-observability.test.ts
npx vitest run test/core/models.test.ts test/core/delegate.test.ts test/core/job-observability.test.ts test/core/runner-recovery.test.ts test/tui/detail-header.test.ts test/tui/running-panel.test.ts test/tui/completed-panel.test.ts
npm test
```
</verification>

<success_criteria>
- `src/core/models.ts` default OpenAI mappings are on `openai/gpt-5.4` with xhigh->high and high->medium remap applied in openai-only and hybrid check/judge cells
- Stale codex/xhigh-high comments are updated to GPT-5.4 high/medium wording
- `src/core/pricing.ts` and all affected tests reference `openai/gpt-5.4`
- `test/core/models.test.ts` default variant assertions reflect high/medium mapping
- GSD agent frontmatter defaults under `/home/luca/.config/opencode/agents` are migrated to gpt-5.4 and remapped variants
- Full `npm test` suite passes
</success_criteria>

<output>
After completion, create `.planning/quick/078-upgrade-openai-models-from-gpt-5-3-codex/078-SUMMARY.md`
</output>
