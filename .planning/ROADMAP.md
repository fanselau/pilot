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
- [x] 06-02-PLAN.md — Runner migration to queue-store
- [x] 06-03-PLAN.md — Command layer migration (add/build/scope/queue/status/config/import)
- [x] 06-04-PLAN.md — TUI migration, test updates, legacy code cleanup

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
- [x] 11-01-PLAN.md — `pilot doctor` health check command (9 checks, --fix, --json)
- [x] 11-02-PLAN.md — Notifications on build complete/fail + runner logging with rotation
- [x] 11-03-PLAN.md — `pilot cleanup` maintenance command + `pilot setup --verify` validation
- [x] 11-04-PLAN.md — Global install verification, --no-tui flag, parallel build tests, TUI smoke test

### Phase 12: Critical fixes per requirements/overnight-fixes.md

**Goal:** Fix all claude→opencode binary references, progress overflow bugs, and add project documentation so all CLI commands work without hanging and the project is demo-ready.
**Depends on:** Phase 11
**Plans:** 3 plans

Plans:
- [x] 12-01-PLAN.md — Fix sessions.ts: opencode binary, optional message_count, 5s timeout, update tests
- [x] 12-02-PLAN.md — Fix init.ts, spawn.ts, config.ts, setup.ts claude→opencode + progress overflow cap
- [x] 12-03-PLAN.md — README.md, LICENSE, package.json metadata

### Phase 13: Daemon mode runner per requirements/daemon-mode-runner.md

**Goal:** Make `pilot run` a persistent daemon that watches for new queue entries. `pilot add` is fire-and-forget. `pilot build` blocks until complete. `--once` flag preserves current drain-and-exit behavior for batch/CI use. Queue-store hardened with atomic findLaunchable, completedIds, dependency failure cascading, and blocked status.
**Depends on:** Phase 12
**Plans:** 4 plans

Plans:
- [x] 13-01-PLAN.md — Types, config, queue-store hardening (blocked status, completedIds, atomic findLaunchable, dep cascading)
- [x] 13-02-PLAN.md — Runner daemon mode (watch loop, SIGINT, graceful shutdown, per-item retry, timeout fixes)
- [x] 13-03-PLAN.md — Command layer (run/stop/add/build refactor, init-service, CLI registration)
- [x] 13-04-PLAN.md — Tests for all Phase 13 changes

### Phase 14: Production hardening per requirements/production-hardening.md

**Goal:** Make the daemon bulletproof for multi-day unsupervised operation. Crash recovery, resource management, stuck auto-recovery, log rotation, atomic writes, disk/memory guards. Every failure mode from the bash runner era must be handled automatically.
**Depends on:** Phase 13
**Plans:** 5 plans

Plans:
- [x] 14-01-PLAN.md — Atomic queue writes + corruption recovery + backup-on-write
- [x] 14-02-PLAN.md — Resource guards (2GB memory, 1GB disk, auto maxParallel, spawn rate limit)
- [x] 14-03-PLAN.md — Daemon resilience (startup self-check, heartbeat, structured logging, job log cleanup)
- [x] 14-04-PLAN.md — Daemon stuck detection + auto-recovery + flaky detection (3-strike rule)
- [x] 14-05-PLAN.md — Tests for all production hardening changes

### Phase 16: CLI polish per requirements/cli-polish.md

**Goal:** Wire all agreed-upon CLI flags (--next, --before, --after, --depends-on, --phase, --milestone), implement `pilot move`, fix build blocking mode, complete claude→opencode migration, fix dry-run bug and add --help output.
**Depends on:** Phase 15
**Plans:** 3 plans

Plans:
- [ ] 16-01-PLAN.md — Queue-store position parameter + moveItem function
- [ ] 16-02-PLAN.md — Dry-run fix + build blocking + claude→opencode migration
- [ ] 16-03-PLAN.md — Wire add flags, move command, help fix, runner status display

### Phase 15-e2e: E2E test suite per requirements/e2e-test-suite.md

**Goal:** Comprehensive end-to-end test suite that exercises every CLI command as a subprocess against real (temp) project directories. Final gate before replacing the bash queue runner.
**Depends on:** Phase 14
**Plans:** 3 plans

Plans:
- [x] 15-01-PLAN.md — E2E test harness + monitoring command tests
- [ ] 15-02-PLAN.md — Setup, queue management, lifecycle, and error case tests
- [ ] 15-03-PLAN.md — Runner E2E, stuck --kill, TUI smoke, build system wiring

### Phase 17: Pilot v2 complete rewrite — delegation AI, SQLite queue, opencode DB ground truth, clean CLI

**Goal:** Clean-break rewrite of Pilot. Delete v1 code, replace JSON queue with SQLite, replace .planning/ parsing with delegation AI, replace PID tracking with opencode DB polling, slim CLI to essential commands.
**Depends on:** Phase 16
**Plans:** 8 plans

Plans:
- [x] 17-01-PLAN.md — Nuke v1 code, update deps, establish v2 types + config
- [x] 17-02-PLAN.md — SQLite queue database (pilot.db) with TDD
- [x] 17-03-PLAN.md — Extend opencode-db.ts with v2 session queries (TDD)
- [x] 17-04-PLAN.md — Delegation AI module + gsd-delegate command
- [x] 17-05-PLAN.md — Queue runner event loop (delegate → spawn → poll)
- [x] 17-06-PLAN.md — Core CLI commands: add, status, queue, log, config
- [x] 17-07-PLAN.md — Remaining commands + complete CLI entry point
- [x] 17-08-PLAN.md — Test suite for all v2 commands

**Details:**
Read requirements/pilot-v2-master.md + requirements/pilot-v2-architecture.md for full spec.

### Phase 18: Pilot v2 TUI with OpenTUI

**Goal:** Pilot v2 TUI with OpenTUI — dashboard, job detail, split pane views. Bun migration, OpenTUI framework, vim-like navigation, reads from pilot.db + opencode.db.
**Depends on:** Phase 17
**Plans:** 7 plans

Plans:
- [ ] 18-01-PLAN.md — Bun migration + OpenTUI/SolidJS dependency install
- [x] 18-02-PLAN.md — Theme constants, reactive state store, data polling layer
- [ ] 18-03-PLAN.md — TUI shell: renderer, App, StatusBar, FooterBar, HelpOverlay, keyboard routing
- [x] 18-04-PLAN.md — Reusable widgets: sparkline, pulse-dot, scrollable
- [ ] 18-05-PLAN.md — Dashboard view: QueuePanel, RunningPanel, CompletedPanel, FilterOverlay
- [ ] 18-06-PLAN.md — Job Detail + Split Pane views: LogPanel, InfoPanel
- [ ] 18-07-PLAN.md — Queue management actions + CLI entry point wiring + polish

**Details:**
Read requirements/pilot-v2-tui.md for full spec.

### Phase 19: TUI build fix — proper OpenTUI/Solid setup

**Goal:** Fix the TUI so `pilot tui` launches a working dashboard under bun. Exclude TUI from tsc (bun runs .tsx natively), fix import paths, clean dist/ before build, remove stale files, verify TUI renders.
**Depends on:** Phase 18
**Plans:** 2 plans

Plans:
- [x] 19-01-PLAN.md — Build setup: exclude TUI from tsc, prebuild clean, fix import paths
- [ ] 19-02-PLAN.md — TUI launch verification + runtime fixes + human verify

**Details:**
Read requirements/tui-phase-redo.md for full spec.

### Phase 20: Model profile support per requirements/model-profile-support.md

**Goal:** Add --profile and --provider flags to `pilot add`, store on job records in pilot.db, and have the runner write .planning/config.json before spawning so GSD agents use the correct model tier. Show profile in status display.
**Depends on:** Phase 19
**Plans:** 2 plans

Plans:
- [x] 20-01-PLAN.md — DB schema migration + types + add command --profile/--provider flags
- [ ] 20-02-PLAN.md — Runner config writing + status profile display + tests

**Details:**
Read requirements/model-profile-support.md for full spec.

### Phase 21: TUI Visual Polish & Functional Fixes

**Goal:** Make `pilot tui` genuinely useful and visually polished — fix ghost action keys, broken token display, raw markdown descriptions, duplicated utils, and missing keyboard navigation. Add queue position numbers, empty states, enriched status bar, and better panel proportions.
**Depends on:** Phase 20
**Plans:** 3 plans

Plans:
- [ ] 21-01-PLAN.md — Extract duplicated utils, fix description sanitization, correct elapsed display
- [ ] 21-02-PLAN.md — Wire action keys (cancel/retry/bump), detail view keyboard nav, remove split placeholder
- [ ] 21-03-PLAN.md — Fix CompletedPanel tokens, panel proportions, queue numbers, empty states, enriched StatusBar

**Details:**
Read requirements/tui-visual-polish.md for full spec. Covers P0 (must-have), P1 (should-have), and P2 (nice-to-have) fixes.

### Phase 22: Delegate Phase Lifecycle Hardening

**Goal:** Make phase lifecycle (add → plan → execute) reliable with proper args and inter-step verification. Delegate passes meaningful descriptions, runner verifies artifacts between steps and dynamically patches phase numbers.
**Depends on:** Phase 21
**Plans:** 2 plans

Plans:
- [x] 22-01-PLAN.md — Delegate title extraction + gsd-delegate.md prompt update
- [x] 22-02-PLAN.md — Runner inter-step artifact verification + dynamic arg patching

**Details:**
Read requirements/delegate-phase-lifecycle-hardening.md for full spec.

### Phase 23: TUI Selection Colors & Visual Polish

**Goal:** Fix selection readability (white-on-blue), shorten project paths, wire completed token counts from opencode DB, add step progress for running jobs, improve focused panel indicators, and use 2-line completed layout for wide terminals.
**Depends on:** Phase 22
**Plans:** 2 plans

Plans:
- [ ] 23-01-PLAN.md — Theme constants + selection colors + focused panel indicators
- [ ] 23-02-PLAN.md — Token wiring + step progress + shortened paths + 2-line completed layout

**Details:**
Read requirements/tui-selection-colors-and-polish.md for full spec.

### Phase 24: Task/Subagent Visibility in TUI and Logs

**Goal:** Make task subagent sessions visible in both `pilot log` and the TUI detail view — users can see what each spawned subagent actually did, inline and indented, without leaving the current context.
**Depends on:** Phase 23
**Plans:** 3 plans

Plans:
- [x] 24-01-PLAN.md — Core DB: getChildSessions() + task part formatting in core/opencode-db.ts
- [x] 24-02-PLAN.md — TUI: extend SessionSection + fetchJobParts child traversal + detail.tsx nested rendering
- [x] 24-03-PLAN.md — CLI: pilot log child expansion, --flat flag, --task N flag

**Details:**
Read requirements/task-subagent-visibility.md for full spec.

### Phase 25: Pilot Learnings Consolidation + Reliability Guardrails (2026-03-03)

**Goal:** Codify hard-earned operational learnings into enforceable reliability guardrails: same-project serialization, stale-running reconciliation on startup and periodic cycles, status integrity check for ghost-running jobs, and a date-stamped in-repo incident document.
**Depends on:** Phase 24
**Plans:** 4 plans

Plans:
- [ ] 25-01-PLAN.md — DB layer: getRunningJobsForProject, getAllRunningJobs, reconcileStaleJobs, markStale
- [ ] 25-02-PLAN.md — Runner: same-project serialization guard + startup/periodic reconciliation
- [ ] 25-03-PLAN.md — Status integrity check (stale display) + docs/RELIABILITY-LEARNINGS-2026-03-03.md
- [ ] 25-04-PLAN.md — Tests for all guardrails (db reconciliation, runner guard, status stale display)

**Details:**
Read requirements/pilot-learnings-consolidation-and-guardrails-2026-03-03.md for full spec.

Wave structure:
- Wave 1: 25-01 (DB foundation)
- Wave 2: 25-02 + 25-03 (runner + status, both depend on 25-01, independent of each other)
- Wave 3: 25-04 (tests, depends on all above)

### Phase 26: Runner Immediate Dispatch + Force Quit Controls

**Goal:** Make runner scheduling and operator controls predictable: fill all available parallel slots immediately when eligible jobs exist (no idle wait), enforce project-level serialization via DB-backed atomic claim, and provide first-class force-quit controls in both CLI (`pilot kill <id> --force`) and TUI (`K` key) that deterministically terminate active jobs and update DB state consistently.
**Depends on:** Phase 25
**Plans:** 5 plans

Plans:
- [ ] 26-01-PLAN.md — DB layer: claimNextLaunchable (atomic + project serialization), forceQuitJob, getRunningJobsByProject
- [ ] 26-02-PLAN.md — Runner: immediate multi-slot dispatch loop, event-driven DB watch wake-up, killJobSession export
- [ ] 26-03-PLAN.md — CLI: pilot kill <id> --force command + wire in index.ts
- [ ] 26-04-PLAN.md — TUI: ConfirmOverlay component, K key force-quit, state signals, help text update
- [ ] 26-05-PLAN.md — Tests: dispatch immediacy, project serialization, DB force-quit, CLI kill command

**Details:**
Read requirements/runner-immediate-dispatch-and-force-quit.md for full spec.

Wave structure:
- Wave 1: 26-01 + 26-02 (independent: DB layer and runner loop, parallel)
- Wave 2: 26-03 + 26-04 (both depend on 26-01: CLI kill + TUI force-quit, parallel)
- Wave 3: 26-05 (tests, depends on all above)

### Phase 27: TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix

**Goal:** Improve TUI operational clarity: rework detail header into a structured, readable summary panel with rich run metadata; fix completed panel hover/overlay rendering glitches; add regression tests for both areas.
**Depends on:** Phase 26
**Plans:** 2 plans

Plans:
- [x] 27-01-PLAN.md — Detail header rework + run info density + completed overlay fix
- [x] 27-02-PLAN.md — Tests for detail header layout (2 widths) + completed panel regression

Wave structure:
- Wave 1: 27-01 (implementation)
- Wave 2: 27-02 (tests, depends on 27-01)

**Details:**
Read requirements/tui-detail-header-and-completions-polish.md for full spec.

### Phase 28: Resource Management System per requirements/resource-management.md

**Goal:** Prevent any pilot-spawned process from OOM-ing the server. Wrap each opencode session in systemd-run cgroups v2 scopes with per-process memory limits, dynamic maxParallel based on available memory, memory pressure watchdog, and OOM score configuration.
**Depends on:** Phase 27
**Plans:** 4 plans

Plans:
- [x] 28-01-PLAN.md — Extend PilotConfig with 3 memory env vars (types.ts + config.ts)
- [x] 28-02-PLAN.md — systemd-run cgroup wrapping, dynamic maxParallel, watchdog, OOM score (runner.ts)
- [ ] 28-03-PLAN.md — Tests for getDynamicMaxParallel, hasSystemdRunUser, config fields
- [ ] 28-04-PLAN.md — Doctor cgroup health checks (cgroups v2, user lingering, resource config)

Wave structure:
- Wave 1: 28-01 (config foundation) ✓
- Wave 2: 28-02 + 28-04 (runner + doctor, both depend on 28-01, independent of each other)
- Wave 3: 28-03 (tests, depends on 28-01 + 28-02)

**Details:**
Read requirements/resource-management.md for full spec.

### Phase 29: Phase Delegation: Revert to Multi-Step Spawning

**Goal:** Revert phase delegation from broken single-session gsd-phase orchestrator to multi-step spawning where each GSD command (add-phase, plan-phase, execute-phase) runs in its own opencode session with proper command inlining. Add state-aware step selection, fix runner judge gating, and fix TUI kill shortcut scope.
**Depends on:** Phase 28
**Plans:** 2 plans

Plans:
- [x] 29-01-PLAN.md — Multi-step delegation rewrite + runner judge fix + TUI kill fix
- [x] 29-02-PLAN.md — Test updates for multi-step delegation behavior

Wave structure:
- Wave 1: 29-01 (implementation)
- Wave 2: 29-02 (tests, depends on 29-01)

**Details:**
Read requirements/phase-delegation-revert-to-multi-step.md for full spec.

### Phase 30: Milestone Orchestration: Child Jobs + depends_on

**Goal:** Make milestone jobs spawn independent child phase jobs with depends_on chaining, failure pausing, operator controls (status/resume/skip), and Telegram notification — replacing the broken flat step list.
**Depends on:** Phase 29
**Plans:** 4 plans

Plans:
- [x] 30-01-PLAN.md — DB foundation: parent_job_id, depends_on enforcement, milestone query helpers
- [x] 30-02-PLAN.md — Milestone coordinator rewrite + spawnChildJobs + pause-on-failure
- [x] 30-03-PLAN.md — CLI milestone commands (status/resume/skip) + Telegram notification
- [x] 30-04-PLAN.md — Tests for all milestone orchestration changes

Wave structure:
- Wave 1: 30-01 (DB foundation)
- Wave 2: 30-02 (coordinator + spawning, depends on 30-01)
- Wave 3: 30-03 (CLI + notifications, depends on 30-01 + 30-02)
- Wave 4: 30-04 (tests, depends on all above)

**Details:**
Read requirements/milestone-orchestration.md for full spec.

### Phase 31: Automated Phase Verification (gsd-verify-phase)

**Goal:** Replace weak transcript-based pilot-judge with structured verification: automated build checks (tsc, tests, lint, build) + AI code review against PLAN.md, producing machine-readable VERIFICATION.md verdicts the runner parses for pass/fail/retry decisions.
**Depends on:** Phase 30
**Plans:** 2 plans

Plans:
- [x] 31-01-PLAN.md — GSD command layer: add Step 0.5 automated build checks to gsd-verifier + create gsd-verify-phase command
- [x] 31-02-PLAN.md — Runner integration: replace pilot-judge with gsd-verify-phase + VERIFICATION.md parsing + tests

Wave structure:
- Wave 1: 31-01 (GSD command layer — agent + command .md files)
- Wave 2: 31-02 (runner integration + tests, depends on 31-01)

**Details:**
Read requirements/verify-phase-command.md for full spec.

### Phase 32: Job Completion Callback (OpenClaw Session Wake)

**Goal:** When a pilot job completes or fails, the runner automatically notifies the originating OpenClaw session via `/hooks/agent` webhook, waking the dormant session so it can continue its workflow autonomously. Adds callbackUrl/callbackSessionKey to Job, `--notify` flag on `pilot add`, and fire-and-forget callback module.
**Depends on:** Phase 31
**Plans:** 3 plans

Plans:
- [x] 32-01-PLAN.md — Types + DB schema + config + callback.ts module + pilot add --notify flag
- [x] 32-02-PLAN.md — Runner integration: notifyJobCompletion after markCompleted/markFailed + child propagation
- [x] 32-03-PLAN.md — Tests for callback module, DB fields, runner integration

Wave structure:
- Wave 1: 32-01 (foundation: types, DB, config, callback module, CLI flag)
- Wave 2: 32-02 (runner integration, depends on 32-01)
- Wave 3: 32-03 (tests, depends on 32-01 + 32-02)

**Details:**
Read requirements/job-completion-callback.md for full spec.


### Phase 33: Managed Projects

**Goal:** Introduce project-level state in pilot.db — owner, status (active/blocked), and blocking behavior. Failed jobs block the project and notify the owner. No blind retries. The human or agent always decides what happens next.
**Depends on:** Phase 32
**Plans:** 4 plans

Plans:
- [x] 33-01-PLAN.md — DB foundation: projects table, CRUD, markFailed→block, claimNextLaunchable skip blocked, max_attempts=1 default, remove verification retry
- [x] 33-02-PLAN.md — CLI commands: setup --owner/--update, pilot projects, pilot unblock, retry unblocks, add uses project owner as fallback notify
- [x] 33-03-PLAN.md — TUI: ProjectsPanel, project status indicators on job list, 'u' keybinding to unblock
- [x] 33-04-PLAN.md — Tests for all managed project behaviors

Wave structure:
- Wave 1: 33-01 (DB foundation)
- Wave 2: 33-02 + 33-03 (CLI + TUI, both depend on 33-01, independent of each other)
- Wave 3: 33-04 (tests, depends on all above)

**Details:**
Read requirements/managed-projects.md for full spec.

### Phase 34: TUI & Observability Overhaul

**Goal:** Fix six interconnected observability issues: token counts include thinking + subagent tokens; long lines show full content (no hard truncation); tool calls always show human-readable input; verify sessions are visible in TUI/CLI; ConfirmOverlay is readable; spawnAndWait has debug logging and safety timeout.
**Depends on:** Phase 33
**Plans:** 3 plans

Plans:
- [x] 34-01-PLAN.md — Token counting (recursive + reasoning) + tool call display unification
- [x] 34-02-PLAN.md — ConfirmOverlay fix + spawnAndWait debug/timeout + verify session visibility
- [x] 34-03-PLAN.md — Remove hard truncation from TUI formatPartLines + CLI formatPart (terminal-width soft-wrap)

Wave structure:
- Wave 1: 34-01 + 34-02 (independent, no file overlap)
- Wave 2: 34-03 (depends on 34-01 + 34-02 for complete context)

**Details:**
Read requirements/tui-observability-overhaul.md for full spec.

### Phase 35: Refactor Error Handling in API Layer

**Goal:** [To be planned]
**Depends on:** Phase 34
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 35 to break down)

**Details:**
[To be added during planning]

### Phase 36: Config File Support for Pilot CLI

**Goal:** Add layered config file system (`~/.pilot/config.json`) with resolution order: CLI flags > env vars > config file > defaults. Includes `pilot config` subcommands (init, set, get, edit, path), enhanced config display with source annotations, and config-driven defaults for model profile and provider mode.
**Depends on:** Phase 35
**Plans:** 3 plans

Plans:
- [x] 36-01-PLAN.md — Config file loading with layered resolution (TDD: types, loadConfigFile, getConfig update, tests)
- [x] 36-02-PLAN.md — CLI config subcommands (init, set, get, edit, path, enhanced show)
- [x] 36-03-PLAN.md — Consumer wiring (add.ts/db.ts defaults, doctor check, comprehensive tests)

Wave structure:
- Wave 1: 36-01 (config foundation — types + loading + resolution)
- Wave 2: 36-02 + 36-03 (CLI subcommands + consumer wiring, both depend on 36-01, independent of each other)

**Details:**
Read requirements/config-file.md for full spec.

### Phase 37: Skills System for Pilot

**Goal:** Manage a curated skill library at `~/.pilot/skills/` and automatically inject relevant skills into OpenCode sessions before spawning. Users install skills from GitHub, assign categories, and select categories on `pilot add`. The runner copies matched skills into the project's `.opencode/skills/` directory before each session and cleans up after.
**Depends on:** Phase 36
**Plans:** 4 plans

Plans:
- [x] 37-01-PLAN.md — Foundation: types (SkillEntry, SkillManifest, Job.categories), DB migration, src/core/skills.ts library module
- [x] 37-02-PLAN.md — Consumer wiring: pilot add --categories flag, delegate.ts skills hint in prompt
- [x] 37-03-PLAN.md — Runner injection: injectSkills before spawn, cleanupInjectedSkills in finally block
- [x] 37-04-PLAN.md — pilot skills CLI subcommands (list, add, remove, categories, tag, sync), index.ts wiring, tests

**Details:**
Read requirements/skills-system.md for full spec.

### Phase 38: Pilot Hardening — Pre-Release Quality Pass

**Goal:** Fix all CRITICAL and HIGH severity issues from 5 automated audits (error handling, security, code quality, UX, dead code). Make the codebase robust enough that a new user can install, set up, queue a job, and succeed without hitting preventable failures.
**Depends on:** Phase 37
**Plans:** 3 plans

Plans:
- [x] 38-01-PLAN.md — Shared utilities (errMsg), dead code cleanup, security hardening (PRAGMA allowlist, command injection, DB busy_timeout + chmod)
- [x] 38-02-PLAN.md — Error recovery: runner process resilience, delegate catch logging, opencode-db reconnection, callback URL security, file size limits
- [x] 38-03-PLAN.md — UX polish (daemon status, setup hint, scope feedback, TUI footer, kill fix, service warning) + pilot gc command

Wave structure:
- Wave 1: 38-01 (utilities + dead code + security foundation)
- Wave 2: 38-02 (error recovery, depends on 38-01 for errMsg + clean exports)
- Wave 3: 38-03 (UX polish + gc, depends on 38-01 + 38-02)

**Details:**
Read requirements/hardening.md for full spec.

### Phase 39: Runner Simplification

**Goal:** Remove dead config knobs (stuckThreshold, defaultTimeout, pollInterval), hardcode maxAttempts=1, add per-job opt-in timeout via `--timeout` flag. Trust opencode for completion detection; infinite run by default.
**Depends on:** Phase 38
**Plans:** 3 plans

Plans:
- [ ] 39-01-PLAN.md — Remove stuckThreshold/defaultTimeout from types + maxAttempts from Job; add timeout field to Job + DB schema
- [ ] 39-02-PLAN.md — Remove 120s delegation timeout; fix checkMemory OOM behavior; use job-level timeout in runner
- [ ] 39-03-PLAN.md — Remove config knobs from config CLI surface; add --timeout to pilot add; show timeout in pilot queue; fix all tests

**Details:**
Requirements: requirements/runner-simplification.md
Wave 1: 39-01 (foundation — types + DB)
Wave 2: 39-02 + 39-03 in parallel (runner/delegate + config/CLI)

### Phase 40: Default Skills Library per requirements/default-skills-library.md

**Status:** complete (3/3 plans, verified ✓)
**Goal:** Bundle a curated default skills catalog with Tier 1 (universal) and Tier 2 (stack-specific) skills. During `pilot setup`, detect project stack and offer to install matching skills. `pilot skills bootstrap` command for manual library initialization via `npx skills install`.
**Depends on:** Phase 39
**Plans:** 3 plans

Plans:
- [x] 40-01-PLAN.md — Core foundation: default-skills.ts (catalog constants, stack detection, recommendation, bootstrap orchestrator) + TDD tests
- [x] 40-02-PLAN.md — CLI commands: pilot skills bootstrap + pilot skills recommend + index.ts wiring + command tests
- [x] 40-03-PLAN.md — Setup integration: post-setup skill offer + setup.test.ts

Wave structure:
- Wave 1: 40-01 (core foundation)
- Wave 2: 40-02 + 40-03 in parallel (CLI commands + setup integration, both depend on 40-01)

**Details:**
Read requirements/default-skills-library.md for full spec.

### Phase 41: OpenClaw Skill Rewrite and Bundle with Pilot

**Status:** complete (2/2 plans, verified ✓)
**Goal:** Bundle a complete, portable SKILL.md for OpenClaw agents in the pilot repo, auto-install it via `pilot init` and keep it in sync via `pilot update`. Replaces the stale, manually-maintained skill with hardcoded paths.
**Depends on:** Phase 39
**Plans:** 2 plans

Plans:
- [x] 41-01-PLAN.md — Write complete SKILL.md with all sections (role, setup, commands, profiles, categories, troubleshooting)
- [x] 41-02-PLAN.md — Create installOpenClawSkill() module, wire into init/update, update package.json, add tests

Wave structure:
- Wave 1: 41-01 (SKILL.md content)
- Wave 2: 41-02 (module + wiring + tests, depends on 41-01)

**Details:**
Read requirements/openclaw-skill-bundle.md for full spec.

### Phase 42: Release Hardening — Config Isolation, Install Story, and Changelog

**Status:** complete (3/3 plans, verified ✓)
**Goal:** Make the test suite deterministic on any machine, remove the false npm install story, and ship a real CHANGELOG so Pilot is ready for soft launch.
**Depends on:** Phase 41
**Plans:** 3 plans

Plans:
- [x] 42-01-PLAN.md — Fix 3 failing tests + config isolation (beforeEach cache reset, PILOT_CONFIG_FILE isolation in db tests, 5 regression cases)
- [x] 42-02-PLAN.md — Remove npm install references from README + GETTING-STARTED.md, replace with clone+build install path
- [x] 42-03-PLAN.md — Write real CHANGELOG.md pre-release section covering all major capability areas

Wave structure:
- Wave 1: 42-01 + 42-02 (independent — tests and docs have no file overlap)
- Wave 2: 42-03 (CHANGELOG, depends on 42-02 so README context is settled)

**Details:**
Read requirements/release-hardening-config-isolation-install-story-and-changelog.md for full spec.

### Phase 43: Job Undo and Recovery Checkpoints

**Status:** complete (4/4 plans, verified ✓)
**Goal:** Ship a conservative recovery MVP by recording per-job git checkpoints, enforcing clean-worktree execution by default, and adding guarded `pilot undo` with clear CLI/TUI safety visibility.
**Depends on:** Phase 42
**Plans:** 4 plans

Plans:
- [x] 43-01-PLAN.md — Add recovery metadata schema/types and `pilot add --force-dirty` queue-time intent capture
- [x] 43-02-PLAN.md — Enforce runner clean-worktree preflight and capture base/head checkpoints around execution
- [x] 43-03-PLAN.md — Implement guarded `pilot undo <id>` with `--dry-run` and `--force` safety rules
- [x] 43-04-PLAN.md — Expose recovery state in status/info/TUI, update docs, and run regression verification

Wave structure:
- Wave 1: 43-01 (schema + add-command plumbing foundation)
- Wave 2: 43-02 (runner preflight/checkpoint capture depends on 43-01)
- Wave 3: 43-03 (undo command depends on 43-02)
- Wave 4: 43-04 (visibility/docs verification depends on 43-02 + 43-03)

**Details:**
Read requirements/job-undo-and-recovery-checkpoints.md for full spec.

### Phase 44: QoL Introspection and Queue Grace Period

**Status:** complete (6/6 plans, verified ✓)
**Goal:** Improve day-to-day operator legibility by adding concise job introspection surfaces (`status --why`, `info`, `log --summary`, `retry --why`) and enforcing a configurable queue grace period with clear per-job override semantics.
**Depends on:** Phase 43
**Plans:** 6 plans

Plans:
- [x] 44-01-PLAN.md — Grace period config + schema foundation (`queueGraceSeconds`, `skipGracePeriod`)
- [x] 44-02-PLAN.md — Launch eligibility grace gate + `pilot add --start-immediately` queue-time UX
- [x] 44-03-PLAN.md — Shared introspection reason model + `pilot status --why` + `pilot retry --why`
- [x] 44-04-PLAN.md — Compact `pilot info <id>` triage view + `pilot log <id> --summary`
- [x] 44-05-PLAN.md — TUI queue/detail grace+reason visibility + regression verification
- [x] 44-06-PLAN.md — Refusal/help copy hardening for dirty-worktree launch and guarded undo flows

Wave structure:
- Wave 1: 44-01 (config/schema primitives)
- Wave 2: 44-02 (grace eligibility + add override wiring)
- Wave 3: 44-03 (shared why-model + status/retry integration)
- Wave 4: 44-04 + 44-05 + 44-06 in parallel (summaries + TUI polish + refusal copy hardening)

**Details:**
Read requirements/qol-introspection-and-queue-grace-period.md for full spec.

### Phase 45: Job Observability, Cost Tracking, and Export

**Status:** complete (6/6 plans, verified ✓)
**Goal:** Unify CLI and TUI observability around opencode-grounded model/token/cost data, failure-aware summaries, and a first-class `pilot export <job-id>` markdown artifact so every job is understandable and shareable without raw transcript dumps.
**Depends on:** Phase 44
**Plans:** 6 plans

Plans:
- [x] 45-01-PLAN.md — Add recursive session-tree model/token observability primitives in `opencode-db`
- [x] 45-02-PLAN.md — Build shared pricing + job observability core and harden runner actual-model persistence
- [x] 45-03-PLAN.md — Wire observability into `pilot info`, `pilot log --summary`, and `pilot status`
- [x] 45-04-PLAN.md — Bring TUI running/completed/detail views to observability parity with CLI
- [x] 45-05-PLAN.md — Implement `pilot export <job-id>` markdown artifact command with output controls
- [x] 45-06-PLAN.md — Update docs and run full Phase 45 regression verification

Wave structure:
- Wave 1: 45-01 (opencode recursive model/token primitives)
- Wave 2: 45-02 (shared observability + pricing core, runner persistence)
- Wave 3: 45-03 + 45-04 + 45-05 in parallel (CLI parity, TUI parity, export command)
- Wave 4: 45-06 (docs + full regression verification)

**Details:**
Read requirements/job-observability-cost-tracking-and-export.md for full spec.

### Phase 46: Dynamic Model Configuration

**Goal:** Move model assignments from hardcoded AGENT_MODELS constant to SQLite database as first-class data. Users can view, edit, reset, and create custom provider modes through `pilot models` CLI. The hardcoded table becomes seed data for first-run initialization. When a new model drops, `pilot models edit` lets you swap it in — no source code, no config files.
**Depends on:** Phase 45
**Plans:** 5 plans

Plans:
- [ ] 46-01-PLAN.md — DB schema (model_profiles + provider_modes tables), seed migration, model-store CRUD module
- [ ] 46-02-PLAN.md — Rewire resolveAgentModel/resolveAllAgentModels/resolveTopLevelModel to read from DB with hardcoded fallback
- [ ] 46-03-PLAN.md — pilot models show/edit/reset CLI commands with interactive editor
- [ ] 46-04-PLAN.md — Provider mode management (add-provider/remove-provider), dynamic --provider flag, diff/export/import
- [ ] 46-05-PLAN.md — Tests for all Phase 46 changes (model-store, resolve functions, CLI commands)

Wave structure:
- Wave 1: 46-01 (DB foundation + model-store module)
- Wave 2: 46-02 (resolution rewire, depends on 46-01)
- Wave 3: 46-03 + 46-04 in parallel (CLI commands + provider management, both depend on 46-01 + 46-02)
- Wave 4: 46-05 (tests, depends on all above)

**Details:**
Read requirements/dynamic-model-config.md for full spec.

### Phase 47: AGENTS.md Integration — CLI Commands & Doctor Check

**Goal:** Integrate AGENTS.md management into the Pilot CLI — setup prompts to generate it, doctor validates health via AI session, and a new `pilot lessons` command extracts build learnings. All three features spawn opencode sessions using established patterns, with GSD commands stubbed until available.
**Depends on:** Phase 46
**Plans:** 3 plans

Plans:
- [x] 47-01-PLAN.md — Core agents-md module + setup AGENTS.md prompt
- [x] 47-02-PLAN.md — Doctor AGENTS.md health check + pilot lessons command
- [x] 47-03-PLAN.md — Tests for all Phase 47 changes

Wave structure:
- Wave 1: 47-01 (core module + setup integration)
- Wave 2: 47-02 (doctor + lessons, depends on 47-01)
- Wave 3: 47-03 (tests, depends on 47-01 + 47-02)

**Details:**
Read requirements/agents-md-integration.md for full spec.

### Phase 48: Fix New Project Setup Critical Bugs

**Status:** complete (2/2 plans, verified ✓)
**Goal:** Fix the critical bugs that make `pilot setup` produce non-functional configurations on new machines — update the pilot-gsd submodule to the working fork with the correct flat command layout, add command layout validation in setupProject(), and add test coverage for all changes.
**Depends on:** Phase 47
**Plans:** 2 plans

Plans:
- [x] 48-01-PLAN.md — Update pilot-gsd submodule to fanselau/pilot-gsd fork + add gsd-delegate.md validation in setupProject()
- [x] 48-02-PLAN.md — Tests for command layout validation + path normalization regression tests

Wave structure:
- Wave 1: 48-01 (submodule update + validation logic)
- Wave 2: 48-02 (tests, depends on 48-01)

**Details:**
Read requirements/fix-new-project-setup.md for full spec.

### Phase 49: Surface Judge Verdict and Status Badges in TUI / Status Views

**Status:** complete (3/3 plans complete)
**Goal:** Surface explicit judge outcome and operational safety badges across TUI completed/detail views and `pilot status` so operators can instantly distinguish pass/fail/doubt/inconclusive, retryability, and undo safety without drilling into logs.
**Depends on:** Phase 48
**Plans:** 3 plans

Plans:
- [x] 49-01-PLAN.md — Shared judge verdict parser/formatter foundation with deterministic core tests
- [x] 49-02-PLAN.md — CLI status/info wiring for explicit judge badges and shared verdict semantics
- [x] 49-03-PLAN.md — TUI completed/detail badge visibility and dedicated status/verdict/retry/undo lines

Wave structure:
- Wave 1: 49-01 (shared verdict formatter foundation)
- Wave 2: 49-02 + 49-03 in parallel (CLI and TUI wiring, both depend on 49-01)

**Details:**
Read requirements/surface-judge-verdict-and-badges-in-tui.md for full spec.

### Phase 50: Setup Refresh Mode and Fast Skill Installation

**Goal:** Add `--refresh` flag to `pilot setup` that re-links symlinks, merges opencode.json with latest template, and re-offers skills/AGENTS.md. Parallelize skill installation to complete in under 10 seconds for typical projects.
**Depends on:** Phase 49
**Plans:** 2 plans

Plans:
- [x] 50-01-PLAN.md — Core: setupProject refresh logic (symlink refresh, opencode.json deep-merge) + parallel bootstrapDefaultSkills
- [ ] 50-02-PLAN.md — CLI wiring (--refresh, --force, --skip-skills flags) + comprehensive tests

Wave structure:
- Wave 1: 50-01 (core setup.ts + default-skills.ts changes)
- Wave 2: 50-02 (CLI wiring + tests, depends on 50-01)

**Details:**
Read requirements/setup-refresh-and-fast-skills.md for full spec.

### Phase 51: Pilot notifications via `openclaw agent --deliver`

**Goal:** Deliver completion/failure notifications to the correct OpenClaw agent chat (group or DM) by invoking `openclaw agent --deliver` with strict route resolution and no `/hooks/wake` fallback for configured deliver targets.
**Depends on:** Phase 50
**Requirements:** OAD-01, OAD-02, OAD-03, OAD-04, OAD-05, OAD-06, OAD-07, OAD-08, OAD-09
**Plans:** 3 plans

Plans:
- [x] 51-01-PLAN.md — Route foundation: typed OpenClaw notify route model, DB persistence, strict structured-first resolver with safe legacy derive rules
- [x] 51-02-PLAN.md — Runtime delivery rewrite: callback uses `openclaw agent --deliver` + structured prompt contract + group/DM/error tests
- [ ] 51-03-PLAN.md — CLI route management and queue-time route snapshot wiring in project/add commands + regression tests

Wave structure:
- Wave 1: 51-01 (route types, DB columns, resolver foundation)
- Wave 2: 51-02 + 51-03 in parallel (runtime callback transport + CLI/add wiring, both depend on 51-01)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-openclaw-agent-deliver-notifications.md` for full spec.

### Phase 52: Shell-Agnostic CLI and TUI Shortcuts

**Goal:** Make Pilot reliably invocable from any shell (agent Bash, Fish, systemd) by fixing binary resolution fallback, hardening service unit generation with stable paths, and wire broken TUI shortcuts (retry, cancel) with accurate help overlay.
**Depends on:** Phase 51
**Plans:** 3 plans

Plans:
- [x] 52-01-PLAN.md — Binary resolution fallback chain + service unit hardening + doctor service check
- [x] 52-02-PLAN.md — Wire TUI retry/cancel shortcuts + update help overlay and footer bar accuracy
- [x] 52-03-PLAN.md — Tests for binary resolution, service generation, doctor checks, and TUI shortcuts

Wave structure:
- Wave 1: 52-01 + 52-02 (independent, no file overlap)
- Wave 2: 52-03 (tests, depends on 52-01 + 52-02)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-shell-agnostic-cli-and-tui-shortcuts.md` for full spec.

### Phase 53: Stable service wrapper + real r/x handler wiring

**Status:** complete (1/1 plans, verified ✓)
**Goal:** Replace argv-derived service ExecStart with stable canonical pilot binary resolution that survives rebuilds and relinks.
**Depends on:** Phase 52
**Plans:** 1 plan

Plans:
- [x] 53-01-PLAN.md — Stable canonical binary resolution for service unit + regression tests

**Details:**
resolvePilotBinary() uses import.meta.url → which pilot → throw chain, never process.argv[1].

### Phase 54: Pilot project-agent notifications should trigger useful replies

**Status:** Complete ✓ (2026-03-11)
**Goal:** Rewrite the notification prompt in `buildDeliveryPrompt()` so project agents reliably produce useful replies instead of choosing NO_REPLY. The transport/routing is working — this is purely prompt design to make agents respond with concise, natural-language updates when jobs complete or fail.
**Depends on:** Phase 53
**Plans:** 1 plan

Plans:
- [x] 54-01-PLAN.md — Rewrite notification prompt for explicit reply behavior + comprehensive prompt regression tests

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-project-agent-notify-prompts-should-trigger-useful-replies.md` for full spec.

### Phase 55: Shell/Runtime Toolchain Exposure (bash/fnm/pnpm) ✓

**Goal:** Make pilot, node, and pnpm resolve from plain non-interactive Bash/sh shells via stable canonical paths in ~/.local/bin. Add doctor health checks for shell exposure and wire launcher maintenance into pilot setup.
**Depends on:** Phase 54
**Status:** complete (2/2 plans, verified ✓)
**Completed:** 2026-03-11
**Plans:** 2 plans

Plans:
- [x] 55-01-PLAN.md — Shell-exposure module: create/verify stable launchers in ~/.local/bin for pilot, node, pnpm
- [x] 55-02-PLAN.md — Wire into pilot doctor (health checks) + pilot setup (launcher creation/refresh)

Wave structure:
- Wave 1: 55-01 (core shell-exposure module + tests)
- Wave 2: 55-02 (doctor + setup integration, depends on 55-01)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-shell-runtime-toolchain-exposure-bash-fnm-pnpm.md` for full spec.

### Phase 56: Pilot existing-install shell exposure must be applyable on real machines

**Status:** complete (1/1 plans, verified ✓)
**Goal:** Add `pilot doctor --fix` to repair shell exposure on existing installations — creating/refreshing stable launchers in ~/.local/bin without requiring a project directory. Update doctor messaging to point to the new repair command.
**Depends on:** Phase 55
**Completed:** 2026-03-11
**Plans:** 1 plan

Plans:
- [x] 56-01-PLAN.md — Add --fix flag to doctor command for shell exposure repair + tests

Wave structure:
- Wave 1: 56-01 (single plan — implementation + tests)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-existing-install-shell-exposure-apply-path.md` for full spec.

### Phase 57: Pilot notify setup must be optional and operator-friendly — ✅ Complete

**Goal:** Make notify easy to understand, optional by default, and clearly documented in setup/help/CLI output. `pilot add` no longer hard-errors when notify is unconfigured. Doctor shows informational notify status. All docs consistently frame notify as optional.
**Depends on:** Phase 56
**Plans:** 2/2 plans complete
**Completed:** 2026-03-11

Plans:
- [x] 57-01-PLAN.md — Make add.ts tolerate missing notify, add doctor notify check, update setup messaging
- [x] 57-02-PLAN.md — Update GETTING-STARTED.md, README.md, SKILL.md, and CLI help text for optional-notify consistency

### Phase 58: Pilot Failure Notifications Should Guide Agents to Unblock and Read Logs — ✅ Complete

**Goal:** Make failure notifications teach the receiving agent the right next actions: state the project is blocked, tell the agent to use `pilot log <id>` to inspect the transcript, and guide toward `pilot retry <id>` recovery. Focused prompt quality improvement — no transport or structural changes.
**Depends on:** Phase 57
**Plans:** 1/1 plans complete
**Completed:** 2026-03-12

Plans:
- [x] 58-01-PLAN.md — Update failure notification prompt with blocked-awareness, log guidance, recovery steps + tests

Wave structure:
- Wave 1: 58-01 (single plan — prompt update + tests)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-failure-notifications-should-guide-agents-to-unblock-and-read-logs.md` for full spec.

### Phase 59: Pilot TUI Shortcuts and Project-Management Actions Must Work in Real Usage — ✅ Complete

**Goal:** Make TUI keyboard interaction reliable and useful in real usage — fix shortcut reliability by making action feedback context-aware, add project-management actions (remove project with confirmation), and ensure footer/help text accurately reflects available actions per panel.
**Depends on:** Phase 58
**Status:** complete (2/2 plans, verified ✓)
**Completed:** 2026-03-12
**Plans:** 2/2 plans complete

Plans:
- [x] 59-01-PLAN.md — Fix shortcut reliability + add deregisterProject DB function + wire remove-project TUI action with confirmation
- [x] 59-02-PLAN.md — Context-aware footer bar + updated help overlay + comprehensive keyboard handler tests

Wave structure:
- Wave 1: 59-01 (core shortcut fixes + project management action)
- Wave 2: 59-02 (help/footer accuracy + tests, depends on 59-01)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-tui-shortcuts-and-project-management-actions-must-work-in-real-usage.md` for full spec.

### Phase 60: Remove dirty-guard blocking entirely; only real failures should block projects

**Goal:** Remove dirty-guard blocking behavior completely — dirty worktrees no longer block job launch or create blocked-project status. Delete the provenance-aware dirty classification system, `--force-dirty` flag, and `ProjectDirtyBaseline` infrastructure. Keep `startedDirty` as informational metadata only. Only real failures (build/execution/verification) block projects.
**Depends on:** Phase 59
**Plans:** 2 plans

Plans:
- [x] 60-01-PLAN.md — Remove dirty-guard launch blocking from runner + delete provenance system + cleanup types/DB/CLI flag
- [x] 60-02-PLAN.md — Clean up UX surfaces (undo/info/status) + update/remove all dirty-guard tests

Wave structure:
- Wave 1: 60-01 (core removal: runner, git-recovery, types, db, add, index)
- Wave 2: 60-02 (UX cleanup + test updates, depends on 60-01)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-remove-dirty-guard-blocking-and-delete-stale-logic.md` for full spec.

### Phase 61: Pilot Web UI Phase 1 — builder-ready feasibility scaffold, compact query backbone, and root-based job detail model

**Goal:** Build a separate minimal web UI subproject using TanStack Start + Coss UI, while first creating a compact, queryable detail model in src/core/ that serves root-based non-recursive job detail snapshots, supports pagination and on-demand expansion, and streams incremental updates via lightweight SSE-style polling.
**Depends on:** Phase 60
**Plans:** 3 plans

Plans:
- [ ] 61-01-PLAN.md — Compact query backbone: reusable detail/query layer with 5 functions + DTO types in src/core/
- [ ] 61-02-PLAN.md — Web scaffold: TanStack Start subproject + Coss UI + server functions + SSE streaming
- [ ] 61-03-PLAN.md — Working UI screens: jobs list, job detail, sub-agent drill-in, load-more, live updates

Wave structure:
- Wave 1: 61-01 (compact query backbone in src/core/)
- Wave 2: 61-02 (web scaffold + server functions, depends on 61-01)
- Wave 3: 61-03 (UI screens + human verification, depends on 61-01 + 61-02)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-web-ui-phase-1-feasibility-tanstack-start-coss-and-queryable-job-detail-model.md` for full spec.

### Phase 62: Pilot Web UI Phase 2 — agent frontend, merged chronological detail flow, inline sub-agent cards, and proactive action parity

**Status:** complete (5/5 plans, verified ✓)
**Goal:** Build the merged timeline query composition layer, action mutation server functions, and rich web UI components for job detail with inline sub-agent cards and proactive action parity.
**Depends on:** Phase 61
**Completed:** 2026-03-13
**Plans:** 5 plans

Plans:
- [x] 62-01-PLAN.md — Merged timeline query composition + mutation wrappers + server functions
- [x] 62-02-PLAN.md — Centralized action model + command palette shell
- [x] 62-03-PLAN.md — Merged timeline stream, inline fork cards, proactive action buttons, breadcrumb navigation
- [x] 62-04-PLAN.md — Table-first overview, session visibility, global command palette + toast
- [x] 62-05-PLAN.md — Timeline query + action model unit tests (41 new tests, 1009 total)

Wave structure:
- Wave 1: 62-01 (timeline query + mutations)
- Wave 2: 62-02 (action model + command palette)
- Wave 3: 62-03 + 62-04 (UI components: timeline stream, table overview)
- Wave 4: 62-05 (tests, depends on 62-01 through 62-04)

### Phase 63: Pilot Phase 63 — step-first detail flow, lifecycle branch blocks, and nested child detail for web + TUI

**Status:** complete (5/5 plans, verified ✓)
**Goal:** Refactor web and TUI detail UX into a shared step-first execution story: explicit step containers, one lifecycle-aware branch object per child session, and true nested child drill-in that feels like entering child context (not appended overflow).
**Depends on:** Phase 62
**Plans:** 5 plans

Plans:
- [x] 63-01-PLAN.md — Core step-grouped timeline contract + lifecycle branch composition + regression tests
- [x] 63-02-PLAN.md — Web step-first timeline rendering + lifecycle branch block UI
- [x] 63-03-PLAN.md — Web nested route/layout restructure for primary child detail flow
- [x] 63-04-PLAN.md — TUI step-first detail model alignment with shared core timeline contract
- [x] 63-05-PLAN.md — TUI explicit child drill-in navigation, hint parity, and shortcut regression tests

Wave structure:
- Wave 1: 63-01 (core shared contract + tests)
- Wave 2: 63-02 + 63-03 + 63-04 (web UI rendering, web routing, and TUI model alignment in parallel)
- Wave 3: 63-05 (TUI drill-in navigation polish + keyboard/hint tests)

**Details:**
Read `/home/luca/.openclaw/workspace/requirements/pilot-phase-63-step-first-branch-blocks-and-nested-child-detail-for-web-and-tui.md` for full spec.

### Phase 64: GSD Installation Switch — Replace pilot-gsd with Vanilla GSD

**Goal:** Replace pilot-gsd symlink-based GSD installation with upstream `get-shit-done-cc` npm package installer. Remove all gsdDir/pilot-gsd infrastructure from types, config, and CLI. All GSD files installed per-project via upstream installer.
**Depends on:** Phase 63
**Plans:** 3 plans
**Status:** Complete (2026-03-15)

Plans:
- [x] 64-01-PLAN.md — Foundation cleanup: remove gsdDir from types/config/CLI + add get-shit-done-cc dependency
- [x] 64-02-PLAN.md — Rewrite setup.ts (upstream installer + migration), update.ts (npm update + per-project), doctor.ts (upstream checks)
- [x] 64-03-PLAN.md — Update all tests for new installer-based GSD workflow

Wave structure:
- Wave 1: 64-01 (foundation cleanup — types, config, package.json)
- Wave 2: 64-02 (implementation — setup, update, doctor rewrites, depends on 64-01)
- Wave 3: 64-03 (tests — full suite update, depends on 64-01 + 64-02)

**Details:**
Read requirements/gsd-01-installation-switch.md for full spec.

### Phase 65: GSD Config Pre-seeding for Autonomous Execution

**Goal:** Ensure every Pilot-managed project gets and keeps an autonomous-safe `.planning/config.json` (`mode: yolo`, `workflow.auto_advance: true`, and required workflow defaults) so headless phase execution never blocks on interactive prompts while preserving user custom keys via deep merge + explicit PILOT_WINS overrides.
**Depends on:** Phase 64
**Requirements:** GSD02-01, GSD02-02, GSD02-03, GSD02-04, GSD02-05, GSD02-06, GSD02-07
**Plans:** 3 plans

Plans:
- [ ] 65-01-PLAN.md — Core `gsd-config` helper with defaults, deep merge policy, PILOT_WINS enforcement, and locked atomic writes
- [ ] 65-02-PLAN.md — Setup integration: seed/merge `.planning/config.json` after installer flow with setup regression coverage
- [ ] 65-03-PLAN.md — Runner enforcement: pre-spawn config assertion + post-`new-project` re-apply with runner regression coverage

Wave structure:
- Wave 1: 65-01 (core config lifecycle helper + unit tests)
- Wave 2: 65-02 + 65-03 in parallel (setup integration and runner enforcement, both depend on 65-01)

**Details:**
Read `requirements/gsd-02-config-preseeding.md` and `.planning/phases/65-gsd-config-pre-seeding-for-autonomous-execution/65-RESEARCH.md` for full spec.

### Phase 66: Delegation Pipeline Redesign — Intent-Based Architecture

**Goal:** Replace step-based delegation with intent-based delegation — the delegation AI outputs a single typed intent object, the runner owns all workflow logic per intent type, and the delegation prompt moves from pilot-gsd to Pilot-internal `src/prompts/delegate.md`.
**Depends on:** Phase 65
**Plans:** 3 plans

Plans:
- [x] 66-01-PLAN.md — Types + delegation rewrite (DelegationIntent/DelegationResult types, delegate.ts rewrite, src/prompts/delegate.md prompt)
- [x] 66-02-PLAN.md — Runner intent routing (step loop → executeIntent dispatch, gap retry, milestone loop, info/db type updates)
- [x] 66-03-PLAN.md — Tests for all Phase 66 changes (parseIntentOutput coverage, removed function cleanup, full suite pass)

Wave structure:
- Wave 1: 66-01 (types + delegation module + prompt)
- Wave 2: 66-02 (runner + db + info rewrites, depends on 66-01)
- Wave 3: 66-03 (tests, depends on 66-01 + 66-02)

**Details:**
Read requirements/gsd-03-delegation-redesign.md for full spec.

### Phase 67: Session Blocker Handling — DB-Based Hung Detection

**Goal:** Use the opencode DB (session/message/part tables) to deterministically detect hung sessions. Replace wall-clock timeout heuristics with DB state queries: immediately kill sessions stuck on `question` tool calls (interactive prompts), tolerate long-running legitimate tool calls, and integrate hung detection with the retry system.
**Depends on:** Phase 66
**Requirements:** DBSD-01, DBSD-02, DBSD-03, DBSD-04, DBSD-05, DBSD-06, DBSD-07, POLL-01, POLL-02, POLL-03, POLL-04, POLL-05, POLL-06, HERR-01, HERR-02, HERR-03, HERR-04, HERR-05, KILL-01, KILL-02, KILL-03, RTRY-01, RTRY-02, RTRY-03, RTRY-04, RTRY-05, RTRY-06, RTRY-07, RTRY-08, NTFY-01, NTFY-02
**Plans:** 4 plans

Plans:
- [x] 67-01-PLAN.md — Core DB detection: `getSessionState()` in opencode-db.ts with hung-on-prompt/hung-on-tool/crashed/working/done states (TDD)
- [x] 67-02-PLAN.md — Error types + kill behavior: `HungSessionError` class, SIGTERM→SIGKILL kill sequence, PID cleanup, fix orphan bug in timeout path
- [ ] 67-03-PLAN.md — Poll loop integration: replace `isSessionDone()` with `getSessionState()` in `spawnAndWait()`, state-based routing
- [ ] 67-04-PLAN.md — Retry integration: add retry_budget/retry_count/hung_count to Job type + DB schema, hung retry logic in runner workflow, same-error escalation, notification on budget exhaustion

**Success Criteria:**
- `getSessionState()` correctly returns all 5 states for their respective DB conditions
- Sessions hung on `question` tool call are killed within one poll cycle (no waiting)
- Sessions with long-running bash/build tool calls are NOT killed
- `HungSessionError` thrown with correct reason, tool name, and session title
- Kill sequence: SIGTERM → 5s → SIGKILL, PID cleaned from sessionPids map
- Existing timeout path also kills the process (fixes orphan bug)
- `retry_budget` and `retry_count` persisted on Job, shared between hung and judge-fail retries
- Two consecutive same-type hangs escalate immediately (don't burn budget)
- Notifications only fire on budget exhaustion, not per-retry
- All existing tests pass with no regressions

Wave structure:
- Wave 1: 67-01 (core DB detection function — pure query, no side effects)
- Wave 2: 67-02 (error types + kill behavior, depends on 67-01 for state detection)
- Wave 3: 67-03 (poll loop integration, depends on 67-01 + 67-02)
- Wave 4: 67-04 (retry integration, depends on 67-01 + 67-02 + 67-03)

**Details:**
Read requirements/gsd-04b-session-blocker-handling.md for full spec.

### Phase 68: Judge System — Move Into Pilot

**Goal:** Move judge prompts from pilot-gsd fork into Pilot's codebase (`src/prompts/judge.md`), merge two divergent judge formats into one canonical format with `pass`/`fail`/`partial` verdicts, add `retryRecommendation`/`retryHint`/`failureFingerprint` fields to the verdict, and update the runner to use inline prompt sessions instead of `--command gsd-judge`.
**Depends on:** Phase 67
**Requirements:** PRMT-01, PRMT-02, PRMT-03, PRMT-04, PRMT-05, PRMT-06, PRMT-07, RNIN-01, RNIN-02, RNIN-03, RNIN-04, RNIN-05, RNIN-06, RNIN-07, TYPE-01, TYPE-02, TYPE-03, TYPE-04, TYPE-05, TYPE-06, SGUI-01, SGUI-02, SGUI-03, SGUI-04, MODL-01, MODL-02, MODL-03, CLEN-01, CLEN-02, CLEN-03, CLEN-04
**Plans:** 4 plans

Plans:
- [x] 68-01-PLAN.md — Judge prompt: merge gsd-judge.md + pilot-judge.md into `src/prompts/judge.md` with canonical verdict schema
- [x] 68-02-PLAN.md — Type updates: extend JudgeVerdict, ParsedJudgeVerdictPayload, JudgeSignal with retryRecommendation/retryHint/failureFingerprint; update VERDICT_TO_OUTCOME for pass/fail/partial
- [x] 68-03-PLAN.md — Runner integration: rewrite runJudge() to use inline prompt, load VERIFICATION.md + VALIDATION.md as evidence, remove --command gsd-judge path
- [x] 68-04-PLAN.md — Tests + cleanup: update all judge-related tests for new verdict format, remove gsd-judge/pilot-judge from pilot-gsd, verify backward compat

**Success Criteria:**
- Single canonical judge prompt exists at `src/prompts/judge.md`
- Judge produces verdicts with `pass`/`fail`/`partial` values (not `succeeded`/`failed`/`doubting`)
- Verdict JSON includes `retryRecommendation` (`'retry-resume'`/`'retry-full'`/`'none'`), `retryHint`, and `failureFingerprint` fields
- `runJudge()` loads prompt from `src/prompts/judge.md` and passes as inline prompt (same pattern as delegation)
- Judge reads VERIFICATION.md from disk as primary evidence; falls back to transcript when absent
- VERIFICATION.md validated: must be >100 bytes and contain expected headers
- When no VERIFICATION.md, judge defaults to `partial` with confidence ≤ 40
- VALIDATION.md (Nyquist) read when present for richer verdicts
- `VERDICT_TO_OUTCOME` handles `pass`/`fail`/`partial` values correctly
- `JudgeSignal` exposes `retryRecommendation`, `retryHint`, `failureFingerprint`
- Judge badge shows `judge:partial 35%` format for partial verdicts
- Legacy verdict values (`succeeded`/`failed`/`doubting`) still parse correctly for backward compat
- Judge model uses `_top:judge` scope — GPT-5.4 in hybrid/openai-only modes
- No more `--command gsd-judge` calls from runner
- `gsd-judge` and `pilot-judge` commands removed or deprecated in pilot-gsd
- All existing tests pass with no regressions

Wave structure:
- Wave 1: 68-01 (judge prompt — standalone, no code changes)
- Wave 2: 68-02 (type updates, depends on 68-01 for verdict schema clarity)
- Wave 3: 68-03 (runner rewrite, depends on 68-01 + 68-02)
- Wave 4: 68-04 (tests + cleanup, depends on all above)

**Details:**
Read requirements/gsd-05-judge-move.md for full spec.

### Phase 69: Model System — Agent Frontmatter Patching

**Status:** complete (3/3 plans, verified ✓)
**Goal:** Harden model routing by making agent frontmatter patching parser-safe and file-driven: scan installed `.opencode/agents/gsd-*.md` files, patch only `model`/`variant` via YAML document mutation, and prevent stale model leakage with explicit `inherit` fallback for unmapped agents.
**Depends on:** Phase 68
**Plans:** 3 plans

Plans:
- [x] 69-01-PLAN.md — Parser-safe frontmatter patch foundation (YAML dependency, file scanning, inherit fallback)
- [x] 69-02-PLAN.md — Runner integration hardening (single patch point per job + patch diagnostics)
- [x] 69-03-PLAN.md — Regression coverage for patching edge cases and runner invocation count

Wave structure:
- Wave 1: 69-01 (models patching foundation)
- Wave 2: 69-02 (runner integration, depends on 69-01)
- Wave 3: 69-03 (tests, depends on 69-01 + 69-02)

**Details:**
Read `requirements/gsd-06-model-frontmatter.md` and `.planning/phases/69-model-system-agent-frontmatter-patching/69-RESEARCH.md`.

### Phase 70: Phase Auto-Retry on Verification Failure

**Goal:** Automatically retry phase jobs when verification/judge outcomes are retryable (`fail`/`partial`/null), using persisted retry budgets and fingerprint-based same-failure escalation, while surfacing retry lineage in CLI (`pilot info`, `pilot log --chain`).
**Depends on:** Phase 69
**Status:** complete (4/4 plans, verified ✓)
**Plans:** 4 plans

Plans:
- [x] 70-01-PLAN.md — Retry persistence foundation (DB schema/helpers + attempt archive + DB tests)
- [x] 70-02-PLAN.md — Runner verification auto-retry orchestration (strategy routing, fingerprint escalation, terminal policy)
- [x] 70-03-PLAN.md — Queue-time retry controls (`defaults.retry_budget`, `pilot add --retries/--no-retry`, CLI wiring)
- [x] 70-04-PLAN.md — Operator visibility (`pilot info` attempt lineage + `pilot log --chain` across attempts)

Wave structure:
- Wave 1: 70-01 (persistence foundation)
- Wave 2: 70-02 + 70-03 in parallel (runner policy + CLI/config controls, both depend on 70-01)
- Wave 3: 70-04 (operator visibility, depends on 70-01 + 70-02 + 70-03)

**Details:**
Read `requirements/gsd-07-auto-retry.md` and `.planning/phases/70-phase-auto-retry-on-verification-failure/70-RESEARCH.md`.

### Phase 71: Full Milestone Lifecycle — Audit, Gap Closure, Completion

**Goal:** Close milestone jobs end-to-end in runner: run milestone audit, auto-plan and execute gap-closure rounds (max 2), then complete milestone when audit passes, with explicit escalation and notifications when automation cannot safely continue.
**Depends on:** Phase 70
**Plans:** 3 plans

Plans:
- [ ] 71-01-PLAN.md — Milestone lifecycle foundation (gap-round persistence + audit parser helpers)
- [ ] 71-02-PLAN.md — Runner audit/gap/complete orchestration with stale-audit retry and max-round enforcement
- [ ] 71-03-PLAN.md — Milestone notifications, interactive blocker manual-gate handling, and delegate prompt contract alignment

Wave structure:
- Wave 1: 71-01 (schema + parser foundation)
- Wave 2: 71-02 (runner lifecycle orchestration, depends on 71-01)
- Wave 3: 71-03 (notifications + manual gates + prompt alignment, depends on 71-01 + 71-02)

**Details:**
Read `requirements/gsd-08-milestone-lifecycle.md` and `.planning/phases/71-full-milestone-lifecycle-audit-gap-closure-completion/71-RESEARCH.md`.

### Phase 72: Cleanup — Remove pilot-gsd Fork

**Goal:** Complete the clean break from the `pilot-gsd` fork by removing remaining runtime/submodule coupling, migrating AGENTS/lessons flows to Pilot-owned prompts, and updating docs/skills to the upstream `get-shit-done-cc` architecture.
**Depends on:** Phase 71
**Status:** complete (6/6 plans complete)
**Plans:** 6/6 plans complete

Plans:
- [x] 72-01-PLAN.md — Core AGENTS/lessons prompt foundation + `agents-md` inline-prompt refactor
- [x] 72-02-PLAN.md — Setup/doctor/lessons command rewiring to operation-based AGENTS flows
- [x] 72-03-PLAN.md — Submodule removal + fork-agnostic setup migration cleanup + setup test updates
- [x] 72-05-PLAN.md — Migration-order gate audit (project refresh/doctor checks, config/manifests, external deprecation evidence)
- [x] 72-06-PLAN.md — Delegation legacy payload safeguard + canonical intent fixtures + contract audit
- [x] 72-04-PLAN.md — README/getting-started/skill docs cleanup + active-surface fork-coupling audit

Wave structure:
- Wave 1: 72-01 + 72-05 (core prompt decoupling + migration-order gate audit in parallel)
- Wave 2: 72-02 + 72-03 + 72-06 (command rewiring depends on 72-01; submodule/setup cleanup and delegation contract hardening depend on 72-05)
- Wave 3: 72-04 (final docs/skill/audit pass depends on 72-02 + 72-03 + 72-05 + 72-06)

**Details:**
Read `requirements/gsd-09-cleanup.md` and `.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-RESEARCH.md`.

### Phase 73: Phase 1: Judge & Step Continuation — Replace Retry with Append-Forward Model

**Goal:** Replace the retry system with an append-forward step model. Jobs get a mutable, append-only step list. The runner executes steps sequentially. When judge finds gaps or sessions hang, new steps are appended via delegation re-query — never retry, never go backwards.
**Requirements**: TBD
**Depends on:** Phase 72
**Plans:** 7/7 plans complete

Plans:
- [x] 73-01-PLAN.md — Foundation: StepSource type, extended JobStep, DB schema migration, step CRUD functions
- [x] 73-02-PLAN.md — Judge verdict update: passed/gaps_found/failed schema, remove retry fields from prompt and signal
- [x] 73-03-PLAN.md — Delegation re-query: reDelegateForContinuation function, delegate prompt re-query section
- [x] 73-04-PLAN.md — Runner rewrite: step execution loop, delete retry methods, gap/hung continuation handlers
- [x] 73-05-PLAN.md — Detail/notification updates: step source in job detail, step history in notifications
- [x] 73-06-PLAN.md — Tests: step CRUD, judge verdict, runner step loop, full regression suite
- [ ] 73-07-PLAN.md — Gap closure: fix 11 failing tests (runner-recovery rewrite, verdict badge expectations)

Wave structure:
- Wave 1: 73-01 + 73-02 (independent: types/DB foundation and judge verdict update)
- Wave 2: 73-03 (delegation re-query, depends on 73-01)
- Wave 3: 73-04 + 73-05 (runner rewrite and detail/notification updates, both depend on 73-01 + 73-02, 73-04 also on 73-03)
- Wave 4: 73-06 (tests, depends on all above)
- Wave 5: 73-07 (gap closure: test migration for verdict mapping + retry removal)

### Phase 74: Required Categories on pilot add

**Goal:** Make `--categories` required on `pilot add` with helpful AI-caller-friendly error, add project-level default categories, rewrite skills to manifest-only architecture (`{ repo, skill }` format, no git-clone/inject/sync), and switch runner to JIT `npx skills add` installation.
**Requirements**: TBD
**Depends on:** Phase 73
**Plans:** 4/4 plans complete

Plans:
- [ ] 74-01-PLAN.md — Foundation: types/DB (Project.defaultCategories, SkillEntry rewrite), CATEGORY_INFO, PREDEFINED_CATEGORIES expansion, skills.ts manifest-only rewrite, default-skills.ts SkillRef format
- [ ] 74-02-PLAN.md — CLI enforcement: required --categories on add, formatCategoryHelp error, project default fallback, --no-categories opt-out, setup --categories, skills CLI rewrite (register/categories/remove)
- [ ] 74-03-PLAN.md — Runner JIT: replace injectSkills/cleanupInjectedSkills with npx skills add --agent opencode, delegate.ts SkillEntry compat
- [ ] 74-04-PLAN.md — Tests: skills core, default-skills, add enforcement, skills CLI, runner JIT, full regression

Wave structure:
- Wave 1: 74-01 (types + DB + skills core + default-skills foundation)
- Wave 2: 74-02 + 74-03 in parallel (CLI enforcement + skills CLI rewrite | runner JIT, both depend on 74-01)
- Wave 3: 74-04 (tests, depends on all above)

### Phase 75: Codex First-Class Citizen — Model-Adaptive Content Patching

**Goal:** Make Codex (gpt-5.4) produce results on par with Claude by patching GSD prompt content before spawn. Create unified pre-spawn preparation (`prepareProjectForSpawn` / `restoreProjectAfterSpawn`) consolidating frontmatter patching, JIT skill installation, and content adaptation (identity/tool/path neutralization) into a single try/finally lifecycle. Add `pilot adapt --dry-run/--scan` verification tools.
**Requirements**: TBD
**Depends on:** Phase 74
**Plans:** 3 plans

Plans:
- [ ] 75-01-PLAN.md — Content adaptation engine: prompt-adapter.ts with model family detection, text transformation pipeline, mode-aware file selection
- [ ] 75-02-PLAN.md — Unified spawn prep: spawn-prep.ts + runner/delegate integration + inline prompt adaptation for Codex
- [ ] 75-03-PLAN.md — CLI adapt commands (dry-run, scan) + comprehensive tests for all new modules + runner test updates

Wave structure:
- Wave 1: 75-01 (content adaptation engine — pure additive, no existing files modified)
- Wave 2: 75-02 (spawn-prep + runner/delegate integration, depends on 75-01)
- Wave 3: 75-03 (CLI + tests, depends on 75-01 + 75-02)

### Phase 76: Pilot Web UI Overhaul — Full-Width Dashboard + Dense Step Visualization

**Goal:** Transform the web UI from a prototype center-column layout into a dense operational dashboard with split-pane job detail, full-width layout, no pagination friction, model visibility badges, projects view, and fixed timezone-safe duration calculations.
**Requirements**: WUI-01, WUI-02, WUI-03, WUI-04, WUI-05, WUI-06, WUI-07, WUI-08, WUI-09
**Depends on:** Phase 75
**Plans:** 6 plans (4 executed, 1 pending, 1 gap closure)

Plans:
- [x] 76-01-PLAN.md — Foundation: safe timestamp parser (TDD), full-width layout, frontend duration fix, comment cleanup
- [x] 76-02-PLAN.md — Dashboard projects tab: backend query, server fn, ProjectsList component
- [x] 76-03-PLAN.md — Timeline data overhaul: remove pagination, full message loading, "Show full" button
- [x] 76-04-PLAN.md — Split-pane job detail: resizable panels, step timeline sidebar, step content pane, model badges, keyboard nav
- [ ] 76-05-PLAN.md — Virtualization for large jobs + scroll-to-bottom + visual verification checkpoint
- [ ] 76-06-PLAN.md — Gap closure: fix job route contract test for split-pane architecture

Wave structure:
- Wave 1: 76-01 + 76-02 (independent: foundation fixes and projects tab)
- Wave 2: 76-03 (timeline data overhaul, depends on 76-01 for timezone fix)
- Wave 3: 76-04 + 76-05 (split-pane UI + virtualization, both depend on 76-03 for non-paginated data)
- Wave 4: 76-06 (gap closure: test fix after 76-04 refactor)



### Phase 77: Web UI Fixes — Post-Overhaul Regressions + Missing Features

**Goal:** Fix post-overhaul regressions and add missing features: mobile responsiveness, delegation step in timeline, continuous-scroll main panel with sidebar navigation, session drill-in layout, grace wait countdown, project management page, and TUI feature parity.
**Requirements**: WUI77-01, WUI77-02, WUI77-03, WUI77-04, WUI77-05, WUI77-06, WUI77-07
**Depends on:** Phase 76
**Plans:** 4/4 plans complete

Plans:
- [ ] 77-01-PLAN.md — Continuous-scroll main panel + sidebar scroll-to + delegation step in timeline (backend + frontend)
- [ ] 77-02-PLAN.md — Mobile responsiveness + session drill-in layout fix
- [ ] 77-03-PLAN.md — Grace wait countdown badge + project management detail page
- [ ] 77-04-PLAN.md — TUI feature parity (delegation step, block/unblock)

Wave structure:
- Wave 1: 77-01 + 77-03 (independent: core UX overhaul and grace/projects, no file overlap)
- Wave 2: 77-02 + 77-04 (mobile/subpages depend on 77-01; TUI depends on 77-01 backend changes)

**Details:**
Read requirements/web-ui-fixes-v2.md for full spec.

### Phase 78: Web UI Premium — Data-Rich, Dense, Modern Dashboard

**Goal:** Transform the web UI into a premium build pipeline control room with inline token/cost observability, judge verdict visualization, step enrichment (duration/source/model/tool summaries), session state badges, git checkpoint display, queue enrichment (position/categories/deps), micro-interactions, syntax-highlighted logs, and mobile-first tabs/bottom-sheets.
**Requirements**: TBD
**Depends on:** Phase 77
**Plans:** 7/7 plans complete

Plans:
- [x] 78-01-PLAN.md — Foundation: install deps (motion, shiki), add server fns (observability, verdict, session state), create shared UI primitives (sparkline, copy-button, status-badge, format helpers)
- [x] 78-02-PLAN.md — Job detail left pane: ObservabilityCard (tokens/cost/models), VerdictCard (confidence/gaps/history), GitCheckpointCard (SHAs/dirty), step sidebar enrichment (duration bars, source/model badges)
- [x] 78-03-PLAN.md — Tool call summaries (aggregated chips per step), SessionStateBadge (5 states with hung preview), step content header enrichment (source/reason/error)
- [x] 78-04-PLAN.md — Queue and job list enrichment: inline verdict/cost badges, queue position numbers, category chips, depends-on badges, step counts, consistent polling
- [x] 78-05-PLAN.md — Log/activity improvements: shiki syntax highlighting (JSON/shell/TS), "Show full" for truncated messages, "Jump to first error" button, polling normalization
- [x] 78-06-PLAN.md — Micro-interactions (highlight-fade, status transitions, hover states, selected step accent) + mobile experience (swipeable tabs, bottom sheets, live banner)
- [ ] 78-07-PLAN.md — Gap closure: Wire orphaned SessionStateBadge into session displays + audit message count parity

Wave structure:
- Wave 1: 78-01 (foundation — server fns, shared components, deps)
- Wave 2: 78-02 + 78-03 + 78-04 (job detail cards, tool/session enrichment, job list enrichment — all depend on 78-01, independent of each other)
- Wave 3: 78-05 + 78-06 (log improvements + micro-interactions/mobile — depend on 78-02/03/04)
- Wave 4: 78-07 (gap closure — wiring + parity audit)

**Details:**
Read requirements/web-ui-premium.md for full spec.

### Phase 79: Web UI Job Activity Regression — Restore visible activity under jobs

**Goal:** Restore visible, trustworthy job activity in the web UI — diagnose and fix the regression that hides timeline activity on the job detail page, and add compact activity previews to the dashboard job list so users can immediately see that jobs have real underlying session activity.
**Requirements**: TBD
**Depends on:** Phase 78
**Plans:** 1/1 plans complete

Plans:
- [ ] 79-01-PLAN.md — Diagnose + fix job detail timeline regression, add dashboard activity previews

### Phase 80: Web UI Attribution + Mobile Overflow Hardening

**Goal:** Make timeline attribution trustworthy, bring child/sub-session views up to the same quality bar as the main interface, and eliminate viewport-breaking horizontal overflow on mobile.
**Requirements**: ATTR-01, ATTR-02, ATTR-03, ATTR-04, ATTR-05, MOB-01, MOB-02, MOB-03, MOB-04, MOB-05, SUB-01
**Depends on:** Phase 79
**Plans:** 3/3 plans complete

Plans:
- [x] 80-01-PLAN.md — Fix timeline attribution: improve resolveStepIndex() with child-session transitivity and last-step fallback
- [x] 80-02-PLAN.md — Mobile overflow hardening + child/sub-session drill-in polish
- [x] 80-03-PLAN.md — Gap closure: Add Phase 80 requirement definitions to REQUIREMENTS.md (completed 2026-03-21)

Wave structure:
- Wave 1: 80-01 + 80-02 (independent: core data-layer attribution fix and web UI overflow/polish, no file overlap)
- Wave 2: 80-03 (gap closure: requirements traceability, depends on 80-01 + 80-02 completion)

### Phase 81: Pilot Human Review Semantics — Autonomy-First, No False Failure

**Goal:** Make Pilot treat human verification as a first-class autonomy-compatible review state rather than a failure mode, supporting both final review pending (job done, human validates) and mid-phase review hold (checkpoint hit mid-execution) without project blocking or failure semantics.
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05, REVIEW-06, REVIEW-07, REVIEW-08, REVIEW-09, REVIEW-10, REVIEW-11, REVIEW-12, REVIEW-13, REVIEW-14, REVIEW-15, REVIEW-16
**Depends on:** Phase 80
**Plans:** 3/3 plans complete

Plans:
- [ ] 81-01-PLAN.md — Foundation: extend JobStatus type, DB schema, and state transition functions for review states
- [ ] 81-02-PLAN.md — Runner integration: verdict-to-review detection, review CLI command, callback notifications
- [ ] 81-03-PLAN.md — Status display: CLI/TUI/web UI consistency for review states with non-failure styling

Wave structure:
- Wave 1: 81-01 (foundation — types, DB, state transitions)
- Wave 2: 81-02 + 81-03 (parallel — runner/CLI and UI updates, both depend on 81-01 contracts)

### Phase 82: Pilot Timeline Semantics + Renderer Unification

**Goal:** Make Pilot's timeline and session rendering feel semantically truthful, visually coherent, and consistent across main and child views. Replace generic "Step N" labels with semantic names, improve attribution logic, unify child/sub-session renderers with main view quality, and fix contradictory top-level status narratives.
**Requirements**: requirements/pilot-timeline-semantics-and-renderer-unification.md
**Depends on:** Phase 81
**Plans:** 5/5 plans complete

Plans:
- [x] 82-01-PLAN.md — Core semantics: improve attribution logic, add semantic labels to StepTimelineGroup, create step-semantics.ts helper module
- [x] 82-02-PLAN.md — Renderer unification: rewrite session-activity.tsx to use shared TimelineItemRenderer, update child drill-in route
- [x] 82-03-PLAN.md — UI surface application: semantic labels across all components, Steps→Timeline tab rename, continuation markers, status narrative fixes
- [ ] 82-04-PLAN.md — Gap closure: metadata header-row layout, generic Step N fallback removal, judge verdict in timeline
- [x] 82-05-PLAN.md — Gap closure: Phase 82 requirement traceability in REQUIREMENTS.md (completed 2026-03-21)

Wave structure:
- Wave 1: 82-01 + 82-02 (independent: core data/helpers and renderer unification, no file overlap)
- Wave 2: 82-03 (UI wiring, depends on 82-01 for step-semantics.ts and 82-02 for unified renderer)
- Wave 3: 82-04 + 82-05 (gap closure: UI fixes and requirements traceability, independent)

### Phase 83: Pilot Human Review Semantics — Phase 81 Follow-up Completion

**Goal:** Finish the remaining Phase 81 human-review semantics work: mid-phase hold checkpoint detection, resume-from-hold execution wiring, TUI completed-panel review rendering, and REQUIREMENTS.md traceability entries.
**Requirements**: REVIEW-08, REVIEW-09, REVIEW-12, REVIEW-13, REVIEW-15
**Depends on:** Phase 82
**Plans:** 2/2 plans complete

Plans:
- [ ] 83-01-PLAN.md — Mid-phase hold checkpoint detection + resume-from-hold execution wiring
- [ ] 83-02-PLAN.md — TUI completed-panel review rendering + REQUIREMENTS.md traceability

Wave structure:
- Wave 1: 83-01 + 83-02 (independent, no file overlap)

### Phase 84: Pilot Control-Flow + Live Status Bugs — Fix False Failure Presentation and Continuation Churn

**Goal:** Make Pilot's runner + web status surfaces reflect live job truth correctly, and stop productive runs from degrading into misleading failed/stale labels and unnecessary continuation churn.
**Requirements**: Per requirements/pilot-control-flow-and-live-status-bugs.md
**Depends on:** Phase 83
**Plans:** 3/3 plans complete

Plans:
- [ ] 84-01-PLAN.md — Fix web UI live-status desync: derive isActive from reactive snapshot
- [ ] 84-02-PLAN.md — Fix continuation churn: add per-job continuation cycle guard and improved step-cap messaging
- [ ] 84-03-PLAN.md — Update web route contract tests for live-status fix regression assertions

Wave structure:
- Wave 1: 84-01 + 84-02 (independent: web UI fix and runner fix, no file overlap)
- Wave 2: 84-03 (test updates, depends on 84-01 and 84-02)

### Phase 85: Pilot CLI: Disable Milestones for Now + Realign Top-Level GSD Commands (debug + fast)

**Goal:** Make Pilot safer and more expressive at the CLI level by disabling milestone queuing, adding first-class debug and fast job scopes, and updating the delegation prompt with explicit autonomy guidance for workflow selection.
**Requirements**: TBD
**Depends on:** Phase 84
**Plans:** 2/2 plans complete

Plans:
- [ ] 85-01-PLAN.md — Foundation: types, models, add command, config, delegation prompt (debug/fast scopes + milestone blocking)
- [ ] 85-02-PLAN.md — Runner routing: intentToSteps for debug/fast, delegate validation, milestone guard note, full test pass

Wave structure:
- Wave 1: 85-01 (type foundation + CLI + delegation prompt)
- Wave 2: 85-02 (runner execution routing + integration verification, depends on 85-01)

### Phase 86: Pilot Web UI — Realtime, Navigation, Header Hierarchy, and Observability Polish

**Goal:** Make the Pilot web UI feel more realtime, more trustworthy, and more informative — especially around live sessions, navigation, sticky headers, grace period visibility, and token observability. Inline subsession nesting replaces the separate drill-in model, sticky headers get a fuller hierarchy rework with synthesized high-signal fields, and token accounting is fixed across all providers.
**Requirements**: TOK86-01, TOK86-02, TOK86-03, GRACE86-01, GRACE86-02, NAV86-01, NAV86-02, PROJ86-01, STICK86-01, STICK86-02, STICK86-03, STICK86-04, SUMM86-01, SUMM86-02, RT86-01, RT86-02, RT86-03, RT86-04, RT86-05, RT86-06, RT86-07
**Depends on:** Phase 85
**Plans:** 5/5 plans complete

Plans:
- [ ] 86-01-PLAN.md — Token accounting fix across providers + grace period visibility
- [ ] 86-02-PLAN.md — Dashboard nav overflow fix + Projects page upgrade + Sessions tab reframe
- [ ] 86-03-PLAN.md — Sticky header hierarchy rework + summary deep-link
- [ ] 86-04-PLAN.md — Inline subsession nesting + route cleanup
- [ ] 86-05-PLAN.md — Phase summary + cross-cutting verification

Wave structure:
- Wave 1: 86-01 + 86-02 + 86-03 (independent: token/grace, dashboard/projects, sticky headers)
- Wave 2: 86-04 (inline nesting, depends on 86-03 for sticky header foundation)
- Wave 3: 86-05 (summary + verification, depends on all above)

### Phase 87: Pilot UI Phase — First-Class Delegation Step for Async Runner Mode

**Goal:** Make ui-phase a first-class delegation step in Pilot — delegation AI decides whether a phase needs UI design contract, runner executes ui-phase explicitly before planning, with async-safe policies for upstream interactive branches and full observability of the decision/outcome.
**Requirements**: UI-PHASE-INTENT, UI-PHASE-DELEGATION, UI-PHASE-RUNNER, UI-PHASE-ASYNC-SAFE, UI-PHASE-OBSERVABILITY, UI-PHASE-COMPAT
**Depends on:** Phase 86
**Plans:** 4/4 plans complete

Plans:
- [x] 87-01-PLAN.md — Types + delegation prompt + intent parser (DelegationIntent uiPhase field, delegate.md guidance, parseIntentOutput normalization)
- [x] 87-02-PLAN.md — Runner integration (intentToSteps ui-phase insertion, UI-SPEC existence check, async-safe skip/fail logging)
- [x] 87-03-PLAN.md — Tests (parseIntentOutput uiPhase parsing, fixture, backward compat, string normalization)
- [ ] 87-04-PLAN.md — Gap closure: Add UI-PHASE-* requirement definitions and traceability to REQUIREMENTS.md

Wave structure:
- Wave 1: 87-01 (types + delegation prompt + parser — foundation)
- Wave 2: 87-02 (runner integration, depends on 87-01 for DelegationIntent type)
- Wave 3: 87-03 (tests, depends on 87-01 + 87-02)
- Wave 4: 87-04 (gap closure: requirements traceability)

**Details:**
Read requirements/pilot-ui-phase-as-first-class-delegation-step.md for full spec.

### Phase 88: Pilot Web UI — Job Detail Content-First Redesign (Info Panel, Summary Overlay, Nested Sticky Sessions, Follow Mode)

**Goal:** Redesign Pilot's job detail UI into a content-first execution reader — unified Info panel replacing fragmented actions/meta, tab bar removal with summary overlay, nested child sessions without card chrome using sticky headers, and Follow mode for live activity tailing.
**Requirements**: INFO-PANEL, TAB-REMOVAL, SUMMARY-OVERLAY, TIMEZONE-FIX, TOP-LAYOUT, NESTED-CHILDREN, STICKY-HEADERS, COLLAPSIBLE, FOLLOW-MODE, CROSS-DEVICE
**Depends on:** Phase 87
**Plans:** 4/4 plans complete

Plans:
- [x] 88-01-PLAN.md — Unified Info panel + Summary overlay + tab bar removal + top layout redesign + timezone fix
- [x] 88-02-PLAN.md — Nested child session redesign: remove card chrome, normal-flow embedding, sticky header hierarchy
- [x] 88-03-PLAN.md — Follow mode: auto-scroll, deliberate-scroll cancellation, jump-to-latest bar + visual verification
- [ ] 88-04-PLAN.md — Gap closure: requirement traceability + key_links frontmatter corrections

Wave structure:
- Wave 1: 88-01 (surfaces: Info panel, Summary overlay, tab removal, layout)
- Wave 2: 88-02 + 88-03 in parallel (nested children + follow mode, both depend on 88-01 for layout foundation)
- Wave 1 (gap closure): 88-04 (requirement traceability + plan frontmatter fixes)

**Details:**
Read requirements/pilot-web-ui-job-detail-content-first-info-panel-and-follow-mode.md for full spec.

### Phase 89: Pilot Web UI — Nested Sticky Hierarchy, Summary, and Label Fixes

**Goal:** Make the job detail view a clear, native, single-scroll execution tree with stacked sticky headers showing Step → sub-agent → nested sub-agent hierarchy. Create a semantic session type model with Lucide icons and pastel depth system, fix Summary popup empty state, eliminate Unattributed sessions, and replace internal jargon with human-readable semantic labels.
**Requirements**: SEMANTIC-TYPE-MODEL, SUMMARY-FIX, LABEL-FOUNDATION, STICKY-HIERARCHY, PASTEL-COLORS, HEADER-RENDERING, EXECUTION-PARENT, GAP-LABELS, ATTRIBUTION-FIX, VALIDATION
**Depends on:** Phase 88
**Plans:** 5 plans (3 complete + 2 gap closure)

Plans:
- [x] 89-01-PLAN.md — Semantic session type model + Lucide icon mappings + Summary popup fix
- [x] 89-02-PLAN.md — Sticky header hierarchy + pastel color system + header rendering overhaul
- [x] 89-03-PLAN.md — Attribution hardening + visual verification against real job data
- [ ] 89-04-PLAN.md — Gap closure: total branch semantic typing + backend semanticLabel wiring
- [ ] 89-05-PLAN.md — Gap closure: Phase 89 requirement definitions in REQUIREMENTS.md

Wave structure:
- Wave 1: 89-01 (semantic foundation — types, icons, colors, summary fix) ✓
- Wave 2: 89-02 (visual hierarchy — sticky headers, pastels, icons in all surfaces) ✓
- Wave 3: 89-03 (attribution + validation checkpoint) ✓
- Wave 4: 89-04, 89-05 (gap closure — parallel, no dependencies between them)

**Details:**
Read requirements/pilot-web-ui-nested-sticky-hierarchy-summary-and-label-fixes.md for full spec.

### Phase 90: Pilot Web UI — Native Subsession Flow, Single-Scroll Integration, and Follow Mode

**Goal:** Verify and harden the three Phase 90 features (Native Subsession Flow, Single-Scroll Integration, Follow Mode) against UI-SPEC contracts, remove dead code from branch helpers, and add requirement traceability. Core implementations exist from Phases 88-89 — this is the contract verification and cleanup pass.
**Requirements**: NSSF-01, NSSF-02, NSSF-03, NSSF-04, SSI-01, SSI-02, FM-01, FM-02, FM-03, CLEAN-01
**Depends on:** Phase 89
**Plans:** 2/2 plans complete

Plans:
- [x] 90-01-PLAN.md — Dead code cleanup + UI-SPEC contract audit across 6 components
- [x] 90-02-PLAN.md — Phase 90 requirement definitions in REQUIREMENTS.md (completed 2026-03-23)

Wave structure:
- Wave 1: 90-01 (implementation cleanup + contract verification)
- Wave 2: 90-02 (requirements traceability, depends on 90-01)

### Phase 91: Pilot Debug Lane — Caller-Side Autonomous gsd-debugger Orchestration

**Goal:** Make Pilot debug jobs autonomous by directly spawning gsd-debugger with prefilled context from caller/runner logic, handling all debugger outcomes (ROOT CAUSE FOUND, DEBUG COMPLETE, INVESTIGATION INCONCLUSIVE, CHECKPOINT REACHED) autonomously, auto-continuing through human-verify checkpoints, and keeping the entire flow in a dedicated debug lifecycle that never touches phase-style judge logic.
**Requirements**: DBG-01, DBG-02, DBG-03, DBG-04, DBG-05, DBG-06, DBG-07, DBG-08, DBG-09, DBG-10, DBG-11, DBG-12, DBG-13, DBG-14
**Depends on:** Phase 90
**Plans:** 4/4 plans complete

Plans:
- [x] 91-01-PLAN.md — Create debug-lane module + rewire runner debug flow (inline gsd-debugger spawn, outcome parsing, autonomous continuation)
- [x] 91-02-PLAN.md — Integration tests for runner debug lane (all outcome types, checkpoint handling, no-judge validation)
- [x] 91-03-PLAN.md — Gap closure: Fix spawnAndWait scope resolution for debug sessions (debug scope → not judge)
- [x] 91-04-PLAN.md — Gap closure: Add DBG-01..DBG-14 requirement definitions to REQUIREMENTS.md

Wave structure:
- Wave 1: 91-01 (implementation: debug-lane.ts module + runner.ts rewire)
- Wave 2: 91-02 (tests, depends on 91-01)
- Wave 3: 91-03 + 91-04 (gap closure, parallel — code fix + docs fix)

**Details:**
Read requirements/pilot-debug-lane-caller-side-autonomous-gsd-debugger.md for full spec.

### Phase 92: Pilot Web UI — Native Subsession Flow Actual Implementation Follow-Up

**Goal:** Ship the actual runtime UI rewrite for native subsession flow — subsession content integrated into the same main scroll stream at the same indentation level, nested sticky headers stacking by depth, foldable subsessions open by default, and follow mode working inside open subsessions.
**Requirements**: NSFF-01, NSFF-02, NSFF-03, NSFF-04, NSFF-05, NSFF-06, NSFF-07, NSFF-08, NSFF-09, NSFF-10, NSFF-11, NSFF-12
**Depends on:** Phase 91
**Plans:** 1/1 plans complete

Plans:
- [x] 92-01-PLAN.md — Flatten subsession layout (BranchLifecycleBlock + SessionActivity rewrite) + human verify

### Phase 93: AutoPilot Brand Identity Rebrand

**Goal:** Rebrand the Pilot frontend to AutoPilot with a cohesive visual identity — SVG brand assets, Brand component, header + title updates, and complete favicon/app icon set that communicates automation, motion, intelligence, and confidence.
**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04, BRAND-05, BRAND-06, BRAND-07
**Depends on:** Phase 92
**Plans:** 2 plans

Plans:
- [ ] 93-01-PLAN.md — SVG brand assets + Brand component + header/title rebrand
- [ ] 93-02-PLAN.md — Favicon set generation + HTML head wiring + visual verification
