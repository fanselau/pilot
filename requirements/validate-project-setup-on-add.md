# Validate Project Setup on `pilot add`

## Problem
`pilot add` accepts any directory, even ones that haven't been set up with `pilot setup`. When an unconfigured project gets queued, the runner spawns opencode which can't find GSD commands (`gsd-delegate`, `gsd-quick`, etc.), exits silently, and the reconciler marks the job as stale. This wastes attempts and is hard to debug — the failure looks like OOM or a process crash.

## Goal
`pilot add` should validate that the target project is properly configured before accepting a job. If not configured, it should error with a clear message suggesting `pilot setup`.

## Requirements

### Must Have
- [ ] In `pilot add`, before queuing, check that `<project>/.opencode/command/` exists (symlink or directory)
- [ ] If missing, print error: `✗ Project not configured. Run: pilot setup <project>` and exit with code 1
- [ ] Also check that the symlink target actually exists (not a broken symlink)
- [ ] Add `--force` flag to bypass the check if needed

### Nice to Have
- [ ] Check that `opencode.json` exists in the project directory
- [ ] Check that `.opencode/agents/` exists too (not just commands)
- [ ] Offer to run `pilot setup` automatically if not configured: "Run pilot setup now? (y/n)"
- [ ] In `pilot doctor`, add a check for all known projects in the DB — report which ones are missing setup

## Technical Notes
- The check goes in `src/commands/add.ts`
- `pilot setup` creates symlinks: `.opencode/command/` → `pilot-gsd/commands`, `.opencode/agents/` → `pilot-gsd/agents`
- Use `fs.existsSync` + `fs.lstatSync` to check symlink validity
- Keep it simple — just a pre-queue validation, not a deep health check

## Do NOT
- Change how `pilot setup` works
- Add network calls or heavy validation
- Block `pilot add` on projects that have `opencode.json` but were set up manually (without symlinks) — the `--force` flag handles this
