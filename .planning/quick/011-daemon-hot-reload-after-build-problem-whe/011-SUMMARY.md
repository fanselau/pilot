---
phase: quick-011
plan: 01
completed: 2026-03-02
duration: ~2m
subsystem: runner
tags: [daemon, hot-reload, sighup, pid-file, postbuild]

tech-stack:
  patterns:
    - SIGHUP-based daemon reload
    - PID file for inter-process signaling
    - systemd Restart=always re-exec vs manual spawn

key-files:
  modified:
    - src/core/runner.ts
    - src/index.ts
    - package.json
  created:
    - src/commands/reload.ts
---

# Quick Task 011: Daemon Hot-Reload After Build

**One-liner:** SIGHUP-based daemon reload with PID file management — `npm run build` auto-signals daemon, `pilot reload` for manual trigger.

## What Was Done

### Task 1: PID File Management and SIGHUP Handler in Runner

Added three capabilities to the `Runner` class in `src/core/runner.ts`:

1. **PID file write on startup:** `run()` writes `process.pid` to `~/.pilot/daemon.pid` (creating directory if needed) using `writeFileSync` for atomicity.

2. **PID file cleanup on exit:** A `finally` block around the main loop ensures `daemon.pid` is removed on normal exit, shutdown, or error. ENOENT is swallowed.

3. **SIGHUP handler for graceful reload:** The `setupShutdownHandlers()` method now registers a SIGHUP listener that:
   - Sets `this.reloading = true` (new boolean field)
   - Sets `this.shuttingDown = true` (reuses existing drain mechanism)
   - Sets `this.running = false` (breaks main loop)
   - Running opencode processes are NOT killed — they're detached/unref'd and survive the daemon exit

4. **Re-exec after drain:** After the active jobs drain loop, if `this.reloading` is true:
   - Under systemd (`INVOCATION_ID` set): just `process.exit(0)` — `Restart=always` handles re-launch
   - Not under systemd: spawns new process with same args (detached, unref'd), then exits

### Task 2: `pilot reload` Command and Postbuild Signal

**`src/commands/reload.ts`:** Reads `~/.pilot/daemon.pid`, checks if process is alive via `process.kill(pid, 0)`, sends SIGHUP if alive. Handles all edge cases:
- No PID file → "No daemon running" (exit 0)
- Stale PID file → removes file, reports stale
- Invalid PID content → removes file, reports invalid
- Supports `--json` output mode

**`src/index.ts`:** Registered `pilot reload` command in the Infrastructure section.

**`package.json`:** Extended postbuild script to read `~/.pilot/daemon.pid` and send SIGHUP after shebang/chmod operations. Entire PID read+signal is wrapped in try/catch for complete no-op when no daemon running.

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| INVOCATION_ID for systemd detection | Standard env var set by systemd for all services — reliable indicator |
| Reuse shuttingDown flag for SIGHUP drain | Existing mechanism already prevents new steps in launch() for-loop |
| writeFileSync for PID file | Atomic from process perspective; no race window for partial writes |
| Inline require() in postbuild | postbuild is `node -e` inline script, not part of ESM module system |

## Commits

| Hash | Description |
|------|-------------|
| 716613d | feat(quick-011): add PID file management and SIGHUP reload handler to Runner |
| 79b116c | feat(quick-011): add pilot reload command and postbuild daemon signal |
