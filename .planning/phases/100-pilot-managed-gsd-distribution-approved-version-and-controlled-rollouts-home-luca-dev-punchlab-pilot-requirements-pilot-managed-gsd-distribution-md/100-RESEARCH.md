# Phase 100 Research - Managed GSD Distribution and Controlled Rollouts

**Date:** 2026-03-26
**Phase:** 100
**Source set:** `requirements/pilot-managed-gsd-distribution.md`, current Pilot command/core modules, Phase 50/55/64 summaries

## Question

What needs to change so Pilot owns GSD version policy explicitly instead of inheriting version behavior from whatever `get-shit-done-cc` happens to be installed locally?

## Current State

### What Pilot already has

- `src/core/setup.ts` already owns project install and refresh behavior around `get-shit-done-cc --opencode --local`.
- `src/commands/update.ts` already iterates managed projects, skips blocked ones, and continues through per-project failures.
- `src/commands/project.ts` and `src/commands/projects.ts` already provide natural operator surfaces for per-project state.
- `src/core/db.ts` already has a durable `projects` table, so GSD version state can become first-class project metadata without inventing new storage.
- `src/core/config.ts` already has layered config resolution, which is the right place for an explicit approved-version source of truth.
- Project installs already expose `.opencode/get-shit-done/VERSION`, and `doctor.ts` already reads it, so version detection has an existing filesystem signal.

### Where the product gap is now

- The effective installed version is still driven by the Pilot repo's current dependency resolution, not by an operator-owned approved version.
- `pilot setup --refresh` has no explicit version-policy guardrail for ahead/behind projects.
- `pilot update` reports success/failure but not managed rollout states such as already-current, ahead, or unknown.
- Approved version, project installed version, and drift are not explicit entities in the current data model.
- There is no dedicated operator control surface for intentionally changing the approved version.

## Recommendation

### 1. Make approved version a config-owned source of truth

Add a single explicit approved-version field to Pilot's config and treat it as authoritative:

- recommended config path: `gsd.approvedVersion`
- recommended default: the currently supported bundled installer version (`1.24.0`)

This satisfies the requirement that version policy be explicit and operator-controlled, while still allowing Pilot to keep using `get-shit-done-cc` internally.

### 2. Keep the distribution model simple for this phase

Recommended supported distribution model for this rollout:

- Pilot continues using `get-shit-done-cc` as the installer artifact.
- The approved version governs which exact installer version Pilot keeps locally and uses for project installs.
- Local package state becomes a derived cache, not the policy source.

Concretely:

- before setup/refresh/update uses the installer, Pilot checks the approved version
- if the locally installed `get-shit-done-cc` version differs, Pilot runs `bun add --exact get-shit-done-cc@<approvedVersion>` in the Pilot repo
- once synchronized, Pilot uses that exact installer to manage projects

Why this is the best fit now:

- aligns with the existing architecture from Phase 64
- avoids inventing a separate artifact cache and distribution pipeline in the same phase
- keeps the source of truth explicit while minimizing migration risk

### 3. Treat per-project version state as managed metadata, not a loose file read

Add explicit project-level metadata for the last known GSD state:

- `approved_gsd_version`
- `installed_gsd_version`
- `gsd_drift_status`
- `gsd_version_checked_at`
- `gsd_version_error`

Then back these fields with a shared helper that:

- reads `.opencode/get-shit-done/VERSION`
- validates/parses the version string
- classifies drift relative to the approved version
- persists the result back onto the project record

This gives Pilot a durable, inspectable managed-state model while still grounding the truth in the installed project artifact.

### 4. Use conservative drift rules

Recommended first-rollout drift states:

- `matches` - installed version equals approved version
- `behind` - installed version is lower than approved version
- `ahead` - installed version is higher than approved version
- `unknown` - missing/unreadable/invalid VERSION or comparison failure

Recommended safety rules:

- `pilot setup <dir>` on a new project installs the approved version
- `pilot setup --refresh` repairs only within the approved-version contract
- if a project is `ahead`, refresh must skip GSD reinstall and report the reason
- `pilot update` is allowed to update `behind` and `unknown` projects toward the approved version
- `pilot update` should not silently downgrade `ahead` projects; instead mark them `ahead/skipped` and require a future explicit downgrade path

This matches the PRD's safety intent without expanding scope to a fully general downgrade workflow.

### 5. Add a dedicated approved-version control surface

Recommended command surface:

- `pilot gsd-version` - show approved version, Pilot runtime installer version, and discovery status
- `pilot gsd-version set <version>` - intentionally update the approved version only; does not roll projects automatically

Why this is better than only using `pilot config set`:

- it makes GSD version policy a first-class Pilot product surface
- it gives truthful, purpose-built output instead of generic config plumbing
- it supports the required operator workflow: inspect -> set -> rollout

`pilot update` remains the rollout command.

### 6. Reuse existing operator surfaces for drift visibility

Recommended visibility surfaces for this phase:

- `pilot project <path>` - detailed approved/install/drift state for one project
- `pilot projects` - concise fleet view of install/drift state per project
- `pilot update` - rollout summary with action/result per project

`pilot status` does not need to change in the first rollout if the above surfaces become trustworthy and easy to read.

## Proposed Core Contracts

### Managed-version domain module

Recommended new module:

- `src/core/managed-gsd.ts`

Recommended responsibilities:

- validate approved-version strings
- read/write approved version from Pilot config
- resolve the locally installed Pilot runtime installer version
- converge the local installer to the approved version
- read installed per-project VERSION files
- classify drift and return a typed project GSD state object

Suggested exported shapes:

```ts
export type ManagedGsdDriftStatus = 'matches' | 'behind' | 'ahead' | 'unknown';

export interface ProjectGsdState {
  approvedVersion: string;
  installedVersion: string | null;
  driftStatus: ManagedGsdDriftStatus;
  checkedAt: string;
  error: string | null;
}
```

### Approved-version control helper

Recommended config behavior:

- add `gsd.approvedVersion?: string` to `ConfigFileSchema`
- add `approvedGsdVersion: string` to `PilotConfig`
- expose a shared setter that updates `~/.pilot/config.json` without requiring the generic config command to know about rollout semantics

### Project persistence helper

Recommended DB helper:

```ts
function updateProjectGsdState(path: string, state: ProjectGsdState | null): void;
```

This keeps setup/update/project commands from duplicating persistence logic.

## Key Risks And Mitigations

### Risk: version policy still leaks from package-manager state

Mitigation:

- treat config `gsd.approvedVersion` as the only policy source
- always compare the local installer version against the approved version before installs/rollouts
- make update output show both approved and runtime versions

### Risk: silent downgrade during refresh

Mitigation:

- inspect the installed project version before refresh
- if drift is `ahead`, skip reinstall, persist `ahead`, and report an explicit warning

### Risk: rollout corruption when one project fails

Mitigation:

- keep Phase 64's continue-through-failure loop
- persist per-project `gsdVersionError`
- report per-project outcome rows and final grouped counts

### Risk: bad VERSION file content crashes commands

Mitigation:

- parse invalid/missing VERSION as `unknown`
- never throw raw parsing errors into operator surfaces
- preserve project registration and managed metadata even when version detection fails

### Risk: semver comparison edge cases

Mitigation:

- add a dedicated version-comparison helper and focused tests for exact `x.y.z` values used by the product surface
- reject invalid operator input early in the control surface instead of silently normalizing unexpected formats

## Recommended Plan Split

### Plan 01 - Approved-version foundation

- add approved-version config authority
- add managed-GSD core helpers for validation, drift classification, and local installer convergence
- add project-level managed GSD persistence

### Plan 02 - Setup/refresh/update semantics

- enforce approved-version behavior in `setupProject()` and `pilot setup`
- rewrite `pilot update` into a controlled rollout surface with ahead/blocked/failure reporting
- persist project version state during setup/update

### Plan 03 - Operator control and drift visibility

- add dedicated approved-version control command(s)
- surface approved/install/drift state in `pilot project` and `pilot projects`
- make the new state machine-readable in JSON output

## Validation Architecture

### Test Infrastructure

- Framework: Vitest
- Config file: `package.json`
- Quick commands:
  - `npx vitest run test/core/managed-gsd.test.ts --reporter=dot`
  - `npx vitest run test/core/db.test.ts --reporter=dot -t "project gsd state"`
  - `npx vitest run test/core/setup.test.ts test/commands/setup.test.ts --reporter=dot -t "approved GSD|refresh"`
  - `npx vitest run test/commands/update.test.ts --reporter=dot -t "approved version|rollout|ahead|blocked"`
  - `npx vitest run test/commands/gsd-version.test.ts --reporter=dot`
  - `npx vitest run test/commands/project.test.ts --reporter=dot -t "GSD version|drift"`
- Full targeted suite:
  - `npx vitest run test/core/managed-gsd.test.ts test/core/db.test.ts test/core/setup.test.ts test/commands/setup.test.ts test/commands/update.test.ts test/commands/gsd-version.test.ts test/commands/project.test.ts --reporter=dot`
- Build gate: `npm run build`

### Nyquist Notes

- No Wave 0 work is needed; Vitest and build infrastructure already exist.
- Every implementation task can ship with a targeted automated command under 60 seconds.
- The full targeted suite plus build should run after the final execution wave.

## Research Result

Proceed with a three-plan implementation:

1. approved-version config/domain/persistence foundation
2. setup/refresh/update controlled rollout semantics
3. operator control surface and project drift visibility

This is the smallest change set that turns GSD distribution into a first-class Pilot capability without introducing a brand-new artifact distribution system in the same phase.

## Research Constraints

- Local repository inspection provided enough implementation context.
- External package documentation lookup was not required for the plan split.
