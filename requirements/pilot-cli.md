# Pilot CLI — Definitive Requirements Specification

> **Version:** 1.0 | **Date:** 2026-02-20
> **Repo:** `punchlab-dev/pilot` at `~/dev/punchlab/pilot/` (branch: `dev`)
> **Purpose:** THE interface for an autonomous AI development pipeline. Used by humans and AI agents (Gorb/OpenClaw).

---

## Ground Truth References

**READ THESE FILES before writing any code. They are the behavioral spec:**

| File | What it defines |
|------|----------------|
| `~/dev/punchlab/gsd-cli/.archive/gsd-bash` | 1219-line bash CLI — output formats for status, queue, stuck, log, tail |
| `~/dev/punchlab/gsd-queue-v5.sh` | 667-line bash queue runner — lifecycle modes, state detection, process management |
| `~/dev/punchlab/pilot/requirements/pilot-cli.md` | This file — the complete spec |

Match the bash output formats exactly (substituting "pilot" for "gsd" in branding). The bash scripts are the ground truth for behavior; this document is the ground truth for architecture and improvements.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Project Structure](#2-project-structure)
3. [Configuration Files](#3-configuration-files)
4. [Phase 1: Foundation — Monitoring + Setup](#4-phase-1)
5. [Phase 2: Automation — Queue Runner + Lifecycle](#5-phase-2)
6. [Phase 3: TUI Dashboard](#6-phase-3)
7. [Stuck Detection Algorithm](#7-stuck-detection)
8. [Queue Runner State Machine](#8-queue-runner-state-machine)
9. [Lifecycle Modes](#9-lifecycle-modes)
10. [The --json Contract](#10-json-contract)
11. [Testing Strategy](#11-testing-strategy)
12. [Do NOT](#12-do-not)

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    src/index.ts                           │
│              (commander program setup)                    │
└──────────┬───────────────────────────────┬───────────────┘
           │                               │
    ┌──────▼──────┐                 ┌──────▼──────┐
    │  commands/   │                 │    tui/      │
    │  (CLI mode)  │                 │  (Ink app)   │
    │  One file    │                 │  React 18    │
    │  per command │                 │  components  │
    └──────┬──────┘                 └──────┬──────┘
           │                               │
           └───────────┬───────────────────┘
                       │
                ┌──────▼──────┐
                │    core/     │
                │  Pure TS     │
                │  No UI deps  │
                └──────────────┘
```

**Key rule:** `core/` has ZERO UI dependencies. No picocolors, no cli-table3, no ink, no React. It exports pure typed data structures. Both `commands/` and `tui/` import from `core/` and handle rendering independently.

**Import direction:** `commands/ → core/`, `tui/ → core/`. Never `core/ → commands/`, never `core/ → tui/`, never `commands/ ↔ tui/`.

**CLI commands MUST NOT import React or Ink.** The TUI is lazily loaded only when `pilot tui` is invoked. This keeps CLI startup fast (<100ms).

---

## 2. Project Structure

```
pilot/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── requirements/
│   └── pilot-cli.md              # This file
├── src/
│   ├── index.ts                  # Entry point: commander program, global --json flag, dispatch
│   ├── commands/
│   │   ├── status.ts             # pilot status
│   │   ├── queue.ts              # pilot queue
│   │   ├── stuck.ts              # pilot stuck
│   │   ├── log.ts                # pilot log <session>
│   │   ├── tail.ts               # pilot tail <session>
│   │   ├── projects.ts           # pilot projects
│   │   ├── progress.ts           # pilot progress [project]
│   │   ├── setup.ts              # pilot setup <dir>
│   │   ├── update.ts             # pilot update
│   │   ├── config.ts             # pilot config
│   │   ├── run.ts                # pilot run              (Phase 2)
│   │   ├── stop.ts               # pilot stop             (Phase 2)
│   │   ├── add.ts                # pilot add              (Phase 2)
│   │   ├── build.ts              # pilot build            (Phase 2)
│   │   ├── init.ts               # pilot init             (Phase 2)
│   │   ├── plan.ts               # pilot plan             (Phase 2)
│   │   ├── execute.ts            # pilot execute          (Phase 2)
│   │   ├── verify.ts             # pilot verify           (Phase 2)
│   │   ├── quick.ts              # pilot quick            (Phase 2)
│   │   ├── debug.ts              # pilot debug            (Phase 2)
│   │   ├── scope.ts              # pilot scope            (Phase 2)
│   │   ├── insert.ts             # pilot insert           (Phase 2)
│   │   ├── remove.ts             # pilot remove           (Phase 2)
│   │   ├── research.ts           # pilot research         (Phase 2)
│   │   ├── milestone.ts          # pilot milestone        (Phase 2)
│   │   ├── todos.ts              # pilot todos            (Phase 2)
│   │   ├── map.ts                # pilot map              (Phase 2)
│   │   └── tui.ts                # pilot tui              (Phase 3)
│   ├── core/
│   │   ├── config.ts             # Env var resolution, defaults, paths
│   │   ├── sessions.ts           # opencode session list/export wrappers
│   │   ├── queue-parser.ts       # QUEUE.md v5 parser (read + write + mark)
│   │   ├── stuck.ts              # Multi-signal stuck detection algorithm
│   │   ├── process.ts            # PID file management, process spawning, tree-kill
│   │   ├── projects.ts           # Project directory scanning, git state, .planning state
│   │   ├── progress.ts           # Deep project progress analysis
│   │   ├── setup.ts              # Symlink creation, opencode.json generation
│   │   ├── runner.ts             # Queue runner state machine              (Phase 2)
│   │   ├── lifecycle.ts          # Lifecycle mode implementations          (Phase 2)
│   │   ├── phase-state.ts        # Phase state detection + STATE files     (Phase 2)
│   │   ├── spawn.ts              # opencode process spawning + monitoring  (Phase 2)
│   │   ├── lock.ts               # proper-lockfile wrapper for QUEUE.md    (Phase 2)
│   │   ├── postmortem.ts         # JSONL job result logging                (Phase 2)
│   │   └── types.ts              # All shared TypeScript interfaces
│   ├── tui/                      # Phase 3
│   │   ├── App.tsx               # Root Ink component
│   │   ├── Dashboard.tsx         # Full-screen layout with panels
│   │   ├── RunningPanel.tsx      # Active sessions panel
│   │   ├── QueuePanel.tsx        # Queue display panel
│   │   ├── LogPanel.tsx          # Log viewer panel
│   │   └── CompletedPanel.tsx    # Recent completions panel
│   └── util/
│       ├── output.ts             # JSON/human output helpers, --json branching
│       ├── format.ts             # Duration formatting, string truncation
│       └── colors.ts             # picocolors wrapper with NO_COLOR support
└── test/
    ├── fixtures/
    │   ├── queue-v5-sample.md    # Sample QUEUE.md for parser tests
    │   ├── sessions.json         # Mock opencode session list output
    │   └── export.json           # Mock opencode export output
    ├── core/
    │   ├── queue-parser.test.ts
    │   ├── stuck.test.ts
    │   ├── sessions.test.ts
    │   ├── config.test.ts
    │   └── projects.test.ts
    └── commands/
        ├── status.test.ts
        └── queue.test.ts
```

---

## 3. Configuration Files

### package.json

```json
{
  "name": "@punchlab/pilot",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "pilot": "./dist/index.js"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "picocolors": "^1.1.0",
    "cli-table3": "^0.6.5",
    "ora": "^8.1.0",
    "execa": "^9.5.0",
    "tree-kill": "^1.2.2",
    "proper-lockfile": "^4.1.2"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "@types/proper-lockfile": "^4.1.4"
  },
  "optionalDependencies": {
    "ink": "^5.2.0",
    "react": "^18.3.0",
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

**Note:** ink/react are `optionalDependencies` so Phase 1 and 2 work without them. Phase 3 moves them to `dependencies`.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
```

---

## 4. Phase 1: Foundation — Monitoring + Setup

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PILOT_QUEUE_FILE` | `~/dev/punchlab/QUEUE.md` | Path to QUEUE.md |
| `PILOT_LOG_DIR` | `/tmp` | Log and PID file directory |
| `PILOT_STUCK_THRESHOLD` | `90` | Stuck threshold in minutes |
| `PILOT_PROJECT_DIR` | `~/dev/punchlab` | Root directory containing project dirs |
| `PILOT_GSD_DIR` | `~/dev/punchlab/pilot-gsd` | Path to pilot-gsd repo (commands/agents/workflows) |
| `NO_COLOR` | (unset) | Disable ANSI colors |

`core/config.ts` resolves these with defaults. Use `os.homedir()` for `~` expansion. Expose a `getConfig()` function returning a typed `PilotConfig` object.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (file not found, process failed) |
| 2 | Usage error (bad args, unknown command) |

Commander's `.exitOverride()` + custom error handler to map commander parse errors to exit code 2.

### Global Flags

Every command supports `--json`. Implement as a global option on the commander program. When `--json` is set, commands output `JSON.stringify(data, null, 2)` to stdout and exit. No color codes, no spinners, no tables.

---

### Command: `pilot status`

**Aliases:** `pilot` (default command when no args), `pilot s`
**Flags:** `--json`, `--verbose` / `-v`

**What it does internally:**
1. Call `opencode session list --format json` via `execa` → parse JSON array of sessions
2. Scan PID files in `$PILOT_LOG_DIR` matching `gsd-*-pid` (keep the `gsd-` prefix for backward compat with existing PID files)
3. Cross-reference: a session is "running" if its title matches a live PID (verified via `kill -0`)
4. Parse QUEUE.md via queue parser → count queued/in-progress items
5. Run stuck detection on all PID files (see §7)
6. Get last 5 sessions sorted by `.updated` descending as "completed"

**Human output (compact):**
```
📊 Pilot Status
────────────────────────────────────────────────────────

3 running  0 stuck  2 queued

Running
  ● resume-roast-execute-phase-3
  ● pet-portraits-plan-phase-2
  ● baby-predictor-verify-auto-1

Queued
  ○ hub
  ○ registry
  ... and 0 more

Recently Completed
  ✓ resume-roast-plan-phase-3 (done)
  ✓ pet-portraits-new-project (done)
```

**Human output (verbose):** Adds PID, duration, log activity columns in table format. See bash `cmd_status` verbose mode.

**JSON output:** See §10 for full schema.

**Error cases:**
- `opencode` not in PATH → exit 1, message: `Error: opencode not found in PATH. Install: npm install -g opencode-ai`
- `jq` not required (we parse JSON in Node.js, not jq)

---

### Command: `pilot queue`

**Aliases:** `pilot q`
**Flags:** `--json`

**What it does internally:**
1. Read `$PILOT_QUEUE_FILE`
2. Parse QUEUE.md v5 format (see queue parser spec below)
3. Group items by status: running (🔨) → queued (pending) → done (✅) → failed (❌)

**QUEUE.md v5 Format (the parser MUST handle):**
```markdown
## project-name | mode | args
Optional description line

## ✅ DONE: project-name | mode | args
## ❌ FAIL: project-name | mode | args
## 🔨 project-name | mode | args
```

Headers start with `## `. The `|` splits project, mode, args. Status prefixes after `## `:
- No prefix → pending/queued
- `🔨 ` → running
- `✅ DONE: ` → completed
- `❌ FAIL: ` → failed

Lines immediately after a `##` header matching `key: value` are metadata:
- `depends-on: project1, project2` — cross-project dependencies (Phase 2)
- `timeout: 120` — per-job timeout in minutes (Phase 2)

**Queue parser output type:**
```typescript
interface QueueEntry {
  lineNum: number;        // 1-indexed line number in file
  project: string;
  mode: string;           // build-full, continue, continue-all, etc.
  args: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  description?: string;   // lines after header before next ##
  dependsOn?: string[];   // Phase 2
  timeout?: number;       // Phase 2, minutes
}
```

**Human output:**
```
Queue: ~/dev/punchlab/QUEUE.md
────────────────────────────────────────────────────────

In Progress
  ⟳ resume-roast: continue-all
  ⟳ pet-portraits: build-full | AI pet portrait generator

Queued
  ○ hub: continue
  ○ registry: add-and-build | add caching per requirements/cache.md

Done
  ✓ baby-predictor: build-full | AI baby face predictor
  ✓ resume-roast: run-command | quick fix navbar

Failed
  ✗ caricature: build-full | Caricature studio tool

4 active item(s)
```

**Error cases:**
- Queue file not found → exit 1: `Error: Queue file not found: <path>`

---

### Command: `pilot stuck`

**Flags:** `--threshold N` / `-t N` (minutes, default from env), `--kill` / `-k`, `--force` / `-f`, `--json`

**What it does internally:**
1. Scan PID files in `$PILOT_LOG_DIR` matching `gsd-*-pid`
2. For each: run the weighted stuck scoring algorithm (see §7)
3. Classify: score ≥ 70 = STUCK, score 40-69 = SUSPECT, score < 40 = HEALTHY
4. Display stuck and suspect processes

**Human output:**
```
Stuck Processes (threshold: 90m)
────────────────────────────────────────────────────────
PID      SESSION                   RUNTIME      LOG IDLE       SCORE
12345    resume-roast-execute-ph…  2h 15m       45m            85
23456    pet-portraits-plan-phas…  1h 30m       30m            72

Suspect (monitoring)
34567    baby-predictor-verify-a…  55m          10m            45
```

**--kill behavior:**
1. If not `--force`: prompt "Kill N stuck process(es)? [y/N]" (only if stdin is TTY)
2. If stdin is not TTY and no `--force`: exit 1 with error
3. Send SIGTERM to each stuck PID
4. Clean up PID file
5. Report what was killed

**JSON output:** `{ timestamp, threshold_minutes, stuck: [{pid, session, runtime_seconds, log_staleness_seconds, score, verdict}], suspect: [...] }`

---

### Command: `pilot log`

**Args:** `<session>` (required)
**Flags:** `--json`

**What it does internally:**
1. Call `opencode session list --format json` → search for session by title or ID
2. **Fuzzy matching:** If exact match fails, find sessions where the title CONTAINS the query string (case-insensitive). If multiple matches, pick the most recently updated one. If zero matches, exit 1.
3. Call `opencode export <session-id>` → parse the JSON output
4. Extract messages, format as readable transcript

**Human output:** Matches the bash `cmd_log` format — user messages in cyan box, assistant in green box, tool calls in dim brackets:
```
resume-roast-plan-phase-3 — Session Log
────────────────────────────────────────────────────────

╔ User ═══════════════════════════════════════════╗
Phase 3 --auto

╔ Assistant ══════════════════════════════════════╗
I'll plan Phase 3 for resume-roast...
  [Read] completed
  [Write] completed
Planning complete. Created 3 plan files.
```

**Error cases:**
- Missing `<session>` arg → exit 2: `Missing required argument: <session>`
- Session not found after fuzzy search → exit 1: `Session not found: <query>`
- Export fails → exit 1: `Failed to export session: <id>`

---

### Command: `pilot tail`

**Args:** `<session>` (required)

**What it does internally:**
1. Resolve log file: `$PILOT_LOG_DIR/gsd-${session}.log`
2. If file doesn't exist → exit 1
3. Use `node:fs.watch` on the file + read new lines on change events
4. Output new lines to stdout in real-time
5. Ctrl-C → clean exit with message "Stopped following: <session>"

**Do NOT** use `tail -f` via child process. Implement natively with `fs.watch` + `fs.createReadStream` tracking file position.

---

### Command: `pilot projects`

**Aliases:** `pilot p`
**Flags:** `--json`

**What it does internally:**
1. Glob `$PILOT_PROJECT_DIR/*/` for project directories
2. For each: check if `.planning/` exists, read `.planning/STATE.md`, `.planning/ROADMAP.md`
3. Run `git status --porcelain` and `git branch --show-current` via execa
4. Determine GSD state: no-planning, active (current phase + state), completed
5. Calculate progress: count done phases / total phases from ROADMAP.md

**Human output:**
```
Projects (~/dev/punchlab)
────────────────────────────────────────────────────────
PROJECT              BRANCH     GIT       STATE           PROGRESS
resume-roast         dev        clean     Phase 3 exec    ████████░░ 60%
pet-portraits        dev        dirty     Phase 2 plan    ███░░░░░░░ 20%
baby-predictor       dev        clean     complete        ██████████ 100%
hub                  dev        clean     no planning     ░░░░░░░░░░ 0%
```

---

### Command: `pilot progress`

**Aliases:** `pilot pg`
**Args:** `<project>` (optional — defaults to cwd project, detected by `.planning/` in cwd or parent)
**Flags:** `--json`

**What it does internally:**
1. Read `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`
2. Read recent `*-SUMMARY.md` files in phase directories
3. Calculate overall progress, per-phase status, blockers, next action
4. Format as deep progress view

**Human output:**
```
resume-roast — Progress
────────────────────────────────────────────────────────
Overall: ████████░░ 60% (6/10 phases)

Phase  Status     Description
  1    ✅ done     Project setup and configuration
  2    ✅ done     Core PDF parsing engine
  3    🔨 exec     AI roast generation
  4    ○ pending   Payment integration
  ...

Current: Phase 3 — executing
Next action: verify Phase 3
Blockers: none
```

---

### Command: `pilot setup`

**Args:** `<dir>` (required — project directory path)

**What it does internally:**
1. Resolve `<dir>` to absolute path. Create it if it doesn't exist.
2. Create `.opencode/` directory in project
3. Create symlinks:
   - `<dir>/.opencode/command/` → `$PILOT_GSD_DIR/commands/` (note: target is `commands/` plural)
   - `<dir>/.opencode/agents/` → `$PILOT_GSD_DIR/agents/`
   - `<dir>/.opencode/get-shit-done/` → `$PILOT_GSD_DIR/get-shit-done/`
4. Create `<dir>/opencode.json` with permissive config:
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
5. Add `.opencode/` to `<dir>/.gitignore` if not already present
6. If `<dir>` is not a git repo, run `git init -q`

**Symlink layout:**
```
<project>/
├── .opencode/
│   ├── command/ → ~/dev/punchlab/pilot-gsd/commands/
│   ├── agents/ → ~/dev/punchlab/pilot-gsd/agents/
│   └── get-shit-done/ → ~/dev/punchlab/pilot-gsd/get-shit-done/
├── opencode.json
└── .gitignore  (includes .opencode/)
```

**Error cases:**
- `$PILOT_GSD_DIR` doesn't exist → exit 1: `Error: pilot-gsd not found at <path>. Set PILOT_GSD_DIR or clone https://github.com/punchlab-dev/pilot-gsd`
- Symlink target dirs don't exist → exit 1 with specific missing dir
- opencode.json already exists → skip (don't overwrite), print note

**Human output:**
```
✓ Created .opencode/command/ → ~/dev/punchlab/pilot-gsd/commands/
✓ Created .opencode/agents/ → ~/dev/punchlab/pilot-gsd/agents/
✓ Created .opencode/get-shit-done/ → ~/dev/punchlab/pilot-gsd/get-shit-done/
✓ Created opencode.json
✓ Added .opencode/ to .gitignore
Setup complete: /home/luca/dev/punchlab/my-project
```

---

### Command: `pilot update`

**What it does internally:**
1. `cd $PILOT_GSD_DIR && git pull` via execa
2. If pull succeeds, verify symlink targets still exist
3. Report result

**Human output:**
```
Updating pilot-gsd...
Already up to date.
✓ pilot-gsd is current
```

**Error cases:**
- pilot-gsd dir doesn't exist → exit 1
- git pull fails → exit 1 with git error

---

### Command: `pilot config`

**Flags:** `--json`

**What it does internally:** Print all resolved config values (env vars with their resolved defaults and actual paths).

**Human output:**
```
Pilot Configuration
────────────────────────────────────────────────────────
PILOT_QUEUE_FILE       ~/dev/punchlab/QUEUE.md
PILOT_LOG_DIR          /tmp
PILOT_STUCK_THRESHOLD  90 (minutes)
PILOT_PROJECT_DIR      ~/dev/punchlab
PILOT_GSD_DIR          ~/dev/punchlab/pilot-gsd
NO_COLOR               (not set)
opencode               /home/luca/.opencode/bin/opencode (found)
```

---

### Command: `pilot help`

**Aliases:** `pilot --help`, `pilot -h`

Implemented by commander's auto-generated help. Customize to show grouped commands:

```
Usage: pilot [options] [command]

THE interface for the Pilot autonomous AI development pipeline.

Options:
  --json           Output as JSON
  -v, --verbose    Verbose output
  -V, --version    Print version
  -h, --help       Show help

Monitoring:
  status [options]          Dashboard (default command)
  queue [options]           Pretty-print QUEUE.md
  stuck [options]           Find stuck processes
  log <session>             Session transcript
  tail <session>            Live-follow session
  projects [options]        All projects with state
  progress [project]        Deep project progress

Setup:
  setup <dir>               Set up project for Pilot
  update                    Update pilot-gsd definitions
  config                    Show configuration

Queue Management:
  run [options]             Start queue runner
  stop [options]            Stop queue runner
  add <project> <mode>      Add to queue
  build <project> [desc]    Queue + run

Project Lifecycle:
  init <project> [desc]     Initialize new project
  plan <project> <phase>    Plan a phase
  execute <project> <phase> Execute a phase
  verify <project> <phase>  Automated UAT
  quick <project> <desc>    Quick ad-hoc task
  debug <project> [desc]    Debug session
  research <project> <phase> Research a phase

Project Management:
  scope <project> <desc>    Add phase to roadmap
  insert <project> <N> <d>  Insert decimal phase
  remove <project> <N>      Remove future phase
  milestone <subcommand>    Milestone management
  todos <subcommand>        Todo management
  map <project>             Map existing codebase

Dashboard:
  tui [options]             Full-screen TUI dashboard
```

---

### Command: `pilot version`

**Aliases:** `pilot --version`, `pilot -V`

Print version from package.json: `pilot 0.1.0`

---

## 5. Phase 2: Automation — Queue Runner + Lifecycle

### Command: `pilot run`

**Flags:** `--max-parallel N` (default: 5), `--max-retries N` (default: 3), `--once`, `--dry-run`, `--force`

**What it does:**
Port of `gsd-queue-v5.sh` as a typed TypeScript state machine. See §8 for full state machine spec and §9 for lifecycle modes.

**Key behaviors (matching bash):**
- Write PID to `$PILOT_LOG_DIR/gsd-queue-pid` (keep `gsd-` prefix for backward compat)
- Same-project entries are SEQUENTIAL. Cross-project entries PARALLEL up to `--max-parallel`.
- Loop: scan queue → find launchable entry → wait for capacity → spawn → mark running → repeat
- When no launchable entries but jobs running: wait for any job to finish, then rescan
- When queue empty and no jobs running: exit
- `--once`: process queue once then exit (don't loop)
- `--dry-run`: show what would run without spawning
- `--force`: ignore stale PID file (overwrite existing runner)
- Log all activity to `$PILOT_LOG_DIR/gsd-queue.log` (keep `gsd-` prefix)

**Pre-spawn checks (execute before EVERY opencode launch):**
1. Disable git gc on ALL snapshot repos INCLUDING the global one: `for repo in ~/.local/share/opencode/snapshot/*/; do git -C "$repo" config gc.auto 0; done` AND `git -C ~/.local/share/opencode/snapshot/global config gc.auto 0` — the global repo is NOT matched by `*/` glob and has caused 2.6GB RAM spikes from `git pack-objects`. This is the #1 silent performance killer.
2. Memory check: read `/proc/meminfo` → MemAvailable. If < 500MB, wait (check every 30s) until enough is free. Log the wait so operators know why nothing is launching.
3. Config validation: verify `opencode.json` exists in project dir, is valid JSON, `permission` field (NOT `permissions` — singular!) has `"**": "allow"` for all types, `instructions` field is array (NOT string — `"instructions": "foo"` crashes opencode silently with "expected array, received string")
4. Binary check: verify `opencode` is in PATH. Default location: `~/.opencode/bin/opencode`. The binary is NOT in standard PATH — pilot must add `~/.opencode/bin` to PATH before spawning. Also ensure node is available (check `~/.local/share/fnm/` paths).
5. Truncate title to 80 chars (title = `${project}-${command}${sanitized_args}`). Long titles cause ENAMETOOLONG on log files → ALL retries fail silently with 0 messages.
6. Never use `nohup` to background opencode — it closes stdin which kills sessions. Always use `setsid` or detached child_process with `stdin: 'ignore'`.

**Process spawning:**
```typescript
// Spawn via execa, detached
const proc = execa('opencode', [
  'run', '--format', 'default', '--title', title,
  '--command', `gsd-${command}`, ...(args ? [args] : [])
], {
  cwd: projectDir,
  stdin: 'ignore',       // equivalent to < /dev/null
  stdout: fs.openSync(logFile, 'a'),
  stderr: fs.openSync(logFile, 'a'),
  detached: true,
});
```

Write PID file: `$PILOT_LOG_DIR/gsd-${title}-pid`

**Success detection (MUST match bash, minus the ≥8 messages heuristic):**
1. ✅ New git commits since pre-run count → success
2. ✅ Uncommitted `.planning/` changes → commit them, success
3. ❌ Do NOT use "≥8 messages" as success signal (phantom completion bug)
4. If opencode exits with code 0 and produced session messages → success

**On failure after MAX_RETRIES:** Mark entry as ❌ FAIL in QUEUE.md.

**Graceful shutdown (SIGTERM handler):**
1. Stop accepting new jobs
2. Send SIGTERM to all active child processes
3. Wait 15 seconds
4. Send SIGKILL to survivors (via tree-kill for entire process trees)
5. Mark running queue entries back to pending
6. Clean up PID files
7. Exit 0

---

### Command: `pilot stop`

**Flags:** `--force`

**What it does:**
1. Read PID from `$PILOT_LOG_DIR/gsd-queue-pid`
2. If PID not alive → clean up file, report "Runner not running"
3. Send SIGTERM to runner PID
4. Wait up to 30s for exit
5. If `--force` and still alive after 30s → SIGKILL
6. Clean up PID file

---

### Command: `pilot add`

**Args:** `<project> <mode> [args]`
**Flags:** `--dry-run`

**Valid modes:** `build-full`, `continue`, `continue-all`, `build-to-phase`, `add-and-build`, `run-command`

**What it does:**
1. Validate project directory exists (or will be created for build-full)
2. Validate mode is one of the valid modes
3. Lock QUEUE.md (proper-lockfile)
4. Append `## project | mode | args` to QUEUE.md
5. Unlock

---

### Command: `pilot build`

**Args:** `<project> [description]`
**Flags:** `--no-run`

**What it does (convenience sugar):**
1. If project has no `.planning/` → mode = `build-full`, args = description
2. If project has `.planning/` → mode = `continue-all`
3. `build-full` MUST FAIL if `.planning/` exists. This prevents the phantom completion bug where it "completes" existing phases without building new requirements.
4. Call `pilot add <project> <mode> [args]`
5. Unless `--no-run`: check if runner is active (PID file + alive). If not, start it.

---

### Command: `pilot init`

**Args:** `<project> [description]`
**Flags:** `--auto`

**Maps to:** `opencode run --command gsd-new-project [--auto] [description]` in project directory.

Before running:
1. Create project dir if needed
2. Run `pilot setup <project-dir>` if `.opencode/` doesn't exist
3. Create minimal opencode.json + .gitignore + git init (same as bash `run_gsd` new-project block)

---

### Commands: `pilot plan`, `pilot execute`, `pilot verify`, `pilot quick`, `pilot debug`, `pilot scope`, `pilot insert`, `pilot remove`, `pilot research`, `pilot milestone`, `pilot todos`, `pilot map`

**All project lifecycle commands follow the same pattern:**

```typescript
// Thin wrapper: resolve project dir → cd → spawn opencode with gsd-<command>
async function runLifecycleCommand(project: string, gsdCommand: string, args: string) {
  const dir = resolveProjectDir(project);  // PILOT_PROJECT_DIR/project
  const title = truncateTitle(`${project}-${gsdCommand}${sanitizeArgs(args)}`, 80);
  
  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', `gsd-${gsdCommand}`,
    ...(args.includes('--') ? ['--', args] : [args].filter(Boolean))
  ], { cwd: dir, stdio: 'inherit' });
  
  return result.exitCode;
}
```

**Command → GSD mapping:**

| Pilot Command | GSD Command | Args Pattern |
|---------------|-------------|-------------|
| `pilot plan <proj> <phase>` | `gsd-plan-phase` | `"<phase> --auto"` (add --research, --skip-research, --gaps flags) |
| `pilot execute <proj> <phase>` | `gsd-execute-phase` | `"<phase> --auto"` (add --gaps-only flag) |
| `pilot verify <proj> <phase>` | `gsd-verify-auto` | `"<phase>"` (add --port flag) |
| `pilot quick <proj> "<desc>"` | `gsd-quick` | `"<desc>"` |
| `pilot debug <proj> [desc]` | `gsd-debug` | `"[desc]"` |
| `pilot scope <proj> "<desc>"` | `gsd-add-phase` | `"<desc>"` (with --build flag: also add + run) |
| `pilot insert <proj> <N> "<desc>"` | `gsd-insert-phase` | `"<N> <desc>"` |
| `pilot remove <proj> <N>` | `gsd-remove-phase` | `"<N>"` |
| `pilot research <proj> <phase>` | `gsd-research-phase` | `"<phase>"` |
| `pilot milestone new <proj> [name]` | `gsd-new-milestone` | `"[name]"` |
| `pilot milestone complete <proj> <ver>` | `gsd-complete-milestone` | `"<ver>"` |
| `pilot milestone audit <proj> [ver]` | `gsd-audit-milestone` | `"[ver]"` |
| `pilot milestone gaps <proj>` | `gsd-plan-milestone-gaps` | (none) |
| `pilot todos list <proj> [area]` | `gsd-check-todos` | `"[area]"` |
| `pilot todos add <proj> "<desc>"` | `gsd-add-todo` | `"<desc>"` |
| `pilot map <proj>` | `gsd-map-codebase` | (none) |

**Important opencode arg passing rule (from bash):**
- If args contain `--` flag-like strings → use `['--', args]` separator
- Otherwise pass args directly as positional

---

## 6. Phase 3: TUI Dashboard

### Command: `pilot tui`

**Flags:** `--interval N` (seconds, default: 3)

**What it does:**
1. Lazy-import ink and React (not loaded for any other command)
2. Enter alternate screen buffer
3. Render full-screen Ink app with 4 panels:
   - **Running:** Active sessions with runtime, log activity indicator
   - **Queue:** Pending queue entries
   - **Log:** Expandable log viewer for selected session
   - **Completed:** Recent completions with pass/fail status
4. Auto-refresh every `--interval` seconds using the same `core/` functions as CLI commands
5. Handle keyboard input:
   - `q` / `Ctrl-C` → quit (restore screen)
   - `↑↓` / `jk` → select session/entry
   - `Enter` → expand log for selected session
   - `K` → kill selected session (with confirmation)
   - `r` → manual refresh
   - `Tab` → cycle between panels
6. Responsive to terminal size (`process.stdout.columns`, `process.stdout.rows`)
7. Progress bars for queue completion (done/total)
8. Completion flash: when a session finishes, briefly highlight it green before moving to completed

**Architecture:** The TUI uses the same `core/` data layer:
```typescript
import { getStatusData } from '../core/sessions.js';
import { parseQueue } from '../core/queue-parser.js';
import { checkStuck } from '../core/stuck.js';

function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const timer = setInterval(async () => {
      setData(await getStatusData());
    }, interval * 1000);
    return () => clearInterval(timer);
  }, []);
  // render panels...
}
```

---

## 7. Stuck Detection Algorithm

**Replace the bash 3-way AND with a weighted scoring system.**

```typescript
interface StuckAssessment {
  pid: number;
  session: string;
  score: number;                    // 0-100+
  verdict: 'healthy' | 'suspect' | 'stuck';
  signals: StuckSignal[];           // which signals fired
  runtime_seconds: number;
  log_staleness_seconds: number;
}

interface StuckSignal {
  name: string;
  points: number;
  detail: string;
}

async function computeStuckScore(pid: number, session: string): Promise<StuckAssessment> {
  let score = 0;
  const signals: StuckSignal[] = [];

  // ── Signal 1: Log staleness (max 50 points) ──
  const logFile = path.join(config.logDir, `gsd-${session}.log`);
  const logStaleness = getLogStaleness(logFile);   // seconds since last write
  const runtime = getProcessRuntime(pid);            // seconds

  if (logStaleness > 900 && runtime > 900) {         // 15min stale + 15min runtime
    score += 30;
    signals.push({ name: 'log_stale_15m', points: 30, detail: `Log stale ${Math.round(logStaleness/60)}m` });
  } else if (logStaleness > 300 && runtime > 600) {  // 5min stale + 10min runtime
    score += 20;
    signals.push({ name: 'log_stale_5m', points: 20, detail: `Log stale ${Math.round(logStaleness/60)}m` });
  }

  // ── Signal 2: CPU usage trend (max 40 points) ──
  // Sample 3 times over 30 seconds
  const cpuSamples = await sampleCpu(pid, 3, 10_000);  // 3 samples, 10s apart
  const maxCpu = Math.max(...cpuSamples);

  if (maxCpu < 0.5 && runtime > 600) {
    score += 25;
    signals.push({ name: 'cpu_zero', points: 25, detail: `Max CPU ${maxCpu}% over 30s` });
  }
  if (cpuSamples.every(s => s < 0.1)) {
    score += 15;
    signals.push({ name: 'cpu_flatline', points: 15, detail: 'All samples <0.1%' });
  }

  // ── Signal 3: Session message count (max 40 points) ──
  const msgCount = await getSessionMessageCount(session);
  if (msgCount === 0 && runtime > 300) {              // 0 messages after 5 min
    score += 40;
    signals.push({ name: 'no_messages', points: 40, detail: `0 messages after ${Math.round(runtime/60)}m` });
  } else if (msgCount !== null && msgCount < 3 && runtime > 600) {
    score += 20;
    signals.push({ name: 'few_messages', points: 20, detail: `Only ${msgCount} messages after ${Math.round(runtime/60)}m` });
  }

  // ── Signal 4: Memory pressure (max 20 points) ──
  const processRss = getProcessRss(pid);               // MB, from /proc/pid/status
  const systemFreeMb = getSystemFreeMem();              // from /proc/meminfo
  if (processRss > 1024) {
    score += 10;
    signals.push({ name: 'high_rss', points: 10, detail: `RSS ${processRss}MB` });
  }
  if (systemFreeMb < 500) {
    score += 10;
    signals.push({ name: 'low_system_mem', points: 10, detail: `System free ${systemFreeMb}MB` });
  }

  // ── Signal 5: /proc/pid/status checks (max 80 points) ──
  const procState = readProcState(pid);                 // from /proc/pid/status → State field
  if (procState === 'T') {                              // stopped
    score += 50;
    signals.push({ name: 'stopped', points: 50, detail: 'Process state: stopped (T)' });
  }
  if (procState === 'Z') {                              // zombie
    score += 80;
    signals.push({ name: 'zombie', points: 80, detail: 'Process state: zombie (Z)' });
  }
  // Check if stdin-blocked: /proc/pid/wchan contains "read" or "wait"
  const wchan = readProcWchan(pid);
  if (wchan && /read|wait|poll/.test(wchan) && runtime > 600) {
    score += 30;
    signals.push({ name: 'stdin_blocked', points: 30, detail: `wchan: ${wchan}` });
  }

  // ── Verdict ──
  const verdict = score >= 70 ? 'stuck' : score >= 40 ? 'suspect' : 'healthy';

  return { pid, session, score, verdict, signals, runtime_seconds: runtime, log_staleness_seconds: logStaleness };
}
```

**Implementation notes:**
- `sampleCpu` reads `/proc/pid/stat` utime+stime at two points, computes delta. Do NOT use `ps -o %cpu=` (it's lifetime average).
- `getProcessRss`: read `/proc/pid/status` → VmRSS field
- `getSystemFreeMem`: read `/proc/meminfo` → MemAvailable field
- `readProcState`: read `/proc/pid/status` → State field (R/S/D/Z/T)
- `readProcWchan`: read `/proc/pid/wchan`
- `getSessionMessageCount`: call `opencode session list --format json`, find by title, then `opencode export <id>` and count messages. **Cache this** — don't call every scoring cycle. Call once and reuse.

**Thresholds:**
- score ≥ 70 → **STUCK** — auto-kill in `pilot run`, display red in `pilot stuck`
- score 40-69 → **SUSPECT** — display yellow, check again next cycle
- score < 40 → **HEALTHY**

---

## 8. Queue Runner State Machine

The queue runner (`pilot run`) is a loop with this state machine:

```
┌─────────┐
│  SCAN   │ ← Read QUEUE.md, find next launchable entry
└────┬────┘
     │ found entry
     ▼
┌─────────────┐
│ WAIT_CAPACITY│ ← active_count < max_parallel?
└────┬────────┘
     │ capacity available
     ▼
┌─────────┐
│ LAUNCH  │ ← Spawn opencode process, mark entry 🔨
└────┬────┘
     │
     ▼
┌─────────┐
│  SCAN   │ ← Back to top (look for more launchable entries)
└────┬────┘
     │ no launchable entries
     ▼
┌───────────────┐
│ WAIT_COMPLETION│ ← Wait for any child to finish, then SCAN again
└───────┬───────┘
        │ all children done + no pending entries
        ▼
     ┌──────┐
     │ EXIT │
     └──────┘
```

**Launchability rules:**
1. Entry status must be `pending` (no prefix)
2. No other entry for the same project is currently running
3. (Phase 2) All `depends-on` projects have their entries above this one marked ✅ DONE
4. Active job count < `--max-parallel`

**Reaping:** Before each scan, check all active PIDs with `kill -0`. Dead processes → capture exit code → handle success/failure → unset from tracking maps.

**QUEUE.md locking:** Use `proper-lockfile` for all QUEUE.md writes (mark running, mark done, mark failed). Stale timeout: 30s.

**Job completion handling:**
```typescript
function handleJobCompletion(entry: QueueEntry, exitCode: number, startTime: number) {
  const duration = Date.now() - startTime;
  
  // Check success (same logic as bash run_gsd, minus ≥8 messages)
  const newCommits = countNewCommits(entry.project, preCommitCount);
  const planningChanges = checkPlanningChanges(entry.project);
  
  if (newCommits > 0 || planningChanges) {
    markEntry(entry.lineNum, 'done');
    logPostmortem(entry, 'success', duration, { newCommits });
  } else if (exitCode === 0) {
    // Clean exit but no artifacts — suspicious but accept
    markEntry(entry.lineNum, 'done');
    logPostmortem(entry, 'success_no_artifacts', duration, {});
  } else {
    // Failed
    if (entry.retries < maxRetries) {
      entry.retries++;
      markEntry(entry.lineNum, 'pending');  // re-queue for retry
      logPostmortem(entry, 'retry', duration, { exitCode, attempt: entry.retries });
    } else {
      markEntry(entry.lineNum, 'failed');
      logPostmortem(entry, 'failed', duration, { exitCode });
    }
  }
}
```

**Per-job timeout:** Default 60 minutes, overridable per entry via `timeout: N` in QUEUE.md metadata. Start a timer when spawning; if exceeded, kill the process tree and treat as failure.

---

## 9. Lifecycle Modes

Reference: `~/dev/punchlab/gsd-queue-v5.sh` functions `lifecycle_*`. Port these exactly.

### Mode: `build-full`

**Args:** `<description>`

1. **MUST FAIL if `.planning/` already exists.** This is a hard requirement. The bash version doesn't enforce this and it causes phantom completions. Print: `Error: .planning/ already exists in <project>. Use 'continue-all' for existing projects or delete .planning/ to start fresh.`
2. If no `.planning/`: run `gsd-new-project --auto <description>`
3. Create project dir if needed (same as bash: mkdir, opencode.json, git init)
4. Loop: `find_next_phase()` → `run_phase_cycle()` → repeat until all phases done

### Mode: `continue`

Run ONE incomplete phase cycle (plan → execute → verify with gap closure).

1. `find_next_phase()` — find first phase where state ≠ "done"
2. If none → log "all phases done", success
3. `run_phase_cycle(project, phase)` — see below

### Mode: `continue-all`

Loop `continue` until all phases done (same as bash `lifecycle_continue_all`).

### Mode: `build-to-phase`

**Args:** `<N>` (target phase number)

Loop through phases 1..N. For each: if state ≠ "done", run `run_phase_cycle`. Stop after phase N is done.

### Mode: `add-and-build`

**Args:** `<description>`

1. Run `gsd-add-phase "<description>"` — adds phase to ROADMAP
2. **Skip check:** Before adding, check if first keyword of description already exists in ROADMAP.md. If so, skip (same as bash).
3. Detect newly created phase number (get_last_phase)
4. Run `run_phase_cycle(project, newPhase)`

### Mode: `run-command`

**Args:** `<gsd-command> [command-args]`

Raw passthrough. Strip `gsd-` prefix if present. Call `run_gsd(project, command, args)`.

### Phase Cycle: `run_phase_cycle`

Port of bash `run_phase_cycle`. Loop:

```
get_phase_state(dir, phase) →
  "done"          → return success
  "needs-plan"    → run gsd-plan-phase <N> --auto
  "needs-execute" → run gsd-execute-phase <N> --auto
  "needs-verify"  → run gsd-verify-auto <N>
  "needs-gaps"    → gap closure (max 3 cycles):
                    1. Rename existing UAT to *-UAT.prev.md (stale UAT fix)
                    2. run gsd-plan-phase <N> --gaps
                    3. run gsd-execute-phase <N> --gaps-only --auto
                    4. run gsd-verify-auto <N>
```

### Phase State Detection: `get_phase_state`

Port of bash `get_phase_state`. Given project dir and phase number:

1. Pad phase to 2 digits: `03`, `12`, etc.
2. Find phase directory: `ls .planning/phases/${padded}-*`
3. If no dir → `"needs-plan"`
4. Check UAT file (`*-UAT.md`):
   - Parse for `result: fail` lines and `failed/issues: N` in summary
   - If UAT exists + 0 failures → `"done"`
   - If UAT exists + failures > 0 → `"needs-gaps"`
5. Count plan `.md` files (excluding UAT)
   - If 0 → `"needs-plan"`
6. Check git commits for phase:
   - Pattern: `(feat|fix|refactor|chore)(${padded}` in commit messages (last 20 commits)
   - Also try: `phase.?${padded}|phase.?${phaseNum}`
   - If commits found → `"needs-verify"`
   - If no commits → `"needs-execute"`

**Phase 2 improvement: Explicit STATE files.** Write `STATE` file in phase directory before/after each action:
- Before plan: write `"planning"`
- After plan: write `"planned"`
- Before execute: write `"executing"`
- After execute: write `"executed"`
- Before verify: write `"verifying"`
- After verify: write `"verified"` or `"needs-gaps"`

If STATE file exists, use it instead of inference. Fall back to inference for backward compatibility.

---

## 10. The --json Contract

### `pilot status --json` — THE data contract

This is consumed by heartbeats, cron monitors, TUI, and external tools. Schema:

```typescript
interface PilotStatusJson {
  timestamp: string;          // ISO 8601 UTC: "2026-02-20T14:30:00Z"
  summary: {
    running: number;
    stuck: number;
    suspect: number;
    queued: number;
    completed: number;
  };
  sessions: {
    running: SessionInfo[];
    stuck: StuckSession[];
    suspect: StuckSession[];
  };
  queue: QueueItem[];
  completed: SessionInfo[];
  runner: {
    active: boolean;          // is queue runner PID alive?
    pid: number | null;
    uptime_seconds: number | null;
  };
}

interface SessionInfo {
  id: string;                 // opencode session ID
  title: string;              // session title
  updated: number;            // epoch ms
  created: number;            // epoch ms
  message_count: number;
}

interface StuckSession extends SessionInfo {
  pid: number;
  runtime_seconds: number;
  log_staleness_seconds: number;
  score: number;
  verdict: 'stuck' | 'suspect';
  signals: { name: string; points: number; detail: string }[];
}

interface QueueItem {
  status: 'pending' | 'running' | 'done' | 'failed';
  project: string;
  mode: string;
  args: string;
  description: string;
  line_num: number;
}
```

### Other --json outputs

All other commands follow the same pattern:
```json
{
  "timestamp": "2026-02-20T14:30:00Z",
  ...command-specific data
}
```

Every JSON output includes a `timestamp` field. This is non-negotiable.

---

## 11. Testing Strategy

### Phase 1 Tests

**Unit tests (test/core/):**
- `queue-parser.test.ts` — Parse sample QUEUE.md files with all status types, metadata, edge cases (empty file, malformed entries, Unicode emoji prefixes)
- `stuck.test.ts` — Test scoring algorithm with mocked /proc data. Test all 5 signal types individually and in combination. Test threshold boundaries (score 39=healthy, 40=suspect, 69=suspect, 70=stuck).
- `sessions.test.ts` — Test session parsing, fuzzy matching (exact → contains → no match)
- `config.test.ts` — Test env var resolution, defaults, path expansion
- `projects.test.ts` — Test project scanning with mock directory structures

**Fixture files (test/fixtures/):**
- `queue-v5-sample.md` — QUEUE.md with pending, running, done, failed entries, depends-on metadata
- `sessions.json` — Array of mock opencode session list output
- `export.json` — Mock opencode export output with messages and tool calls

**Integration tests:**
- Mock `execa` calls to `opencode` and `git`
- Test `pilot status --json` produces valid JSON matching the schema
- Test `pilot queue --json` with fixture queue file
- Test `pilot config --json` output

### Phase 2 Tests

- `runner.test.ts` — Test state machine transitions: scan → launch → reap → scan
- `lifecycle.test.ts` — Test each mode with mocked project states
- `phase-state.test.ts` — Test state detection with mock .planning dirs
- `spawn.test.ts` — Test pre-spawn checks (memory, config validation, gc disable)
- Queue locking: concurrent write test

### Phase 3 Tests

- Use `ink-testing-library` for component rendering tests
- Test keyboard input handling
- Test data refresh cycle

### Testing Rules

1. **Mock all external commands** (opencode, git, ps). Never call real binaries in tests.
2. **Use temp directories** for file system tests (QUEUE.md parsing, project scanning)
3. **Snapshot tests** for CLI human-readable output (ensures format stability)
4. **Test exit codes** explicitly — exit 0, 1, 2 for each error path

---

## 12. Do NOT

### Architecture
- **Do NOT put UI rendering in `core/`.** Core returns data. Commands render.
- **Do NOT import React/Ink in any file except `tui/*.tsx`.** This kills CLI startup time.
- **Do NOT use `require()`.** This is an ESM project. Use `import` everywhere.
- **Do NOT use `chalk`.** Use `picocolors` (3KB vs 48KB, same API for our needs).
- **Do NOT use `child_process` directly.** Use `execa` for all process spawning.
- **Do NOT use `fs.existsSync` in hot paths.** Use async `fs.access` or `fs.stat`.

### Queue Runner
- **Do NOT use the "≥8 messages" success heuristic.** This causes phantom completions. A verbose error session can have 20+ messages and zero useful work. Use only: new commits, .planning changes, explicit exit code 0.
- **Do NOT run same-project entries in parallel.** Git conflicts, shared STATE files. Always sequential.
- **Do NOT use `sed -i` for QUEUE.md modifications.** Use proper file locking + full file rewrite in Node.js. The bash `sed -i` with line numbers is fragile when file changes between read and write.
- **Do NOT skip the memory check.** OOM kills are the #2 cause of stuck processes. Always check `/proc/meminfo` before spawning.
- **Do NOT skip gc.auto=0 enforcement.** git gc on snapshot repos causes 5-10 minute hangs that look like stuck processes. The `snapshot/global/` repo is a special case — it's NOT matched by `snapshot/*/` glob. Must be disabled separately. git pack-objects on this repo consumed 2.6GB RAM and 93% CPU in production.
- **Do NOT use `nohup` to background opencode.** nohup closes stdin which causes opencode to die mid-session. Always use setsid or execa with `detached: true` + `stdin: 'ignore'`.
- **Do NOT assume `opencode` is in PATH.** It lives at `~/.opencode/bin/opencode`, which is not in standard PATH. The process spawner must prepend this to PATH or use the absolute path.
- **Do NOT concatenate long strings into filenames.** Truncate title to 80 chars. ENAMETOOLONG is the #1 cause of silent failures in the bash version.
- **Do NOT spawn without `stdin: 'ignore'`.** Equivalent to `< /dev/null`. Without this, interactive prompts in GSD workflows hang forever.

### Stuck Detection
- **Do NOT use `ps -o %cpu=` for CPU sampling.** It returns lifetime average, not current usage. Read `/proc/pid/stat` and compute delta between samples.
- **Do NOT treat all stucks identically.** The signals tell you WHY it's stuck (stdin block vs OOM vs git gc). Log the signals.

### Process Management
- **Do NOT send SIGKILL without SIGTERM first.** Always: SIGTERM → wait 15s → SIGKILL.
- **Do NOT kill just the parent PID.** Use `tree-kill` to kill the entire process tree.
- **Do NOT leave orphan PID files.** Always clean up `$PILOT_LOG_DIR/gsd-*-pid` on process death.

### Setup
- **Do NOT overwrite existing `opencode.json`.** Users may have customized it. Skip with a note.
- **Do NOT create hard copies of pilot-gsd files.** Always symlink. This way `pilot update` works.

### Output
- **Do NOT print colors when `--json` is set.** Zero ANSI in JSON output.
- **Do NOT print spinners when `--json` is set.** Just output the JSON and exit.
- **Do NOT print to stderr in `--json` mode** unless it's an error. stdout = JSON, stderr = errors only.
- **Do NOT use `console.log` for JSON output.** Use `process.stdout.write(JSON.stringify(data, null, 2) + '\n')`. This avoids Node.js adding extra newlines.

### General
- **Do NOT use `any` type.** Everything is typed. Use `unknown` + type guards if needed.
- **Do NOT catch errors and silently swallow them.** Log them, even in non-verbose mode.
- **Do NOT add features not in this spec.** Build exactly what's specified. No extras.
- **Do NOT use default exports.** Use named exports everywhere for better tree-shaking and IDE support.
- **Do NOT generate creative/clever code.** This is infrastructure. Be boring, explicit, and debuggable.

---

## Appendix A: QUEUE.md v5 Full Example

```markdown
## ✅ DONE: baby-predictor | build-full | AI baby face predictor tool
Created in 2h 15m, 10 phases complete

## ✅ DONE: resume-roast | run-command | quick fix navbar z-index

## 🔨 resume-roast | continue-all
Running Phase 3 execute

## 🔨 pet-portraits | build-full | AI pet portrait generator
Starting Phase 1

## hub | continue
depends-on: registry

## registry | add-and-build | add caching per requirements/cache.md
timeout: 120

## ❌ FAIL: caricature | build-full | Caricature studio
Failed: OOM after 3 retries
```

## Appendix B: Post-Mortem JSONL Format

Each line in `$PILOT_LOG_DIR/pilot-job-history.jsonl`:

```json
{"ts":"2026-02-20T14:30:00Z","project":"resume-roast","title":"resume-roast-execute-phase-3","mode":"continue-all","exit":0,"duration_ms":3600000,"result":"success","commits":5,"messages":42}
{"ts":"2026-02-20T15:00:00Z","project":"caricature","title":"caricature-new-project--autoCaricature-studio","mode":"build-full","exit":137,"duration_ms":3600000,"result":"failed","commits":0,"messages":3,"failure_category":"oom"}
```

## Appendix C: Entry Point Skeleton

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command()
  .name('pilot')
  .description('THE interface for the Pilot autonomous AI development pipeline.')
  .version(pkg.version, '-V, --version')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output');

// Default command: status
program.action(async (opts) => {
  const { statusCommand } = await import('./commands/status.js');
  await statusCommand(opts);
});

// Register commands
program.command('status').alias('s')
  .description('Dashboard: running, stuck, queued, completed')
  .option('-v, --verbose', 'Full tables')
  .action(async (opts) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand({ ...program.opts(), ...opts });
  });

// ... register all other commands similarly

program.parse();
```

**The `dist/index.js` file MUST start with `#!/usr/bin/env node`.** Add this in the build step or as a banner.
