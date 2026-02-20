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

- [ ] **AUTO-01**: `pilot run` — queue runner state machine (scan -> wait_capacity -> launch -> scan loop)
- [ ] **AUTO-02**: `pilot stop` — graceful runner shutdown with SIGTERM -> SIGKILL
- [ ] **AUTO-03**: `pilot add <project> <mode>` — append to QUEUE.md with file locking
- [ ] **AUTO-04**: `pilot build <project>` — convenience wrapper: detect mode + add + start runner
- [ ] **AUTO-05**: `pilot init <project>` — create project dir, setup, spawn gsd-new-project
- [ ] **AUTO-06**: All lifecycle commands (plan, execute, verify, quick, debug, scope, insert, remove, research, milestone, todos, map)
- [ ] **AUTO-07**: Pre-spawn checks: git gc disable, memory check, config validation, binary check, title truncation
- [ ] **AUTO-08**: Success detection: new commits OR .planning changes OR clean exit (no >=8 messages heuristic)
- [ ] **AUTO-09**: Lifecycle modes: build-full, continue, continue-all, build-to-phase, add-and-build, run-command
- [ ] **AUTO-10**: Phase state detection with explicit STATE files + inference fallback
- [ ] **AUTO-11**: Phase cycle: plan -> execute -> verify -> gap closure (max 3 cycles)
- [ ] **AUTO-12**: Graceful shutdown: SIGTERM handler, tree-kill, PID cleanup, queue entry reset
- [ ] **AUTO-13**: core/runner.ts — queue runner state machine
- [ ] **AUTO-14**: core/lifecycle.ts — lifecycle mode implementations
- [ ] **AUTO-15**: core/phase-state.ts — phase state detection
- [ ] **AUTO-16**: core/spawn.ts — process spawning with pre-spawn checks
- [ ] **AUTO-17**: core/lock.ts — proper-lockfile wrapper for QUEUE.md
- [ ] **AUTO-18**: core/postmortem.ts — JSONL job result logging
- [ ] **AUTO-19**: build-full MUST reject existing .planning/ directories

### TUI Dashboard

- [ ] **TUI-01**: `pilot tui` — full-screen Ink/React dashboard with 4 panels
- [ ] **TUI-02**: Auto-refresh with configurable interval
- [ ] **TUI-03**: Keyboard navigation (q, arrows, Enter, K, r, Tab)
- [ ] **TUI-04**: Responsive to terminal size
- [ ] **TUI-05**: Lazy-loaded — React/Ink not imported for any other command

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
| AUTO-01 | Phase 2 | Pending |
| AUTO-02 | Phase 2 | Pending |
| AUTO-03 | Phase 2 | Pending |
| AUTO-04 | Phase 2 | Pending |
| AUTO-05 | Phase 2 | Pending |
| AUTO-06 | Phase 2 | Pending |
| AUTO-07 | Phase 2 | Pending |
| AUTO-08 | Phase 2 | Pending |
| AUTO-09 | Phase 2 | Pending |
| AUTO-10 | Phase 2 | Pending |
| AUTO-11 | Phase 2 | Pending |
| AUTO-12 | Phase 2 | Pending |
| AUTO-13 | Phase 2 | Pending |
| AUTO-14 | Phase 2 | Pending |
| AUTO-15 | Phase 2 | Pending |
| AUTO-16 | Phase 2 | Pending |
| AUTO-17 | Phase 2 | Pending |
| AUTO-18 | Phase 2 | Pending |
| AUTO-19 | Phase 2 | Pending |
| TUI-01 | Phase 3 | Pending |
| TUI-02 | Phase 3 | Pending |
| TUI-03 | Phase 3 | Pending |
| TUI-04 | Phase 3 | Pending |
| TUI-05 | Phase 3 | Pending |
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
*Last updated: 2026-02-20 after Phase 2 completion*
