---
name: pilot-pipeline
description: Use the Pilot CLI to queue, monitor, and manage autonomous code builds. Read this before ANY code-related work — writing requirements, queueing builds, checking progress, or debugging failures.
---

# Pilot — Autonomous Dev Pipeline

Pilot is a CLI that orchestrates autonomous code builds. It queues work, spawns AI developer sessions (via opencode), monitors progress, evaluates results, and notifies you when done. **You are the CTO.** You think, plan, write requirements, queue work, monitor progress, and review results. You NEVER write code directly. You NEVER open files and edit them. You write requirements, queue them via `pilot add`, and let the pipeline handle execution.

## Your Role

You are the CTO of this development pipeline. Your responsibilities:

1. **Think** — Analyze what needs to be built, what's blocked, what's next
2. **Plan** — Write requirement files that are specific enough for agents to execute
3. **Queue** — Use `pilot add` to submit work to the pipeline
4. **Monitor** — Use `pilot status`, `pilot queue`, `pilot log` to track progress
5. **Review** — Check results, decide on retries, unblock projects

You never open source files and edit them. The pipeline spawns developer agents (opencode sessions) that do the actual coding. Your tools:

- `pilot add` — Queue work
- `pilot status` — Dashboard overview
- `pilot queue` — See pending/running jobs
- `pilot log` — Read build transcripts
- `pilot retry` — Retry failed jobs
- `pilot cancel` — Cancel pending jobs
- `pilot kill` — Kill running jobs

## First-Time Setup

### 1. Initialize Pilot

```bash
pilot init
```

Interactive command that detects available AI providers (Claude, OpenAI/Codex) and creates `~/.pilot/config.json` with your preferred defaults (provider mode, model profile).

Use `pilot init --yes` to accept defaults non-interactively, or `pilot init --force` to overwrite an existing config.

### 2. Register a Project

```bash
pilot setup ~/dev/myapp --owner main
```

This registers the project in Pilot's database with you as the owner. It runs upstream `get-shit-done-cc --opencode --local`, validates sentinels (for example `gsd-help.md`), and creates/merges the local project config required by the pipeline.

- `--owner` sets the agent ID that gets notified on job completion/failure
- Always use full project paths, never relative

If setup drift is detected later, repair with:

```bash
pilot setup ~/dev/myapp --refresh
```

### 2.5 Autonomous config pre-seeding (important)

Pilot enforces autonomous-safe defaults in each managed project's `.planning/config.json` so execution does not block on interactive prompts.

Key enforced defaults include:
- `mode: yolo`
- `workflow.auto_advance: true`
- `workflow.node_repair: true`

Pilot deep-merges existing config, then applies required "Pilot wins" overrides for safety-critical keys.

### 3. Validate Health

```bash
pilot doctor
```

Checks that all dependencies are available: opencode binary, database, daemon status, project configurations. Fix any issues it reports before queuing work.

### 4. Start the Daemon

```bash
pilot service start
```

The daemon watches for new queue entries and processes them automatically. It must be running for jobs to execute.

## Queuing Work

The core command for submitting work:

```bash
pilot add <project-path> <requirement> [flags]
```

The `<requirement>` can be a file path to a requirements document or a quoted description string.

### Examples

**Queue a feature from a requirement file:**
```bash
pilot add ~/dev/myapp requirements/user-auth.md
```

**Quick fix without a requirement file:**
```bash
pilot add ~/dev/myapp "Fix the login button not responding on mobile" --as quick
```

**High-priority job with quality models:**
```bash
pilot add ~/dev/myapp requirements/payment-integration.md --profile quality --next
```

**Budget mode for low-risk work:**
```bash
pilot add ~/dev/myapp "Update copyright year in footer" --as quick --profile budget
```

**With categories for skill injection:**
```bash
pilot add ~/dev/myapp requirements/dashboard-redesign.md --categories frontend,testing
```

**Preview without queueing:**
```bash
pilot add ~/dev/myapp requirements/api-refactor.md --dry-run
```

### Scope

The `--as` flag controls how work is executed:

| Scope | When to Use | What Happens |
|-------|------------|--------------|
| `quick` | Bug fixes, small changes, single-file edits | Single opencode session, no planning artifacts |
| `phase` | Features, multi-file changes, anything needing a plan | Delegation AI reads project state, creates/continues phase plans |
| `milestone` | Major releases, multi-feature sprints | Two-pass: creates roadmap first, then delegates phases |

**Decision guide:**
- Short description string? → `quick`
- Requirement file with multiple items? → `phase` (auto-detected)
- Requirement file with multiple Must Have sections? → `milestone` (auto-detected)
- Not sure? → Let auto-detection decide (omit `--as`)

### Provider Modes

The `--provider` flag controls which AI models are used:

| Mode | What It Does | When to Use |
|------|-------------|-------------|
| `hybrid` | Build/orchestration agents run on Claude, check/judge scopes run on OpenAI GPT-5.4 | Cross-model checks and balanced cost/quality |
| `claude-only` | All agents/scopes resolve to Claude mappings | Standard Claude-only operation |
| `openai-only` | All agents/scopes resolve to OpenAI GPT-5.4 mappings | OpenAI-only operation |

```bash
pilot add ~/dev/myapp requirements/feat.md --provider claude-only
```

### Quality Profiles

The `--profile` flag controls model tier selection across pipeline steps:

| Profile | Typical Behavior |
|---------|------------------|
| `quality` | Highest-cost/highest-capability mappings (more Opus/high-variant usage) |
| `balanced` *(default)* | Mixed quality/cost mappings intended for day-to-day runs |
| `budget` | Lower-cost mappings for lighter workloads |

Exact model IDs and variants are resolved by Pilot's model tables at runtime (`pilot models show`) and then patched into `.opencode/agents/gsd-*.md` frontmatter per job.

```bash
pilot add ~/dev/myapp requirements/feat.md --profile quality
```

### Categories

The `--categories` flag injects relevant skills into the developer sessions:

```bash
pilot add ~/dev/myapp requirements/ui-overhaul.md --categories frontend,testing
```

Categories map to skills in `~/.pilot/skills/`. When the runner spawns a developer session, it copies matching skills into the project's `.opencode/skills/` directory so the coding agent has domain-specific knowledge.

Manage your skill library with:
```bash
pilot skills list                         # See all installed skills
pilot skills add <github-url>             # Install a skill from GitHub
pilot skills tag <name> --categories X,Y  # Assign categories to a skill
pilot skills categories                   # List all categories
```

### Priority

Move a job to the front of the queue:

```bash
# At queue time
pilot add ~/dev/myapp requirements/hotfix.md --next

# After queueing
pilot bump <id>
```

### Dry Run

Preview what would happen without actually queueing:

```bash
pilot add ~/dev/myapp requirements/feat.md --dry-run
```

Shows the detected scope, provider mode, profile, and estimated execution plan.

### Intent lifecycle (critical mental model)

Pilot does **not** execute a step array from delegation output. Delegation produces one typed intent, and the runner owns the lifecycle logic for that intent.

Canonical intent types:
- `quick`
- `plan-and-execute`
- `execute-only`
- `audit-milestone`

Operationally: delegation decides intent, runner executes the corresponding command flow, and judge/verification policy decides retry or terminal outcome.

### Model frontmatter patching

Before launches, Pilot patches `model` and optional `variant` fields in installed GSD agent frontmatter (`.opencode/agents/gsd-*.md`) based on resolved provider mode + profile.

- Mapped agents get explicit model assignments.
- Unmapped agents fall back to `model: inherit`.
- This keeps routing deterministic even if upstream agent files change.

## Monitoring

### Dashboard Overview

```bash
pilot status              # All projects
pilot status ~/dev/myapp  # Specific project
```

Shows running jobs, queue depth, recent completions/failures.

### Queue

```bash
pilot queue              # Pending and running jobs
pilot queue --history    # Include completed/failed history
```

### Build Transcript

```bash
pilot log <id>                # Full build transcript
pilot log <id> --follow       # Stream live output (like tail -f)
pilot log <id> --last 50      # Last 50 lines only
pilot log <id> -v             # Verbose — include tool calls
pilot log <id> --delegation   # Show delegation AI output only
```

### Project Status

```bash
pilot projects              # List all managed projects
pilot projects --blocked    # Show only blocked projects
pilot project ~/dev/myapp   # Detailed project info: status, owner, job counts
```

## When Things Go Wrong

### Job Failed

```bash
# 1. Check what happened
pilot log <id>

# 2. If fixable, retry (resets attempts + unblocks project)
pilot retry <id>

# 3. If not fixable, cancel and re-queue with different approach
pilot cancel <id>
pilot add ~/dev/myapp requirements/revised-approach.md
```

### Job Stuck

```bash
# 1. Check if it's actually working
pilot log <id> --follow

# 2. If truly stuck, kill it
pilot kill <id> --force

# 3. Re-queue
pilot add ~/dev/myapp requirements/feat.md
```

### Project Blocked

When a job fails, the project becomes blocked — no new jobs will run until resolved.

```bash
# Option A: Retry the failed job (unblocks automatically)
pilot retry <id>

# Option B: Manually unblock without retrying
pilot project ~/dev/myapp --unblock
```

### Verification retry flow and lineage

Phase verification outcomes can auto-retry based on job retry budget and failure fingerprint logic.

- Retry budget is set at queue time (`--retries <n>` or `--no-retry`).
- Same-fingerprint failures escalate immediately instead of burning all retries.
- Retry history is persisted and visible to operators.

Inspect lineage with:

```bash
pilot info <id>         # attempt counters and retry context
pilot log <id> --chain  # full chain across attempts
```

### Daemon Died

```bash
pilot service start
```

Check status first: `pilot service status`

## Notification Pipeline

### How It Works

Notifications are optional. Pilot works without any notify configuration — you check results via `pilot status`, `pilot log`, or `pilot tui`.

When configured, Pilot notifies the project owner (or a specified agent) when jobs complete or fail:

```bash
# With owner-based automatic notifications
pilot add ~/dev/myapp requirements/feat.md

# With explicit agent notification
pilot add ~/dev/myapp requirements/feat.md --notify main

# Explicit opt-out
pilot add ~/dev/myapp requirements/feat.md --no-notify
```

### Owner-Based Default

If a project has an owner and structured notify route configured, notifications go to the owner automatically:

```bash
# One-time setup
pilot setup ~/dev/myapp --owner main
pilot project ~/dev/myapp --notify-openclaw --notify-agent main --notify-channel <ch> --notify-to <target>

# Then just add jobs — notify is automatic
pilot add ~/dev/myapp requirements/feat.md
```

### What You Receive

On job completion or failure, the runner POSTs to OpenClaw's webhook endpoint. You receive a message with:
- Job ID and status (completed/failed)
- Project path and description
- Verdict (`pass`/`fail`/`partial`, with legacy values still parseable) and confidence score
- Link to review the build log

## Writing Good Requirements

Good requirements are the difference between a successful build and a wasted run. Write them so the agent can build without asking questions.

### Template

```markdown
# Feature Name

## Problem
What's wrong or what's missing. Be specific.

## Goal
What success looks like — specific, measurable outcomes.

## Requirements

### Must Have
- [ ] Concrete, testable requirement
- [ ] Another concrete requirement
- [ ] Include acceptance criteria inline

### Nice to Have
- [ ] Lower priority items

## Technical Notes
Stack constraints, API limits, integration points, relevant file paths.

## Do NOT
- Anti-patterns to avoid
- Things that look tempting but are wrong
```

### Rules

- **Be specific** — "Add email validation that rejects invalid formats and returns a 422 error" not "validate emails"
- **Include acceptance criteria** — How will the agent verify it works?
- **One file per feature** — Store in `requirements/` directory
- **Mention relevant files** — "The auth middleware is at `src/middleware/auth.ts`"
- **Use positive instructions** — "Use library X" not "Don't use library Y"

## Project Management

### Registering Projects

```bash
pilot setup ~/dev/myapp --owner main
```

Every project needs to be registered before queuing work. The owner receives notifications on job completion/failure.

### Checking Project Status

```bash
pilot projects                    # List all projects
pilot project ~/dev/myapp         # Detailed view with job counts
```

### Blocking and Unblocking

```bash
# Manually block (prevents new jobs from running)
pilot project ~/dev/myapp --block "Waiting for API keys"

# Unblock
pilot project ~/dev/myapp --unblock
```

### Phase Continuation

| Situation | Command |
|-----------|---------|
| New feature (no plans exist) | `pilot add ~/dev/myapp requirements/feat.md` |
| Continue existing phase | `pilot add ~/dev/myapp "25" --as phase` |
| Resume failed job | `pilot retry <id>` |

**NEVER pass a requirement file when plans already exist for that feature** — it creates a duplicate phase. Check first:

```bash
ls ~/dev/myapp/.planning/phases/
```

## Daemon Management

The Pilot daemon is the runner process that watches for queued jobs and executes them.

```bash
pilot service start    # Start the daemon
pilot service stop     # Stop gracefully
pilot service status   # Check if running
```

### Rules

- **ALWAYS** use `pilot service` commands for daemon management
- **NEVER** use `pkill`, `kill`, `nohup`, or manual `setsid` commands
- **NEVER** start the daemon manually — always go through `pilot service`

### Restarting After Updates

```bash
pilot service stop
# ... rebuild if needed ...
pilot service start
```

Always stop before restarting. The daemon uses a lock file to prevent multiple instances.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pilot add <project> <req>` | Queue work |
| `pilot add ... --as quick\|phase\|milestone` | Force scope |
| `pilot add ... --next` | Priority (front of queue) |
| `pilot add ... --profile quality\|balanced\|budget` | Model tier |
| `pilot add ... --provider hybrid\|claude-only\|openai-only` | AI vendor |
| `pilot add ... --categories frontend,testing` | Inject skills |
| `pilot add ... --notify <agentId>` | Notify on completion |
| `pilot add ... --no-notify` | Skip notification |
| `pilot add ... --dry-run` | Preview without queueing |
| `pilot status [project]` | Dashboard overview |
| `pilot queue` | Pending/running jobs |
| `pilot queue --history` | Include completed/failed |
| `pilot log <id>` | Build transcript |
| `pilot log <id> --follow` | Stream live output |
| `pilot log <id> -v` | Verbose (tool calls) |
| `pilot log <id> --delegation` | Delegation output only |
| `pilot cancel <id>` | Cancel pending job |
| `pilot kill <id> --force` | Kill running job |
| `pilot retry <id>` | Retry failed (unblocks project) |
| `pilot bump <id>` | Move to front of queue |
| `pilot projects` | List managed projects |
| `pilot projects --blocked` | Show blocked only |
| `pilot project <path>` | Project info |
| `pilot project <path> --block "reason"` | Block project |
| `pilot project <path> --unblock` | Unblock project |
| `pilot setup <dir> --owner <agentId>` | Register project |
| `pilot service start\|stop\|status` | Daemon management |
| `pilot init` | First-time setup |
| `pilot update` | Update upstream GSD package and refresh projects |
| `pilot doctor` | Health check |
| `pilot gc` | Clean old jobs |
| `pilot skills list` | List installed skills |
| `pilot skills add <url>` | Install skill |
| `pilot skills remove <name>` | Remove skill |
| `pilot skills tag <name> --categories X,Y` | Assign categories |
| `pilot skills categories` | List all categories |
