# Model Profile Support — Control Agent Models from Pilot

## Problem
Pilot has no control over which models GSD agents use. Every job runs with whatever's in the global opencode config (opus for build agent). This means:
- Simple fixes waste opus tokens when sonnet would suffice
- No way to use Codex for verification (hybrid mode)
- No way to run budget jobs for high-volume work
- The GSD model profile system exists but Pilot doesn't interact with it

## How GSD Model Profiles Work (Current State)

### Resolution Chain
1. GSD workflows read `.planning/config.json` in the project directory
2. `model_profile` field: `quality` | `balanced` | `budget`
3. `provider_mode` field: `hybrid` | `claude-only` | `openai-only`
4. Each GSD agent type maps to a model tier based on profile (see table below)
5. Workflows pass `model="{resolved}"` to `Task()` calls (opencode subagent tool)

### Profile → Model Mapping (Claude Matrix)
| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| gsd-planner | opus | opus | sonnet |
| gsd-executor | opus | sonnet | sonnet |
| gsd-verifier | sonnet | sonnet | haiku |
| gsd-debugger | opus | sonnet | sonnet |
| gsd-codebase-mapper | sonnet | haiku | haiku |

### Provider Modes
- `hybrid`: Claude for most agents, OpenAI Codex for verifier/checker agents
- `claude-only`: All agents use Claude matrix
- `openai-only`: All agents use OpenAI Codex matrix (with reasoning effort levels)

### Config File
`.planning/config.json` in each project:
```json
{
  "model_profile": "balanced",
  "provider_mode": "hybrid",
  "model_overrides": {}
}
```

## Goal
`pilot add --profile budget ~/project requirement.md` queues a job that uses budget-tier models, saving tokens on simple work.

## Requirements

### Must Have — CLI
- [ ] `pilot add` accepts `--profile <quality|balanced|budget>` (default: `balanced`)
- [ ] `pilot add` accepts `--provider <hybrid|claude-only|openai-only>` (default: `claude-only`)
- [ ] Profile and provider stored on the job record in pilot.db
- [ ] `pilot status` shows profile/provider for active jobs (e.g., `● job1 ... [balanced/hybrid]`)

### Must Have — DB Schema
- [ ] Add `model_profile TEXT DEFAULT 'balanced'` column to jobs table
- [ ] Add `provider_mode TEXT DEFAULT 'claude-only'` column to jobs table
- [ ] Migration: ALTER TABLE if columns don't exist

### Must Have — Runner Integration
- [ ] Before spawning opencode for a job, runner writes/updates `.planning/config.json` in the project directory with the job's profile and provider settings
- [ ] After job completes, restore original `.planning/config.json` (or leave it — GSD defaults to balanced anyway)
- [ ] The delegation step itself should use the parent session's model (always opus/inherit)

### Must Have — Agent Frontmatter
- [ ] Add `model:` field to all 11 GSD agent frontmatter files in pilot-gsd
- [ ] Model field should match the `balanced` profile by default: planner=opus, executor=sonnet, verifier=sonnet, etc.
- [ ] Document that frontmatter `model:` takes precedence over config.json profile

### Nice to Have
- [ ] `pilot config set default-profile balanced` — set global default
- [ ] Per-project default: `.pilot.json` in project root with `{ "profile": "budget" }`
- [ ] `--model-override gsd-executor=opus` — override specific agent for one job
- [ ] TUI shows model profile in job detail view

## Technical Notes
- `.planning/config.json` is the interface between Pilot and GSD — Pilot writes it, GSD reads it
- GSD resolution code: `~/.config/opencode/get-shit-done/references/model-profile-resolution.md`
- Profile tables: `~/dev/pilot-gsd/get-shit-done/references/model-profiles.md`
- Opencode Task tool accepts `model` parameter for subagent model selection
- `inherit` means "use parent session's model" — used for opus-tier to avoid version conflicts
- The opencode build agent model (set in opencode.json `agent.build.model`) is the parent session model — this is separate from GSD subagent models

## Do NOT
- Change the GSD workflow logic — only write config.json before spawning
- Hardcode model IDs — use the profile table indirection
- Make profile required — default to balanced
- Remove provider_mode support — hybrid with Codex verification is valuable
