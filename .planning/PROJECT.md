# Pilot CLI

## What This Is

Pilot is THE command-line interface for an autonomous AI development pipeline. It replaces a collection of bash scripts (gsd-cli + gsd-queue-v5.sh) with a typed TypeScript CLI that monitors running AI sessions, manages a job queue, detects stuck processes, orchestrates project lifecycle commands, and provides a TUI dashboard. Used by both humans and AI agents (Gorb/OpenClaw).

## Core Value

Reliable autonomous orchestration of AI development sessions — queue jobs, spawn them, detect when they're stuck, and keep the pipeline moving without human intervention.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Monitor running AI sessions (status, stuck detection, log viewing)
- [ ] Parse and display QUEUE.md v5 format
- [ ] Weighted multi-signal stuck detection algorithm (log staleness, CPU, messages, memory, /proc state)
- [ ] Project scanning with git state and .planning progress tracking
- [ ] Setup command: symlink pilot-gsd definitions into project directories
- [ ] Queue runner state machine with parallel cross-project execution
- [ ] Lifecycle mode implementations (build-full, continue, continue-all, etc.)
- [ ] Phase state detection with explicit STATE files
- [ ] All project lifecycle commands as thin wrappers around gsd-* commands
- [ ] --json output contract for every command
- [ ] Full-screen TUI dashboard with Ink/React
- [ ] Graceful process management (SIGTERM -> SIGKILL, tree-kill, PID cleanup)

### Out of Scope

- Backend/API server — this is a CLI tool only
- Web UI — TUI is the visual interface
- Custom AI model integration — delegates to opencode which handles models
- Windows support — Linux-only (/proc filesystem dependency for stuck detection)

## Context

- Porting from two bash scripts: gsd-cli (1219 lines) and gsd-queue-v5.sh (667 lines)
- The bash scripts are the ground truth for behavior; the spec (requirements/pilot-cli.md) is the ground truth for architecture
- Companion repo pilot-gsd contains GSD command/agent/workflow definitions (symlinked into projects)
- Built on Node.js 20+ with ESM modules
- Architecture: core/ (pure TS, no UI deps) -> commands/ (CLI rendering) + tui/ (Ink/React)
- Key dependencies: commander, picocolors, cli-table3, execa, tree-kill, proper-lockfile

## Constraints

- **Architecture**: core/ has ZERO UI dependencies — pure typed data structures only
- **Performance**: CLI startup < 100ms — no React/Ink loaded except for `pilot tui`
- **Compatibility**: Keep `gsd-` prefix on PID/log files for backward compat with existing pipeline
- **Platform**: Linux only (relies on /proc filesystem for stuck detection, memory checks)
- **ESM**: No require(), no default exports, strict TypeScript
- **No chalk**: Use picocolors (3KB vs 48KB)
- **No child_process**: Use execa for all process spawning

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + ESM | Type safety for infrastructure code, modern Node.js | -- Pending |
| commander for CLI | Standard, well-tested, supports subcommands + global flags | -- Pending |
| Weighted stuck scoring | Replace brittle 3-way AND with nuanced multi-signal system | -- Pending |
| proper-lockfile for QUEUE.md | Prevent concurrent write corruption (bash sed -i was fragile) | -- Pending |
| Explicit STATE files | Eliminate inference-based state detection ambiguity | -- Pending |
| build-full rejects existing .planning/ | Prevents phantom completion bug from bash version | -- Pending |
| No ">=8 messages" heuristic | Phantom completion bug — verbose errors have many messages | -- Pending |

---
*Last updated: 2026-02-20 after initialization*
