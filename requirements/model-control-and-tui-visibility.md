# Model Control Enforcement + TUI Model Visibility

## Problem
Two issues with model handling:

1. **Model enforcement gap**: The runner patches agent frontmatter files (`patchAgentFrontmatter`) before spawning sessions, but `opencode run --model` is never used. The `--model` flag controls the top-level session agent model, while frontmatter patching controls sub-agent models (Task() spawned agents). Both mechanisms should be used together for full coverage.

2. **TUI model visibility is minimal**: The detail view shows `Model: balanced/claude-only` (profile/provider), but doesn't show the **resolved model names** for each agent tier. Operators can't verify which actual model (opus/sonnet/haiku) is being used for each agent role without reading code.

## Goal
- Ensure per-job model config is enforced at ALL levels: top-level session + sub-agents
- Make resolved model assignments visible in TUI and `pilot info`
- Pass `--model` flag to `opencode run` based on job config

## Requirements

### Must Have
- [ ] **Pass `--model` to `opencode run`** in `spawnAndWait()`
  - Resolve the top-level model from job's `modelProfile` + `providerMode`
  - For phase scope: orchestrator agent tier = opus/sonnet based on profile
  - For judge sessions: always use haiku tier
  - For quick scope: executor tier based on profile
  - Add `--model <resolved-model>` to the execa args array
  - Keep `patchAgentFrontmatter()` for sub-agent model control (Task() agents)

- [ ] **TUI detail view: show resolved models**
  - Below the existing `Model: balanced/claude-only` line, add a line showing resolved model names:
    - e.g., `Models: opus→claude-opus-4-6  sonnet→claude-sonnet-4-6  haiku→claude-haiku-4-5`
  - Use muted/dim styling, don't clutter
  - Only show when job has non-default model profile

- [ ] **`pilot info` show resolved models**
  - Add a "Resolved Models" section to `pilot info <id>` output
  - Show the mapping: agent name → resolved model for the job's profile/provider

- [ ] **TUI list view: model badge**
  - In the job list, show a small badge/tag when model profile is not `balanced`
  - e.g., `● woh3  pilot  quick  "phase-redesign..."  [quality]  19m ago`
  - Skip badge for `balanced` (default) to reduce noise

- [ ] **Show ACTUAL model used (from opencode DB)**
  - After a session completes, query opencode DB for the real model:
    ```sql
    SELECT DISTINCT json_extract(m.data, '$.providerID') || '/' || json_extract(m.data, '$.modelID')
    FROM message m JOIN session s ON m.session_id = s.id
    WHERE s.title = ? AND json_extract(m.data, '$.role') = 'assistant'
    ```
  - Store actual model(s) used in pilot DB: add `actual_models TEXT` column on jobs table (JSON array of unique provider/model strings seen)
  - TUI detail view shows: `Intended: quality/claude-only → claude-opus-4-6` and `Actual: anthropic/claude-sonnet-4-6` (if different, highlight in yellow)
  - `pilot info` shows both intended and actual
  - This catches drift where frontmatter patching failed or opencode overrode the model

- [ ] **Store intended resolved model in DB**
  - Add `resolved_model TEXT` column to jobs table (JSON of agent→model mapping)
  - Populate on job creation from `resolveAllAgentModels()`
  - Used by TUI/info for display without re-resolving

### Nice to Have
- [ ] `--variant` flag support for reasoning effort control per job
- [ ] Warn in TUI if frontmatter model doesn't match expected resolved model (drift detection)
- [ ] `pilot add --model <exact-model>` to bypass profile resolution and use exact model ID

## Technical Notes
- `opencode run --model` only affects the primary agent in the session, NOT sub-agents spawned via Task()
- Sub-agents use their frontmatter `model:` field → `patchAgentFrontmatter()` is still required
- Both mechanisms together = full model control: `--model` for orchestrator, frontmatter for sub-agents
- The `--model` flag accepts `provider/model` format (e.g., `anthropic/claude-opus-4-6`)
- `resolveAllAgentModels()` already exists in `src/core/models.ts` — reuse it

## Do NOT
- Remove `patchAgentFrontmatter()` — it's needed for sub-agent model control
- Make `--model` the ONLY mechanism — it doesn't cascade to Task() sub-agents
- Add model selection UI to TUI — model is set at job creation time via `pilot add --profile`
