# Phase 100: Pilot - Managed GSD Distribution, Approved Version, and Controlled Rollouts - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** PRD Express Path (`requirements/pilot-managed-gsd-distribution.md`)

<domain>
## Phase Boundary

Make GSD version management a first-class Pilot capability: one explicit Pilot-approved GSD version, controlled rollout semantics, per-project installed-version visibility, safe setup/refresh/update behavior, and operator-visible drift reporting.

This phase covers version authority, installer/version convergence behavior, project drift classification, rollout outcome reporting, and regression coverage for managed-project flows.

</domain>

<decisions>
## Implementation Decisions

### Version Authority
- D-01: Pilot must own one explicit Pilot-approved GSD version; hidden `node_modules` resolution is not the source of truth.
- D-02: The approved version must be easy to inspect in human-facing and machine-readable surfaces.
- D-03: The approved version must be intentionally changeable by the operator.
- D-04: Pilot must treat each managed project's installed GSD version as managed state and detect it per project.

### Command Semantics
- D-05: `pilot update` means "converge Pilot's managed GSD distribution to the approved version and roll managed projects toward that approved version."
- D-06: `pilot setup <dir>` installs the current approved version into a newly managed project.
- D-07: `pilot setup --refresh` repairs or reinstalls GSD for that one project only, against the approved-version contract.
- D-08: No command may silently change a project's GSD version unless version change is the explicit purpose of that command.

### Version Control Surface
- D-09: Pilot must provide an explicit approved-version control surface independent of implicit package-manager resolution.
- D-10: The operator workflow must support: inspect approved version, intentionally set or bump approved version, then run rollout/update.
- D-11: Pilot surfaces must distinguish approved version, project installed version, and newer available version(s) if discovery is supported.

### Drift Detection and Safety
- D-12: Pilot must classify project drift at least as `matches`, `behind`, `ahead`, or `unknown`.
- D-13: Routine repair operations must never silently downgrade projects that are ahead of the approved version.
- D-14: Any downgrade support must be explicit and operator-intentional, not implicit in refresh/repair flows.
- D-15: If convergence fails for a project, Pilot must report it clearly without corrupting managed state.

### Distribution Model
- D-16: This phase must define one supported distribution model for GSD inside Pilot.
- D-17: Hidden local dependency state must not be the effective source of truth.
- D-18: If Pilot still uses a bundled installer dependency internally, the approved-version mechanism must govern installs.
- D-19: Any future cached or distributed artifact model must preserve the same setup/refresh/update semantics and safety guarantees.

### Rollout Behavior and UX
- D-20: `pilot update` must perform a controlled rollout across managed projects and report updated, skipped, already-current, ahead/drifted, and failed outcomes.
- D-21: Blocked projects need an explicit rollout policy.
- D-22: Approved version and per-project installed version must surface in useful operator views and truthful help/output copy.

### the agent's Discretion
- Storage location and exact internal representation for approved-version metadata, as long as D-01 through D-22 remain true.
- Exact command naming for the approved-version control surface.
- Whether per-project version state is cached in Pilot DB, recomputed live, or both.
- Whether newer-version discovery ships now or returns a clear unsupported/not-implemented state.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product requirements
- `requirements/pilot-managed-gsd-distribution.md` - canonical product problem, command semantics, drift safety rules, rollout expectations, and deferred ideas

### Current installer and refresh behavior
- `src/core/setup.ts` - current per-project installer flow, refresh behavior, sentinel validation, and setup side effects
- `src/commands/setup.ts` - current CLI setup/refresh semantics and output contract
- `src/commands/update.ts` - current fleet update behavior using `bun update get-shit-done-cc`
- `src/commands/project.ts` - managed-project detail surface
- `src/commands/projects.ts` - managed-project list surface

### Current managed-project persistence
- `src/core/db.ts` - projects table and project metadata persistence helpers
- `src/core/types.ts` - `Project`, `PilotConfig`, and related domain contracts
- `src/core/config.ts` - layered config resolution and config-file schema

### Historical decisions
- `.planning/phases/64-gsd-installation-switch/64-01-SUMMARY.md` - `get-shit-done-cc` became Pilot's installer dependency and `gsdDir` was removed
- `.planning/phases/64-gsd-installation-switch/64-02-SUMMARY.md` - `setup`, `update`, and `doctor` were rewritten around the upstream installer
- `.planning/phases/50-setup-refresh-mode-and-fast-skill-installation/50-01-SUMMARY.md` - `setupProject()` refresh semantics and config merge behavior
- `.planning/phases/50-setup-refresh-mode-and-fast-skill-installation/50-02-SUMMARY.md` - CLI `--refresh` semantics and regression coverage
- `.planning/phases/55-shell-runtime-toolchain-exposure/55-02-SUMMARY.md` - setup already includes shell-exposure maintenance; keep this phase focused on GSD version management

</canonical_refs>

<specifics>
## Specific Ideas

- Use `.opencode/get-shit-done/VERSION` as the first readable per-project installed-version signal.
- Keep ahead-of-approved projects safe during routine repair flows; do not silently downgrade them.
- Make `pilot update` report per-project rollout outcomes instead of only binary success/failure.
- Make the approved-version authority operator-controlled instead of package-manager-controlled.

</specifics>

<deferred>
## Deferred Ideas

- Release channels or rings such as stable/candidate.
- `pilot update --to <version>`.
- A separate dedicated drift/status command if the existing operator surfaces become too noisy.

</deferred>

---

*Phase: 100-managed-gsd-distribution*
*Context gathered: 2026-03-26 via PRD Express Path*
