
# Pilot

Autonomous AI development pipeline CLI that monitors running AI sessions, manages a job queue, detects stuck processes, orchestrates project lifecycle commands, and provides a full-screen TUI dashboard. Replaces bash scripts with typed TypeScript for reliability.

## Quick Start

```bash
# Install
npm install -g @punchlab/pilot

# Or run from source
git clone https://github.com/lucafanselau/pilot.git
cd pilot
npm install
npm run build
npm link

# Set up a project
pilot setup ~/dev/my-project

# Check status
pilot status

# View queue
pilot queue

# Start the queue runner
pilot run
```

## Commands

### Monitoring

```
pilot status [--verbose]           Dashboard: running, stuck, queued, completed (default command)
pilot queue                        Pretty-print QUEUE.md
pilot stuck [--threshold N] [-k]   Find stuck processes
pilot log <session>                Session transcript
pilot tail <session>               Live-follow session log
pilot projects                     All projects with state
pilot progress [project]           Deep project progress
```

### Setup

```
pilot setup <dir>                  Set up project for Pilot
pilot update                       Update pilot-gsd definitions
pilot config                       Show configuration
```

### Queue Management

```
pilot run [--max-parallel N]       Start queue runner
pilot stop [--force]               Stop queue runner
pilot add <project> <mode>         Add entry to queue
pilot build <project> [desc]       Queue + run (convenience)
```

### Project Lifecycle

```
pilot init <project> [desc]        Initialize new project
pilot plan <project> <phase>       Plan a phase
pilot execute <project> <phase>    Execute a phase
pilot verify <project> <phase>     Automated UAT
pilot quick <project> <desc>       Quick ad-hoc task
pilot debug <project> [desc]       Debug session
pilot research <project> <phase>   Research a phase
pilot scope <project> <desc>       Add phase to roadmap
pilot insert <project> <N> <desc>  Insert decimal phase
pilot remove <project> <N>         Remove future phase
pilot milestone <subcommand>       Milestone management
pilot todos <subcommand>           Todo management
pilot map <project>                Map existing codebase
```

### Dashboard

```
pilot tui [--interval N]           Full-screen TUI dashboard
```

### Global Flags

Every command supports `--json` for machine-readable output. Use `-v` / `--verbose` for detailed tables.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_QUEUE_FILE` | `~/dev/QUEUE.md` | Path to QUEUE.md |
| `PILOT_LOG_DIR` | `/tmp` | Log and PID file directory |
| `PILOT_STUCK_THRESHOLD` | `90` | Stuck threshold in minutes |
| `PILOT_PROJECT_DIR` | `~/dev` | Root directory containing project dirs |
| `PILOT_GSD_DIR` | `~/dev/pilot-gsd` | Path to pilot-gsd repo (commands/agents/workflows) |
| `NO_COLOR` | (unset) | Disable ANSI colors |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    src/index.ts                       │
│              (commander program setup)                │
└──────────┬───────────────────────────┬───────────────┘
           │                           │
    ┌──────▼──────┐             ┌──────▼──────┐
    │  commands/   │             │    tui/      │
    │  (CLI mode)  │             │  (Ink app)   │
    │  One file    │             │  React 18    │
    │  per command │             │  components  │
    └──────┬──────┘             └──────┬──────┘
           │                           │
           └───────────┬───────────────┘
                       │
                ┌──────▼──────┐
                │    core/     │
                │  Pure TS     │
                │  No UI deps  │
                └──────────────┘
```

**Three-layer architecture:**

- **`core/`** — Pure TypeScript data layer with zero UI dependencies. Sessions, queue parsing, stuck detection, process management, project scanning.
- **`commands/`** — CLI command handlers. Import from `core/`, render human-readable or JSON output via picocolors and cli-table3.
- **`tui/`** — Full-screen Ink/React dashboard. Lazy-loaded only when `pilot tui` is invoked.

**Key rule:** `core/` has zero UI dependencies. Import direction is always `commands/ → core/` and `tui/ → core/`. Never the reverse.

**Key dependencies:** commander, picocolors, cli-table3, execa, tree-kill, proper-lockfile, ink, react

## License

MIT — see [LICENSE](./LICENSE) for details.
