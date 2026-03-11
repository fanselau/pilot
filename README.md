<div align="center">

<img src="assets/logo/final-readme-header.svg" alt="Pilot — Autopilot for your projects" width="600">

<br><br>

[![Node.js](https://img.shields.io/badge/runtime-bun-black?style=flat-square)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)

Star this repo if you find it useful

[Quick Start](#quick-start) · [Getting Started](#getting-started) · [Features](#features) · [CLI Reference](#cli-reference) · [Architecture](#architecture) · [Configuration](#configuration)

![Pilot Demo](demo/demo.svg)

</div>

---

> **What's New:** Skills system for reusable AI capabilities, AI judge for automatic post-execution evaluation, and per-job timeouts with simplified configuration. See [Features](#features) for details.

---

## What is Pilot?

Pilot is an autonomous AI development pipeline. You queue work — a requirements file or a plain description — and Pilot handles the rest without human intervention.

When a job is picked up, a **delegation AI** reads your project's current state (planning docs, phase summaries, roadmap) and produces a structured execution plan. The **runner** then executes each step in sequence by spawning [opencode](https://opencode.ai) sessions. After execution, an **AI judge** evaluates the results and returns a verdict with confidence score. Success means the job completes and your configured agent is notified (including the judge's verdict and reasoning). Failure triggers the retry policy or blocks the project for operator review.

The entire queue lives in a local SQLite database (`~/.pilot/pilot.db`). There are no YAML files to manage, no PID tracking scripts, and no polling bash loops — just a typed TypeScript daemon reading a database.

> [!NOTE]
> Pilot is designed for Linux environments with [opencode](https://opencode.ai) installed. Some features rely on `/proc` and systemd.

---

## Quick Start

```bash
# Clone with submodules (includes pilot-gsd command definitions)
git clone --recurse-submodules https://github.com/lucafanselau/pilot.git
cd pilot

# Install dependencies and build
bun install
bun run build

# Link globally so `pilot` is available system-wide
bun link --global

# Verify install
pilot --version
pilot doctor
```

Set up a project and run your first job:

```bash
# Set up a project and register an owner for notifications
pilot setup ~/dev/my-project --owner main

# Queue a quick task
pilot add my-project "Fix the flaky test in auth module"

# Queue a full phase from a requirements file
pilot add my-project requirements/add-user-auth.md

# Watch jobs in the live dashboard
pilot tui

# Or check status in one shot
pilot status
```

Start the runner (keeps processing until the queue is empty):

```bash
pilot run
```

Install as a persistent systemd service:

```bash
pilot service install
pilot service start
```

> For the complete installation walkthrough, see **[Getting Started Guide](docs/GETTING-STARTED.md)**.

---

## Getting Started

### Prerequisites

- **[Bun](https://bun.sh) >= 1.x** — primary runtime (the CLI shebang targets `bun`)
- **Node.js >= 18** — needed for `better-sqlite3` native module compilation
- **[opencode](https://opencode.ai)** — the AI coding agent that executes work
- **Build tools** — `build-essential`, `python3` (for compiling `better-sqlite3`)
- **Linux** — required for daemon mode, memory management, and cgroups. Basic job running may work on macOS.

### Setting up pilot-gsd

pilot-gsd contains the GSD command definitions (agent prompts and workflows) and is included as a git submodule.

If you cloned without `--recurse-submodules`, initialize it:

```bash
git submodule update --init
```

Alternatively, clone with submodules in one step:

```bash
git clone --recurse-submodules https://github.com/lucafanselau/pilot.git
```

If you want pilot-gsd in a separate location (e.g. shared across multiple checkouts), clone it to your home directory:

```bash
git clone https://github.com/lucafanselau/pilot-gsd.git ~/pilot-gsd
```

Or set a custom path:

```bash
export PILOT_GSD_DIR=/path/to/pilot-gsd
```

See the [pilot-gsd](https://github.com/lucafanselau/pilot-gsd) repository for more details.

### Verify your setup

```bash
pilot doctor
```

Checks opencode binary, pilot-gsd, system memory, cgroups v2, and user lingering.

> For the complete installation walkthrough — including environment variables, AI provider setup, notification configuration, and daemon mode — see **[Getting Started Guide](docs/GETTING-STARTED.md)**.

---

## Features

### Smart queue with auto-detected scope

`pilot add` inspects the requirement and classifies it as `quick`, `phase`, or `milestone` automatically. You can override with `--as`:

```bash
pilot add my-project "Add logging" --as quick
pilot add my-project requirements/auth.md --as phase
pilot add my-project "Complete v2.0" --as milestone
```

By default, jobs start only when the target repo is clean. If you intentionally need to run on a dirty worktree, queue with `--force-dirty`:

```bash
pilot add my-project "Investigate local regression" --force-dirty
```

`--force-dirty` weakens rollback guarantees for that run. It is not the same as undo `--force`.

### Recovery checkpoints and guarded undo

Pilot records a per-job git base/head checkpoint and exposes guarded rollback via `pilot undo`.

```bash
# Safe path: inspect first, then apply
pilot undo ab12 --dry-run
pilot undo ab12

# Refusal when newer work exists after the job checkpoint
pilot undo ab12
# Refusing undo for job ab12: newer commits exist after this checkpoint...

# Explicit override (history may be discarded)
pilot undo ab12 --force
```

Safety model:
- clean start (default) -> safest checkpoint + undo behavior
- dirty start (`pilot add --force-dirty`) -> undo becomes guarded
- undo `--force` only overrides guarded history/dirty-start checks; it does **not** bypass a currently dirty worktree

### Delegation AI

Before executing, Pilot spawns a short AI session that reads your project's `.planning/` directory and decides the exact sequence of [GSD](https://github.com/lucafanselau/pilot-gsd) commands to run — `add-phase`, `plan-phase`, `execute-phase`, `verify-phase`, and so on. This replaces fragile regex-based plan parsing.

### Skills system

Reusable AI capabilities that are automatically injected into sessions based on job categories. Install skills from GitHub repos, tag them with categories, and Pilot matches them to jobs at runtime.

```bash
# Install a skill from GitHub
pilot skills add owner/repo --categories frontend,testing

# List installed skills
pilot skills list

# Tag a skill with categories
pilot skills tag my-skill --categories docs,api

# See skill categories and counts
pilot skills categories

# Rebuild manifest from filesystem
pilot skills sync
```

When a job runs, Pilot resolves matching skills (by category overlap) and copies them into the project's `.opencode/skills/` directory. After the job finishes, injected skills are cleaned up automatically. Skills with no categories are treated as universal and included in every job.

```bash
# Queue a job with skill categories
pilot add my-project "Build the dashboard" --categories frontend,ui-design
```

### AI judge

After each `execute-phase` step, Pilot spawns a lightweight judge session that evaluates the execution results. The judge returns a structured verdict:

```json
{
  "verdict": "succeeded",
  "confidence": 85,
  "reason": "All planned changes implemented, tests pass, no regressions detected."
}
```

| Verdict | Confidence | Action |
|---------|-----------|--------|
| `succeeded` | any | Job continues |
| `doubting` | ≥ 50 | Treated as pass, job continues |
| `doubting` | < 50 | Job fails with reason |
| `failed` | any | Job fails with reason |

The verdict, confidence score, and reason are included in completion notifications (webhooks and Telegram), so you know at a glance whether the AI is confident in its own work.

### Job observability and export artifacts

Pilot now uses explicit observability semantics across `status`, `info`, `log --summary`, TUI, and exports:

- `requested` - what lane/profile/provider was requested for the run
- `observed` - what models and tokens were actually found from opencode session data
- `estimated` - cost estimate derived from observed token/model usage and maintained pricing assumptions
- `unavailable` - data could not be resolved (missing session data, missing pricing, or no token rollup yet)

Cost values are intentionally labeled as estimates. They are useful for operator triage, not exact provider billing truth.

```bash
# Compact queue-level observability signals (includes live/partial markers)
pilot status

# Full job-level observability and failure context
pilot info ab12

# High-signal summary view without transcript stream
pilot log ab12 --summary
```

Export a portable markdown artifact for sharing, debugging, or attaching to PRs:

```bash
# Default output path: ~/.pilot/exports/job-ab12.md
pilot export ab12

# Custom output path
pilot export ab12 --output docs/exports/ab12.md

# Stream markdown to stdout (for pipes or redirects)
pilot export ab12 --stdout
```

Success-case export example:

```bash
pilot export ab12 --output docs/exports/job-ab12-success.md
```

Failure-case export example (includes failure step/reason + retry context when available):

```bash
pilot export f91c --output docs/exports/job-f91c-failure.md
```

### Model profiles and provider modes

Control the cost/quality tradeoff per job:

```bash
# High-quality run with Claude Opus on all agents
pilot add my-project "Refactor payment module" --profile quality --provider claude-only

# Budget run mixing Claude and OpenAI
pilot add my-project "Fix typos in docs" --profile budget --provider hybrid
```

| Profile | Description |
|---------|-------------|
| `quality` | Opus for orchestration and execution |
| `balanced` | Sonnet for execution (default) |
| `budget` | Haiku for lightweight tasks |

| Provider | Description |
|----------|-------------|
| `hybrid` | Claude for orchestration, OpenAI for execution |
| `claude-only` | All agents use Claude (default) |
| `openai-only` | All agents use OpenAI |

### Managed projects and owner notifications

Optionally register projects with an owner. When configured, Pilot notifies the owner on job completion or failure:

```bash
pilot setup ~/dev/my-project --owner main
pilot project ~/dev/my-project --notify-openclaw --notify-agent main --notify-channel <ch> --notify-to <target>
```

Without owner setup, Pilot still runs all jobs — you just check results manually via `pilot status` or `pilot tui`.

If a job fails after exhausting retries, the project is automatically blocked. No new jobs run until you review and unblock:

```bash
pilot project ~/dev/my-project --block "waiting for API key"
pilot unblock my-project
```

### Real-time TUI dashboard

```bash
pilot tui
```

A full-screen terminal UI with live panels: running jobs with step progress, queue, completed history with token counts, and job detail drill-down. Press Enter on any job to see the full session log inline.

### Health checks

```bash
pilot doctor
```

Validates the opencode binary, SQLite access, available disk space, and memory headroom before you run jobs.

### Daemon mode

```bash
pilot run          # Foreground runner (useful for testing)
pilot service install  # Install systemd user service
pilot service start    # Start as background daemon
```

The daemon auto-detects how many parallel jobs to run based on available RAM, enforces a 5-second minimum between spawns, and watches memory with a kill threshold to protect system stability.

### Notifications

Pilot optionally notifies on job completion via:
- **Agent routing** — sends to a specific OpenClaw agent via owner-based or `--notify <agentId>` routing
- **Webhook** — any URL via `--notify-url`
- **Telegram** — via `PILOT_TELEGRAM_BOT_TOKEN` + `PILOT_TELEGRAM_CHAT_ID`

Notifications are optional. Without configuration, check job results via `pilot status`, `pilot log`, or `pilot tui`.

---

## CLI Reference

### Core

| Command | Description |
|---------|-------------|
| `pilot add <project> <requirement>` | Queue work. Auto-detects scope. Flags: `--as <scope>`, `--next`, `--dry-run`, `--force-dirty`, `--profile`, `--provider`, `--notify <agentId>`, `--notify-url <url>`, `--no-notify`, `--timeout <minutes>`, `--categories <cats>` |
| `pilot status [project]` | One-shot status dashboard (default command, alias: `s`). Flag: `--why` |
| `pilot log [id]` | Session activity stream. Flags: `--summary`, `--follow`, `--last <n>`, `--verbose`, `--delegation`, `--flat`, `--task <n>` |
| `pilot info <id>` | Full job metadata, observability snapshot (requested/observed/estimated/unavailable), and failure insight |
| `pilot export <id>` | Generate portable markdown artifact. Flags: `--output <path>`, `--stdout` |
| `pilot queue` | Show job queue. Flag: `--history` for completed/failed (alias: `q`) |

### Queue management

| Command | Description |
|---------|-------------|
| `pilot cancel <id>` | Cancel a pending job |
| `pilot kill <id>` | Force-quit a running job (kills opencode session + marks failed). Requires `--force` |
| `pilot retry <id>` | Retry a failed job |
| `pilot undo <id> [--dry-run] [--force]` | Roll back a job to its recorded base checkpoint with safety guards for dirty starts and newer/diverged history |
| `pilot bump <id>` | Move job to front of queue |
| `pilot milestone <action> <id>` | Milestone management: `status`, `resume`, `skip` |

### Infrastructure

| Command | Description |
|---------|-------------|
| `pilot setup <dir>` | Set up project for Pilot (links pilot-gsd). Flags: `--verify`, `--owner <agentId>`, `--update` |
| `pilot projects` | List all registered managed projects. Flag: `--blocked` |
| `pilot project <path>` | Show or manage a project. Flags: `--block <reason>`, `--unblock`, `--owner <agentId>`, `--jobs` |
| `pilot unblock <project>` | Unblock a blocked project |
| `pilot update` | Update pilot-gsd command definitions |
| `pilot config` | Show resolved configuration and env vars |
| `pilot doctor` | Health check: binary, DB, disk, memory |
| `pilot service <action>` | Daemon management: `install`, `start`, `stop`, `status` |
| `pilot reload` | Signal running daemon to reload after build |
| `pilot gc` | Clean old jobs and compact the database |

### Skills

| Command | Description |
|---------|-------------|
| `pilot skills` | List installed skills (alias for `pilot skills list`) |
| `pilot skills add <repo>` | Install skills from a GitHub repo. Flags: `--skill <name>`, `--all`, `--categories <cats>` |
| `pilot skills remove <name>` | Remove an installed skill |
| `pilot skills tag <name>` | Add categories to a skill. Flag: `--categories <cats>` (required) |
| `pilot skills categories` | Show all categories with skill counts |
| `pilot skills sync` | Rebuild manifest from filesystem |

### Dashboard

| Command | Description |
|---------|-------------|
| `pilot tui` | Full-screen TUI dashboard. Flag: `--interval <seconds>` (default 3) |

### Runner

| Command | Description |
|---------|-------------|
| `pilot run` | Start queue runner in foreground. Flags: `--once`, `--daemon`, `--max-parallel <n>` |

### Global flags

Every command accepts `--json` for machine-readable output and `--verbose` / `-v` for detailed output.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  pilot add                                               │
│  Queue a job (quick / phase / milestone)                 │
└──────────────────────┬──────────────────────────────────┘
                       │ writes to
                       ▼
              ┌────────────────┐
              │   pilot.db     │  (~/.pilot/pilot.db)
              │   SQLite queue │
              └───────┬────────┘
                      │ runner polls
                      ▼
         ┌────────────────────────┐
         │  Runner (event loop)   │
         │  - Claim next pending  │
         │  - Check RAM + limits  │
         │  - Inject skills       │
         │  - Enforce spawn rate  │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Delegation AI         │
         │  Reads .planning/      │
         │  Outputs step plan     │
         └────────────┬───────────┘
                      │ per step
                      ▼
         ┌────────────────────────┐
         │  opencode sessions     │
         │  One per GSD command   │
         │  (plan, execute, etc.) │
         └────────────┬───────────┘
                      │ after execute-phase
                      ▼
         ┌────────────────────────┐
         │  AI Judge              │
         │  Evaluates execution   │
         │  succeeded / failed /  │
         │  doubting + confidence │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Complete / Fail       │
         │  Notify owner agent    │
         │  Include verdict       │
         │  Block project on fail │
         └────────────────────────┘
```

The pipeline flow is: **delegate → execute → judge → notify**.

**Three code layers:**

- **`core/`** — Pure TypeScript. SQLite access, delegation AI, runner loop, model resolution, callbacks. Zero UI dependencies.
- **`commands/`** — CLI command handlers. Import from `core/`, render human-readable or JSON output.
- **`tui/`** — Full-screen dashboard built with [OpenTUI](https://github.com/nicholasgasior/opentui) and SolidJS. Lazy-loaded only when `pilot tui` runs.

---

## Configuration

Pilot is configured via environment variables and an optional config file (`~/.pilot/config.json`). All have sensible defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_PROJECT_DIR` | `~/dev` | Root directory containing your projects |
| `PILOT_GSD_DIR` | `./pilot-gsd` (relative to pilot install) | Path to the pilot-gsd command definitions repo |
| `PILOT_MAX_PARALLEL` | auto | Max concurrent jobs (auto-detected from RAM: 1-4) |
| `PILOT_SESSION_MEMORY_MAX_MB` | `8192` | Per-session systemd memory limit (MB) |
| `PILOT_RESERVED_MEMORY_MB` | `4096` | RAM reserved for OS before dynamic parallel calc (MB) |
| `PILOT_MEMORY_KILL_THRESHOLD_MB` | `2048` | Watchdog kills sessions if available RAM drops below (MB) |
| `PILOT_LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `PILOT_DEFAULT_NOTIFY` | (unset) | Default agent ID for job completion notifications |
| `PILOT_OPENCLAW_HOOKS_URL` | (unset) | Base webhook URL for session wake notifications |
| `PILOT_OPENCLAW_HOOKS_TOKEN` | (unset) | Auth token for the hooks endpoint |
| `PILOT_TELEGRAM_BOT_TOKEN` | (unset) | Telegram bot token for notifications |
| `PILOT_TELEGRAM_CHAT_ID` | (unset) | Telegram chat ID for notifications |
| `NO_COLOR` | (unset) | Set to any value to disable ANSI colors |

Timeouts are set per-job rather than globally:

```bash
pilot add my-project "Long running migration" --timeout 120  # 120 minutes
```

The default is `0` (no timeout). Poll interval and stuck detection are handled internally.

### opencode.json

Each project needs an `opencode.json` to grant permissions to the AI agents:

```json
{
  "permission": "allow",
  "instructions": "You are working on my-project. Follow the plan."
}
```

### Model profile config

When the runner launches a job, it writes `.planning/config.json` into the project directory with resolved model IDs for each agent. This ensures every opencode session uses the correct model for the selected profile and provider.

---

## Requirements

- **Bun >= 1.x** — primary runtime (the CLI shebang targets `bun`)
- **[opencode](https://opencode.ai)** — the AI coding agent that executes work
- **[pilot-gsd](https://github.com/lucafanselau/pilot-gsd)** — GSD command definitions (agent prompts, workflows)
- **Linux** — some features use `/proc` for memory checks and systemd for service management

> [!IMPORTANT]
> Run `pilot doctor` after installation to verify your environment is correctly configured.

---

## Contributing

Contributions are welcome! Please open an issue to discuss what you'd like to change before submitting a PR.

---

## Built With

- **TypeScript** — strict, fully typed throughout
- **SolidJS + OpenTUI** — reactive terminal UI
- **SQLite** (better-sqlite3) — local job queue and audit trail
- **Commander** — CLI parsing and help formatting
- **opencode** — AI coding agent execution engine

---

## License

MIT
