# Requirements: Pilot CLI

**Defined:** 2026-02-20
**Core Value:** Reliable autonomous orchestration of AI development sessions

## v1 Requirements

### Foundation (Monitoring + Setup)

- [x] **FOUND-01**: CLI entry point with commander, global --json flag, exit codes 0/1/2
- [x] **FOUND-02**: `pilot status` — cross-reference sessions with PID files, show running/stuck/queued/completed
- [x] **FOUND-03**: `pilot queue` — parse QUEUE.md v5 format, display grouped by status
- [x] **FOUND-04**: `pilot stuck` — weighted multi-signal stuck detection (log staleness, CPU, messages, memory, /proc state)
- [x] **FOUND-05**: `pilot log <session>` — fuzzy match session, export and format transcript
- [x] **FOUND-06**: `pilot tail <session>` — native fs.watch live log following
- [x] **FOUND-07**: `pilot projects` — scan project dirs, show git state and .planning progress
- [x] **FOUND-08**: `pilot progress [project]` — deep phase-by-phase progress analysis
- [x] **FOUND-09**: `pilot setup <dir>` — symlink pilot-gsd definitions, create opencode.json, init git
- [x] **FOUND-10**: `pilot update` — git pull pilot-gsd repo
- [x] **FOUND-11**: `pilot config` — display resolved env vars and paths
- [x] **FOUND-12**: core/config.ts — env var resolution with defaults, typed PilotConfig
- [x] **FOUND-13**: core/types.ts — all shared TypeScript interfaces
- [x] **FOUND-14**: core/queue-parser.ts — QUEUE.md v5 read/write/mark operations
- [x] **FOUND-15**: core/stuck.ts — stuck scoring algorithm with 5 signal types
- [x] **FOUND-16**: core/sessions.ts — session list/export wrappers with fuzzy matching
- [x] **FOUND-17**: core/projects.ts — project scanning, git state, .planning state detection
- [x] **FOUND-18**: core/progress.ts — deep project progress analysis
- [x] **FOUND-19**: core/setup.ts — symlink creation, opencode.json generation
- [x] **FOUND-20**: core/process.ts — PID file management, process spawning helpers
- [x] **FOUND-21**: util/output.ts — JSON/human output helpers, --json branching
- [x] **FOUND-22**: util/format.ts — duration formatting, string truncation
- [x] **FOUND-23**: util/colors.ts — picocolors wrapper with NO_COLOR support

### Automation (Queue Runner + Lifecycle)

- [x] **AUTO-01**: `pilot run` — queue runner state machine (scan -> wait_capacity -> launch -> scan loop)
- [x] **AUTO-02**: `pilot stop` — graceful runner shutdown with SIGTERM -> SIGKILL
- [x] **AUTO-03**: `pilot add <project> <mode>` — append to QUEUE.md with file locking
- [x] **AUTO-04**: `pilot build <project>` — convenience wrapper: detect mode + add + start runner
- [x] **AUTO-05**: `pilot init <project>` — create project dir, setup, spawn gsd-new-project
- [x] **AUTO-06**: All lifecycle commands (plan, execute, verify, quick, debug, scope, insert, remove, research, milestone, todos, map)
- [x] **AUTO-07**: Pre-spawn checks: git gc disable, memory check, config validation, binary check, title truncation
- [x] **AUTO-08**: Success detection: new commits OR .planning changes OR clean exit (no >=8 messages heuristic)
- [x] **AUTO-09**: Lifecycle modes: build-full, continue, continue-all, build-to-phase, add-and-build, run-command
- [x] **AUTO-10**: Phase state detection with explicit STATE files + inference fallback
- [x] **AUTO-11**: Phase cycle: plan -> execute -> verify -> gap closure (max 3 cycles)
- [x] **AUTO-12**: Graceful shutdown: SIGTERM handler, tree-kill, PID cleanup, queue entry reset
- [x] **AUTO-13**: core/runner.ts — queue runner state machine
- [x] **AUTO-14**: core/lifecycle.ts — lifecycle mode implementations
- [x] **AUTO-15**: core/phase-state.ts — phase state detection
- [x] **AUTO-16**: core/spawn.ts — process spawning with pre-spawn checks
- [x] **AUTO-17**: core/lock.ts — proper-lockfile wrapper for QUEUE.md
- [x] **AUTO-18**: core/postmortem.ts — JSONL job result logging
- [x] **AUTO-19**: build-full MUST reject existing .planning/ directories

### TUI Dashboard

- [x] **TUI-01**: `pilot tui` — full-screen Ink/React dashboard with 4 panels
- [x] **TUI-02**: Auto-refresh with configurable interval
- [x] **TUI-03**: Keyboard navigation (q, arrows, Enter, K, r, Tab)
- [x] **TUI-04**: Responsive to terminal size
- [x] **TUI-05**: Lazy-loaded — React/Ink not imported for any other command

### Cross-Cutting

- [x] **XCUT-01**: --json output on every command with timestamp field
- [x] **XCUT-02**: pilot status --json matches the full PilotStatusJson schema
- [x] **XCUT-03**: Exit code 0 (success), 1 (runtime error), 2 (usage error) consistently
- [x] **XCUT-04**: NO_COLOR support via picocolors wrapper
- [x] **XCUT-05**: All tests mock external commands (opencode, git), use temp dirs, test exit codes

## v2 Requirements

(None planned yet)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI / API server | CLI-only tool; TUI is the visual interface |
| Windows support | Requires /proc filesystem for stuck detection |
| Custom AI models | Delegates to opencode which handles model selection |
| OAuth / authentication | Local CLI tool, no auth needed |
| Plugin system | Build exactly what's specified, no extras |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 2 | Complete |
| FOUND-02 | Phase 2 | Complete |
| FOUND-03 | Phase 2 | Complete |
| FOUND-04 | Phase 2 | Complete |
| FOUND-05 | Phase 2 | Complete |
| FOUND-06 | Phase 2 | Complete |
| FOUND-07 | Phase 2 | Complete |
| FOUND-08 | Phase 2 | Complete |
| FOUND-09 | Phase 2 | Complete |
| FOUND-10 | Phase 2 | Complete |
| FOUND-11 | Phase 2 | Complete |
| FOUND-12 | Phase 1 | Complete |
| FOUND-13 | Phase 1 | Complete |
| FOUND-14 | Phase 1 | Complete |
| FOUND-15 | Phase 1 | Complete |
| FOUND-16 | Phase 1 | Complete |
| FOUND-17 | Phase 1 | Complete |
| FOUND-18 | Phase 1 | Complete |
| FOUND-19 | Phase 1 | Complete |
| FOUND-20 | Phase 1 | Complete |
| FOUND-21 | Phase 1 | Complete |
| FOUND-22 | Phase 1 | Complete |
| FOUND-23 | Phase 1 | Complete |
| AUTO-01 | Phase 3 | Complete |
| AUTO-02 | Phase 3 | Complete |
| AUTO-03 | Phase 3 | Complete |
| AUTO-04 | Phase 3 | Complete |
| AUTO-05 | Phase 3 | Complete |
| AUTO-06 | Phase 3 | Complete |
| AUTO-07 | Phase 3 | Complete |
| AUTO-08 | Phase 3 | Complete |
| AUTO-09 | Phase 3 | Complete |
| AUTO-10 | Phase 3 | Complete |
| AUTO-11 | Phase 3 | Complete |
| AUTO-12 | Phase 3 | Complete |
| AUTO-13 | Phase 3 | Complete |
| AUTO-14 | Phase 3 | Complete |
| AUTO-15 | Phase 3 | Complete |
| AUTO-16 | Phase 3 | Complete |
| AUTO-17 | Phase 3 | Complete |
| AUTO-18 | Phase 3 | Complete |
| AUTO-19 | Phase 3 | Complete |
| TUI-01 | Phase 4 | Complete |
| TUI-02 | Phase 4 | Complete |
| TUI-03 | Phase 4 | Complete |
| TUI-04 | Phase 4 | Complete |
| TUI-05 | Phase 4 | Complete |
| XCUT-01 | Phase 2 | Complete |
| XCUT-02 | Phase 2 | Complete |
| XCUT-03 | Phase 2 | Complete |
| XCUT-04 | Phase 2 | Complete |
| XCUT-05 | Phase 2 | Complete |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after Phase 4 completion — all v1 requirements complete*
