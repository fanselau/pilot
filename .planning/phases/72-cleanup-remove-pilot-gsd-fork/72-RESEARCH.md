# Phase 72: Cleanup - Remove pilot-gsd Fork - Research

**Researched:** 2026-03-16
**Domain:** Fork decoupling, submodule removal, and post-migration cleanup
**Confidence:** HIGH

## Summary

Pilot has already migrated runtime installation to upstream `get-shit-done-cc` (Phase 64), but the repository still contains direct fork coupling in three places: git submodule wiring (`.gitmodules` + `pilot-gsd/`), user-facing documentation (`README.md`, `docs/GETTING-STARTED.md`), and fork-specific AGENTS command surfaces (`gsd-setup-agents`, `gsd-lessons`) that are still invoked from source and tests.

The cleanup phase should be planned as a controlled decoupling pass, not a blanket string replace. There is still intentional migration logic in `src/core/setup.ts` that detects legacy `pilot-gsd` symlinks and removes them before running installer. Removing that too early can break older projects that never ran `pilot setup --refresh` after Phase 64. Sequence matters: verify migration completion first, then remove fork-era compatibility paths.

Upstream command inventory verification (local install of `get-shit-done-cc@1.24.0`) confirms `gsd-setup-agents` and `gsd-lessons` are not provided by upstream OpenCode command set. Those invocations are now the highest-risk runtime coupling because they can silently fail or time out in real usage even after submodule removal.

**Primary recommendation:** Execute Phase 72 in this order: (1) replace/remove fork-only AGENTS commands, (2) remove submodule + metadata, (3) clean source/test/doc references, (4) verify with search + targeted tests + full build/test.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `get-shit-done-cc` | `1.24.0` (installed, dependency `~1.24.0`) | Upstream GSD command/workflow distribution | Current installation contract for `pilot setup`/`pilot update`; already adopted in Phase 64 |
| `execa` | `^9.5.0` | Installer and command invocation from Node | Existing process execution primitive in setup/update/runner paths |
| `git` submodule tooling | system git | Remove `pilot-gsd` submodule cleanly | Submodule is still active (`git submodule status` shows `pilot-gsd`) |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `vitest` | `^2.1.0` | Regression coverage during decoupling | Validate setup/doctor/AGENTS command behavior after fork removal |
| `rg` (ripgrep) | n/a | Deterministic coupling audit | Final gate to ensure no active `pilot-gsd` references remain outside historical docs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Keep legacy AGENTS command stubs (`gsd-setup-agents`, `gsd-lessons`) | Remove feature paths or remap to upstream-supported flow | Keeping stubs hides runtime failures and leaves hidden fork dependency |
| Remove migration cleanup immediately | Keep migration cleanup for one release window, then remove | Immediate removal risks breaking unmigrated project `.opencode/` symlink layouts |
| Rewrite all historical planning artifacts | Limit edits to active docs/runtime/test code | Full history rewrite is high-noise and low product value |

**Installation:**
```bash
bun install
```

## Architecture Patterns

### Recommended Project Structure

```
repo-root/
├── .gitmodules                    # remove pilot-gsd entry
├── pilot-gsd/                     # remove submodule path
├── src/core/setup.ts              # migration compatibility policy
├── src/core/agents-md.ts          # fork-only command invocations
├── src/commands/setup.ts          # gsd-setup-agents invocation
├── src/commands/doctor.ts         # gsd-setup-agents check invocation
├── src/commands/lessons.ts        # gsd-lessons invocation
├── test/core/setup.test.ts        # pilot-gsd migration fixtures
├── test/core/agents-md.test.ts    # gsd-setup-agents fixtures
├── test/commands/lessons.test.ts  # gsd-lessons fixtures
├── README.md                      # stale submodule and PILOT_GSD_DIR docs
└── docs/GETTING-STARTED.md        # stale submodule, symlink, env-var docs
```

### Pattern 1: Two-Phase Decoupling (Compatibility then Removal)

**What:** Keep legacy migration logic until fleet refresh is complete; remove fork coupling after verified migration.
**When to use:** Any cleanup step that touches `setupProject()` migration behavior.
**Example:**
```typescript
// Source: src/core/setup.ts
if (target.includes('pilot-gsd')) {
  await unlink(linkPath);
  result.created.push(`Removed old pilot-gsd symlink: .opencode/${name}/`);
}
```

### Pattern 2: Capability-Backed Command Surfaces

**What:** Do not invoke commands that upstream installer does not ship.
**When to use:** AGENTS and lessons flows.
**Example:**
```text
# Source: temporary install of get-shit-done-cc@1.24.0 command directory
gsd-add-phase.md
gsd-plan-phase.md
gsd-execute-phase.md
...
# No gsd-setup-agents.md
# No gsd-lessons.md
```

### Pattern 3: Single Source of Truth for User Docs

**What:** Derive user-facing setup/update text from current command behavior, not historical fork setup.
**When to use:** README and getting-started refresh.
**Example:**
```typescript
// Source: src/index.ts
.command('setup <dir>')
.description('Set up project for Pilot (installs GSD commands)')

.command('update')
.description('Update GSD commands for all projects')
```

### Pattern 4: Explicit Submodule Removal Gate

**What:** Remove submodule only after migration verification passes.
**When to use:** Deleting `.gitmodules` entry and `pilot-gsd/` path.
**Example:**
```bash
# Source: verified current state
git submodule status
# -> pilot-gsd still present
```

### Anti-Patterns to Avoid

- **Delete-first submodule cleanup:** removing `pilot-gsd/` before project refresh can strand old symlinked setups.
- **Comment-only cleanup:** removing references from comments/docs but leaving `gsd-setup-agents` or `gsd-lessons` runtime invocations.
- **Docs-only cleanup:** updating README while leaving `docs/GETTING-STARTED.md` and tests stale.
- **Ignoring generated artifacts:** forgetting `dist/` refresh if release flow depends on committed build outputs.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Upstream command discovery | Hardcoded guessed command list | Inspect installed `get-shit-done-cc` command dir | Prevents drift and false assumptions |
| Submodule cleanup | Manual `.git/` surgery first | Standard git submodule removal workflow | Avoids broken index/module metadata states |
| Fork-reference audit | Manual spot edits | `rg`-based inventory + category triage | Ensures no active coupling points are missed |
| Setup migration detection | Generic symlink delete logic | Existing targeted legacy cleanup path in setup | Preserves backward compatibility during transition window |

**Key insight:** The hard part is not deleting files; it is preserving setup reliability while removing hidden runtime assumptions.

## Common Pitfalls

### Pitfall 1: Breaking Unmigrated Projects

**What goes wrong:** Old projects still linked to fork paths fail setup/doctor after cleanup.
**Why it happens:** Migration compatibility removed before refresh rollout.
**How to avoid:** Require `pilot setup --refresh` migration pass across registered projects first.
**Warning signs:** Broken symlink findings in doctor, missing `gsd-help.md`, stale `.opencode` entries.

### Pitfall 2: AGENTS Features Regress Silently

**What goes wrong:** `pilot setup` AGENTS generation and `pilot lessons` report timeouts/failures.
**Why it happens:** Commands `gsd-setup-agents` and `gsd-lessons` are fork-specific and not shipped upstream.
**How to avoid:** Replace with supported command strategy or disable with explicit UX copy.
**Warning signs:** Repeated null session results and warning-only behavior in setup/doctor/lessons.

### Pitfall 3: Documentation Drift After Runtime Cleanup

**What goes wrong:** Users follow submodule and `PILOT_GSD_DIR` instructions that no longer apply.
**Why it happens:** Source and docs updated in separate passes.
**How to avoid:** Update README and getting-started in same wave as code cleanup.
**Warning signs:** README still says "links pilot-gsd" while CLI says "installs GSD commands".

### Pitfall 4: Stale Historical References Confused with Active Coupling

**What goes wrong:** Cleanup scope balloons into rewriting historical phase artifacts.
**Why it happens:** Search results mix active runtime files and archived planning history.
**How to avoid:** Separate active runtime/docs/tests from historical planning records.
**Warning signs:** Large diff churn in `.planning/phases/*` with no runtime impact.

## Code Examples

Verified patterns from current sources:

### Upstream Installer Command (Current Standard)

```typescript
// Source: src/core/setup.ts
const installerBin = path.join(path.resolve(import.meta.dirname, '..', '..'), 'node_modules', '.bin', 'get-shit-done-cc');
const { exitCode, stderr } = await execa(installerBin, ['--opencode', '--local'], {
  cwd: absDir,
  timeout: 60_000,
  reject: false,
});
```

### Fork-Only AGENTS Command Invocation (Cleanup Target)

```typescript
// Source: src/commands/setup.ts
const agentsResult = await spawnAgentsMdSession({
  projectDir: absDir,
  command: 'gsd-setup-agents',
});
```

### Lessons Command Invocation (Cleanup Target)

```typescript
// Source: src/commands/lessons.ts
const result = await spawnAgentsMdSession({
  projectDir,
  command: 'gsd-lessons',
  timeoutMs: 120_000,
});
```

### Reference Audit Command

```bash
# Source: repository audit command used during this research
rg -n --hidden "pilot-gsd|PILOT_GSD_DIR|gsdDir" \
  --glob '!.git/**' --glob '!node_modules/**' --glob '!pilot-gsd/**'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| `pilot-gsd` submodule + `gsdDir` resolution | Upstream `get-shit-done-cc` installer (`--opencode --local`) | Phase 64 (2026-03-15) | Runtime no longer requires fork checkout |
| Symlink-based `.opencode` setup | Installer-managed real directories/files with sentinels | Phase 64 | Better portability and simpler health checks |
| Step-based delegation artifacts from fork | Intent-based delegation with inline prompt in Pilot | Phase 66 | Removed core workflow dependency on fork commands |

**Deprecated/outdated:**

- `PILOT_GSD_DIR` and submodule setup instructions in `README.md` and `docs/GETTING-STARTED.md`.
- Fork-specific AGENTS command assumptions in `src/core/agents-md.ts`, `src/commands/setup.ts`, `src/commands/doctor.ts`, and `src/commands/lessons.ts`.

## Open Questions

1. **Should legacy symlink migration support be removed in Phase 72 or retained for one more cycle?**
   - What we know: setup currently removes `pilot-gsd` symlinks explicitly before install.
   - What's unclear: whether all managed projects have already run `pilot setup --refresh`.
   - Recommendation: gate removal behind migration verification; otherwise keep and reword as legacy compatibility.

2. **How should AGENTS/lessons features behave post-fork?**
   - What we know: upstream OpenCode command set does not ship `gsd-setup-agents` or `gsd-lessons`.
   - What's unclear: whether replacement upstream commands or in-repo prompts should be used.
   - Recommendation: choose explicit behavior (remove command, map to supported flow, or inline prompt path) and update tests accordingly.

3. **How much historical planning cleanup is in scope?**
   - What we know: `.planning` contains many historical references to fork work.
   - What's unclear: whether to preserve historical fidelity or normalize all historical docs.
   - Recommendation: update active docs (`STATE`, `ROADMAP`, current phase files) and preserve historical phase artifacts unless user explicitly requests full rewrite.

## Sources

### Primary (HIGH confidence)

- `src/core/setup.ts` - legacy symlink cleanup, installer invocation, sentinels.
- `src/commands/setup.ts` - `gsd-setup-agents` invocation path.
- `src/commands/doctor.ts` - `gsd-setup-agents check` invocation path.
- `src/commands/lessons.ts` - `gsd-lessons` invocation path.
- `test/core/setup.test.ts` - pilot-gsd-specific migration fixtures.
- `test/core/agents-md.test.ts` - fork-only command fixtures.
- `test/commands/lessons.test.ts` - fork-only command fixtures.
- `README.md` and `docs/GETTING-STARTED.md` - stale submodule/env-var coupling.
- `.gitmodules` - active `pilot-gsd` submodule metadata.
- `git submodule status` - confirms submodule still registered.
- Local installed `node_modules/get-shit-done-cc/package.json` (`1.24.0`) and `bin/install.js` - upstream install behavior and command flattening source (`commands/gsd/*` only).
- Temporary isolated install command output (`get-shit-done-cc --opencode --global --config-dir <tmp>`) - verified upstream command inventory (no `gsd-setup-agents`/`gsd-lessons`).
- Context7 `/glittercowboy/get-shit-done` - authoritative current installer command docs.
- `https://raw.githubusercontent.com/glittercowboy/get-shit-done/main/README.md` - official runtime install and command reference.

### Secondary (MEDIUM confidence)

- `requirements/gsd-09-cleanup.md` - intended cleanup targets and migration order.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - versions and installer behavior verified in local package + Context7 + official README.
- Architecture: HIGH - coupling points are directly observable in source/tests/docs.
- Pitfalls: HIGH - derived from concrete runtime invocations and migration behavior.

**Research date:** 2026-03-16
**Valid until:** 2026-04-15 (30 days)
