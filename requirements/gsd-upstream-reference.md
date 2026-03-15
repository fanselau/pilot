# GSD Upstream Reference — Key Findings for Implementation

This file contains distilled research findings that implementers need when building the migration. NOT a requirement — a reference document.

## Installer Behavior (`npx get-shit-done-cc --opencode --local`)

**Creates:**
```
.opencode/
├── command/gsd-*.md           # Flat commands (hyphen-separated, OpenCode format)
├── agents/gsd-*.md            # Converted agents (model: inherit, mode: subagent)
├── get-shit-done/             # Reference docs + bin/gsd-tools.cjs
├── hooks/                     # Copied but NOT registered (dead weight for OpenCode)
├── opencode.json              # Permissions for gsd-tools.cjs access
├── package.json               # {"type":"commonjs"} for gsd-tools.cjs
├── settings.json              # Mostly empty for OpenCode
└── gsd-file-manifest.json     # Install tracking for updates
```

**Key behaviors:**
- Copies files (not symlinks) with absolute path replacement
- Agent frontmatter: strips tools/skills/color, adds `model: inherit` + `mode: subagent`
- Command frontmatter: converts tools to `{toolname: true}` object format
- `AskUserQuestion` → `question`, `SlashCommand` → `skill` in content
- `/gsd:` → `/gsd-` in command references (OpenCode flat naming)
- `gsd-tools.cjs` paths baked as absolute during install
- Updates: `gsd-file-manifest.json` tracks hashes, local mods backed up to `gsd-local-patches/`
- Uninstall: `--opencode --local --uninstall` removes GSD files, preserves user files

**Command naming in OpenCode:** Files are `command/gsd-plan-phase.md` (hyphen-separated). The `--command` flag to opencode should use `gsd-plan-phase` (matching the filename without .md). Verify this after first install.

## Config Reference (`.planning/config.json`)

**Pilot's optimal autonomous config:**
```json
{
  "mode": "yolo",
  "granularity": "standard",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "planning": { "commit_docs": true, "search_gitignored": false },
  "git": { "branching_strategy": "none" },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": true,
    "nyquist_validation": true,
    "ui_phase": true,
    "ui_safety_gate": false,
    "node_repair": true,
    "node_repair_budget": 2
  }
}
```

**Dangerous keys for autonomous mode:**
| Key | Risk | Safe Value |
|-----|------|------------|
| `mode: "interactive"` | 🔴 Hangs on every transition | `"yolo"` |
| `workflow.node_repair: false` | 🔴 Task failures block immediately | `true` |
| `workflow.auto_advance: false | 🔴 Checkpoints in execute-phase block | `true`` |
| `workflow.ui_safety_gate: true` | ⚠️ Prompts for UI-SPEC on frontend phases | `false` unless intended |

## Model Profiles

**Default: `balanced`** (not `inherit`). Within a single plan-phase session, GSD spawns multiple agents at different tiers:
- `balanced`: Planner = Opus-tier (→ `inherit` = parent session model), Executor = Sonnet, Researcher = Sonnet, Verifier = Sonnet
- `quality`: Most agents = Opus-tier, Verifier/Checker = Sonnet
- `budget`: Planner = Sonnet, Researcher = Haiku, Verifier = Haiku
- `inherit`: ALL agents use parent model (useful for testing, NOT default)

**Key insight:** GSD resolves `opus` → `inherit` internally. So in `balanced` profile, the planner inherits whatever `opencode run --model X` Pilot passes. Other agents use their own models.

**Per-agent overrides:** `model_overrides` in config.json takes precedence: `{ "model_profile": "balanced", "model_overrides": { "gsd-verifier": "haiku" } }`

**Provider mode — via agent frontmatter patching:**

GSD installer writes `model: inherit` on all `.opencode/agents/gsd-*.md` files. Pilot patches these per-job based on provider mode + profile. This is the reliable approach — opencode reads frontmatter `model:` directly when spawning subagents.

- `claude-only`: All agents get Claude model strings in frontmatter
- `openai-only`: All agents get Codex model strings in frontmatter
- `hybrid`: Build-role agents (planner, executor, researcher, debugger) → Claude. Check-role agents (verifier, plan-checker, integration-checker, mapper, auditor) → Codex.

Hybrid = two different perspectives. Luca's explicit design.

Pilot keeps a model resolution table mapping `(agent, profile, provider)` → `provider/model` string. Simpler than old AGENT_MODELS but still Pilot-owned since GSD's config-based model_overrides is unreliable. Frontmatter is the proven path.

## Quick Workflow: `--full` Flag

- Adds plan-checker loop (up to 2 iterations) + post-execution verifier
- **Interactive touchpoints in `--full`:** max iterations hit → "Force proceed / Abort", `gaps_found` → "Re-run / Accept as-is"
- Happy path (plan passes, verification passes) is fully autonomous
- No `--auto` flag exists for quick — but with description always provided + happy path, it works headlessly
- `--full --research` is the strongest quality configuration for autonomous quick tasks

## Node Repair Operator

- Triggered when task verification fails during execute-phase
- Strategies: RETRY (transient fix), DECOMPOSE (split task), PRUNE (skip with justification), ESCALATE (human)
- Budget: `workflow.node_repair_budget` (default: 2)
- Logged to SUMMARY.md under "Deviations from Plan"
- Disable: `workflow.node_repair: false`

## Autonomous Command Intelligence (for delegation AI rewrite)

**Patterns from `gsd:autonomous`:**
1. Smart discuss: batch gray area proposals in tables, auto-accept for infrastructure phases
2. Verification routing: `passed` → continue, `gaps_found` → 1-retry with `--gaps`, `human_needed` → present items
3. Dynamic phase discovery: re-read ROADMAP.md after each phase (catches decimal insertions)
4. `--no-transition` on execute-phase: prevents GSD from auto-advancing (orchestrator controls flow)
5. Blocker escalation with resume command: always provide exact resume point
6. Prior context accumulation: each discuss loads all prior CONTEXT.md files
7. Infrastructure skip: auto-skip discuss for pure infra phases (no user-facing behavior)

## GSD Source Reference

Upstream clone at `~/dev/punchlab/gsd-upstream/` (v1.24.0, commit 33dcb77)
Full analysis at `~/.openclaw/workspace/research/gsd-fork-analysis-2026-03-15.md`
