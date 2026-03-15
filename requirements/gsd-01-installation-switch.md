# GSD Installation Switch — Replace pilot-gsd with Vanilla GSD

## Problem
Pilot depends on `pilot-gsd`, a heavily diverged fork. Upstream GSD v1.24.0 has native OpenCode support via `--opencode --local` installer. The fork's OpenCode compat is now redundant.

## Goal
Replace pilot-gsd symlink-based installation with upstream `get-shit-done-cc` package installer. All GSD files come from upstream, installed per-project.

## Requirements

### Must Have

- [ ] Add `get-shit-done-cc` as a dependency in Pilot's package.json (pin version to ~1.24.x)
- [ ] Update `pilot setup <project>` to run the GSD installer: `npx get-shit-done-cc --opencode --local` in the project directory (uses execa or child_process, cwd = projectDir)
- [ ] The installer creates these files (do NOT create them manually — let the installer handle it):
  - `.opencode/command/gsd-*.md` — flat commands with OpenCode frontmatter
  - `.opencode/agents/gsd-*.md` — agents with `model: inherit` + `mode: subagent`
  - `.opencode/get-shit-done/` — reference docs + `bin/gsd-tools.cjs`
  - `.opencode/opencode.json` — read permissions for gsd-tools.cjs
  - `.opencode/package.json` — `{"type":"commonjs"}` for gsd-tools.cjs
  - `.opencode/gsd-file-manifest.json` — install tracking for updates
- [ ] Remove ALL pilot-gsd symlink logic from setup.ts — the upstream installer handles everything (copies with absolute path replacement, frontmatter conversion, permission setup)
- [ ] Update `pilot setup <project> --refresh` to re-run the upstream installer (handles upgrades, preserves local patches via `gsd-file-manifest.json`)
- [ ] Update `pilot update` to update the `get-shit-done-cc` npm package then re-run `--opencode --local` per registered project
- [ ] Update `pilot doctor` to verify GSD is installed via upstream:
  - Check `.opencode/command/gsd-help.md` exists
  - Check `.opencode/get-shit-done/bin/gsd-tools.cjs` exists
  - Report version from `.opencode/get-shit-done/VERSION` if present
- [ ] Remove `pilot-gsd` from package.json dependencies

### Nice to Have
- [ ] `pilot setup` offers to run `gsd-map-codebase` on existing projects with source code (brownfield onboarding)

## Technical Notes
- Upstream package: `get-shit-done-cc` on npm, repo: `github.com/gsd-build/get-shit-done`
- Installer invocation: `npx get-shit-done-cc --opencode --local` (must run with cwd = project dir)
- Installer is idempotent — safe to re-run. Backs up local modifications to `gsd-local-patches/`
- `gsd-tools.cjs` paths are baked as absolute during install — no runtime resolution needed
- Hooks files are copied but NOT registered for OpenCode (dead weight, harmless)
- GSD source reference at `~/dev/punchlab/gsd-upstream/` (v1.24.0)
- Full installer analysis at `~/dev/punchlab/pilot/requirements/gsd-upstream-reference.md`

## Do NOT
- Do NOT manually create GSD command/agent files — the installer does this
- Do NOT keep any pilot-gsd symlink code
- Do NOT modify .opencode/opencode.json beyond what the installer writes (it handles permissions)

#### Migration from pilot-gsd (CRITICAL — from critique)

- [ ] Before running upstream installer on existing projects: detect and remove old pilot-gsd symlinks in `.opencode/command/` and `.opencode/agents/` (any file that `readlink` resolves to a path containing `pilot-gsd`)
- [ ] Remove `config.gsdDir` from `src/core/config.ts` — this points to pilot-gsd and is used in `systemHealthCheck()`
- [ ] Remove the `pilot-gsd` system-level check in `systemHealthCheck()` in `doctor.ts`
- [ ] Update the `gsd-delegate.md` check in `projectHealthCheck()` — replace with `gsd-help.md` check (upstream equivalent)
- [ ] Use local dependency binary (`node_modules/.bin/get-shit-done-cc`) via execa, NOT `npx` (avoids version mismatch, faster)
- [ ] Add installer error handling: timeout (60s), non-zero exit → surface stderr, mark setup as failed
- [ ] For projects with no `package.json`: warn and skip GSD installation (log reason)
- [ ] Add `pilot doctor` check for broken symlinks in `.opencode/` — flags migration-needed projects
