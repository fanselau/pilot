# Daemon Hot-Reload After Build

## Problem
When `npm run build` produces new `dist/` files, the running daemon (`pilot run --daemon`) keeps using the old code. Session linking fixes, log improvements, etc. don't take effect until manual daemon restart. This is a major DX problem — you fix a bug, rebuild, but the daemon keeps running broken code.

## Goal
The daemon should automatically pick up new builds without losing running jobs.

## Requirements

### Must Have
- [ ] After `npm run build` (postbuild hook), signal the running daemon to restart
- [ ] Daemon handles SIGHUP (or similar) gracefully: finish current job step, then re-exec itself
- [ ] If no daemon is running, signal is a no-op (no error)
- [ ] Running opencode processes are NOT killed — only the daemon restarts, and it re-attaches to running jobs by checking `status=running` jobs in DB
- [ ] `pilot run --daemon` writes its PID to `~/.pilot/daemon.pid` on startup
- [ ] Postbuild script reads `~/.pilot/daemon.pid` and sends signal if process exists

### Nice to Have
- [ ] `pilot reload` command that manually triggers the same reload
- [ ] Log message when daemon reloads: "Reloading after build..."
- [ ] Debounce: if multiple builds happen quickly, only reload once

## Technical Notes
- Daemon PID file: `~/.pilot/daemon.pid`
- postbuild in package.json already runs a node script — extend it to also signal daemon
- SIGHUP is conventional for "reload config" — good choice here
- On re-exec: daemon should `process.execv` or spawn new process and exit
- Active jobs: daemon tracks them in `this.activeJobs` Map — on reload, check DB for `status=running` jobs and re-monitor their opencode PIDs

## Do NOT
- Kill running opencode processes on reload
- Use file watchers (too complex, wasteful)
- Make the daemon poll for changes
