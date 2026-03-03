# Model Frontmatter Patching

## Problem
Pilot's model profile system writes `.planning/config.json` with `model_profile` and `provider_mode`, but GSD agents never actually use different models. Investigation confirmed that opencode's `Task()` tool does **not** accept a `model` parameter — the `model="{executor_model}"` in GSD orchestrators is dead code that gets silently ignored.

The only working mechanism for controlling subagent models is the `model:` field in agent frontmatter (`.opencode/agents/*.md`). When Task() spawns a subagent, opencode reads the agent's `model` field from frontmatter. If absent, it falls back to the parent session's model.

## Goal
When a job has a model profile (quality/balanced/budget) and provider mode (claude-only/openai-only/hybrid), Pilot's runner patches agent frontmatter files with the resolved model IDs before spawning opencode. This makes model profiles actually functional end-to-end.

## Requirements

### Must Have

- [ ] **Model resolution function** in `src/core/models.ts` (new file)
  - Takes `(agentName: string, profile: string, providerMode: string)` → returns full model ID string
  - Profile table (from `model-profiles.md`):
    ```
    | Agent                    | quality | balanced | budget |
    |--------------------------|---------|----------|--------|
    | gsd-planner              | opus    | opus     | sonnet |
    | gsd-roadmapper           | opus    | sonnet   | sonnet |
    | gsd-executor             | opus    | sonnet   | sonnet |
    | gsd-phase-researcher     | opus    | sonnet   | haiku  |
    | gsd-project-researcher   | opus    | sonnet   | haiku  |
    | gsd-research-synthesizer | sonnet  | sonnet   | haiku  |
    | gsd-debugger             | opus    | sonnet   | sonnet |
    | gsd-codebase-mapper      | sonnet  | haiku    | haiku  |
    | gsd-verifier             | sonnet  | sonnet   | haiku  |
    | gsd-plan-checker         | sonnet  | sonnet   | haiku  |
    | gsd-integration-checker  | sonnet  | sonnet   | haiku  |
    ```
  - Model tier → model ID mapping:
    - `claude-only`: opus=`anthropic/claude-opus-4-6`, sonnet=`anthropic/claude-sonnet-4-6`, haiku=`anthropic/claude-haiku-4-5`
    - `openai-only`: opus=`openai/gpt-5.2-codex`, sonnet=`openai/gpt-5.1-codex-mini`, haiku=`openai/gpt-4.1-mini`
    - `hybrid`: opus=`anthropic/claude-opus-4-6`, sonnet=`openai/gpt-5.1-codex-mini`, haiku=`openai/gpt-4.1-nano`
  - Export `resolveAgentModel(agentName, profile, providerMode): string`
  - Export `resolveAllAgentModels(profile, providerMode): Record<string, string>`

- [ ] **Frontmatter patching function** in `src/core/models.ts`
  - `patchAgentFrontmatter(projectDir: string, models: Record<string, string>): void`
  - For each agent in models map:
    1. Read `.opencode/agents/{agentName}.md`
    2. Parse YAML frontmatter (between `---` delimiters)
    3. If `model:` exists → update it
    4. If `model:` doesn't exist → add it after `description:` line
    5. Write file back
  - Skip agents whose files don't exist (project may not have all agents)
  - Use simple string manipulation — do NOT pull in a YAML library

- [ ] **Runner integration** in `src/core/runner.ts`
  - Before `delegate()` or `spawnAndWait()` call:
    1. Read job's `model_profile` and `provider_mode` from DB (already available on job object)
    2. If profile is set (not null/undefined): call `resolveAllAgentModels()` then `patchAgentFrontmatter()`
    3. If profile is not set: skip patching (use whatever's in frontmatter already)
  - Log: `dim(`Patching agent models: ${profile}/${providerMode}`)`

- [ ] **Tests** for model resolution
  - All 11 agents × 3 profiles × 3 providers = 99 cases (table-driven test)
  - Frontmatter patching: test adding model: to file without it, updating existing model:, handling missing file

### Nice to Have

- [ ] `pilot status` shows model profile in job listing when set (already shows profile from eyqt work)
- [ ] `pilot log` shows which model each subagent actually used (from opencode DB session metadata)

## Technical Notes
- Agent frontmatter uses YAML between `---` delimiters. The `model:` field format is: `model: "provider/model-id"` (must be quoted since it contains `/`)
- opencode resolves model from frontmatter via: `const model = agent.model ? await Provider.getModel(agent.model.providerID, agent.model.modelID) : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID);`
- The provider/model split happens on `/` — so `anthropic/claude-opus-4-6` → provider=anthropic, modelID=claude-opus-4-6
- Default profile when not specified: `balanced` + `claude-only` (per existing convention)
- Patching happens on every spawn, not just setup — so profile changes take effect on next job without re-running setup

## Do NOT
- Do NOT modify any GSD files (pilot-gsd repo) — this is purely a Pilot runner change
- Do NOT add a YAML parsing library — use regex/string manipulation for frontmatter
- Do NOT remove the `.planning/config.json` writing — keep it as documentation/reference for GSD orchestrators even though they don't read it effectively
- Do NOT change the opencode binary or Task() tool — work within its constraints
