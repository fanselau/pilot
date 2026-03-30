# Phase 99 Research - Runtime `agent_skills` Patching

**Date:** 2026-03-26
**Phase:** 99
**Source set:** `requirements/pilot-runtime-agent-skills-patching.md`, current Pilot core modules, Phase 65/69/74 summaries

## Question

What needs to change so Pilot can keep owning skill selection while using runtime `agent_skills` in `.planning/config.json` as explicit per-job delivery plumbing?

## Current State

### What Pilot already does well

- `src/core/skills.ts` is the current source of truth for skill selection:
  - manifest-only registry (`repo`, `skill`, `categories`)
  - `resolveSkillsForJob(categories)` for category matching
  - `installSkillsForJob(categories, projectDir)` for JIT installation into `.opencode/skill/<name>`
  - `cleanupInstalledSkills(projectDir)` for post-run cleanup
- `src/core/runner.ts` already installs skills before delegation and removes the injected `.opencode/skill` directory in `finally`.
- `src/core/gsd-config.ts` already owns lock-safe, atomic `.planning/config.json` writes.
- `src/core/models.ts` already has a strong pattern for file-driven patching against real installed `gsd-*.md` agent files.

### Where the gap is now

- Skill delivery is still implicit: installed skill directories are discovered by OpenCode/GSD rather than assigned explicitly to agent roles.
- Pilot has no runtime `agent_skills` merge/restore policy.
- There is no job-scoped record of which skill map was active during a run.
- Current cleanup removes installed skills but does not restore config because config is not being patched yet.

## Recommendation

### 1. Keep selection logic unchanged; add a runtime transport layer

Do not change how Pilot decides which skills matter. Keep this flow:

`job categories -> resolveSkillsForJob() -> installed skill directories -> runtime agent_skills map`

The new work should start after Pilot has already resolved and installed skills for the job.

### 2. Materialize the runtime map from real installed directories

Use the installed project-local directories under:

- `<projectDir>/.opencode/skill/<skillName>`

Then normalize each entry by:

- confirming the directory exists
- converting to an absolute normalized path
- deduplicating repeated paths
- rejecting missing or invalid directories without failing the job

This satisfies the requirement that the written paths are real, session-visible filesystem paths.

### 3. Use an explicit additive merge policy

Recommended policy:

- preserve the exact pre-run `agent_skills` block for restoration
- during runtime, merge per targeted agent as:
  - existing user-defined array first
  - Pilot-generated paths appended second
  - duplicates removed after normalization
- agents Pilot does not target remain unchanged

Why this policy:

- it avoids silently overwriting user config
- it keeps Pilot-generated delivery active for the current job
- restoration can still return the config to the exact original state

### 4. Scope the runtime patch to the whole job launch

Apply the patch once in `launch()` after JIT installation and before delegation starts.

Keep it active for the entire job so these paths all see the same skill map:

- initial delegation
- plan/execute/verify steps
- judge-driven continuation and re-delegation in the same launch

Restore it once in the job `finally` block, before removing `.opencode/skill`.

### 5. Persist a concise runtime snapshot

Store a job-scoped JSON snapshot on the job record so operators can inspect:

- resolved categories
- selected skills
- invalid/missing skill entries that were skipped
- final per-agent map written
- merge policy used
- restore status (`pending`, `restored`, `skipped`, `failed`)

This is the cleanest way to satisfy "deterministic and inspectable" without depending on transient runner stderr.

## Proposed Core Contracts

### Persisted snapshot

Recommended job field:

- `runtime_skill_snapshot TEXT NULL`

Recommended parsed shape:

```ts
type RuntimeAgentSkillsSnapshot = {
  categories: string[];
  selectedSkills: string[];
  invalidSkills: string[];
  agentSkills: Record<string, string[]>;
  mergePolicy: 'append-user-then-pilot';
  applied: boolean;
  restoreStatus: 'pending' | 'restored' | 'skipped' | 'failed';
  restoreError: string | null;
};
```

### Runtime helper module

Recommended new module:

- `src/core/runtime-agent-skills.ts`

Recommended responsibilities:

- discover target GSD agent names from `.opencode/agents/gsd-*.md`
- resolve installed skill directories for the current job
- build deterministic `agent_skills` entries
- apply the merged config patch using lock-safe config mutation helpers
- restore the exact original `agent_skills` block
- return both a persisted snapshot and a private restore handle

### Config mutation primitive

Recommended addition to `src/core/gsd-config.ts`:

- a shared lock-safe `mutatePlanningConfig(projectDir, updater)` helper

Reason:

- avoid duplicating lock/retry/tmp-file logic in another module
- keep `.planning/config.json` mutation centralized, like Phase 65 intended

## Target Agent Policy

For the first rollout, use one stable allowlist covering the roles Pilot actually uses in phase jobs:

- `gsd-planner`
- `gsd-roadmapper`
- `gsd-executor`
- `gsd-debugger`
- `gsd-phase-researcher`
- `gsd-project-researcher`
- `gsd-research-synthesizer`
- `gsd-codebase-mapper`
- `gsd-verifier`
- `gsd-plan-checker`
- `gsd-integration-checker`

Then intersect that allowlist with the discovered `gsd-*.md` files in the target project before writing config.

For the first rollout, it is acceptable for each targeted agent to receive the same deduped skill-path list. The requirement asks for per-agent mapping, not per-agent differentiated ranking.

## Key Risks And Mitigations

### Risk: stale skill leakage across jobs

Mitigation:

- restore the exact original `agent_skills` block in `finally`
- remove installed `.opencode/skill` directories after restore
- persist restore status in the job snapshot for debugging

### Risk: corrupt or torn config writes

Mitigation:

- reuse Phase 65 lock + tmp-file + rename strategy
- do not write config from ad hoc runner code

### Risk: targeting agents that are not really installed

Mitigation:

- use Phase 69's discovered-agent pattern
- only write keys for discovered allowlisted `gsd-*.md` files

### Risk: empty skill selection breaking jobs

Mitigation:

- treat empty category resolution or zero valid paths as a no-op snapshot
- do not fail the job when nothing needs patching

### Risk: rollout against older upstream versions

Mitigation:

- keep the patch helper non-fatal when it cannot build a valid map
- preserve current job execution path when the generated map is empty

Capability/version detection is useful, but it is not required for the first plan because the current requirement does not lock it as a must-have.

## Recommended Plan Split

### Plan 01 - Foundation

- add snapshot types + DB persistence
- add shared config mutation primitive
- add runtime agent-skills helper and focused tests

### Plan 02 - Runner and operator visibility

- apply and restore runtime patch in `runner.ts`
- persist snapshot updates across success/failure/restore paths
- surface the snapshot in `pilot info`
- add recovery and command-level regressions

## Validation Architecture

### Test Infrastructure

- Framework: Vitest
- Config file: `package.json` (`npm test`) with repo-standard `vitest run`
- Quick commands:
  - `npx vitest run test/core/db.test.ts --reporter=dot -t "runtime skill snapshot"`
  - `npx vitest run test/core/runtime-agent-skills.test.ts --reporter=dot`
  - `npx vitest run test/core/runner-recovery.test.ts --reporter=dot -t "runtime agent_skills|agent skills patch"`
  - `npx vitest run test/commands/info.test.ts --reporter=dot -t "runtime skills"`
- Full targeted suite:
  - `npx vitest run test/core/db.test.ts test/core/runtime-agent-skills.test.ts test/core/runner-recovery.test.ts test/commands/info.test.ts --reporter=dot`
- Build gate: `npm run build`

### Nyquist Notes

- No Wave 0 framework work is needed; Vitest and build infrastructure already exist.
- Each code-producing task should ship with a focused automated command under 60 seconds.
- Full targeted suite plus build should run after the final wave.

## Research Result

Proceed with a two-plan implementation:

1. foundational runtime patching primitives and snapshot persistence
2. runner integration plus concise operator introspection

This matches the requirement without redesigning Pilot's skill product model.

## Research Constraints

- Local repository inspection provided enough implementation context.
- Context7 documentation lookup was unavailable because the API quota was exhausted during this run.
