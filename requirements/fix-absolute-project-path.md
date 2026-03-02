# Fix Absolute Project Path in Runner

## Problem
`pilot add` stores the full absolute path as `job.project` (e.g. `/home/user/dev/myapp`).
The runner at `src/core/runner.ts:118` does `path.join(config.projectDir, job.project)` which produces
a broken double-path like `/home/user/dev/home/user/dev/myapp`.

Same bug exists in `src/core/delegate.ts` line ~93 where `attemptDelegation` uses `projectDir` parameter
passed from runner.

## Goal
Runner correctly resolves project directory whether `job.project` is absolute or relative.

## Requirements
### Must Have
- [ ] If `job.project` is an absolute path (starts with `/`), use it directly
- [ ] If `job.project` is a relative path, join with `config.projectDir` as before
- [ ] Fix in both `runner.ts` (launch method) and `delegate.ts` (attemptDelegation)
- [ ] Add test: absolute path project resolves correctly
- [ ] Add test: relative path project resolves correctly (backward compat)

## Technical Notes
- `runner.ts:118`: `const projectDir = path.join(config.projectDir, job.project);`
- Fix: `const projectDir = path.isAbsolute(job.project) ? job.project : path.join(config.projectDir, job.project);`
- Same pattern in delegate.ts

## Do NOT
- Change how `pilot add` stores the project path
- Change the config.projectDir behavior
- Add any new dependencies
