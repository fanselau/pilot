# Phase 40 Research: Default Skills Library - Bundled Skill Catalog for Pilot

## Scope

- Implement default skill library bootstrapping on top of existing Phase 37 skills system.
- Keep runner behavior unchanged (skills are still injected from `~/.pilot/skills/` by category at launch time).
- Add setup-time recommendation/install flow and a manual bootstrap command.
- Preserve current non-fatal resilience pattern: setup should succeed even if skill installs fail.

## Existing Architecture Findings

### Current Skills Core (`src/core/skills.ts`)

- Existing primitives are strong and reusable: `addSkill`, `tagSkill`, `listSkills`, `syncManifest`, `resolveSkillsForJob`, `injectSkills`, `cleanupInjectedSkills`.
- `addSkill` already handles multi-skill repos (`available` list, `--skill`, `--all`) and writes manifest entries with optional categories.
- Manifest handling is resilient and atomic (`loadManifest` graceful fallback, `saveManifest` temp file + rename).
- Categories contract is already enforced in CLI layer (`skills add --categories`, `skills tag --categories`) per quick-070.

### Setup Flow (`src/commands/setup.ts`, `src/core/setup.ts`)

- `core/setup.ts` is pure setup mechanics (filesystem/git), no UX prompts.
- `commands/setup.ts` is the right orchestration point for optional post-setup behavior.
- There are currently no dedicated setup command tests; setup behavior is only indirectly covered (e.g. in `test/commands/add.test.ts` setup validation paths).

### CLI Wiring (`src/index.ts`, `src/commands/skills.ts`)

- Skills subcommand group exists (`list`, `add`, `remove`, `categories`, `tag`, `sync`) and follows clean command-module patterns.
- Adding `skills bootstrap` and optional `skills recommend` naturally fits this structure.

### Test Surface

- `test/core/skills.test.ts`: currently covers resolve/inject/cleanup; does not cover default catalog, stack detection, or bootstrap orchestration.
- `test/commands/skills.test.ts`: command-level behavior is mocked and easy to extend for new subcommands.
- `test/commands/setup` does not exist yet (gap to close for setup-offer flow).

## Recommended Design

### 1) Add Default Catalog + Stack Detection in Core

Implement in `src/core/skills.ts` (or split constants to `src/core/default-skills.ts` and keep logic in `skills.ts`):

- `TIER1_SKILLS` (always recommended) and `STACK_SKILLS` (keyed by stack signal).
- `detectProjectStack(projectDir): DetectedStack` using filesystem/package signals:
  - `package.json` deps/devDeps: react/next/tanstack/tailwindcss/vitest/jest
  - `wrangler.toml`/`wrangler.json` -> cloudflare
  - `tsconfig.json` -> typescript
  - `Cargo.toml` -> rust
  - `go.mod` -> golang
  - `requirements.txt`/`pyproject.toml` -> python
  - `*.prisma` or drizzle config -> database
- `recommendDefaultSkills(projectDir, tier): Recommendation`:
  - merge Tier 1 + detected Tier 2 (or tier-filtered)
  - de-duplicate by `(ref, skill)` pair
  - include detected stack labels for UX output

### 2) Add Non-Fatal Bootstrap Orchestrator in Core

Add `bootstrapDefaultSkills(options): BootstrapResult` in core.

- Calls `recommendDefaultSkills`.
- For each recommendation, calls `addSkill(ref, { skill })`.
- Applies categories via `tagSkill` only when needed.
- Continues on per-item failure (collect warnings/errors, do not throw by default).
- Returns structured counts for command/setup summaries:
  - attempted, installed, skipped, failed, tagged, categoriesTouched, detectedStack.

Important alignment with current patterns:

- Do not call `skillsAddCommand` from setup/core (that path uses `process.exit` on errors).
- Use core functions directly so setup remains resilient and testable.

### 3) Add CLI Commands

In `src/commands/skills.ts` and `src/index.ts`:

- `pilot skills bootstrap`
  - flags: `--yes`, `--tier <1|2|all>` (nice-to-have can be implemented now with minimal extra cost)
  - interactive behavior when no `--yes`: show detected stack + recommended count and prompt confirmation
  - non-interactive behavior with `--yes`: install immediately
- `pilot skills recommend` (nice-to-have)
  - no installation, only prints what would be installed (ref, skill, categories, tier origin)

### 4) Integrate Optional Offer into `pilot setup`

In `src/commands/setup.ts`:

- After successful setup + optional owner registration:
  - detect stack
  - print detected stack summary
  - ask: install recommended skills? (default yes)
  - if accepted, run bootstrap and print summary
- Guardrails:
  - skip prompt in JSON mode (or add explicit `--with-skills`/`--no-skills` later if needed)
  - if installer tooling/network fails, warn and continue (setup remains success)

## File-Level Change Map

- `src/core/skills.ts`
  - add default catalog constants (or re-export from new file)
  - add stack detection helpers
  - add recommendation builder
  - add bootstrap installer orchestrator with non-fatal result model
- `src/core/default-skills.ts` (optional but recommended)
  - catalog constants/types only to keep `skills.ts` maintainable
- `src/commands/skills.ts`
  - add `skillsBootstrapCommand`
  - add `skillsRecommendCommand` (nice-to-have)
- `src/index.ts`
  - register `skills bootstrap` and optional `skills recommend`
  - wire bootstrap flags: `--yes`, `--tier <1|2|all>`
- `src/commands/setup.ts`
  - append post-setup optional bootstrap flow
  - keep non-fatal behavior for install failures
- `test/core/skills.test.ts`
  - add tests for detection/recommend/bootstrap logic and dedupe
- `test/commands/skills.test.ts`
  - add bootstrap/recommend command tests (flag parsing, output, failure messaging)
- `test/commands/setup.test.ts` (new)
  - add focused tests for setup-offer integration and non-fatal install failure behavior

## Dependency and Wave Implications

### Wave 1 (Core Foundation)

- `src/core/skills.ts` (+ optional `src/core/default-skills.ts`)
- `test/core/skills.test.ts`

Why first: all command/setup integration depends on stable recommendation/bootstrap APIs.

### Wave 2 (Skills CLI Surface)

- `src/commands/skills.ts`, `src/index.ts`
- `test/commands/skills.test.ts`

Parallelizable with Wave 3 only after Wave 1 APIs are merged.

### Wave 3 (Setup Integration)

- `src/commands/setup.ts`
- `test/commands/setup.test.ts` (new)

Depends on Wave 1 bootstrap API; can proceed independently of Wave 2 command wiring once core API is stable.

### Wave 4 (Regression/Full Verification)

- run command and core tests + full suite/build
- ensure no behavior regressions in existing skills/add/setup flows

## Requirement Mapping to Concrete Tasks

### Must-Have Mapping

| Requirement | Concrete Implementation Task |
| --- | --- |
| Default skills catalog in source (Tier 1 + Tier 2) | Add `TIER1_SKILLS` + `STACK_SKILLS` constants and typed catalog entries in core |
| Stack detection logic (package/tsconfig/wrangler/etc.) | Implement `detectProjectStack(projectDir)` with explicit signal checks |
| `pilot setup` offers skill installation | Add post-setup detect + prompt + bootstrap call in `setupCommand` |
| `pilot skills bootstrap` command | Add `skillsBootstrapCommand` + index wiring |
| `--yes` for non-interactive bootstrap | Parse flag in index and bypass prompt in command |
| Auto-tag categories during install | Ensure bootstrap applies categories via `addSkill(...categories)` and/or `tagSkill` |
| Graceful failure when installer unavailable | Catch per-install failures in bootstrap/setup and warn; do not exit setup with failure |
| All existing tests pass | Add/adjust tests, then run full `npm test` and `npm run build` |

### Nice-to-Have Mapping

| Requirement | Concrete Implementation Task |
| --- | --- |
| `--tier 1\|2\|all` on bootstrap | Add tier filter in recommendation builder + command flag parsing |
| Cache detection results to avoid re-prompt | Defer unless required: add marker file in project or config flag; currently no existing cache mechanism |
| `pilot skills recommend` dry preview | Add command that prints recommendations from core without install side effects |

Recommendation: implement `--tier` and `skills recommend` in Phase 40; defer detection caching unless explicitly prioritized.

## Risks and Pitfalls

- Prompt behavior in automation: setup is often run by scripts/agents; interactive prompting must be skippable (`--yes` and/or non-TTY fallback).
- Setup reliability regression: skill bootstrap must never make core setup fail; treat install errors as warnings.
- Duplicate catalog installs: multi-source recommendations can overlap; dedupe before install attempts.
- Category drift: avoid overwriting user custom tags when a skill already exists; merge categories instead of replace.
- Excessive filesystem scanning: stack detection should be bounded (root-level checks + small-depth targeted checks), not full recursive traversal.
- Command-layer `process.exit` traps: do not reuse command functions from setup/core; always call core APIs.

## Verification Plan

### Targeted Tests During Implementation

- `npm test -- test/core/skills.test.ts`
- `npm test -- test/commands/skills.test.ts`
- `npm test -- test/commands/setup.test.ts` (after added)
- `npm test -- test/commands/add.test.ts` (regression on categories/setup validation)

### Full Regression Gate

- `npm test`
- `npm run build`

### Manual Smoke Checks

- `pilot skills recommend`
- `pilot skills bootstrap --yes`
- `pilot skills bootstrap --tier 1 --yes`
- `pilot setup <project-dir>` and confirm optional recommendation/install path

## Planning Notes (Actionable Defaults)

- Prefer a dedicated `src/core/default-skills.ts` for catalog constants to keep `src/core/skills.ts` from becoming monolithic.
- Keep setup prompt logic in command layer; keep all detection/recommend/install logic in core for testability.
- Use structured `BootstrapResult` objects instead of parsing human output in tests.
- Treat caching as explicit defer unless product wants stateful prompt suppression in this phase.
