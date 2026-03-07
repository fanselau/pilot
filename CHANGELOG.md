# Changelog

All notable changes to Pilot are documented here.

## [0.1.0] — 2026-03-07 (Pre-release)

This is the first tracked release of Pilot — an autonomous AI development pipeline CLI that queues, delegates, and orchestrates AI coding sessions without human intervention.

### Queue and Runner Architecture

- SQLite-backed job queue at `~/.pilot/pilot.db` — typed, durable, no YAML files
- Persistent daemon runner (`pilot run`) with per-project serialization (one active job per project at a time)
- Atomic job claiming with TOCTOU protection via SQLite transactions
- Dependency graph: jobs can declare `dependsOn` chains; blocked jobs are skipped until their parent completes
- Startup reconciliation resets ghost-running jobs left by crashed processes
- Resource guards: free memory threshold, spawn rate limiting, cgroup memory caps via systemd-run (Linux)

### Delegation Flow

- Delegation AI reads project state (planning docs, phase summaries, roadmap) and produces a structured execution plan
- Multi-step phase execution: each GSD command (add-phase, plan-phase, execute-phase) runs in its own opencode session
- State-aware step selection skips steps already completed in prior runs
- Inter-step artifact verification confirms each step produced expected outputs before advancing

### Model Routing

- Role-based model routing with three profiles: `quality`, `balanced`, `budget`
- Per-agent model assignment: orchestrator, executor, judge, and planner each get the right model for their role
- Provider mode support: `claude-only`, `openai-only`, `hybrid` — runner writes `.planning/config.json` before spawning
- Variant support for OpenAI Codex models (high/low thinking variants)
- Per-job model profile and provider mode stored on the job record

### AI Judge

- Post-execution AI judge evaluates each phase with a `succeeded / failed / doubting` verdict and confidence score
- Inconclusive detection: zero-confidence verdict treated as failure (no silent pass on empty responses)
- Judge result stored with confidence and reason; surfaced in TUI, `pilot log`, and completion callbacks
- Verdict used for retry/block decisions: failed jobs block the project; operator decides next step

### Skills System

- Skill library at `~/.pilot/skills/` — SKILL.md files installed from GitHub or local paths
- Category-based matching: jobs declare `--categories` and runner injects matching skills before spawning
- Skills copied into `.opencode/skills/` before each session and cleaned up after
- `pilot skills` subcommands: `list`, `add`, `remove`, `tag`, `sync`, `categories`, `bootstrap`, `recommend`
- Default skills catalog with Tier 1 (universal) and Tier 2 (stack-specific) recommendations
- Stack detection for auto-recommendation: React/Next.js, TypeScript, Python/FastAPI, etc.
- OpenClaw SKILL.md bundled in repo — auto-installed by `pilot init` and kept current by `pilot update`

### Notifications and Hooks

- Job completion callbacks via OpenClaw hooks agent (`/hooks/agent` webhook)
- `--notify <agentId>` on `pilot add` wakes the originating agent session when a job completes
- `--no-notify` opts out; `PILOT_DEFAULT_NOTIFY` env var sets a project-wide default
- Telegram notification support for milestone job completions
- Project owner fallback: if no `--notify` given, the registered project owner receives the callback
- Callback delivers verdict, confidence, reason, and job metadata

### Setup and Init Improvements

- `pilot setup <dir>` creates `.opencode/` symlinks and `opencode.json`, validates configuration
- `pilot init` creates a new project with a registration step and queues initial planning
- Smart config initialization: `pilot init` auto-detects available AI providers via `opencode models`
- `pilot doctor` health check with 9 checks, `--fix` mode, and `--json` output
- Layered config file system: `~/.pilot/config.json` with CLI flags > env vars > config file > defaults
- `pilot config` subcommands: `init`, `set`, `get`, `edit`, `path`, `show` with source annotations

### TUI and Observability

- Full-screen TUI dashboard (`pilot tui`) with running/queue/completed/projects panels
- Live job detail view: per-step progress, token counts (including thinking + subagent tokens), actual models used
- Subagent session visibility: task subagents shown inline and indented in detail view and `pilot log`
- Force-quit controls: `K` key in TUI, `pilot kill <id> --force` CLI command
- Job blocking and unblocking: failed jobs block project, `u` key in TUI to unblock
- `pilot gc` command for database and log cleanup
- Structured daemon logging with size-based rotation and ISO-8601 timestamps

---

*Pilot follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.*
