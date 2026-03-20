# Phase 65: GSD Config Pre-seeding for Autonomous Execution - Research

**Researched:** 2026-03-15
**Domain:** Pilot setup/runtime config orchestration for vanilla GSD (`.planning/config.json` lifecycle)
**Confidence:** HIGH

## User Constraints

- No phase `CONTEXT.md` exists for Phase 65.
- Scope source is `requirements/gsd-02-config-preseeding.md` plus Phase 64 implementation context.
- ROADMAP goal is placeholder; implementation intent must be derived from requirement + existing code patterns.

<phase_requirements>
## Phase Requirements (Inferred IDs from `gsd-02-config-preseeding.md`)

| ID | Description | Research Support |
|----|-------------|-----------------|
| GSD02-01 | During `pilot setup`, ensure `.planning/` exists and write/merge `.planning/config.json` | Architecture Patterns: Pattern 1 + Pattern 2 |
| GSD02-02 | Preseed autonomous-safe config values (`mode: yolo`, `workflow.auto_advance: true`, `model_profile: balanced`, workflow toggles, planning/git keys) | Standard Stack + Code Examples |
| GSD02-03 | Deep merge with explicit PILOT_WINS keys; preserve user customization elsewhere | Architecture Patterns: Pattern 2; Common Pitfalls 1 |
| GSD02-04 | Enforce pre-job config assertion before any GSD spawn (`mode` + `auto_advance`) | Architecture Patterns: Pattern 3 |
| GSD02-05 | Use atomic writes (`config.json.tmp` -> rename) | Code Examples + Common Pitfalls 4 |
| GSD02-06 | Handle lifecycle where GSD operations recreate `.planning/` (coordination item with future gsd-04 work) | Open Questions 1 |
| GSD02-07 | Address per-project config patching concurrency (locking or explicit non-support) | Architecture Patterns: Pattern 4 |
| GSD02-08 (Nice-to-have) | `pilot config <project> set ...` and setup granularity flag | Open Questions 2 |

</phase_requirements>

## Summary

Phase 65 should be planned as a **config lifecycle hardening** phase, not just a one-time setup write. Upstream GSD 1.24.0 defaults to interactive behavior (`mode: interactive`, `workflow.auto_advance: false`), and Pilot’s headless runner can block at phase transitions/checkpoints unless config is proactively forced into autonomous-safe values.

The established implementation path in this repo is: keep installer orchestration in `src/core/setup.ts`, keep runtime safeguards in `src/core/runner.ts`, and use idempotent helper modules in `src/core/*` for merge/write logic. Existing code already uses `execa` with `reject: false`, project-level job serialization in DB transactions, and atomic temp-write + rename patterns (skills manifest), which are directly reusable here.

Primary planning risk is **partial or stale config drift**: setup may run once, but later workflows (or future `gsd-new-project --auto` flows) can recreate `.planning`. The phase should therefore include both setup-time pre-seeding and runner-time assertion/re-application so every spawned GSD command sees safe config.

**Primary recommendation:** Implement a single idempotent `ensureAutonomousGsdConfig(projectDir)` helper, call it after installer in setup and before every runner spawn, with deep merge + explicit PILOT_WINS + atomic write.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `get-shit-done-cc` | `~1.24.0` | Upstream GSD command/workflow distribution and config contract | Already adopted in Phase 64; defines actual config schema/behavior Pilot must satisfy |
| Node.js `fs/promises` + `fs` | Node 22 runtime (`@types/node ^22`) | Read/parse/write/rename config files | Native APIs already used across Pilot; no extra dependency for JSON config lifecycle |
| `execa` | `^9.5.0` | Installer/process invocation with non-throwing failure handling (`reject: false`) | Existing setup/update/runner pattern in codebase |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `proper-lockfile` | `^4.1.2` | Inter-process lock for file mutation critical sections | Use if config writes can race; otherwise document same-project serialization constraint |
| `vitest` | `^2.1.0` | Regression tests for setup merge semantics and runner assertion behavior | Required for phase safety because this logic is orchestration-critical |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Reusing in-repo merge/write helper | New deep-merge dependency | Unnecessary dependency for narrow JSON shape; existing repo already has merge helpers |
| Locking with `proper-lockfile` | Rely on project serialization only | Viable today because jobs are serialized per project, but weaker if future concurrency changes |
| Setup-only seeding | Runner-only patching | Insufficient; setup-only misses drift, runner-only leaves fresh projects unsafe until first run |

**Installation:**
```bash
# No new dependencies required for Must-Have scope
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/gsd-config.ts      # NEW: config merge, PILOT_WINS enforcement, atomic write
├── core/setup.ts           # call ensureAutonomousGsdConfig() after installer step
├── core/runner.ts          # pre-spawn assertion/re-apply before every GSD command
└── commands/setup.ts       # no heavy logic; just surfaces setup results

test/
├── core/gsd-config.test.ts # NEW: merge + PILOT_WINS + atomic write semantics
├── core/setup.test.ts      # extend: setup creates/merges .planning/config.json
└── core/runner*.test.ts    # extend: pre-job assertion calls re-apply when drifted/missing
```

### Pattern 1: Centralized Config Lifecycle Helper

**What:** A single helper owns read/parse/default/merge/assert/write for `.planning/config.json`.
**When to use:** Setup-time preseed and runtime pre-spawn validation.
**Example:**
```typescript
// Source: repository pattern (src/core/setup.ts + src/core/skills.ts) and GSD config contract
export async function ensureAutonomousGsdConfig(projectDir: string): Promise<void> {
  // 1) ensure .planning dir exists
  // 2) read existing config if present
  // 3) deep-merge with defaults
  // 4) force PILOT_WINS keys
  // 5) write atomically (.tmp -> rename)
}
```

### Pattern 2: Deep Merge with Explicit PILOT_WINS Set

**What:** Merge nested objects key-by-key, but always override specific safety-critical keys.
**When to use:** Existing user config present.
**PILOT_WINS (from requirement):**
- `mode`
- `workflow.auto_advance`
- `workflow.node_repair`
- `workflow.ui_safety_gate`

All other keys: preserve user-provided values when present.

### Pattern 3: Pre-Spawn Config Assertion in Runner

**What:** Before spawning any GSD command, assert `mode: yolo` and `workflow.auto_advance: true`; re-apply if missing or wrong.
**When to use:** Every `spawnAndWait` call path in `runner.ts`.
**Why:** Protects against drift/recreation of `.planning/config.json` after setup.

### Pattern 4: Concurrency Contract

**What:** Keep per-project config writes safe either by lock or by explicit serialization contract.
**When to use:** Runtime patching that can occur near command spawn.
**Current repo evidence:** `claimNextLaunchable()` enforces one running job per project in a DB transaction.

### Anti-Patterns to Avoid

- **Blind overwrite of `config.json`:** destroys user settings and violates requirement merge rules.
- **String-based JSON editing:** brittle and error-prone for nested workflow/planning/git objects.
- **Non-atomic writes:** risks partial reads by concurrent GSD invocations.
- **Assuming setup is enough:** misses runtime drift cases and recreated `.planning/` directories.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Config write safety | Ad hoc write sequence | Temp file + atomic rename | Prevents torn/partial config reads |
| Merge policy | One-level object spread | Recursive merge with explicit PILOT_WINS map | Nested `workflow/planning/git` keys need deterministic policy |
| Cross-process lock | Custom lock file protocol | `proper-lockfile` (if locking is chosen) | Existing dependency with stale/retry handling |
| Spawn failure handling | Manual try/catch wrappers around child processes | `execa(..., { reject: false })` pattern already used | Consistent result handling without thrown subprocess errors |

**Key insight:** The risky part here is lifecycle correctness, not JSON syntax. Reuse existing repository patterns for atomicity, merge behavior, and spawn guards.

## Common Pitfalls

### Pitfall 1: Overwriting User Configuration

**What goes wrong:** Setup writes a full static object and drops user custom keys.
**Why it happens:** Using default template assignment instead of merge policy.
**How to avoid:** Deep merge existing -> defaults, then apply PILOT_WINS overrides only.
**Warning signs:** User-defined git/planning/workflow keys disappear after setup.

### Pitfall 2: Mixing Old/New Key Shapes Incorrectly

**What goes wrong:** Writes legacy `depth` or malformed parallelization structure.
**Why it happens:** Copying config from old fork assumptions.
**How to avoid:** Write `granularity`; allow/keep existing `parallelization` object but set autonomous-safe value in supported shape.
**Warning signs:** GSD tools silently fall back to defaults despite config file existing.

### Pitfall 3: Missing Runtime Re-assertion

**What goes wrong:** Jobs hang later even though setup passed once.
**Why it happens:** `.planning/config.json` changed or was recreated after setup.
**How to avoid:** Runner pre-spawn assertion + re-apply before every GSD command.
**Warning signs:** Blocking prompts reappear mid-pipeline in headless runs.

### Pitfall 4: Non-atomic Config Writes

**What goes wrong:** GSD reads half-written JSON and fails or falls back.
**Why it happens:** Direct write to final path while another process reads.
**How to avoid:** Write `config.json.tmp`, then rename to `config.json`.
**Warning signs:** Intermittent JSON parse failures during busy automation windows.

### Pitfall 5: Confusing Persistent and Ephemeral Auto Flags

**What goes wrong:** Clearing or mis-setting wrong flag disables intended automation.
**Why it happens:** Treating `workflow.auto_advance` and `workflow._auto_chain_active` as equivalent.
**How to avoid:** Keep `auto_advance` persistent (config policy), leave `_auto_chain_active` to GSD workflow orchestration.
**Warning signs:** Unexpected chain behavior after manual vs auto invocations.

## Code Examples

Verified patterns from official sources and current repo:

### Atomic Config Write

```typescript
// Source: Node.js fs rename docs + existing pattern in src/core/skills.ts
import { writeFile, rename } from 'node:fs/promises';

const tmpPath = `${configPath}.tmp`;
await writeFile(tmpPath, JSON.stringify(nextConfig, null, 2) + '\n', 'utf8');
await rename(tmpPath, configPath);
```

### Non-throwing Installer / Command Invocation

```typescript
// Source: Execa docs + existing src/core/setup.ts pattern
const { exitCode, stderr } = await execa(installerBin, ['--opencode', '--local'], {
  cwd: projectDir,
  timeout: 60_000,
  reject: false,
});

if (exitCode !== 0) {
  // handle failure path explicitly
}
```

### Runtime Guard Before Spawn

```typescript
// Source: recommended Phase 65 pattern mapped to existing runner spawn point
await ensureAutonomousGsdConfig(cwd);
await validateProjectConfig(cwd); // existing opencode.json safety check
// ...spawn GSD command
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| `pilot-gsd` symlink-managed install assumptions | Vanilla `get-shit-done-cc` installer + upstream config contract | Phase 64 / 2026-03-15 | Pilot must own runtime config safety explicitly |
| `depth` config key | `granularity` (with migration support) | GSD 1.24.x | New writes should use `granularity` only |
| Setup-only confidence in config stability | Setup + runtime assertion model | Needed for autonomous headless reliability | Prevents later hangs from config drift |

**Deprecated/outdated:**

- `depth` as canonical key: migrated to `granularity` in upstream config libs.
- Assuming upstream defaults are autonomous-safe: upstream template is interactive-first.
- Any new use of `gsdDir`/`pilot-gsd` config plumbing: removed in Phase 64.

## Open Questions

1. **Where to hook post-`gsd-new-project` reapply in current Pilot code?**
   - What we know: Requirement calls out `runInitProject()` coordination, but current `JobScope`/delegate flow in Pilot does not expose that function/path directly.
   - What's unclear: Exact current codepath for future gsd-04 integration.
   - Recommendation: Implement robust pre-spawn assertion now; add explicit post-init reapply task when gsd-04 introduces/uses init-project path.

2. **Should Nice-to-Have CLI config editing be included in Phase 65 scope?**
   - What we know: Requirement labels project-level `pilot config <project> set ...` and setup granularity flag as nice-to-have.
   - What's unclear: Whether planner should include these in must-have wave.
   - Recommendation: Keep Phase 65 focused on autonomous safety must-haves; open a follow-up phase for UX/config commands.

3. **Locking strategy decision:**
   - What we know: Current DB launch flow serializes jobs per project, reducing concurrent write risk.
   - What's unclear: Whether future multi-runner or same-project parallel execution is planned.
   - Recommendation: Either (a) explicitly document same-project concurrency unsupported, or (b) add `proper-lockfile` around config writes now for future-proofing.

## Sources

### Primary (HIGH confidence)

- `requirements/gsd-02-config-preseeding.md` - Must-have payload, merge policy, lifecycle constraints.
- `.planning/ROADMAP.md` - Phase 65 scope/dependency context.
- `.planning/STATE.md` - Phase 64 completion status and decisions.
- `.planning/phases/64-gsd-installation-switch/64-01-SUMMARY.md` - installer dependency switch context.
- `.planning/phases/64-gsd-installation-switch/64-02-SUMMARY.md` - setup/update/doctor rewrite patterns.
- `.planning/phases/64-gsd-installation-switch/64-03-SUMMARY.md` - current test/mocking conventions.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/33dcb775db9d51c4fbb9ec3adc874264f384b481/get-shit-done/templates/config.json` - upstream default interactive config.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/33dcb775db9d51c4fbb9ec3adc874264f384b481/docs/USER-GUIDE.md` - config schema and workflow toggle semantics.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/33dcb775db9d51c4fbb9ec3adc874264f384b481/get-shit-done/bin/lib/core.cjs` - config loading/normalization behavior.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/33dcb775db9d51c4fbb9ec3adc874264f384b481/get-shit-done/workflows/execute-phase.md` - `--no-transition`, auto-chain handling.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/33dcb775db9d51c4fbb9ec3adc874264f384b481/get-shit-done/workflows/execute-plan.md` - `workflow.node_repair` + `workflow.node_repair_budget` behavior.
- Context7 `/websites/nodejs_api` - `fs.rename` overwrite/rename semantics.
- Context7 `/sindresorhus/execa` - `reject: false` non-throwing failure handling.
- Context7 `/moxystudio/node-proper-lockfile` - lock/release usage for file mutation critical sections.

### Secondary (MEDIUM confidence)

- `https://registry.npmjs.org/get-shit-done-cc/1.24.0` - package metadata, repo linkage, exact published version context.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** - direct package metadata, repo code, and current project dependency graph align.
- Architecture: **HIGH** - built from current Pilot code paths + official GSD workflow docs.
- Pitfalls: **HIGH** - directly evidenced by requirement constraints and upstream config defaults.

**Research date:** 2026-03-15
**Valid until:** 2026-04-14 (30 days)
