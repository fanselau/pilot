# Pilot Runtime & Install Path Guide

This document explains how Pilot resolves its binary at runtime, what can go wrong (shadow path drift), and the correct operator workflow for rebuilding, updating, and troubleshooting.

## The Problem: Split-Brain Runtime

Pilot can be invoked from multiple locations — a bun-linked symlink, a global install, or the built `dist/index.js` in the repo. The systemd service unit bakes a specific binary path into `ExecStart` at install time. If you rebuild Pilot but the service still points to an old or different binary, the daemon runs stale code while the CLI runs new code. This is **shadow path drift** — a split-brain where the service and the CLI disagree on which binary is canonical.

## Canonical Binary Path

Pilot's canonical binary is the built entry point at `<repo>/dist/index.js`, produced by `bun run build`.

The function `resolvePilotBinary()` (in `src/commands/service.ts`) determines the canonical path using this resolution chain:

1. **Package root `dist/index.js`** — derived from `import.meta.url`, resolving up to the repo root. Checked for execute permission.
2. **`which pilot`** — PATH lookup fallback. Returns whatever `pilot` resolves to in the current shell.
3. **Throw** — if neither resolves, an error is raised with a clear message.

When `pilot service install` runs, it calls `resolvePilotBinary()`, applies `realpathSync()` to follow symlinks, and bakes the resolved absolute path into the systemd unit's `ExecStart` line.

## Shadow Install Paths (Demoted)

Several paths may contain a `pilot` binary but are **not** the service's runtime path:

- **`~/.local/bin/pilot`** — symlink created by `bun link` or manual linking. May go stale after rebuilds if not re-linked.
- **`~/.bun/bin/pilot`** — bun global install path. May point to an old version if Pilot was ever globally installed.
- **fnm/nvm global package path** — if Pilot was ever npm-installed globally, this path may exist but lag behind the repo.

**These are NOT the service's runtime path.** They may work for CLI invocations, but the systemd service only uses the canonical path resolved at `pilot service install` time.

## The Correct Operator Workflow

### Rebuilding Pilot (after code changes)

```bash
bun run build        # Compiles TypeScript to dist/index.js
pilot reload         # Sends SIGHUP — daemon restarts with new code
```

This is the fast path. `pilot reload` triggers a graceful restart: the daemon finishes current work, exits, and systemd restarts it — picking up the new `dist/index.js` at the canonical path.

### Full service reinstall (after relinking or path changes)

If you moved the repo, re-ran `bun link`, or changed the symlink structure:

```bash
bun run build              # Ensure dist/index.js is current
pilot service install      # Re-generates unit with new canonical path
pilot service start        # Or: systemctl --user restart pilot-runner
```

### Verifying the running service

```bash
pilot doctor    # Look for "service unit" (pass) and "binary drift" (pass)
```

Both checks should show `pass`. If "binary drift" shows `warn`, the service binary and build output have diverged — see Troubleshooting below.

## What Each Command Does

### `pilot update`

Updates the GSD (get-shit-done) commands package and re-runs the GSD installer per registered project. Also updates the OpenClaw skill.

- Does **NOT** rebuild Pilot itself
- Does **NOT** restart the service
- Does **NOT** change the service binary path

### `pilot setup --refresh`

Re-runs project-level setup: re-links symlinks (`.opencode/command`, `.opencode/gsd-tools.cjs`, `gsd-help.md`), merges `opencode.json` config, and re-offers skills.

- Operates on a **target project**, not Pilot itself
- Does **NOT** rebuild Pilot
- Does **NOT** affect the service binary

### `pilot service install`

Generates (or regenerates) the systemd user service unit file at `~/.config/systemd/user/pilot-runner.service`. Resolves the canonical pilot binary via `resolvePilotBinary()`, applies `realpathSync()`, and bakes it into `ExecStart`.

- Run this after any path change (bun link, repo move, etc.)
- Always followed by `pilot service start` or `systemctl --user restart pilot-runner`

### `pilot reload`

Sends SIGHUP to the running daemon. The daemon finishes current work, then exits. systemd auto-restarts it (`Restart=always`), picking up the new binary at the canonical path.

- This is the **hot-reload path** after `bun run build`
- Requires the daemon to already be running

### `pilot doctor`

Runs system health checks. Relevant to runtime:

- **service unit**: Checks that the `ExecStart` binary exists and is executable
- **binary drift**: Warns if the service binary differs from the current build output (`resolvePilotBinary()`)

## Troubleshooting

### "binary drift" warning in pilot doctor

The service unit points to a different binary than your current build. This happens when you rebuilt Pilot but the service unit still references an old path (e.g., after re-linking or moving the repo).

**Fix:**

```bash
pilot service install && pilot service start
```

### Service not starting after build

Check that `dist/index.js` exists and is executable:

```bash
ls -la dist/index.js
bun run build   # Rebuild if missing
```

### Unsure which binary the service runs

```bash
cat ~/.config/systemd/user/pilot-runner.service | grep ExecStart
```

This shows the exact path baked into the unit file. Compare it with `resolvePilotBinary()` output (visible in `pilot doctor`).

### Service runs old code after `pilot reload`

If `pilot reload` doesn't pick up changes:

1. Verify you ran `bun run build` first
2. Check `pilot doctor` for "binary drift"
3. If drift detected, run `pilot service install && pilot service start`
