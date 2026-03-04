# Resource Management System

## Problem

Pilot spawns opencode sessions as detached processes with no resource limits. On a 64GB RAM / 16 CPU / 320GB SSD / 8GB swap server, a single runaway session (or several concurrent ones) can OOM the entire machine, killing SSH access and requiring a hard reboot. The current safeguards are minimal:

- `checkMemory(2048)` — waits for 2GB free before spawning, but doesn't cap the spawned process
- `maxParallel` is static (5 for ≥32GB) — doesn't adapt to actual available memory
- No per-process memory limits — spawned opencode processes can consume unlimited RAM
- No OOM killer priority configuration — SSH/pilot can be killed before opencode sessions
- No kill-on-pressure mechanism — no way to shed load when memory gets tight

## Goal

Prevent any pilot-spawned process from OOM-ing the server. Ensure SSH and the pilot daemon always survive. Degrade gracefully under memory pressure by killing expendable sessions before the kernel OOM killer intervenes.

## Requirements

### Must Have

#### 1. Per-process memory limits via cgroups v2

- [ ] Wrap each `opencode run` spawn in `systemd-run --scope --user` with `MemoryMax` and `MemorySwapMax`
- [ ] Default memory cap: **8GB per session** (configurable via `PILOT_SESSION_MEMORY_MAX_MB`, default `8192`)
- [ ] Swap cap: **0** (`MemorySwapMax=0`) — prevent swap thrashing, fail fast instead
- [ ] CPU weight (not hard limit): `CPUWeight=100` (default, fair share with other processes)
- [ ] The spawn command in `spawnAndWait()` changes from:
  ```
  opencode run --format default --model <model> --title <title> --command <cmd> [args]
  ```
  to:
  ```
  systemd-run --scope --user -p MemoryMax=8G -p MemorySwapMax=0 -p OOMPolicy=kill \
    --unit=pilot-session-<jobId>-<timestamp> \
    opencode run --format default --model <model> --title <title> --command <cmd> [args]
  ```
- [ ] On systems where `systemd-run --user` is unavailable, fall back to current behavior with a warning log
- [ ] Add `PILOT_SESSION_MEMORY_MAX_MB` to config.ts with validation

#### 2. System-level OOM protection

- [ ] Create a setup command (`pilot setup-cgroups` or integrate into `pilot setup`) that configures:
  - `oom_score_adj = -1000` for sshd (via `/etc/systemd/system/ssh.service.d/oom-protect.override`)
  - `oom_score_adj = -500` for the pilot daemon process (set in pilot's own systemd unit or at process start)
  - `oom_score_adj = 300` for spawned opencode sessions (via systemd-run scope property `OOMScoreAdjust=300`)
- [ ] Document these as a one-time setup step (requires root for sshd override)
- [ ] Pilot daemon sets its own `oom_score_adj` on startup by writing to `/proc/self/oom_score_adj`

#### 3. Dynamic maxParallel based on available memory

- [ ] Replace static `maxParallel` with dynamic calculation in the dispatch loop:
  ```typescript
  function getDynamicMaxParallel(configuredMax: number, sessionMemoryMb: number): number {
    const availableMb = getAvailableMemoryMb();
    const reservedMb = 4096; // 4GB reserved for OS/SSH/pilot
    const usableMb = Math.max(0, availableMb - reservedMb);
    const memorySlots = Math.floor(usableMb / sessionMemoryMb);
    return Math.max(0, Math.min(configuredMax, memorySlots));
  }
  ```
- [ ] Call this before each spawn attempt in the drain loop, not just once at startup
- [ ] When `getDynamicMaxParallel()` returns 0, log and wait (same as current `checkMemory` behavior)
- [ ] `PILOT_RESERVED_MEMORY_MB` env var (default `4096`) for the reserved amount

#### 4. Memory pressure watchdog

- [ ] Add a background interval (every 10s) in the Runner class that checks available memory
- [ ] If available memory drops below `PILOT_MEMORY_KILL_THRESHOLD_MB` (default `2048`):
  - Find the longest-running active job (by `started_at`)
  - Call existing `killJobSession()` on it
  - Reset to pending with reason "Killed by memory pressure watchdog"
  - Log prominently
- [ ] The watchdog runs as a `setInterval` inside `Runner.run()`, cleared on shutdown

#### 5. Tune checkMemory for 64GB

- [ ] Increase `checkMemory()` threshold from `2048` to match `sessionMemoryMb + reservedMb` (i.e., don't spawn if there isn't enough for at least one full session + OS reserve)
- [ ] Current: `checkMemory(2048)` → New: `checkMemory(sessionMemoryMb + 1024)` (session budget + 1GB safety margin)

### Nice to Have

- [ ] Per-job memory budget override in the queue entry (some jobs are known to be heavy)
- [ ] CPU limiting via `CPUQuota=200%` (2 cores max per session) to prevent CPU starvation
- [ ] Disk I/O weight via `IOWeight` in the systemd scope
- [ ] `pilot doctor` check that validates cgroups v2 is available and user lingering is enabled
- [ ] Metrics logging: peak memory per session (read from cgroup accounting after session ends)
- [ ] `pilot top` command showing live memory usage per active session (reads cgroup stats)

## Technical Notes

### Why cgroups v2 / systemd-run (not alternatives)

- **ulimit (`RLIMIT_AS`)**: Limits virtual memory, not RSS. Node.js/V8 maps large virtual regions it never uses. Setting ulimit too low kills healthy processes; too high doesn't protect against OOM. Unreliable.
- **`--max-old-space-size`**: Only limits V8 heap. Doesn't cap native memory (buffers, child processes, git operations). An opencode session spawns subprocesses (git, npm, tsc) that are completely uncapped.
- **Docker per session**: Massive overhead (image pull, container lifecycle, volume mounts, networking). Adds complexity for marginal benefit over cgroups. The sessions need full filesystem access to the project.
- **cgroups v2 via systemd-run**: Kernel-enforced RSS limit on the entire process tree (opencode + all its children). Zero overhead. Clean integration with systemd. User-level scopes don't need root. The OOM killer targets the scope, not random system processes.

### Prerequisites

- cgroups v2 must be active (default on Ubuntu 22.04+): `mount | grep cgroup2`
- User lingering must be enabled for the pilot user: `loginctl enable-linger $USER`
- D-Bus user session must be running (usually automatic with systemd-logind)

### Key files to modify

| File | Changes |
|------|---------|
| `src/core/runner.ts` | Spawn via `systemd-run`, dynamic maxParallel, memory watchdog, OOM score |
| `src/core/config.ts` | New env vars: `PILOT_SESSION_MEMORY_MAX_MB`, `PILOT_RESERVED_MEMORY_MB`, `PILOT_MEMORY_KILL_THRESHOLD_MB` |
| `src/commands/setup.ts` | Add cgroup prerequisite checks |
| `src/commands/doctor.ts` | Validate cgroups v2, lingering, D-Bus |

### Spawn command detail

```typescript
// In spawnAndWait(), replace the execa() call:
const sessionMemoryMb = config.sessionMemoryMaxMb; // default 8192
const scopeUnit = `pilot-${job.id}-${Date.now().toString(36)}`;

const proc = execa('systemd-run', [
  '--scope', '--user',
  '-p', `MemoryMax=${sessionMemoryMb}M`,
  '-p', 'MemorySwapMax=0',
  '-p', 'OOMScoreAdjust=300',
  '-p', 'OOMPolicy=kill',
  '--unit', scopeUnit,
  '--', // end of systemd-run args
  opencodeBin,
  'run',
  '--format', 'default',
  '--model', topLevelModel,
  '--title', title,
  '--command', gsdCommand,
  ...(args ? [args] : []),
], {
  cwd,
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  detached: true,
  cleanup: false,
});
```

### Fallback detection

```typescript
async function hasSystemdRunUser(): Promise<boolean> {
  try {
    const { exitCode } = await execa('systemd-run', ['--user', '--scope', 'true'], {
      timeout: 5000, reject: false,
    });
    return exitCode === 0;
  } catch {
    return false;
  }
}
```

Cache this result at Runner construction time. If false, log a warning once and use bare `execa(opencodeBin, ...)` as today.

## Do NOT

- Do NOT use `ulimit` — it limits virtual memory, not RSS, and is unreliable for Node.js processes
- Do NOT use Docker — way too heavy for per-session isolation
- Do NOT use `--max-old-space-size` as the primary limit — it only caps V8 heap, not native memory or child processes
- Do NOT hard-kill sessions without resetting them to pending — they should be retryable
- Do NOT set CPU hard limits (`CPUQuota`) in v1 — fair scheduling via `CPUWeight` is sufficient
- Do NOT require root for normal operation — `systemd-run --user` works without root
- Do NOT make cgroups a hard dependency — graceful fallback to current behavior if unavailable
