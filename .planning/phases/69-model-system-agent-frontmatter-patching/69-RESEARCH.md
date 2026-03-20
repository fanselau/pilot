# Phase 69: Model System - Agent Frontmatter Patching - Research

**Researched:** 2026-03-16
**Domain:** Model routing + agent frontmatter mutation in Pilot/GSD execution pipeline
**Confidence:** MEDIUM

## Summary

Phase 69 should not invent a new model system; it should harden and formalize the one already in production. The current code already does DB-first model resolution (`model_profiles`/`provider_modes`), top-level model selection (`resolveTopLevelModel`), and per-agent markdown frontmatter patching (`patchAgentFrontmatter`) before sessions run. The implementation is functionally correct for the known 11 `gsd-*` agents, but it still uses regex/line-based frontmatter mutation and does not scan agent files as a source of truth.

The standard approach for this phase is a two-layer routing contract: (1) top-level `opencode run --model [--variant]` for the parent session, and (2) per-agent `model`/`variant` fields in `.opencode/agents/gsd-*.md` for spawned subagents. Keep this architecture, but make patching parser-safe and file-driven so the system survives upstream agent changes and custom provider modes without stale model leakage.

Also preserve the existing phase-number correction flow in runner intent handling: after `add-phase`, re-read filesystem phase directories and patch the predicted `phaseNumber` before `plan-phase`/`execute-phase`. This is the current reliability guard for phase/milestone routing and should remain intact while model patching is improved.

**Primary recommendation:** Implement a parser-safe, file-scanning `patchAgentFrontmatter` pipeline (YAML `Document` based), keep DB-first model resolution, and add targeted tests for unknown agents, partial provider modes, and idempotent patching.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `better-sqlite3` | `^12.6.2` | Store model profiles/provider modes (`model_profiles`, `provider_modes`) | Already the runtime source for dynamic model config; synchronous + deterministic in this codebase |
| `execa` | `^9.5.0` | Spawn `opencode run` sessions with `--model`/`--variant` | Existing runner/delegate spawn path; avoids introducing another process layer |
| `get-shit-done-cc` | `~1.24.0` | Installs `.opencode/agents/gsd-*.md` files and baseline frontmatter | Upstream installer defines file layout Phase 69 must patch against |
| `yaml` (`/eemeli/yaml`) | `2.x` (recommended add) | Parse/mutate YAML frontmatter safely | Supports `parseDocument`, keyed updates, and comment-aware document handling; avoids regex corruption |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Node `fs/path` | built-in | Enumerate `.opencode/agents`, read/write markdown files | Always for local patching flow |
| `vitest` | `^2.1.0` | Unit tests for patching + model resolution + runner integration | Mandatory for regression coverage on patch behavior |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Regex/line-split frontmatter editing | `yaml` `parseDocument` + `set`/`delete` | Parser approach is safer for edge cases (comments, ordering, multiline), with minor dependency cost |
| Hardcoded known-agent iteration only | Filesystem scan of `gsd-*.md` | Scan is safer for upstream agent additions; hardcoding risks silent drift |
| ROADMAP-only phase patching | Filesystem phase-dir patching (current) | Filesystem reflects actual created dirs post-`add-phase`; ROADMAP-only can lag |

**Installation:**
```bash
npm install yaml
```

## Architecture Patterns

### Recommended Project Structure

```
src/core/
├── models.ts        # model table + DB-backed resolution + frontmatter patching
├── model-store.ts   # CRUD for model_profiles/provider_modes
├── runner.ts        # patch call sites + top-level model selection + phase number correction
├── delegate.ts      # delegation top-level model selection + next phase number helper
└── db.ts            # schema + seeding for model tables
test/core/
├── models.test.ts   # frontmatter patching and resolution invariants
└── runner*.test.ts  # integration-level patch call path verification
```

### Pattern 1: Two-Layer Model Routing (Top-Level + Subagent)

**What:** Resolve one top-level model for each spawned session (`--model`, optional `--variant`) and patch subagent frontmatter for agent-specific routing.
**When to use:** Every job execution path (`delegate`, `runGsdStep`, `judge`) in phase/quick/milestone scopes.
**Example:**
```typescript
// Source: src/core/runner.ts + src/core/models.ts
const providerMode = job.providerMode ?? 'claude-only';
const models = resolveAllAgentModels(job.modelProfile, providerMode);
patchAgentFrontmatter(projectDir, models);

const { model: topLevelModel, variant } = resolveTopLevelModel(scope, job.modelProfile, providerMode);
// ... pass to `opencode run --model [--variant]`
```

### Pattern 2: DB-First Resolution With Hardcoded Fallback

**What:** Query `model_profiles` first; if DB is unavailable/missing entries, fallback to `AGENT_MODELS` constants.
**When to use:** All resolution functions (`resolveAgentModel`, `resolveAllAgentModels`, `resolveTopLevelModel`).
**Example:**
```typescript
// Source: src/core/models.ts
const row = getModelEntry(providerMode, agentName, profile);
if (row) return { model: row.model, variant: row.variant ?? undefined };
// fallback to AGENT_MODELS
```

### Pattern 3: Phase Number Reality Patch After `add-phase`

**What:** Treat delegation `phaseNumber` as predicted; after `add-phase`, recalculate actual phase number from `.planning/phases` before planning/execution.
**When to use:** `plan-and-execute` intent when `addPhaseTitle` is present.
**Example:**
```typescript
// Source: src/core/runner.ts
await this.runGsdStep(job, projectDir, 'add-phase', addArgs, stepIdx++);
const actualPhaseNumber = getNextPhaseNumber(path.join(projectDir, '.planning', 'phases')) - 1;
if (actualPhaseNumber > 0 && actualPhaseNumber !== phaseNumber) phaseNumber = actualPhaseNumber;
```

### Anti-Patterns to Avoid

- **Regex-only YAML mutation:** brittle with comments/multiline/formatting edge cases; use a YAML parser.
- **Agent-name hardcoding without file scan:** misses new upstream agents and hides drift.
- **Assuming delegation phase prediction is authoritative:** always patch from filesystem after `add-phase`.
- **Per-provider partial maps without guardrails:** leaves stale frontmatter from previous jobs.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| YAML frontmatter edits | Regex split/replace parser | `yaml` `parseDocument` + `set`/`delete` + `toString()` | Handles YAML semantics and comment-aware docs reliably |
| Model source of truth | New ad hoc config map | Existing `model_profiles` + `provider_modes` via `model-store.ts` | Keeps `pilot models` CLI and runtime in sync |
| Phase argument correction | Manual string math in multiple places | Existing `getNextPhaseNumber()` + single patch site in runner | Avoids duplicate phase-number drift logic |
| Provider-mode validation | Loose string checks in runner | `model-store` mode existence checks + existing add-command validation | Prevents invalid mode paths from reaching spawn |

**Key insight:** In this domain, correctness failures are mostly silent (wrong model, stale patch, wrong phase number). Reuse parser/DB primitives so failures become explicit and testable.

## Common Pitfalls

### Pitfall 1: Silent Frontmatter Corruption

**What goes wrong:** Regex/line mutation breaks YAML structure or reorders fields unexpectedly.
**Why it happens:** Frontmatter is treated as plain text, not YAML.
**How to avoid:** Parse to YAML `Document`, mutate only `model`/`variant`, re-render frontmatter block.
**Warning signs:** Agent files lose metadata, comments disappear unexpectedly, or patch skips files with minor format variation.

### Pitfall 2: Stale Agent Models Across Jobs

**What goes wrong:** Some agents keep old `model`/`variant` values when provider mode/profile changes.
**Why it happens:** Patch input map is partial (custom mode or missing entries), and untouched files retain previous values.
**How to avoid:** Drive patching from discovered `gsd-*.md` files, resolve unknowns to explicit fallback policy (`inherit` + warning).
**Warning signs:** `job.actualModels` shows prior mode/provider after a mode switch.

### Pitfall 3: Duplicate Patch Churn

**What goes wrong:** Files are patched repeatedly at job start and each step with no semantic change.
**Why it happens:** Patch is called both before delegation and in `runGsdStep`.
**How to avoid:** Keep idempotence check and consider single authoritative patch point per spawned session set.
**Warning signs:** Repeated "Patching agent models" logs and unnecessary write timestamps.

### Pitfall 4: Phase Number Drift After New Phase Creation

**What goes wrong:** Runner plans/executes wrong phase when delegation predicted phase number diverges from actual created dir.
**Why it happens:** Delegation prediction can race with real filesystem state.
**How to avoid:** Keep post-`add-phase` filesystem recalculation before `plan-phase`/`execute-phase`.
**Warning signs:** `plan-phase` errors for non-existent phase or logs showing mismatched predicted/actual phase numbers.

## Code Examples

Verified patterns from official sources:

### YAML Document Mutation For Frontmatter Fields

```typescript
// Source: Context7 /eemeli/yaml docs (parseDocument/get/delete/toString)
import YAML from 'yaml';

const doc = YAML.parseDocument(frontmatterText);
doc.set('model', entry.model);
if (entry.variant) doc.set('variant', entry.variant);
else doc.delete('variant');

const newFrontmatter = String(doc).trimEnd();
```

### Existing Runner Patch + Spawn Model Resolution

```typescript
// Source: src/core/runner.ts
const models = resolveAllAgentModels(job.modelProfile, providerMode);
patchAgentFrontmatter(projectDir, models);

const { model: topLevelModel, variant } = resolveTopLevelModel(scope, profile, providerMode);
const args = ['run', '--model', topLevelModel, ...(variant ? ['--variant', variant] : [])];
```

### Existing Phase Number Correction Before Plan/Execute

```typescript
// Source: src/core/runner.ts
await runGsdStep('add-phase', addArgs);
const actual = getNextPhaseNumber(path.join(projectDir, '.planning', 'phases')) - 1;
if (actual > 0 && actual !== phaseNumber) phaseNumber = actual;
await runGsdStep('plan-phase', `${phaseNumber}`);
await runGsdStep('execute-phase', `${phaseNumber}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Tier indirection (`ModelTier`, provider tables, resolver indirection) | Flat `AGENT_MODELS` with `{ model, variant? }` entries + DB-backed overrides | Quick phases 073-075 (2026-03-06), 078 (2026-03-09) | Simpler resolution and explicit variant handling |
| Step-based phase arg patch helpers | Intent-based runner with post-`add-phase` filesystem correction | Phase 66+ (2026-03-15 onward) | More reliable phase/milestone execution routing |
| External judge command path (`gsd-judge`) | Inline prompt + top-level `_top:judge` resolution in runner | Phase 68 (2026-03-16) | Unified model routing and fewer external command dependencies |

**Deprecated/outdated:**

- `patchPhaseArgs` safety-net helpers (removed in favor of intent + runtime correction).
- Treating YAML frontmatter as raw text for model-critical mutation (works today, but fragile).

## Open Questions

1. **Should `inherit` be a first-class `ModelProfile` again?**
   - What we know: current type/schema only allow `quality|balanced|budget`; older requirements mention `inherit` behavior.
   - What's unclear: whether product wants explicit `--profile inherit` UX in current model CLI/add flow.
   - Recommendation: decide before implementation; if yes, include DB CHECK migration + CLI validation + runner no-op patch mode.

2. **Should patching run once per job or once per step?**
   - What we know: current code patches at job start and each `runGsdStep`.
   - What's unclear: whether repeated patching is intentional defense-in-depth or accidental duplication.
   - Recommendation: keep idempotent writes now, then pick one authoritative patch point in this phase and test for equivalent behavior.

3. **Unknown/new `gsd-*.md` agents policy**
   - What we know: current patch flow only iterates known resolved keys, not discovered files.
   - What's unclear: whether unknown files should be patched to `inherit`, ignored, or fail-fast.
   - Recommendation: explicit policy: `inherit` + warning (non-fatal), with tests.

4. **Custom provider modes with incomplete rows**
   - What we know: custom modes can be created empty; resolver/patch behavior is partial and may leave stale values.
   - What's unclear: whether to enforce completeness at mode creation/edit time.
   - Recommendation: add preflight validation for required `_top:*` scopes and known agents before job launch.

## Sources

### Primary (HIGH confidence)

- Repository code: `src/core/models.ts` - current resolution and frontmatter patch implementation
- Repository code: `src/core/runner.ts` - patch call sites, top-level model selection, phase-number correction
- Repository code: `src/core/delegate.ts` - delegation model selection and phase-number helper
- Repository code: `src/core/model-store.ts` + `src/core/db.ts` - DB schema and model table seeding
- Dependency source: `node_modules/get-shit-done-cc/bin/install.js` - upstream installer behavior (`model: inherit`, `mode: subagent`)
- Context7: `/eemeli/yaml` - `parseDocument`, node mutation, and comment-aware YAML document handling

### Secondary (MEDIUM confidence)

- `requirements/gsd-06-model-frontmatter.md` - historical phase intent and edge-case checklist (partially stale model naming)
- `requirements/gsd-03-delegation-redesign.md` - phase-number correction intent and intent-routing constraints
- `.planning/quick/073-*/074-*/075-*/078-*` summaries - chronology of model-system refactors

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - directly verified in repository code and package manifest; YAML parser capability verified via Context7
- Architecture: HIGH - runtime control flow verified in `runner.ts`/`delegate.ts`
- Pitfalls: MEDIUM - strongly inferred from current implementation and test coverage gaps; some behaviors depend on operational usage patterns

**Research date:** 2026-03-16
**Valid until:** 2026-04-15 (30 days; model/provider surface is active and changes frequently)
