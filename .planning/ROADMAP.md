# Roadmap

## Milestone: launch-v1

### Phase 1: Project Scaffolding + Core Data Layer
**Goal:** Set up the TypeScript project structure, build toolchain, and implement the pure core/ data layer that all commands depend on. No CLI rendering yet — just the foundation.
**Requirements:** FOUND-12, FOUND-13, FOUND-14, FOUND-15, FOUND-16, FOUND-17, FOUND-18, FOUND-19, FOUND-20, FOUND-21, FOUND-22, FOUND-23
**Plans:** 5 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffolding + types + utilities + config
- [x] 01-02-PLAN.md — Queue parser (TDD)
- [x] 01-03-PLAN.md — Process management + sessions
- [x] 01-04-PLAN.md — Stuck detection algorithm (TDD)
- [x] 01-05-PLAN.md — Projects + progress + setup
**Success Criteria:**
- package.json, tsconfig.json, vitest.config.ts configured per spec
- `npm run build` produces dist/ with no errors
- `npm test` runs and passes
- core/config.ts resolves all env vars with defaults
- core/types.ts exports all shared interfaces
- core/queue-parser.ts parses QUEUE.md v5 fixtures correctly
- core/stuck.ts scoring algorithm returns correct verdicts for all signal combinations
- core/sessions.ts wraps session list/export with fuzzy matching
- core/projects.ts scans directories and detects .planning state
- core/progress.ts analyzes phase progress
- core/setup.ts creates symlinks
- core/process.ts manages PID files
- util/ helpers (output, format, colors) work with --json and NO_COLOR

### Phase 2: CLI Commands (Phase 1 Monitoring + Setup)
**Goal:** Implement all Phase 1 CLI commands that render core/ data as human-readable and JSON output. The user can run `pilot status`, `pilot queue`, `pilot stuck`, etc.
**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09, FOUND-10, FOUND-11, XCUT-01, XCUT-02, XCUT-03, XCUT-04, XCUT-05
**Plans:** 3 plans
Plans:
- [x] 02-01-PLAN.md — Entry point + status/queue/stuck/config commands
- [x] 02-02-PLAN.md — Log/tail/projects/progress commands
- [x] 02-03-PLAN.md — Setup/update commands + command tests
**Success Criteria:**
- src/index.ts entry point with commander, global --json, grouped help output
- `pilot status` shows running/stuck/queued/completed matching spec format
- `pilot status --json` outputs valid PilotStatusJson schema
- `pilot queue` displays QUEUE.md entries grouped by status
- `pilot stuck` shows scored processes with verdicts
- `pilot stuck --kill --force` terminates stuck processes
- `pilot log <session>` displays formatted transcript with fuzzy matching
- `pilot tail <session>` follows log in real-time via fs.watch
- `pilot projects` shows project table with git/planning state
- `pilot progress` shows deep phase progress
- `pilot setup <dir>` creates symlinks and opencode.json
- `pilot update` pulls pilot-gsd
- `pilot config` displays resolved configuration
- `pilot help` shows grouped command listing
- All commands support --json with timestamp field
- Exit codes: 0 success, 1 runtime error, 2 usage error

### Phase 3: Queue Runner + Lifecycle Automation
**Goal:** Implement the queue runner state machine and all lifecycle mode commands. This is the automation engine that processes QUEUE.md entries, spawns AI sessions, and manages the full plan->execute->verify pipeline.
**Requirements:** AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06, AUTO-07, AUTO-08, AUTO-09, AUTO-10, AUTO-11, AUTO-12, AUTO-13, AUTO-14, AUTO-15, AUTO-16, AUTO-17, AUTO-18, AUTO-19
**Plans:** 4 plans
Plans:
- [x] 03-01-PLAN.md — Core infrastructure: lock, spawn, phase-state, postmortem
- [ ] 03-02-PLAN.md — All lifecycle command wrappers (13 commands)
- [x] 03-03-PLAN.md — Queue runner state machine + lifecycle modes
- [ ] 03-04-PLAN.md — Queue management commands: run, stop, add, build
**Success Criteria:**
- `pilot run` processes QUEUE.md entries with state machine (scan -> launch -> reap)
- Same-project entries run sequentially, cross-project entries parallel up to --max-parallel
- Pre-spawn checks: git gc disable, memory check, config validation, binary check, title truncation
- Success detection: new commits OR .planning changes OR clean exit code 0
- `pilot stop` gracefully shuts down runner (SIGTERM -> wait 15s -> SIGKILL)
- `pilot add` appends to QUEUE.md with proper-lockfile
- `pilot build` detects mode + adds + starts runner
- `pilot init` creates project + setup + spawns gsd-new-project
- All lifecycle commands (plan, execute, verify, etc.) spawn correct gsd-* commands
- build-full rejects existing .planning/ directories
- Phase state detection uses STATE files with inference fallback
- Phase cycle: plan -> execute -> verify -> gap closure (max 3)
- Graceful shutdown: SIGTERM handler, tree-kill, PID cleanup
- Post-mortem JSONL logging

### Phase 4: TUI Dashboard
**Goal:** Implement the full-screen Ink/React TUI dashboard that provides a live view of the pipeline.
**Requirements:** TUI-01, TUI-02, TUI-03, TUI-04, TUI-05
**Success Criteria:**
- `pilot tui` enters alternate screen buffer with 4-panel layout
- Running panel shows active sessions with runtime and log activity
- Queue panel shows pending entries
- Log panel expands for selected session
- Completed panel shows recent pass/fail
- Auto-refresh every --interval seconds (default 3)
- Keyboard: q/Ctrl-C quit, arrows/jk select, Enter expand, K kill, r refresh, Tab cycle panels
- Responsive to terminal size
- React/Ink lazy-loaded only for this command
- ink-testing-library tests for components
