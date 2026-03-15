# Cleanup — Remove pilot-gsd Fork

## Problem
After migration to upstream GSD, all pilot-gsd references need to be removed.

## Goal
Clean break from the fork. All references updated.

## Requirements

### Must Have

- [ ] Remove `pilot-gsd` from package.json and package-lock.json
- [ ] Remove any test fixtures or mocks referencing pilot-gsd command structure or paths
- [ ] Update tests to reflect new intent-based delegation (DelegationIntent, not DelegationStep[])
- [ ] Update Pilot's README.md to reflect upstream GSD dependency
- [ ] Update the pilot-pipeline SKILL.md (at `~/.openclaw/skills/pilot-pipeline/SKILL.md`) to document:
  - New intent-based delegation model
  - GSD installation via upstream `get-shit-done-cc`
  - Config pre-seeding
  - Provider mode + frontmatter patching
  - Auto-retry flow
- [ ] Archive the `pilot-gsd` GitHub repo (fanselau/pilot-gsd) — mark deprecated with pointer to upstream GSD
- [ ] Remove `gsd-setup-agents` and `gsd-lessons` commands (pilot-gsd specific, not in upstream)
- [ ] Remove or update `GSD-REFERENCE.md` in workspace — replace with pointer to upstream docs and `gsd-upstream-reference.md`
- [ ] Update `memory/` and `MEMORY.md` references to pilot-gsd

### Nice to Have
- [ ] Delete the `~/dev/punchlab/pilot-gsd/` directory (or move to archive)
- [ ] Remove the `gsd-upstream` clone after migration is verified (`~/dev/punchlab/gsd-upstream/`)

## Do NOT
- Do NOT keep any pilot-gsd code "just in case" — clean break
- Do NOT leave stale test mocks that reference the old step-based delegation

#### Critical Fixes (from critique)

- [ ] Migration order: (1) run `pilot setup --refresh` on ALL registered projects, (2) verify each works with upstream GSD, (3) THEN remove pilot-gsd. Not the reverse.
- [ ] Audit all projects' `.opencode/opencode.json` for pilot-gsd-specific entries
- [ ] Check `~/.pilot/config.json` for fork-specific keys
- [ ] Migrate job store schema: jobs with old `DelegationStep[]` format → mark as `legacy`, exclude from re-runs
- [ ] List specific test files that need updating (anything importing `DelegationPlan`, `DelegationStep`, or mocking `--command gsd-delegate`)
- [ ] Create new delegation test fixtures: sample `DelegationResult` JSON for each intent type
- [ ] Add `pilot doctor` check for broken symlinks in `.opencode/` (catches projects not yet migrated)
