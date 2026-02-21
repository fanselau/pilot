# Production Hardening — Multi-Day Unsupervised Operation

## Problem
Pilot needs to run for days or weeks without human intervention on a 16GB VPS. Current failure modes from the bash runner era: processes hang forever, OOM kills, stale PID files, disk fills with logs, zombie processes accumulate, snapshot repo git gc triggers CPU storms. Every one of these has happened. Pilot must handle all of them automatically.

## Goal
Zero-touch operation. Pilot daemon starts, processes work, recovers from failures, manages resources, and keeps running indefinitely. The only human interaction should be `pilot add` to queue new work.

## Requirements

### Must Have

#### Crash Recovery & Self-Healing
- [ ] **Stale PID detection**: On startup, check PID file. If PID exists but process is dead → clean up PID file and start normally. Don't refuse to start because of a stale PID from a crash.
- [ ] **Crash recovery is systemd's job**: No internal supervisor. `pilot run` is a simple process. Systemd `Restart=on-failure` + `RestartSec=10` handles restarts. Pilot just needs to exit cleanly with correct exit codes (0=clean, 1=error) so systemd knows what to do.
- [ ] **Queue corruption recovery**: If queue.json is malformed (truncated write, encoding error), attempt to recover:
  1. Try JSON.parse with trailing comma tolerance
  2. Fall back to queue.json.bak (written before every mutation)
  3. If both corrupt, start fresh with empty queue + log error
  4. NEVER crash the daemon because of a bad queue file
- [ ] **Backup on every write**: Before writing queue.json, copy current to queue.json.bak. Atomic writes via write-to-temp-then-rename.
- [ ] **Orphan process cleanup**: On startup, scan for opencode processes that don't match any running queue item. Log them. Kill them after 2 hours if still orphaned (they're from a previous crashed daemon run).

#### Resource Management (16GB VPS)
- [ ] **Memory guard**: Before spawning a new job, check available system memory. If <2GB free → don't spawn, wait and retry. Log warning.
- [ ] **Max parallel enforcement**: Hard cap at `--max-parallel` (default 2 on <32GB, 5 on >=32GB). Auto-detect from system RAM if not set.
- [ ] **Git GC prevention**: Before every spawn, run `git config gc.auto 0` on the target project's snapshot repo. This is the #1 cause of CPU storms and OOM on this VPS.
- [ ] **Process tree kill**: When killing a job (timeout, stuck, stop), kill the entire process tree (all children), not just the parent PID. Use `kill -TERM -- -<pgid>` or tree-kill.
- [ ] **Spawn rate limiting**: Max 1 spawn per 5 seconds. Prevents thundering herd when queue has many items.

#### Stuck Detection & Auto-Recovery  
- [ ] **Built-in stuck detection in daemon**: Every 60 seconds, check all active jobs:
  1. Has the process produced new output (log file mtime) in the last N minutes? (configurable, default: 15min)
  2. Is CPU usage near zero for >10 minutes?
  3. Has it exceeded its `timeoutMinutes`?
  If stuck → kill, mark failed, retry if attempts remain.
- [ ] **Stuck != slow**: A job that's actively using CPU and producing output is NOT stuck, even if it's been running for hours. Only kill on actual stall signals.
- [ ] **Flaky detection**: If a job fails with <5 messages (opencode session too short to be real work) → mark as "flaky", retry immediately. After 3 flaky failures → mark as failed with "consistently flaky" reason.

#### Logging & Disk Management
- [ ] **Log rotation**: Runner log capped at 10MB. When exceeded, rotate to .log.1, .log.2, keep max 3 rotations. Total max ~40MB.
- [ ] **Job log cleanup**: Completed job logs older than 7 days → delete. Keep last 20 regardless of age.
- [ ] **Queue history cap**: History array in queue.json capped at 200 items. Oldest pruned on every write.
- [ ] **Disk space check**: Before spawning, check disk space. If <1GB free → don't spawn, log critical warning.
- [ ] **Structured logging**: All daemon logs as `[ISO-8601] [LEVEL] message` format. Levels: DEBUG, INFO, WARN, ERROR. Default level: INFO. Configurable via `PILOT_LOG_LEVEL`.

#### Resilience Patterns
- [ ] **Graceful degradation**: If a non-critical subsystem fails (e.g., stuck detection, log rotation), log the error and continue. Don't crash the daemon.
- [ ] **Heartbeat file**: Write `~/.pilot/heartbeat` with timestamp every 60 seconds. External monitors can check this file to verify daemon is alive.
- [ ] **Startup self-check**: On daemon start, verify:
  1. opencode binary exists and is executable
  2. pilot-gsd directory exists
  3. Queue file is readable/writable  
  4. Enough disk space (>500MB)
  5. Enough memory (>2GB free)
  Log warnings for non-critical failures, abort for critical ones.

#### Atomic Operations
- [ ] **Atomic queue writes**: Write to temp file → fsync → rename. Never write directly to queue.json (risks corruption on crash/power loss).
- [ ] **Lock timeout**: If queue lock can't be acquired in 30 seconds → log error, skip this cycle, retry next cycle. Don't deadlock.
- [ ] **Lock cleanup**: Stale lock files (lockfile age >5 minutes) are forcibly removed on daemon startup.

### Nice to Have
- [ ] Systemd service file for auto-start on boot
- [ ] `pilot health` command that checks daemon heartbeat, memory, disk, queue state
- [ ] Prometheus-compatible metrics endpoint (for future monitoring)
- [ ] Email/Telegram notification on daemon crash + auto-restart
- [ ] Watchdog: separate lightweight process that monitors daemon heartbeat file and restarts if stale

## Technical Notes
- Node.js is single-threaded — the stuck detection timer and main loop share the event loop. Use `setInterval` for periodic checks, but ensure they don't block spawn/reap.
- `process.memoryUsage()` for Node heap, `os.freemem()` for system memory
- `os.cpus()` to auto-detect parallel capacity
- `child_process.spawn` with `detached: true` creates new process group — use negative PID for group kill
- `fs.writeFileSync` + `fs.renameSync` for atomic writes (rename is atomic on Linux for same filesystem)
- The VPS has had issues with: snapshot repo git gc (8GB repos), opencode processes hanging, OOM kills at 4+ parallel jobs, /tmp filling up

## Do NOT
- Use external process managers (pm2, forever) — pilot should be self-contained
- Implement clustering or multi-instance — single daemon, always
- Buffer logs in memory — write immediately (crash = lost logs otherwise)
- Retry indefinitely — always have a max attempts cap
- Trust PID files blindly — always verify process is actually alive
- Ignore ENOMEM / ENOSPC errors — these must prevent new spawns
