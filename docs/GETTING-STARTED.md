# Getting Started

Complete installation and setup guide for Pilot — from a fresh machine to `pilot doctor` showing all-pass.

---

## 1. Prerequisites

### Bun >= 1.x

Pilot's CLI shebang targets `bun`. It is the primary runtime.

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version
# Expected: 1.x.x
```

### Node.js >= 18

Required for compiling `better-sqlite3`, a native C++ addon used for the job queue.

```bash
node --version
# Expected: v18.x.x or higher
```

Install via [nvm](https://github.com/nvm-sh/nvm) or your package manager if not present.

### Build tools

`better-sqlite3` compiles from source and needs a C++ toolchain:

**Debian / Ubuntu:**

```bash
sudo apt install build-essential python3
```

**Fedora / RHEL:**

```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install python3
```

Verify:

```bash
gcc --version
python3 --version
```

### Git

Required for project setup and repository operations.

```bash
git --version
# Expected: 2.x+
```

### opencode

The AI coding agent that executes work. Pilot spawns opencode sessions — it does not call AI APIs directly.

Install from [https://opencode.ai](https://opencode.ai):

```bash
curl -fsSL https://opencode.ai/install | bash
```

The binary installs to `~/.opencode/bin/opencode`.

Verify:

```bash
~/.opencode/bin/opencode --version
```

> [!IMPORTANT]
> opencode needs its own API keys configured. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` as environment variables, or configure them in opencode's own config. Pilot does **not** manage AI provider credentials — it delegates to opencode, which handles authentication.

### Linux

Pilot is designed for Linux. Several features depend on Linux-specific APIs:

- `/proc/meminfo` — memory availability checks
- `systemd-run --user` — per-session cgroup memory limits
- `systemctl --user` — daemon mode via systemd user services
- `loginctl enable-linger` — services persist after logout

> [!NOTE]
> Basic job running (queue, run, status) may work on macOS, but daemon mode, memory management, and cgroups features are Linux-only. `pilot doctor` will report these as warnings on non-Linux systems.

---

## 2. Installation

```bash
# Clone repository
git clone https://github.com/lucafanselau/pilot.git
cd pilot

# Install dependencies
bun install

# Build the CLI
bun run build

# Link globally so `pilot` is available system-wide
bun link --global

# Verify
pilot --version
pilot --help
```

### GSD installation model

Pilot installs GSD commands from upstream `get-shit-done-cc` per project:

1. `pilot setup <dir>` runs `get-shit-done-cc --opencode --local` in that project
2. `pilot update` updates `get-shit-done-cc` in the Pilot repo, then re-runs installer for each registered project
3. `pilot setup --refresh` is the standard repair path when GSD sentinels are missing

Run `pilot doctor` (system) and `pilot doctor --project <path>` (project-level) to verify setup health.

---

## 3. Project Setup

Before Pilot can run jobs against a project, you need to set it up with `pilot setup`. This installs `.opencode` command assets and project config that opencode expects.

### What `pilot setup` does

1. Creates the project directory (if it doesn't exist)
2. Creates `.opencode/` directory inside the project
3. Runs upstream installer: `get-shit-done-cc --opencode --local`
4. Validates sentinel files like `.opencode/command/gsd-help.md`
5. Enforces autonomous-safe `.planning/config.json` defaults
6. Generates or merges `opencode.json` with full permissions (see below)
7. Adds `.opencode/` to `.gitignore`
8. Runs `git init` if the project isn't a git repository

### Running setup

```bash
pilot setup ~/dev/my-project --owner main
```

- `~/dev/my-project` — path to your project (created if it doesn't exist)
- `--owner main` — registers this project with owner agent ID `main` for completion notifications

### Verifying setup

```bash
pilot setup ~/dev/my-project --verify
```

This checks all symlinks resolve correctly and `opencode.json` is valid JSON, without modifying anything.

Example output:

```
  ✓ Config directory          .opencode/ exists
  ✓ .opencode/command         exists
  ✓ .opencode/agents          exists
  ✓ .opencode/get-shit-done   exists
  ✓ gsd-help.md               GSD commands installed
  ✓ opencode.json             valid JSON

  6 passed, 0 failed, 0 warnings
```

### opencode.json

`pilot setup` generates this exact structure:

```json
{
  "permission": {
    "read": { "**": "allow" },
    "write": { "**": "allow" },
    "edit": { "**": "allow" },
    "bash": { "**": "allow" },
    "external_directory": { "**": "allow" }
  }
}
```

> [!WARNING]
> The key must be `permission` (singular). Using `permissions` (plural) will silently crash opencode. This is the #1 gotcha in setup.

You can optionally add an `instructions` array pointing to project-specific instruction files:

```json
{
  "permission": { ... },
  "instructions": [
    "requirements/my-project-spec.md"
  ]
}
```

---

## 4. Environment Variables

All Pilot configuration is via `PILOT_*` environment variables. Every variable has a sensible default — you can run Pilot with zero configuration.

### Core paths

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_PROJECT_DIR` | `~/dev` | Root directory containing your projects. When you run `pilot add my-project ...`, Pilot resolves `my-project` to `$PILOT_PROJECT_DIR/my-project`. |

### Runner tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_MAX_PARALLEL` | Auto (1-4 based on RAM: <12GB=1, <32GB=2, <48GB=3, >=48GB=4) | Maximum concurrent jobs. The runner also dynamically adjusts based on available memory at spawn time. |

Job timeout is configured per queue item via `pilot add --timeout <minutes>` (default `0`, meaning no timeout).

### Memory management

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_SESSION_MEMORY_MAX_MB` | `8192` | Per-session systemd cgroup memory limit (MB). Sessions exceeding this are OOM-killed by the kernel. |
| `PILOT_RESERVED_MEMORY_MB` | `4096` | RAM reserved for the OS and other processes. The runner won't spawn if available RAM minus reserved is too low. |
| `PILOT_MEMORY_KILL_THRESHOLD_MB` | `2048` | Memory watchdog threshold. If system available RAM drops below this, the runner kills the newest active session to protect older jobs. |

### Notifications (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_DEFAULT_NOTIFY` | (unset) | Default agent ID for job completion notifications. Used when `--notify` is not specified on `pilot add`. |
| `PILOT_OPENCLAW_HOOKS_URL` | (unset) | Webhook URL for OpenClaw session wake notifications (e.g., `http://127.0.0.1:18789/hooks/agent`). |
| `PILOT_OPENCLAW_HOOKS_TOKEN` | (unset) | Bearer token for authenticating with the hooks endpoint. |
| `PILOT_TELEGRAM_BOT_TOKEN` | (unset) | Telegram bot token for sending notifications. |
| `PILOT_TELEGRAM_CHAT_ID` | (unset) | Telegram chat ID to send notifications to. |

### Debug / display

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_LOG_LEVEL` | `INFO` | Log verbosity. Options: `DEBUG`, `INFO`, `WARN`, `ERROR`. |
| `NO_COLOR` | (unset) | Set to any value to disable ANSI color output. |

### Example .env

```bash
# Core paths
PILOT_PROJECT_DIR=~/dev

# Runner tuning
PILOT_MAX_PARALLEL=2

# Memory management (defaults are good for 16-32GB machines)
# PILOT_SESSION_MEMORY_MAX_MB=8192
# PILOT_RESERVED_MEMORY_MB=4096
# PILOT_MEMORY_KILL_THRESHOLD_MB=2048

# Notifications (optional)
# PILOT_DEFAULT_NOTIFY=main
# PILOT_OPENCLAW_HOOKS_URL=http://127.0.0.1:18789/hooks/agent
# PILOT_OPENCLAW_HOOKS_TOKEN=your-token-here
# PILOT_TELEGRAM_BOT_TOKEN=123456:ABC-DEF
# PILOT_TELEGRAM_CHAT_ID=123456789

# Debug
PILOT_LOG_LEVEL=INFO
# NO_COLOR=1
```

> [!NOTE]
> Pilot reads environment variables at runtime. You can set them in your shell profile (`~/.bashrc`, `~/.zshrc`), a `.env` file loaded by your shell, or in the systemd service unit (see [Daemon Mode](#9-daemon-mode-systemd)).

---

## 5. AI Provider Setup

AI API keys are **not** Pilot environment variables. They go through opencode.

| Variable | Provider | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic | For Claude models (Opus, Sonnet, Haiku) |
| `OPENAI_API_KEY` | OpenAI | For OpenAI models (GPT-5.x, GPT-4.x) |

Set these in your shell environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

Or configure them in opencode's own config file.

### Which keys you need

Depends on your provider mode:

| Provider Mode | Keys Required |
|---------------|---------------|
| `claude-only` (default) | `ANTHROPIC_API_KEY` |
| `openai-only` | `OPENAI_API_KEY` |
| `hybrid` | Both |

Pilot's **model profiles** (`quality` / `balanced` / `budget`) and **provider modes** (`claude-only` / `openai-only` / `hybrid`) control which provider and model tier are used for each agent in the pipeline. See the [Model Profiles & Provider Modes](#7-model-profiles--provider-modes) section for details.

---

## 6. Running Your First Job

### 1. Health check

```bash
pilot doctor
```

Expected output (all checks should pass or warn):

```
  Pilot Doctor

  ✓ opencode binary    /home/you/.opencode/bin/opencode
  ✓ get-shit-done-cc   /home/you/dev/pilot/node_modules/.bin/get-shit-done-cc
  ✓ pilot dir          /home/you/.pilot
  ✓ memory             12345MB free
  ✓ cgroups v2         cgroup2 mounted
  ✓ user lingering     Enabled via loginctl
  ✓ resource limits    session cap: 8192MB | reserved: 4096MB | kill threshold: 2048MB
```

### 2. Set up a project

```bash
pilot setup ~/dev/my-project --owner main
```

### 3. Queue a quick task

```bash
pilot add my-project "Add a README with project description"
```

Pilot auto-detects this as a `quick` scope task. You can override with `--as phase` or `--as milestone`.

If you intentionally need to run on a dirty repo snapshot, queue with `--force-dirty`:

```bash
pilot add my-project "Investigate local regression" --force-dirty
```

Use this sparingly. Dirty-start jobs have weaker recovery guarantees.

### 4. Start the runner

```bash
pilot run --once
```

`--once` processes all pending jobs then exits. Without it, the runner keeps polling.

### 5. Check status

```bash
pilot status
```

Or use the full TUI dashboard:

```bash
pilot tui
```

### 6. View the job log

```bash
pilot log --last 1
```

Add `--verbose` for full session transcript, or `--follow` to tail in real time.

### 7. Triage observability and export artifacts

Use these commands for high-signal observability without reading full transcripts:

```bash
# Queue-level observability (running/recent jobs)
pilot status

# Full per-job observability and failure context
pilot info <job-id>

# Compact summary of outcome + observability
pilot log <job-id> --summary
```

Pilot uses consistent data labels:

- `requested` - requested profile/provider/scope configuration
- `observed` - model and token usage found in opencode session data
- `estimated` - cost estimate from observed usage and maintained pricing assumptions
- `unavailable` - data could not be resolved (missing session/pricing data)

Cost is shown as an estimate for operator triage, not exact billing truth.

Export a portable markdown artifact (success and failure jobs are both supported):

```bash
# Default output path: ~/.pilot/exports/job-ab12.md
pilot export ab12

# Successful job artifact
pilot export ab12 --output docs/exports/job-ab12-success.md

# Failed job artifact (includes failure context + retry guidance when available)
pilot export f91c --output docs/exports/job-f91c-failure.md
```

Use `--stdout` to print markdown directly instead of writing a file.

### 8. Web UI (operator dashboard)

Pilot's web UI is useful for operator triage when you want a visual pass across jobs and session detail.

1. Start it from the web workspace:

```bash
cd web
bun run dev
```

2. Open `http://localhost:3100` and use the dashboard for active/queued/recent jobs, then open a job detail page for the merged step-aware timeline.
3. Use branch lifecycle cards to drill into child sessions (`/jobs/:jobId/sessions/:sessionId`) and inspect focused Session Activity with breadcrumb context.
4. Use action surfaces for follow-up execution:
   - global command palette (`Cmd/Ctrl+K`)
   - contextual job-level actions on detail views (retry/cancel/force-quit when available)

Remote/tunneled access (same default port as local):

```bash
cd web
bun run dev -- --host 0.0.0.0 --port 3100
# from your local machine
ssh -L 3100:localhost:3100 <user>@<remote-host>
```

Narrow-screen note: recent responsive follow-ups make dashboard cards, timeline rows, and session views usable on small screens for triage and follow-up checks, but desktop remains the primary operator experience.

Release verification checklist for Phase 45 observability/export behavior:

```bash
npx vitest run test/core/opencode-db.test.ts test/core/job-observability.test.ts
npx vitest run test/commands/info.test.ts test/commands/log.test.ts test/commands/status.test.ts test/commands/export.test.ts
npx vitest run test/tui/completed-panel.test.ts test/tui/running-panel.test.ts test/tui/detail-header.test.ts
npm test
```

---

## 7. Recovery Safety Model

Pilot's recovery system is conservative by default:

1. At execution time, Pilot checks the target repository worktree.
2. If the worktree is dirty, execution is refused by default.
3. If the job starts clean, Pilot records base/head checkpoints for safer undo.

### Clean default and dirty refusal

- Default behavior: jobs run only on clean worktrees.
- Typical refusal copy: `Refusing to start job <id>: worktree is dirty...`
- Operator action: commit, stash, or discard local edits, then retry the job.

### `--force-dirty` vs `--force`

- `pilot add --force-dirty` affects **job start** and allows a dirty-start run.
- `pilot undo --force` affects **undo execution** and overrides guarded history checks.
- `pilot undo --force` does **not** bypass a currently dirty worktree.

### Undo workflow

```bash
# inspect first
pilot undo ab12 --dry-run

# apply when safe
pilot undo ab12
```

If newer commits exist after the job checkpoint, Pilot refuses by default and tells you to undo newer work first (or re-run with `--force`).

### Quick troubleshooting for common recovery refusals

| Message snippet | Meaning | What to do |
|---|---|---|
| `worktree is dirty` (runner start) | Job refused before execution | Commit/stash/discard edits, then `pilot retry <id>` |
| `job started from a dirty worktree` | Undo is guarded due to dirty start | Re-run `pilot undo <id> --force` only if you accept losing pre-existing edits |
| `newer commits exist after this checkpoint` | Undo would discard newer history | Undo newer jobs first, or use `--force` intentionally |
| `missing recovery checkpoints` / `cannot resolve stored ... checkpoint` | Metadata or commit no longer available | Undo unavailable for that job; inspect history manually |

---

## 8. Model Profiles & Provider Modes

Control the cost/quality tradeoff per job with `--profile` and `--provider` flags on `pilot add`:

```bash
# High-quality: Opus everywhere
pilot add my-project "Refactor payment module" --profile quality --provider claude-only

# Budget: cheap models, fast
pilot add my-project "Fix typos in docs" --profile budget

# Hybrid: Claude for orchestration, OpenAI for execution
pilot add my-project "Build auth system" --provider hybrid
```

### Profiles

| Profile | Orchestrator | Executor | Judge |
|---------|-------------|----------|-------|
| `quality` | Opus | Opus | Haiku |
| `balanced` (default) | Opus | Sonnet | Haiku |
| `budget` | Sonnet | Sonnet | Haiku |

### Provider modes

| Mode | Orchestrator | Executor |
|------|-------------|----------|
| `claude-only` (default) | Claude | Claude |
| `openai-only` | OpenAI | OpenAI |
| `hybrid` | Claude | OpenAI |

The judge always uses the cheapest tier (Haiku) regardless of profile — it only parses and evaluates a transcript.

---

## 9. Notifications (Optional)

Pilot works perfectly without notifications. Jobs run, complete, and their results are available via `pilot status`, `pilot log`, and the TUI.

When you're ready, you can enable notifications so Pilot tells you (or your agent) when jobs finish.

### Quick Setup (Owner-Based)

The simplest path — register a project owner:

```bash
pilot setup ~/dev/my-project --owner main
```

Then configure a structured notify route for the project:

```bash
pilot project ~/dev/my-project \
  --notify-openclaw \
  --notify-agent main \
  --notify-channel <channel-name> \
  --notify-to <target>
```

Once configured, every job for that project automatically notifies the owner on completion or failure. No `--notify` flag needed on each `pilot add`.

### Per-Job Override

Override or skip notifications for individual jobs:

```bash
pilot add my-project "task" --notify other-agent  # different agent
pilot add my-project "task" --no-notify            # skip notification
```

### Default Notify (All Projects)

Set a default notify target for all projects that don't have their own:

```bash
export PILOT_DEFAULT_NOTIFY=main
# or
pilot config set defaults.notifyTarget main
```

### OpenClaw Webhook Setup

For OpenClaw-based agent delivery (used by `--notify` and owner-based routing):

```bash
export PILOT_OPENCLAW_HOOKS_URL=http://127.0.0.1:18789/hooks/agent
export PILOT_OPENCLAW_HOOKS_TOKEN=your-token-here
```

### Telegram

Send notifications to a Telegram chat:

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID
3. Set the environment variables:

```bash
export PILOT_TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
export PILOT_TELEGRAM_CHAT_ID=123456789
```

---

## 10. Daemon Mode (systemd)

Run Pilot as a persistent background service that continuously processes the job queue.

### Install the service

```bash
pilot service install
```

This creates `~/.config/systemd/user/pilot-runner.service` with:

- `Restart=always` — auto-restarts on crash
- `RestartSec=10` — 10-second cooldown between restarts
- Your current `PATH` is baked into the unit

### Start the daemon

```bash
pilot service start
```

### Check status

```bash
pilot service status
```

### Stop the daemon

```bash
pilot service stop
```

### Prerequisites for daemon mode

**User lingering** — required for systemd user services to persist after you log out:

```bash
loginctl enable-linger $USER
```

**cgroups v2** — required for per-session memory limits (`systemd-run --user --scope`). Available on Ubuntu 22.04+ and most modern distros.

Verify both:

```bash
pilot doctor
```

The `user lingering` and `cgroups v2` checks should show pass.

### How the daemon works

- Polls the SQLite queue on a fixed internal interval (currently 5s)
- Also watches `~/.pilot/pilot.db` for filesystem changes (instant wake on new jobs)
- Auto-detects max parallel jobs based on available RAM
- Enforces a 5-second minimum between spawns to prevent thundering herd
- Memory watchdog runs every 10 seconds — kills the newest session if available RAM drops below `PILOT_MEMORY_KILL_THRESHOLD_MB`
- Graceful shutdown on SIGTERM/SIGINT — finishes current steps, resets in-progress jobs to pending
- SIGHUP triggers hot-reload — drains current work, then re-execs with new code

### Hot-reload after build

```bash
bun run build && pilot reload
```

`pilot reload` sends SIGHUP to the running daemon. Under systemd, the daemon exits and systemd restarts it with the new binary.

> **Tip:** Run `pilot doctor` after reload to confirm the service binary matches your build. See [docs/RUNTIME.md](RUNTIME.md) for the full runtime path guide.

---

## 11. Verification Checklist

Run through this checklist to confirm everything is set up correctly:

```bash
# 1. Bun runtime
bun --version
# Expected: 1.x+

# 2. opencode binary
~/.opencode/bin/opencode --version
# Expected: version string

# 3. Verify GSD sentinels in project setup
pilot setup ~/dev/my-project --verify
# Expected: .opencode/command exists + gsd-help.md present

# 4. System health check
pilot doctor
# Expected: all checks pass (or warn for optional features)

# 5. Project setup verification
pilot setup ~/dev/my-project --verify
# Expected: all pass

# 6. Queue a dry-run job
pilot add my-project "Hello world test" --dry-run
# Expected: shows what would be queued without actually queuing
```

---

## 12. Troubleshooting

### "opencode binary not found"

Install opencode from [https://opencode.ai](https://opencode.ai). The binary should be at `~/.opencode/bin/opencode`. Ensure it's executable:

```bash
chmod +x ~/.opencode/bin/opencode
```

### "get-shit-done-cc not installed" or missing `gsd-help.md`

Ensure dependencies are installed in the Pilot repo:

```bash
bun install
```

Then refresh project setup:

```bash
pilot setup ~/dev/my-project --refresh
pilot doctor --project ~/dev/my-project
```

### "better-sqlite3 build error"

Install build tools:

```bash
# Debian/Ubuntu
sudo apt install build-essential python3

# Fedora/RHEL
sudo dnf groupinstall "Development Tools" && sudo dnf install python3
```

Then reinstall:

```bash
bun install
```

### "permission" vs "permissions" in opencode.json

The key must be `permission` (singular). Using `permissions` (plural) will silently crash opencode. Check your project's `opencode.json`:

```bash
cat ~/dev/my-project/opencode.json
```

Should contain `"permission"`, not `"permissions"`.

### "Another runner is already active"

Another instance of the Pilot runner is already running. Check:

```bash
pilot service status
```

Stop it before starting a new one:

```bash
pilot service stop
```

Or check the lock file directly:

```bash
cat ~/.pilot/runner.lock
```

### "Session never appeared in opencode DB"

This means opencode failed to start or crashed immediately. Common causes:

1. **Missing API keys** — set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
2. **opencode not properly installed** — check `~/.opencode/bin/opencode --version`
3. **Broken project setup** — run `pilot setup ~/dev/my-project --verify`

### "cgroups v2 not mounted"

Your system is running cgroups v1 (common on Ubuntu 20.04 or older). Per-session memory limits via `systemd-run` won't work. The runner will still function but without memory isolation.

To upgrade (requires reboot):

```bash
# Add to kernel command line
sudo sed -i 's/GRUB_CMDLINE_LINUX=""/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=1"/' /etc/default/grub
sudo update-grub
sudo reboot
```

### "user lingering not enabled"

Enable it for your user:

```bash
loginctl enable-linger $USER
```

Verify:

```bash
loginctl show-user $USER --property=Linger
# Expected: Linger=yes
```

Without lingering, systemd user services stop when you log out.

### Low memory warnings

The runner checks `/proc/meminfo` before spawning. If you see "Low memory" warnings:

1. Reduce `PILOT_MAX_PARALLEL` (e.g., set to 1)
2. Lower `PILOT_SESSION_MEMORY_MAX_MB` (default 8192MB)
3. Close other memory-intensive applications
4. The runner waits up to 5 minutes for memory to free up before proceeding anyway
