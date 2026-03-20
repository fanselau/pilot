# Phase 75: Codex First-Class Citizen — Model-Adaptive Content Patching - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/codex-first-class-citizen.md)

<domain>
## Phase Boundary

Make Codex (gpt-5.4) work as well as Claude for GSD agent tasks by patching prompt content before spawn. Create a unified pre-spawn preparation system (`prepareProjectForSpawn()` / `restoreProjectAfterSpawn()`) that consolidates frontmatter patching, skill injection (JIT via `npx skills add`), and NEW content adaptation (identity/tool/path neutralization) into a single try/finally lifecycle.

This is Phase 3 of the multi-phase Codex support effort. It depends on Phase 73 (judge/step model) and Phase 74 (skills JIT via `npx skills add`).

</domain>

<decisions>
## Implementation Decisions

### Content Adaptation Engine
- New module `src/core/prompt-adapter.ts` — NOT part of existing files
- `getModelFamily(model)` returns `'claude' | 'codex' | 'unknown'`
- `adaptContent(content, family)` applies regex/string replacement pipeline
- `patchContentForModel(projectDir, provider, models)` patches files on disk, returns `PatchState`
- `restoreContent(patchState)` writes originals back from in-memory map
- Transformation rules are regex/string replacements — no AST parsing, GSD-release-agnostic

### Adaptation Rules (Text Transformations)
- **Identity neutralization:** "Claude" as actor/identity → "You" or role name. Skip model identifiers in backticks (`claude-opus-4-6`), config values
- **Tool reference generalization:** "Bash tool" / "Write tool" / "Read tool" in prose → "the appropriate tool" or remove qualifier. Skip frontmatter `tools:` blocks
- **Path neutralization:** `~/.claude/` → `~/.opencode/`, `.claude/skills/` → `.opencode/skill/`, `.claude/commands/` → `.opencode/command/`, `.claude/agents/` → `.opencode/agents/`, `CLAUDE.md` → `AGENTS.md`
- **Skill discovery paths:** `.claude/skills/` → `.opencode/skill/`
- **CRITICAL:** All replacement rules must be verified against a real GSD install scan — not guessed

### Mode-Aware File Selection
- `getFilesToPatch(projectDir, providerMode)` returns file list
- **openai-only:** ALL agents + commands + workflows + references
- **hybrid:** ONLY check-role agent files (verifier, plan-checker, integration-checker, codebase-mapper, `*-checker*` / `*-verifier*` pattern)
- **claude-only:** empty list (no patching)
- Role mapping from existing `AGENT_MODELS` table or parallel role map — NOT hardcoded file lists

### Unified Spawn Prep (`src/core/spawn-prep.ts`)
- `prepareProjectForSpawn(projectDir, job, models, provider): PrepState`
- `restoreProjectAfterSpawn(prepState): void`
- Consolidates: (1) `patchAgentFrontmatter()` (existing, moved here), (2) `installSkillsForJob()` (JIT via `npx skills add`, from Phase 74), (3) `patchContentForModel()` (NEW)
- Runner replaces separate `patchAgentFrontmatter` + skills calls with single `prepareProjectForSpawn()`
- Same pattern for delegation spawn in `src/core/delegate.ts`
- Same pattern for judge spawn
- `PrepState` holds: `originals: Map<string, string>`, `injectedSkills: string[]`, `projectDir: string`

### Inline Prompt Adaptation
- `src/prompts/delegate.md` and `src/prompts/judge.md`: apply `adaptContent()` in-memory before passing to `opencode run` — these are inline, NOT disk-based
- Handles delegate/judge path without disk patching

### Adaptation Rules Must Be Verified Against Real GSD Install
- All replacement rules tested against actual `get-shit-done` opencode install
- Before implementing regex patterns, scan real GSD install to enumerate every "Claude" occurrence
- Classify each: identity (replace), model identifier (skip), filename reference (skip), documentation (replace)
- Build rules FROM scan, not from assumptions
- Snapshot tests: take real GSD files, run `adaptContent()`, verify output manually
- `pilot adapt --dry-run <project>` is **must-have** — verify replacements before production
- `pilot adapt --scan <project>` to re-run scan when GSD upstream changes

### File Lifecycle
- Backup original content before patching (in-memory map, not disk)
- Patch files for target model family
- Spawn opencode (reads patched files from disk)
- Restore originals after spawn (or fail/timeout)
- Projects are serial (one active job per project) — no race conditions

### Claude's Discretion
- Exact regex patterns for identity neutralization (context-aware matching)
- Whether to log replacement counts per file
- Error handling for failed patches (skip file vs abort spawn)
- Whether `pilot adapt --scan` outputs to stdout or writes a report file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/codex-first-class-citizen.md` — Complete PRD with design, requirements, technical notes

### Core Files (Modified/Created)
- `src/core/prompt-adapter.ts` — NEW: content adaptation engine
- `src/core/spawn-prep.ts` — NEW: unified pre-spawn preparation
- `src/core/runner.ts` — Runner integration: replace separate patch/skills calls with spawn-prep
- `src/core/delegate.ts` — Delegation: use spawn-prep or inline adaptation
- `src/core/models.ts` — AGENT_MODELS table (source for role mapping)
- `src/prompts/delegate.md` — Inline prompt: needs in-memory adaptation for Codex
- `src/prompts/judge.md` — Inline prompt: needs in-memory adaptation for Codex

### Cross-Phase Dependencies
- Phase 73 provides step execution loop (per-step spawning)
- Phase 74 provides `installSkillsForJob()` JIT pattern (replaces copy-based injection)

</canonical_refs>

<specifics>
## Specific Ideas

### PrepState Interface
```typescript
interface PrepState {
  originals: Map<string, string>;  // filepath → original content
  injectedSkills: string[];        // skill names injected into .opencode/skill/
  projectDir: string;              // for cleanup
}
```

### getModelFamily
```typescript
function getModelFamily(model: string): 'claude' | 'codex' | 'unknown' {
  if (model.includes('anthropic/') || model.includes('claude')) return 'claude';
  if (model.includes('openai/') || model.includes('gpt-') || model.includes('codex')) return 'codex';
  return 'unknown';
}
```

### File Discovery (GSD-release-agnostic)
```typescript
glob('.opencode/command/*.md')
glob('.opencode/get-shit-done/workflows/*.md')
glob('.opencode/get-shit-done/references/*.md')
glob('.opencode/agents/*.md')
```

### Correct Paths
- Commands: `.opencode/command/` (singular)
- Workflows: `.opencode/get-shit-done/workflows/`
- References: `.opencode/get-shit-done/references/`
- Agents: `.opencode/agents/`
- Skills: `.opencode/skill/` (installed by `skills add`)

</specifics>

<deferred>
## Deferred Ideas

- Per-model prompt overrides: `gsd-executor.codex.md` alongside `gsd-executor.md` — if a Codex-specific variant exists, use it instead
- `pilot doctor` check: report how many Claude references remain in project GSD files
- Metrics: log how many replacements were made per file per spawn

</deferred>

---

*Phase: 75-codex-first-class-citizen-model-adaptive-content-patching*
*Context gathered: 2026-03-20 via PRD Express Path*
