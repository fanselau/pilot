# Model System — Agent Frontmatter Patching

## Problem
GSD's config-based `model_overrides` is unreliable with opencode. The proven approach is patching the `model:` field in agent `.md` frontmatter files — opencode reads this directly when spawning subagents. The GSD installer writes `model: inherit` on all agents, but Pilot needs per-agent model control for profile tiers and provider modes (hybrid = Claude builds, Codex verifies).

## Goal
Pilot patches `.opencode/agents/gsd-*.md` frontmatter before each job based on profile + provider mode. Delete the old AGENT_MODELS table and replace with a GSD-agent-aware model resolution table.

## Requirements

### Must Have

- [ ] Implement `patchAgentFrontmatter(projectDir: string, profile: string, providerMode: string)`:
  1. Read all `.opencode/agents/gsd-*.md` files in the project
  2. Parse YAML frontmatter (between `---` markers)
  3. Look up `(agentName, profile, providerMode)` in model table
  4. Replace `model:` field with the resolved value
  5. Write back, preserving everything else in the file (content after frontmatter)

- [ ] Model resolution table — maps `(agent, profile, provider)` → `provider/model` string:

  **Build-role agents** (planner, roadmapper, executor, researchers, synthesizer, debugger):
  | Profile | claude-only | openai-only | hybrid |
  |---------|------------|-------------|--------|
  | quality | inherit | openai/gpt-5.3-codex | inherit |
  | balanced | inherit (planner), anthropic/claude-sonnet-4-6 (others) | openai/gpt-5.3-codex | inherit (planner), anthropic/claude-sonnet-4-6 (others) |
  | budget | anthropic/claude-sonnet-4-6 | openai/gpt-5.3-codex | anthropic/claude-sonnet-4-6 |

  **Check-role agents** (verifier, plan-checker, integration-checker, codebase-mapper, nyquist-auditor, ui-auditor, ui-checker):
  | Profile | claude-only | openai-only | hybrid |
  |---------|------------|-------------|--------|
  | quality | anthropic/claude-sonnet-4-6 | openai/gpt-5.3-codex | openai/gpt-5.3-codex |
  | balanced | anthropic/claude-sonnet-4-6 | openai/gpt-5.3-codex | openai/gpt-5.3-codex |
  | budget | anthropic/claude-haiku-4-5 | openai/gpt-5.3-codex | openai/gpt-5.3-codex |

  `inherit` profile: all agents → `inherit` (use whatever top-level session model is)

- [ ] Call `patchAgentFrontmatter()` in the runner BEFORE spawning each job (per-job, not per-project — different jobs can have different profiles/providers)
- [ ] Top-level session model set via `opencode run --model <X>`. `inherit` in frontmatter = use this model.
- [ ] Delete the old `AGENT_MODELS` table in `src/core/models.ts` and replace with this new table
- [ ] `resolveTopLevelModel()` simplifies: return the model for the top-level session based on provider mode (Claude Opus for claude-only/hybrid, Codex for openai-only)
- [ ] Keep `--provider hybrid|claude-only|openai-only` and `--profile quality|balanced|budget|inherit` flags on `pilot add`

### Nice to Have
- [ ] `pilot add --model <specific-model>` for top-level override
- [ ] Cache the original frontmatter to avoid re-reading on every job (optional — files are small)

## Technical Notes
- The GSD installer writes `model: inherit` + `mode: subagent` on all agents by default
- Frontmatter is YAML between `---` markers at the top of the file
- Agent files are at `.opencode/agents/gsd-*.md` (installed by upstream GSD)
- `inherit` means "use the parent session's model" — opencode resolves this at spawn time
- Patching must preserve `mode: subagent`, `name:`, and all content after frontmatter
- If GSD updates add new agents, Pilot's table should gracefully default unknown agents to `inherit`

## Do NOT
- Do NOT use GSD's config.json `model_overrides` — unreliable with opencode
- Do NOT hardcode model version strings that could go stale — use the table in this requirement
- Do NOT patch at setup time — it must be per-job since jobs can have different profiles

#### Critical Fixes (from critique)

- [ ] Enumerate ALL agent filenames explicitly (list every `gsd-*.md` in `.opencode/agents/`). Count them after first install — don't assume 15.
- [ ] Concurrent same-project jobs: document as unsupported constraint OR add per-project file lock before patching. Pilot currently runs one job per project (project blocking), so this may already be safe — verify.
- [ ] Use a proper YAML parser for frontmatter (not regex). Handle: model line absent → insert, comments preserved, multiline values, no frontmatter → skip with warning.
- [ ] Unknown agents (new in future GSD versions): default to `inherit` gracefully. Log a warning.
- [ ] `--profile inherit` semantics: early-return from `patchAgentFrontmatter` (don't touch files, all agents keep `model: inherit` from installer).
