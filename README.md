# Pilot

<div align="center">

**Autonomous AI development pipeline CLI**

[![npm](https://img.shields.io/npm/v/@punchlab/pilot?style=flat-square)](https://www.npmjs.com/package/@punchlab/pilot)
[![Node.js](https://img.shields.io/badge/runtime-bun-black?style=flat-square)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)

⭐ Star this repo if you find it useful

[Quick Start](#quick-start) · [Features](#features) · [CLI Reference](#cli-reference) · [Architecture](#architecture) · [Configuration](#configuration)

</div>

---

## What is Pilot?

Pilot is an autonomous AI development pipeline. You queue work — a requirements file or a plain description — and Pilot handles the rest without human intervention.

When a job is picked up, a **delegation AI** reads your project's current state (planning docs, phase summaries, roadmap) and produces a structured execution plan. The **runner** then executes each step in sequence by spawning [opencode](https://opencode.ai) sessions. After each significant step, a judge session evaluates the results automatically. Success means the job completes and your configured agent is notified. Failure triggers the retry policy or blocks the project for operator review.

The entire queue lives in a local SQLite database (`~/.pilot/pilot.db`). There are no YAML files to manage, no PID tracking scripts, and no polling bash loops — just a typed TypeScript daemon reading a database.

> [!NOTE]
> Pilot is designed for Linux environments with [opencode](https://opencode.ai) installed. Some features rely on `/proc` and systemd.

---

## Quick Start

```bash
# Install globally
npm install -g @punchlab/pilot

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

---

## Features

### Smart queue with auto-detected scope

`pilot add` inspects the requirement and classifies it as `quick`, `phase`, or `milestone` automatically. You can override with `--as`:

```bash
pilot add my-project "Add logging" --as quick
pilot add my-project requirements/auth.md --as phase
pilot add my-project "Complete v2.0" --as milestone
```

### Delegation AI

Before executing, Pilot spawns a short AI session that reads your project's `.planning/` directory and decides the exact sequence of [GSD](https://github.com/lucafanselau/pilot-gsd) commands to run — `add-phase`, `plan-phase`, `execute-phase`, `verify-phase`, and so on. This replaces fragile regex-based plan parsing.

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

Register projects with an owner agent ID. When a job completes (or fails), Pilot fires a webhook to wake the owner's session:

```bash
pilot setup ~/dev/my-project --owner main
pilot add my-project "Add feature X" --notify main
```

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

Pilot notifies on job completion via:
- **Webhook** — any URL via `--notify-url` or `PILOT_OPENCLAW_HOOKS_URL`
- **Agent routing** — sends to a specific agent session via `--notify <agentId>`
- **Telegram** — via `PILOT_TELEGRAM_BOT_TOKEN` + `PILOT_TELEGRAM_CHAT_ID`

---

## CLI Reference

### Core

| Command | Description |
|---------|-------------|
| `pilot add <project> <requirement>` | Queue work. Auto-detects scope. Flags: `--as <scope>`, `--next`, `--dry-run`, `--profile`, `--provider`, `--notify <agentId>`, `--notify-url <url>`, `--no-notify` |
| `pilot status [project]` | One-shot status dashboard (default command, alias: `s`) |
| `pilot log [id]` | Session activity stream. Flags: `--follow`, `--last <n>`, `--verbose`, `--delegation`, `--flat`, `--task <n>` |
| `pilot info <id>` | Full job metadata, token usage, and cost estimate |
| `pilot queue` | Show job queue. Flag: `--history` for completed/failed (alias: `q`) |

### Queue management

| Command | Description |
|---------|-------------|
| `pilot cancel <id>` | Cancel a pending job |
| `pilot kill <id>` | Force-quit a running job (kills opencode session + marks failed). Requires `--force` |
| `pilot retry <id>` | Retry a failed job |
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
                      │
                      ▼
         ┌────────────────────────┐
         │  Judge evaluation      │
         │  Reads session output  │
         │  pass / fail / partial │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Complete / Fail       │
         │  Notify owner agent    │
         │  Block project on fail │
         └────────────────────────┘
```

**Three code layers:**

- **`core/`** — Pure TypeScript. SQLite access, delegation AI, runner loop, model resolution, callbacks. Zero UI dependencies.
- **`commands/`** — CLI command handlers. Import from `core/`, render human-readable or JSON output.
- **`tui/`** — Full-screen dashboard built with [OpenTUI](https://github.com/nicholasgasior/opentui) and SolidJS. Lazy-loaded only when `pilot tui` runs.

---

## Configuration

Pilot is configured via environment variables. All have sensible defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_PROJECT_DIR` | `~/dev` | Root directory containing your projects |
| `PILOT_GSD_DIR` | `~/dev/pilot-gsd` | Path to the pilot-gsd command definitions repo |
| `PILOT_STUCK_THRESHOLD` | `90` | Minutes before a session is flagged as stuck |
| `PILOT_MAX_PARALLEL` | auto | Max concurrent jobs (auto-detected from RAM: 1–4) |
| `PILOT_POLL_INTERVAL` | `5` | Seconds between queue poll cycles |
| `PILOT_DEFAULT_TIMEOUT` | `60` | Job timeout in minutes |
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

## Built With

- **TypeScript** — strict, fully typed throughout
- **SolidJS + OpenTUI** — reactive terminal UI
- **SQLite** (better-sqlite3) — local job queue and audit trail
- **Commander** — CLI parsing and help formatting
- **opencode** — AI coding agent execution engine

---

## License

MIT
