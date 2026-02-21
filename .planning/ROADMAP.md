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
- [x] 03-02-PLAN.md — All lifecycle command wrappers (13 commands)
- [x] 03-03-PLAN.md — Queue runner state machine + lifecycle modes
- [x] 03-04-PLAN.md — Queue management commands: run, stop, add, build
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
**Plans:** 5 plans
Plans:
- [x] 04-01-PLAN.md — TUI components: App, Dashboard, 4 panels, data hook (superseded by 04-03/04-04)
- [x] 04-02-PLAN.md — Command wiring (lazy import), package.json update, tests (superseded by 04-04/04-05)
- [x] 04-03-PLAN.md — Gap closure: package.json deps + vitest config + data hook + App shell
- [x] 04-04-PLAN.md — Gap closure: Dashboard + 4 panels + tui command wiring
- [x] 04-05-PLAN.md — Gap closure: TUI component tests (panels + Dashboard)
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

### Phase 5: Integration fixes per requirements/integration-fixes.md
**Goal:** Fix 6 integration bugs discovered during testing that prevent pilot from replacing the bash queue runner: setup creates wrong directory/config, status hangs 30s, run-command wrong dispatch, --once exits early, update fails without upstream.
**Depends on:** Phase 4
**Plans:** 4 plans

Plans:
- [x] 05-01-PLAN.md — Fix setup: .opencode/ symlinks + opencode.json correct format
- [x] 05-02-PLAN.md — Fix status: skip queue runner PID, fast stuck scoring
- [x] 05-03-PLAN.md — Fix runner --once wait + update explicit remote/branch
- [x] 05-04-PLAN.md — Regression tests for all integration fixes

### Phase 6: Queue storage migration per requirements/queue-storage-migration.md
**Goal:** Replace QUEUE.md with structured JSON storage at ~/.pilot/queue.json. CLI becomes the only queue interface with nanoid IDs, timestamps, dependency tracking, and capped history.
**Depends on:** Phase 5
**Plans:** 4 plans

Plans:
- [x] 06-01-PLAN.md — Foundation: types, nanoid dep, queue-store.ts, tests
- [ ] 06-02-PLAN.md — Runner migration to queue-store
- [ ] 06-03-PLAN.md — Command layer migration (add/build/scope/queue/status/config/import)
- [ ] 06-04-PLAN.md — TUI migration, test updates, legacy code cleanup

**Success Criteria:**
- Queue stored as ~/.pilot/queue.json with version 1 schema
- Items have nanoid IDs, timestamps, status (queued/running/completed/failed)
- pilot add returns item ID, pilot queue reads from JSON
- pilot queue --history shows completed/failed from history array
- pilot queue remove <id> removes queued items
- pilot run reads JSON, marks items via queue-store CRUD
- pilot import converts QUEUE.md to queue.json (one-time migration)
- History capped at 100 entries
- dependsOn with circular detection
- pilot queue --json backward compat preserved
- QUEUE.md only read by import command

### Phase 7: Smart add per requirements/smart-add.md
**Goal:** Replace mode-based `pilot add` with intelligent task routing that auto-detects scope (milestone/phase/quick) from requirements files or descriptions, handles project state detection, and queues the right internal mode automatically.
**Depends on:** Phase 6
**Plans:** 4 plans

Plans:
- [ ] 07-01-PLAN.md — Core smart-add logic: scope detection, project state detection, requirements parsing (TDD) [original — superseded by 07-03]
- [ ] 07-02-PLAN.md — Rewrite add/build commands with smart routing, update CLI registration, integration tests [original — superseded by 07-04]
- [x] 07-03-PLAN.md — Gap closure: Core smart-add logic adapted for QUEUE.md infrastructure (TDD)
- [x] 07-04-PLAN.md — Gap closure: Rewrite add/build commands with QUEUE.md integration, update CLI, tests

**Success Criteria:**
- `pilot add <project> <requirements-file>` detects scope (milestone/phase/quick) and queues correct internal mode
- `pilot add <project> "description"` queues as quick task
- `pilot add <project> requirements-dir/` queues as milestone
- `pilot add --dry-run` shows what would happen without queuing
- `pilot add --as quick|phase|milestone` overrides auto-detection
- `pilot build` = smart add + start runner
- No GSD modes (build-full, continue-all, etc.) exposed to user
- Project state detection handles: missing dir, no .opencode, no .planning, incomplete phases, all done, already queued, currently running
- All tests pass with no regressions

### Phase 8: Smart tail stuck detection per requirements/smart-tail-stuck-detection.md
**Goal:** Add log content analysis as a 6th stuck detection signal so pilot can detect "semantically stuck" processes — where the log itself reveals the process is confused, waiting for input, or has finished work but hasn't exited.
**Depends on:** Phase 7
**Plans:** 2 plans

Plans:
- [ ] 08-01-PLAN.md — Core log content analyzer + Signal 6 stuck scoring integration (TDD)
- [ ] 08-02-PLAN.md — Command layer: tail --smart highlighting + stuck reason field display

### Phase 9: Gap closure resilience per requirements/gap-closure-resilience.md
**Goal:** Prevent broken gap closure loops by checking execution evidence (SUMMARY.md files) before entering --gaps-only mode. When original plans haven't been executed, run full execute instead.
**Depends on:** Phase 8
**Plans:** 4 plans

Plans:
- [ ] 09-01-PLAN.md — Core gap closure guard: summary counting, lifecycle guard, postmortem field (TDD) [original — superseded by 09-03]
- [ ] 09-02-PLAN.md — Stuck detection: gap closure misconfiguration detection for pilot stuck [original — superseded by 09-04]
- [x] 09-03-PLAN.md — Gap closure: Core gap closure guard with TDD (summary counting, lifecycle guard, postmortem field)
- [x] 09-04-PLAN.md — Gap closure: Stuck detection gap closure misconfiguration detection

**Success Criteria:**
- Gap closure only runs when original plans have SUMMARY.md files
- When needs-gaps fires but no summaries exist, full execute runs instead
- Log message clearly states why gap closure was skipped
- pilot stuck detects gap closure on unexecuted phases as misconfiguration
- PostmortemEntry tracks gap_closure_attempts
- All existing tests pass with no regressions

### Phase 10: Smart verify routing per requirements/smart-verify-routing.md
**Goal:** Detect project type and route verification to appropriate strategy (browser UAT for web, file-content checks for non-web, CLI checks for CLI tools). Prevent verify loops by auto-skipping after 3 failures.
**Depends on:** Phase 9
**Plans:** 4 plans

Plans:
- [x] 10-01-PLAN.md — Project type detection: classify web/cli/file-content (TDD)
- [x] 10-02-PLAN.md — File-content and CLI verification strategy implementations (TDD)
- [x] 10-03-PLAN.md — Wire verify command + lifecycle runner with smart routing
- [x] 10-04-PLAN.md — Verify failure detection and auto-skip after 3 attempts

**Success Criteria:**
- Project type detection classifies web, CLI, and file-content projects from filesystem signals
- File-content verification checks file existence, stubs, summaries, and test suites
- CLI verification builds, runs --help, checks binary, and runs tests
- `pilot verify --strategy auto|browser|file|cli` flag works
- Lifecycle runner routes non-web projects to pilot's own verification (no AI agent spawn)
- After 3 verify failures, auto-skip and continue to next phase
- Web projects still use gsd-verify-auto (unchanged)
- All existing tests pass with no regressions

### Phase 11: Finishing touches per requirements/finishing-touches.md

**Goal:** Polish, DX, and production readiness — doctor health check, notifications, runner logging, cleanup command, setup validation, global install verification, TUI smoke test, and cross-project parallel build validation.
**Depends on:** Phase 10
**Plans:** 4 plans

Plans:
- [ ] 11-01-PLAN.md — `pilot doctor` health check command (9 checks, --fix, --json)
- [ ] 11-02-PLAN.md — Notifications on build complete/fail + runner logging with rotation
- [ ] 11-03-PLAN.md — `pilot cleanup` maintenance command + `pilot setup --verify` validation
- [ ] 11-04-PLAN.md — Global install verification, --no-tui flag, parallel build tests, TUI smoke test

### Phase 12: Critical fixes per requirements/overnight-fixes.md

**Goal:** Fix all claude→opencode binary references, progress overflow bugs, and add project documentation so all CLI commands work without hanging and the project is demo-ready.
**Depends on:** Phase 11
**Plans:** 3 plans

Plans:
- [x] 12-01-PLAN.md — Fix sessions.ts: opencode binary, optional message_count, 5s timeout, update tests
- [x] 12-02-PLAN.md — Fix init.ts, spawn.ts, config.ts, setup.ts claude→opencode + progress overflow cap
- [x] 12-03-PLAN.md — README.md, LICENSE, package.json metadata

### Phase 13: E2E test suite per requirements/e2e-test-suite.md

**Goal:** Comprehensive end-to-end test suite that exercises every CLI command as a subprocess against real (temp) project directories. Final gate before replacing the bash queue runner.
**Depends on:** Phase 12
**Plans:** 0 plans

Plans:
(to be planned)
