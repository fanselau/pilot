# Phase 99: Runtime `agent_skills` Patching for Per-Job Skill Delivery - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Requirement doc inference (`requirements/pilot-runtime-agent-skills-patching.md`)

<domain>
## Phase Boundary

This phase adds job-scoped runtime `agent_skills` patching to Pilot's phase execution flow.

Pilot must keep its current category-based skill selection architecture as the source of truth, resolve the effective skills for a job, turn those into an explicit per-agent `agent_skills` map in the target project's `.planning/config.json`, and restore the original config when the job ends.

The phase covers:
- runtime config patching before delegation/execution begins
- merge policy for existing user-defined `agent_skills`
- real filesystem skill path resolution, normalization, and invalid-path rejection
- lifecycle-safe cleanup on success, failure, hung sessions, and interruption
- operator-visible logging and inspectable runtime snapshot data

The phase does not redesign Pilot's product-level skill model or require humans to author `agent_skills` manually.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions

- D-01: Keep Pilot's current category/manifest skill-selection architecture as the source of truth. Do not replace Pilot categories, manifest logic, or role policy with upstream defaults.
- D-02: Use GSD/OpenCode `agent_skills` only as runtime delivery plumbing. The runtime patch must write a per-job `agent_skills` mapping into the target project's `.planning/config.json` before execution-dependent steps begin.
- D-03: Build the runtime `agent_skills` payload from Pilot's already-resolved skill set for the job. Jobs with no categories or no matching skills must still run cleanly with an empty/no-op runtime patch.
- D-04: Support per-agent-type mapping for the GSD roles Pilot actually uses (planner, executor, verifier/checkers, debugger, and researchers where applicable).
- D-05: Use real filesystem skill paths that are visible from the spawned session context. Normalize and deduplicate them before writing config, and reject invalid or missing paths safely instead of writing broken config.
- D-06: Define an explicit merge policy for existing user-defined `agent_skills`, including whether Pilot appends or overwrites, which side wins, and how duplicates are normalized. Runtime patching must be deterministic and inspectable.
- D-07: Apply runtime patching before delegation/execution steps that depend on subagent spawning, and keep the intended mapping active through continuation and re-delegation within the same job.
- D-08: Restore or clean up runtime-injected `agent_skills` state after success, failure, hung-session handling, and cancellation/interruption. Do not leak one job's skill selection into later jobs.
- D-09: Provide concise operator-visible evidence for categories resolved, skills selected, agent-role mapping written, and merge/restore outcomes without dumping entire config blobs by default.

### the agent's Discretion

- Choose the concrete helper/module boundaries for config mutation and runtime skill patching.
- Choose the persisted snapshot format used for inspectability, as long as it stays concise and job-scoped.
- Choose the exact agent-role allowlist and mapping shape, as long as it covers Pilot-used GSD roles and remains deterministic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement and roadmap source
- `requirements/pilot-runtime-agent-skills-patching.md` - Canonical phase requirements and non-goals.
- `.planning/ROADMAP.md` - Phase 99 placement and dependency on Phase 98.

### Existing skill delivery patterns
- `src/core/skills.ts` - Manifest-only registry, category resolution, JIT installation, and cleanup behavior.
- `.planning/phases/74-required-categories-on-pilot-add/74-03-SUMMARY.md` - Current JIT install and cleanup pattern in the runner.
- `.planning/phases/74-required-categories-on-pilot-add/74-01-SUMMARY.md` - Current manifest-only skill architecture and category ownership.

### Existing runtime config and patching patterns
- `src/core/gsd-config.ts` - Lock-protected, atomic `.planning/config.json` mutation pattern.
- `.planning/phases/65-gsd-config-pre-seeding-for-autonomous-execution/65-01-SUMMARY.md` - Centralized config merge and write policy.
- `.planning/phases/65-gsd-config-pre-seeding-for-autonomous-execution/65-03-SUMMARY.md` - Runner-time config enforcement pattern.
- `src/core/models.ts` - File-driven, parser-safe patching pattern for installed GSD agent files.
- `.planning/phases/69-model-system-agent-frontmatter-patching/69-01-SUMMARY.md` - Deterministic discovered-agent patching and skip/fallback diagnostics.

### Current runtime integration points
- `src/core/runner.ts` - Current skill installation, launch lifecycle, and cleanup timing.
- `src/core/delegate.ts` - Existing skills hint added to delegation prompts.
- `src/commands/info.ts` - Existing job introspection surface for runtime metadata.

</canonical_refs>

<specifics>
## Specific Ideas

- Prefer a single runtime helper that can: resolve effective installed skill paths, build the per-agent map, apply the config patch, and restore the original config.
- Reuse the lock-safe config mutation strategy from `src/core/gsd-config.ts` instead of duplicating ad hoc JSON write logic in `runner.ts`.
- Follow Phase 69's discovered-agent filtering pattern so runtime mapping only targets real `gsd-*.md` agent files present in the installed project.
- Persist a concise job-scoped snapshot of what was injected so operators can inspect the resolved categories, selected skills, agent assignments, and restore outcome after the run.

</specifics>

<deferred>
## Deferred Ideas

None - the requirement doc includes optional ideas, but it does not explicitly move them to a later phase.

</deferred>

---

*Phase: 99-runtime-agent-skills-patching*
*Context gathered: 2026-03-26 via requirement doc inference*
