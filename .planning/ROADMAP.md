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
