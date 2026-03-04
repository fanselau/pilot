# Robust Project Path Resolution

## Problem
Project paths are always resolved via `path.join(config.projectDir, project)`, where `projectDir` defaults to `~/dev`. This means:
- `pilot add . "task"` resolves to `~/dev/.` instead of the current directory
- `pilot add /home/user/clients/foo "task"` gets joined: `~/dev//home/user/clients/foo`
- Pilot only works for projects inside `~/dev/`, which is too restrictive

## Goal
`pilot add` (and all other commands that take a project argument) should work with any project on the system. Absolute paths, relative paths, and shorthand names should all resolve correctly.

## Requirements

### Must Have
- [ ] Create a `resolveProjectDir(project: string): string` utility function used everywhere
- [ ] Resolution order:
  1. If `project` is an absolute path → use as-is
  2. If `project` starts with `~` → expand to home directory
  3. If `project` is `.` or starts with `./` or `../` → resolve relative to `process.cwd()`
  4. Otherwise → treat as shorthand name, resolve via `path.join(config.projectDir, project)` (existing behavior, kept as convenience)
- [ ] Replace ALL occurrences of `path.join(getConfig().projectDir, project)` with `resolveProjectDir(project)` across the codebase
- [ ] Store the resolved absolute path in the DB (not the raw input) so logs/status always show unambiguous paths
- [ ] The `validateProjectSetup()` function in add.ts must also use `resolveProjectDir()`

### Nice to Have
- [ ] `pilot doctor` warns if `PILOT_PROJECT_DIR` is set but doesn't exist
- [ ] Tab completion for project names (future)

## Technical Notes
- The utility function should live in `src/core/config.ts` or a new `src/core/paths.ts`
- Search for `getConfig().projectDir` across ALL files to find every usage
- The DB `project` column currently stores whatever was passed — after this change it should store the resolved absolute path
- Runner also uses project paths in `src/core/runner.ts` — make sure those go through `resolveProjectDir` too
- Test with: `pilot add . "task"`, `pilot add ~/dev/foo "task"`, `pilot add /tmp/test "task"`, `pilot add my-project "task"`

## Do NOT
- Remove `config.projectDir` — it's still useful as the shorthand base directory
- Change the DB schema — just store the resolved path in the existing column
- Break existing behavior for shorthand names (e.g. `pilot add my-project "task"` should still work)
