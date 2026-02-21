# Daemon Mode Runner — Persistent Queue Watcher

## Problem
`pilot run` currently drains the queue and exits. There's no persistent daemon that watches for new entries. This means every `pilot add` requires manually running `pilot run` afterward (or using `pilot build` which spawns a throwaway runner). The UX should be: `pilot add` is the only command you think about — the runner handles the rest.

## Goal
`pilot run` becomes a long-lived daemon by default. It watches QUEUE.md (or queue.json after Phase 6) for new entries and processes them as they arrive. `pilot add` auto-starts the daemon if not running. The pipeline never sleeps.

## Requirements

### Must Have

- [ ] **Daemon mode (default)**: `pilot run` stays alive after draining the queue, watching for new entries
  - Poll QUEUE.md/queue.json every 3 seconds (configurable via `PILOT_POLL_INTERVAL` env var)
  - On new entries detected → process them immediately
  - Stay alive indefinitely until `pilot stop` or SIGTERM
  - Log idle status periodically (every 5 minutes): "Watching for new queue entries..."
  
- [ ] **`--once` flag**: explicit drain-and-exit mode (current behavior, for CI/scripts/Gorb batches)
  - Process all queue entries, wait for completion, exit
  - This is what the bash runner does today

- [ ] **`pilot add` auto-starts daemon**:
  - After writing to queue, check if daemon is running (PID file + process alive check)
  - If not running → start daemon in background (detached, stdout/stderr to log file)
  - If running → do nothing (daemon will pick up the new entry on next poll)
  - Print: "✓ Queued: project | scope" and "✓ Runner started" or "Runner active (PID xxx)"
  
- [ ] **`pilot build` uses same daemon logic** (already close, align with add)

- [ ] **Daemon PID management**:
  - Write PID to `$PILOT_LOG_DIR/pilot-runner.pid` on start
  - Remove PID file on clean exit
  - `pilot run` refuses to start if daemon already running (print PID, exit 1)
  - `pilot run --force` kills existing daemon and starts fresh
  
- [ ] **`pilot stop`**: 
  - Reads PID file, sends SIGTERM
  - Waits up to 15s for graceful shutdown (finish current jobs)
  - If still alive after 15s → SIGKILL
  - `pilot stop --force` → immediate SIGKILL
  - Cleans up PID file
  
- [ ] **Daemon log output**:
  - When running as daemon (detached), log to `$PILOT_LOG_DIR/pilot-runner.log`
  - When running in foreground (attached terminal), log to stdout (current behavior)
  - Detect via `process.stdout.isTTY`

- [ ] **Graceful shutdown**:
  - SIGTERM → stop accepting new jobs, wait for active jobs to complete, exit
  - SIGINT (Ctrl+C) → same as SIGTERM
  - Active jobs are NOT killed — they finish naturally
  - PID file cleaned up on exit

### Nice to Have

- [ ] File watcher (fs.watch) instead of polling for faster pickup
- [ ] `pilot run --foreground` to force foreground mode even when piped
- [ ] `pilot attach` — connect to running daemon's log stream (like `pilot tail` but for the runner itself)
- [ ] Desktop notification on job complete/fail (integrates with Phase 11)

## Technical Notes

- Runner already has the main loop in `src/core/runner.ts` — needs a `watch` loop wrapping the existing `mainLoop`
- The `mainLoop` currently breaks when queue is empty. In daemon mode, it should sleep then rescan.
- PID management already exists in `src/core/process.ts` — extend it
- `pilot add` already has all the queue-writing logic — just add daemon check + start at the end
- Lock file prevents concurrent runners — existing `withQueueLock` handles this
- Keep `--once` as the escape hatch, daemon as default

## Do NOT

- Use `nohup` for daemonization — use `child_process.spawn` with `detached: true` + `unref()`
- Kill active jobs on `pilot stop` (unless --force)
- Poll faster than 1 second (unnecessary CPU burn)
- Make daemon mode opt-in — it should be the default. `--once` is the opt-out.
- Break the existing `pilot run --once` flow — Gorb's batch mode depends on it
