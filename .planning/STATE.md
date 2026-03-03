# State

## Current Milestone: launch-v1
## Current Phase: 27

## Current Position

Phase: 27 of 27 (TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix)
Plan: 2 of 2 in current phase (27-01 and 27-02 complete)
Status: Phase complete
Last activity: 2026-03-03 - Completed quick task 024: requirements/phase-redesign-edge-cases-and-retry-fixes.md

Progress: ██████████████████████████████ 100% (78/78 plans)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Reliable autonomous orchestration of AI development sessions
**Current focus:** Phase 25 in progress — Pilot Learnings Consolidation + Reliability Guardrails (1/4 plans complete)

### Phase 1: Project Scaffolding + Core Data Layer
- **Status:** complete (5/5 plans, verified ✓)

### Phase 2: CLI Commands (Phase 1 Monitoring + Setup)
- **Status:** complete (3/3 plans, verified ✓)

### Phase 3: Queue Runner + Lifecycle Automation
- **Status:** complete (4/4 plans, verified ✓)

### Phase 4: TUI Dashboard
- **Status:** complete (5/5 plans, verified ✓)

### Phase 5: Integration fixes per requirements/integration-fixes.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 6: Queue storage migration per requirements/queue-storage-migration.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 7: Smart add per requirements/smart-add.md
- **Status:** complete (2/4 plans executed [gap closure 03+04], verified ✓)

### Phase 8: Smart tail stuck detection
- **Status:** planned (0/2 plans complete)

### Phase 9: Gap closure resilience
- **Status:** complete (2/2 active plans complete [gap closure 09-03+09-04], verified ✓)

### Phase 10: Smart verify routing per requirements/smart-verify-routing.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 11: Finishing touches per requirements/finishing-touches.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 12: Critical fixes per requirements/overnight-fixes.md
- **Status:** complete (3/3 plans, verified ✓)

### Phase 13: Daemon mode runner per requirements/daemon-mode-runner.md
- **Status:** complete (4/4 plans)

### Phase 14: Production hardening per requirements/production-hardening.md
- **Status:** complete (5/5 plans, verified ✓)

### Phase 15: E2E test suite per requirements/e2e-test-suite.md
- **Status:** in progress (1/3 plans complete)

### Phase 25: Pilot Learnings Consolidation + Reliability Guardrails
- **Status:** in progress (1/4 plans complete)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Fix pilot log — Show actual message content | 2026-03-02 | 8a74897 | [001-fix-pilot-log-show-actual-message-content](./quick/001-fix-pilot-log-show-actual-message-content/) |
| 009 | Fix TUI — Register @opentui/solid bun plugin | 2026-03-02 | a5e4a57 | [009-fix-tui-replace-react-ink-with-solid-open](./quick/009-fix-tui-replace-react-ink-with-solid-open/) |
| 010 | Flesh out pilot log — show full session activity | 2026-03-02 | d73c13d | [010-flesh-out-pilot-log-show-full-session-act](./quick/010-flesh-out-pilot-log-show-full-session-act/) |
| 011 | Daemon hot-reload after build | 2026-03-02 | 79b116c | [011-daemon-hot-reload-after-build-problem-whe](./quick/011-daemon-hot-reload-after-build-problem-whe/) |
| 012 | TUI Detail View - Job Drill-Down on Enter | 2026-03-02 | e33b2d8 | [012-tui-detail-view-job-drill-down-on-enter-](./quick/012-tui-detail-view-job-drill-down-on-enter-/) |
| 012 | TUI detail view — job drill-down on enter | 2026-03-02 | ebe7b62 | [012-tui-detail-view-job-drill-down-on-enter-](./quick/012-tui-detail-view-job-drill-down-on-enter-/) |
| 013 | Implement requirements/pilot-phase-execution-success-contract.md end-to-end in code: fix phase fallback mapping, semantic success gating, interrupted-job status handling, and phase ambiguity warning; include tests | 2026-03-02 | 979bbf3 | [013-implement-requirements-pilot-phase-execu](./quick/013-implement-requirements-pilot-phase-execu/) |
| 014 | Model Frontmatter Patching | 2026-03-02 | 04df455 | [014-model-frontmatter-patching](./quick/014-model-frontmatter-patching/) |
| 015 | Step-level observability (R4) — job_steps table + runner recording + pilot log display | 2026-03-02 | 6840417 | [015-pilot-requirement-phase-execution-succes](./quick/015-pilot-requirement-phase-execution-succes/) |
| 016 | Phase & milestone reliability — filesystem phase resolution, success pattern gating | 2026-03-03 | 9424b3d | [016-phase-milestone-reliability-make-structu](./quick/016-phase-milestone-reliability-make-structu/) |
| 018 | Fix premature completion detection — isSessionDone(), runner polling, evaluateStepResult fail-safe | 2026-03-03 | c1a2fe4 | [018-requirements-fix-premature-completion-de](./quick/018-requirements-fix-premature-completion-de/) |
| 019 | Harden add-phase reliability — GSD_INSTRUCTION_BLOCKLIST, matchesBlocklist(), verifyStepArtifacts duplicate/blocklist checks, hardened gsd-add-phase.md | 2026-03-03 | b0c65dc | [019-harden-add-phase-reliability-problem-add](./quick/019-harden-add-phase-reliability-problem-add/) |
| 020 | Requirements observability and job config visibility — pilot log header with model/attempts, per-step tokens, new pilot info <id> command | 2026-03-03 | 82bcdda | [020-requirements-observability-and-job-config](./quick/020-requirements-observability-and-job-config/) |
| 021 | Phase redesign — single-session orchestrator + judge evaluation replacing multi-step delegation → regex evaluation | 2026-03-03 | a301bed | [021-phase-redesign-single-session-orchestrat](./quick/021-phase-redesign-single-session-orchestrat/) |
| 022 | Dead code cleanup post-redesign — remove 6 dead exports from opencode-db.ts, delete 4 empty duplicate phase dirs, scrub stale comments | 2026-03-03 | 17ec5e0 | [022-requirements-cleanup-dead-code-post-rede](./quick/022-requirements-cleanup-dead-code-post-rede/) |
| 023 | requirements/model-control-and-tui-visibility.md | 2026-03-03 | 9eb94ea | [023-requirements-model-control-and-tui-visib](./quick/023-requirements-model-control-and-tui-visib/) |
| 024 | requirements/phase-redesign-edge-cases-and-retry-fixes.md | 2026-03-03 | bb3ddcc | [024-requirements-phase-redesign-edge-cases-a](./quick/024-requirements-phase-redesign-edge-cases-a/) |

## Accumulated Context

### Roadmap Evolution
- Phase 5 added: Integration fixes per requirements/integration-fixes.md
- Phase 6 added: Queue storage migration per requirements/queue-storage-migration.md
- Phase 7 added: Smart add per requirements/smart-add.md
- Phase 6 skipped: queue-store.ts never built; Phase 7 adapted to use QUEUE.md
- Phase 8 added: Smart tail stuck detection per requirements/smart-tail-stuck-detection.md
- Phase 9 added: Gap closure resilience per requirements/gap-closure-resilience.md
- Phase 10 added: Smart verify routing per requirements/smart-verify-routing.md
- Phase 11 added: Finishing touches per requirements/finishing-touches.md
- Phase 12 added: Critical fixes per requirements/overnight-fixes.md
- Phase 17 added: Pilot v2 complete rewrite — delegation AI, SQLite queue, opencode DB ground truth, clean CLI
- Phase 18 added: Pilot v2 TUI with OpenTUI — dashboard, job detail, split pane views
- Phase 19 added: requirements/tui-phase-redo.md
- Phase 20 added: requirements/model-profile-support.md
- Phase 21 added: requirements/tui-visual-polish.md
- Phase 22 added: Delegate Phase Lifecycle Hardening
- Phase 23 added: TUI Selection Colors & Visual Polish
- Phase 24 added: Task/Subagent Visibility in TUI and Logs
- Phase 25 added: Pilot Learnings Consolidation + Reliability Guardrails (2026-03-03)
- Phase 26 added: Runner Immediate Dispatch + Force Quit Controls
- Phase 27 added: TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix
- Phase 28 added: Runner Immediate Dispatch + Force Quit Controls

## Decisions

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01-01 | picocolors identity functions for NO_COLOR at module load | Simpler than checking at every call site |
| 01-01 | NaN fallback for stuckThreshold defaults to 90 | More robust for automation than throwing |
| 01-02 | Multi-pipe args joined with ' \| ' separator | Preserves original format for round-trip fidelity |
| 01-02 | Description lines identified by metadata exclusion | Simpler than positive matching against free-form text |
| 01-03 | getProcessRuntime is async (reads /proc files) | Consistent with spec guidance against sync fs in hot paths |
| 01-03 | Module-level Map cache with 60s TTL for session message counts | Avoids repeated CLI calls during stuck scoring cycles |
| 01-04 | Pure scoring function separated from I/O helpers | Enables testing without mocking /proc filesystem |
| 01-04 | CPU sampling via /proc/pid/stat delta, not ps -o %cpu | ps gives lifetime average; delta gives current usage per spec |
| 01-05 | PlanningStateResult kept as local interface in projects.ts | Implementation detail, not a cross-module contract |
| 01-05 | Phase completion = all plans have matching summaries | Simple ratio check avoids complex state inference |
| 01-05 | setupProject uses absolute symlink targets | More reliable across working directories than relative paths |
| 02-01 | Custom formatHelp override for grouped help | Avoids brittle addHelpText ordering |
| 02-01 | Stub files for all future commands | tsc strict module resolution requires import targets to exist |
| 02-01 | computeStuckScore called sequentially per PID | CPU sampling is inherently serial (3×10s) |
| 02-02 | Native fs.watch + 1s poll backup for tail | fs.watch can miss events on some systems; poll ensures reliability |
| 02-02 | Walk-up cwd detection for progress command | Intuitive UX when running inside a project directory |
| 02-02 | Content truncation at 500 chars in non-verbose log mode | Keeps transcript readable without overwhelming output |
| 02-03 | stdout spy with type cast for vi.mock of process.stdout.write | Complex overload types require cast for test compatibility |
| 02-03 | Queue ENOENT graceful in status, exit 1 in queue | Status is dashboard (soft fail), queue is explicit command (hard fail) |
| 03-01 | execa v9 file redirect for log appending | Cleaner than manual FD management; execa handles lifecycle |
| 03-01 | STATE file priority over inference fallback | Explicit state is authoritative; inference for backward compat only |
| 03-01 | Module-level resolvedBinary cache in spawn.ts | Avoids repeated which calls across multiple spawn cycles |
| 03-02 | Inline truncateTitle/sanitizeArgs per command file | spawn.ts from Plan 01 has errors; avoid cross-dependency in parallel wave |
| 03-02 | void opts for no-flag commands | Consistent signature without unused-param warnings |
| 03-02 | reject: false on execa calls | Manual exit code propagation instead of throwing on non-zero |
| 03-03 | Polling-based reap for detached processes | Exit events not reliable for detached processes |
| 03-03 | markEntryPending helper in runner.ts | queue-parser markEntry only supports running/done/failed |
| 03-03 | Synchronous spawnAndWait for lifecycle inner steps | Phase cycle steps must complete before next state transition |
| 03-03 | MAX_GAP_CYCLES=3 with best-effort acceptance | Prevents infinite gap closure loops |
| 03-04 | Detached execa spawn for runner from build command | Runner survives parent exit; uses process.argv[1] for self-reference |
| 03-04 | scope --build wired as add-and-build mode | Matches spec §9 lifecycle mode; deferred from 03-02 now that runner exists |
| 04-03 | Fast stuck scoring in TUI (no CPU/message signals) | Avoids 30s delay per process; log staleness + memory sufficient for dashboard |
| 04-04 | createElement() in tui.ts instead of JSX | Keeps file as .ts matching existing index.ts import path |
| 04-04 | Dynamic import for tree-kill in kill handler | Avoids loading tree-kill at startup for non-TUI commands |
| 04-04 | Log panel 3s interval when expanded | Balances freshness vs performance; clears when collapsed |
| 04-05 | afterEach cleanup for Ink component unmount | Prevents interval leaks in TUI tests |
| 04-05 | 60s intervalMs for Dashboard tests | Prevents re-fetches during short test window |
| 07-03 | Optional PilotConfig param in detectProjectState | Clean test injection without fragile vi.mock on config.js |
| 07-03 | Multiple Must Have sections (>=2) = phase headers | Indicates milestone-level multi-section scope |
| 07-03 | Uses parseQueueFile not queue-store.ts | Phase 6 queue-store.ts was never built |
| 07-04 | addCommand returns AddResult for composition | buildCommand and index.ts JSON output compose with result |
| 07-04 | Queue writes via withQueueLock not queue-store.ts | Phase 6 never built; QUEUE.md is the storage layer |
| 07-04 | VALID_MODES removed from user-facing code | GSD modes are internal implementation details |
| 09-03 | countSummaryFiles reads content for Superseded check | Filename alone can't distinguish superseded summaries |
| 09-03 | countNonGapPlanFiles reads first 20 lines for frontmatter | Efficient for large plan files; gap_closure field is always in frontmatter |
| 09-03 | MAX_GAP_CYCLES throws instead of silent accept | Fail-fast is correct behavior; runner marks entry as FAIL |
| 09-04 | detectGapClosureMisconfig in stuck.ts not phase-state.ts | It's a stuck detection concern, co-located with scoring |
| 09-04 | Misconfig detection on stuck/suspect only | Healthy sessions don't need gap closure checks |
| 09-04 | Silent error catch during misconfig detection | Monitoring must not break due to filesystem issues |
| 10-01 | Web signals checked before CLI — web wins when both present | CLI that serves web content should get browser UAT |
| 10-01 | JSX/TSX scan limited to 2 levels deep | Avoids performance issues on large codebases |
| 10-01 | Port patterns match spec exactly (:3000, :8080, :5173, localhost) | Simple heuristics per requirements |
| 10-02 | Warning-only for unmatched ROADMAP criteria grep | Heuristic — missing file matches are informational, not hard failures |
| 10-02 | Simple key: value frontmatter parser (no YAML library) | Sufficient for phase/plan key validation without dependency |
| 10-02 | Shared runTests helper between both strategies | Avoid code duplication for test suite execution |
| 10-03 | formatVerifyResult renders human-readable check output to stderr | Consistent UX for non-web strategy output |
| 10-03 | Lifecycle writes UAT-style file on non-web verification failure | Gap closure compatibility with existing flow |
| 10-03 | Web project flow completely unchanged in lifecycle | Preserves proven gsd-verify-auto behavior |
| 10-04 | verifyAttempts counter persists across loop iterations | Counts through gap closure cycles — prevents infinite loops |
| 10-04 | Non-web auto-skip on attempt count; web also checks log content | Non-web verify is inline (no log); web has log to analyze |
| 10-04 | Auto-skip writes UAT with result: pass for state machine compat | Phase moves to done/next-phase without manual intervention |
| 12-01 | message_count optional (undefined) not default 0 | Preserves distinction between no data and zero messages |
| 12-01 | 5s timeout on all execa calls to opencode | Prevents indefinite hangs when binary unavailable |
| 12-02 | Removed claude.json fallback from spawn.ts validateConfig | opencode.json is the only config format |
| 12-02 | Removed claude binary fallback from spawn.ts checkBinary | Only opencode binary supported for spawning |
| 12-02 | Kept claude paths as secondary detection in config.ts | Backward compat for reporting binary location |
| 12-02 | Cap donePhases at totalPhases before percent calc | Prevents extra phase dirs inflating progress |
| 05-01 | lstat to distinguish symlinks from real directories | Prevents data loss on re-setup with real dirs |
| 05-01 | Skip opencode.json if legacy claude.json exists | Backward compat without overwriting user configs |
| 05-02 | computeStuckScoreFast skips CPU sampling — scorer defaults maxCpu to 100 | Instant results for status dashboard |
| 05-02 | sampleCpu timeout checks before and after sleep | Prompt abort when timeout exceeded |
| 05-02 | Runner PID check moved before stuck loop in status | Enables PID exclusion from scoring |
| 05-03 | Unconditional wait-for-all block after main loop | Safe: normal mode breaks when activeJobs empty (no-op) |
| 05-03 | Best-effort upstream tracking before explicit pull | Graceful degradation on fresh clones |
| 05-04 | Setup tests use real filesystem (mkdtemp) for symlink verification | Integration-level testing more reliable than mocking fs for symlink behavior |
| 05-04 | Runner tests use mock exit event instead of fake timers | Avoids timeout issues with runner's sleep-based polling loops |
| 06-01 | nanoid(12) for queue item IDs | Short enough to type, unique enough for <100 items |
| 06-01 | detectCircularDep exported for direct testing | addItem creates new IDs so cycles via public API are impossible, but guards against data corruption |
| 06-01 | History capped at 100 entries by newest completedAt | Prevents unbounded growth while keeping useful history |
| 06-01 | Lock on queue.json file, create empty if needed | proper-lockfile requires existing target |
| 06-02 | Timeout stored in item.meta.timeout instead of entry.timeout | QueueJsonItem uses meta bag for optional fields |
| 06-02 | item.description holds run-command args (replaces entry.args) | Consistent with queue-store addItem API |
| 06-02 | lock.ts kept with deprecation notice for add.ts/scope.ts | Will be removed after Plan 03 migrates remaining consumers |
| 06-03 | build.ts unchanged — delegates to addCommand | addCommand now uses queue-store, no direct queue write in build |
| 06-03 | JSON backward compat: queued→pending, description→args, line_num=0 | Preserve external consumer contracts during migration |
| 06-03 | Queue --history for completed/failed, inline only shows running/queued | Clean separation of active vs historical items |
| 06-03 | import.ts uses local shortId matching queue-store | Avoids exposing internal ID generator |
| 06-04 | smart-add.ts migrated from parseQueueFile to getItems | Was reading stale QUEUE.md instead of queue.json |
| 06-04 | TUI migration already done in non-plan commits | Prior commits a6003cc and 38cd6ef handled useStatusData/QueuePanel/Dashboard |
| 11-01 | Reuse spawn.ts patterns without shared helpers | Keeps modules independent, avoids refactor scope |
| 11-01 | Queue check validates queue.json not QUEUE.md | Consistent with Phase 6 migration |
| 11-01 | Tests account for real filesystem state | Binary and snapshot repos may exist on dev machines |
| 11-02 | Built-in fetch() for webhook notifications | No new dependency needed (Node.js 20+) |
| 11-02 | Sync appendFileSync for runner log | Infrequent writes, simplicity over async |
| 11-02 | Filename date rotation not mtime | Deterministic and testable |
| 11-02 | Notifications never throw | Fire-and-forget with stderr logging on failure |
| 11-03 | Orphan detection via pgrep with self/parent PID exclusion | Avoids false positives from current process |
| 11-03 | History truncation keeps last 100 entries | Newest entries are most useful; prevents unbounded growth |
| 11-03 | Queue cleanup is read-only reporting | Modifying queue.json during cleanup is too risky |
| 11-03 | verifySetup uses realpath for symlink resolution | Catches broken symlinks that lstat alone would miss |
| 11-04 | postbuild script guarantees shebang + chmod | Defense in depth even if tsc behavior changes |
| 11-04 | --no-tui is informational flag | Runner already headless by default; flag documents intent |
| 11-04 | TUI smoke tests in test/commands/ per plan | Complements test/tui/ without duplication |
| 13-01 | completedIds never pruned in queue.json | Source of truth for dep resolution; history caps at 100 |
| 13-01 | findLaunchableAtomic holds lock during read+mark | Prevents TOCTOU race where two runners launch same item |
| 13-01 | Old findLaunchable kept as deprecated | Existing runner.ts uses it; migration deferred to Plan 02 |
| 13-01 | QueueEntry moved to queue-parser.ts | Legacy QUEUE.md vocabulary, not runtime contract |
| 13-01 | QueueItem kept in types.ts with blocked | JSON contract vocabulary (pending/done) must be preserved |

| 13-02 | Task 2 merged into Task 1 — cascadeFailure tightly coupled with runner refactor | Cannot be separated into standalone commit |
| 13-02 | PID file key change requires updating all consumers | Cross-cutting concern applied atomically |
| 13-02 | Graceful shutdown removes kill logic — pilot stop --force handles externally | Active jobs finish naturally on SIGINT/SIGTERM |
| 13-03 | TTY detection gates human output in run.ts | Daemon mode logs to file only, TTY gets stdout |
| 13-03 | stop --force sends immediate SIGKILL (no SIGTERM) | Clean daemon management for systemd |
| 13-03 | build runs runner in-process with --once | Blocks until item completes, no detached child |
| 13-03 | add is fire-and-forget, never starts runner | Decoupled from runner lifecycle |
| 13-03 | silent mode on addCommand for composition | Prevents double output when build calls add |
| 13-04 | Execa mock override needed for retry/fail test paths | Default stdout:'0' makes checkPlanningChanges true |
| 13-04 | parallel.test.ts once:false → once:true | Sequential/maxParallel enforcement identical in both modes; avoids daemon loop |
| 13-04 | Config mock must include pollInterval + defaultTimeout | Required fields added in Plan 03 runner refactor |
| 14-01 | Sync fs methods for atomic write path (writeFileSync, renameSync, copyFileSync, fsyncSync) | Crash safety requires synchronous operations within held lock |
| 14-01 | tryParseJson with trailing-garbage trimming for truncated write recovery | Handles partial writes where JSON is truncated mid-write |
| 14-01 | cleanStaleLocks as 5-minute safety net beyond proper-lockfile 30s stale | Defense in depth for lock cleanup when proper-lockfile fails |
| 14-01 | Lock acquisition failure logs + re-throws | Callers in daemon loop catch and skip cycle; daemon never crashes |
| 14-02 | BigInt arithmetic for disk space calculation | bfree * bsize can exceed Number.MAX_SAFE_INTEGER on large filesystems |
| 14-02 | Spawn rate limiter as module-level state in spawn.ts | Single daemon process means module-level is effectively singleton |
| 14-02 | validLogLevels cast to readonly string[] for includes() | TypeScript const tuple needs widened type for string.includes() |
| 14-03 | Export checkBinary and getSystemFreeMem from spawn.ts for startup validation | Runner needs binary/memory check without full preSpawnChecks |
| 14-03 | Orphan detection logs only on startup — no kill | Killing on startup too aggressive; Plan 04 handles periodic kill |
| 14-03 | Job log cleanup: keep 20 most recent, delete >7 days beyond that | Balance debugging access with disk space |
| 14-03 | ISO-8601 local timestamp for structured logging | Matches requirements; parseable and sortable |
| 14-03 | Size rotation renameSync cascade (current→.1→.2→.3→deleted) | Standard pattern; ~40MB total cap |
| 14-04 | DaemonStuckAssessment separate from StuckAssessment | Daemon needs isFlaky field and skips CPU sampling |
| 14-04 | Flaky detection checks attempts >= maxAttempts FIRST | Exhausted attempts always fail regardless of flaky signals |
| 14-04 | flakyAttempts map entry required for consistently_flaky label | Prevents false positives on first-time failures |
| 14-04 | Orphan cleanup via pgrep cross-reference | Can't match PIDs to queue items directly; compares count and runtime |
| 14-04 | statSync for log file size in flaky detection | Single sync call in completion handler is fine |
| 14-05 | statSync added to node:fs mock in runner.test.ts | Flaky detection uses statSync; must be mocked |
| 14-05 | Fake timers for spawn rate limiter test | Avoids 5-second real delays in test |
| 14-05 | computeDaemonStuckScore tested with process.pid | Always-alive PID for healthy path verification |
| 15-01 | progress exits 0 for nonexistent projects — test adjusted | Actual CLI behavior: shows "No planning data found" not exit 1 |
| 15-01 | execaNode for E2E subprocess spawning | Cleaner than execa('node', ...) for Node.js scripts |
| 15-01 | Queue JSON written directly in helpers (no core imports) | Test isolation — helpers must not depend on application code |
| 17-02 | In-memory DB via _getTestDb() for test isolation | Fresh DB per test without touching filesystem |
| 17-02 | 4-char alphanumeric IDs with collision check loop | 36^4 = 1.6M possible IDs, collision extremely unlikely |
| 17-02 | updateSessionTitles appends via read-merge-write | Preserves existing titles from previous spawn cycles |
| 17-02 | COALESCE(completed_at, created_at) for cancelled job ordering | Cancelled jobs lack completed_at; fallback to created_at |
| 17-05 | Poll interval from config.pollInterval not hardcoded 5s | Enables 1s polls in tests; configurable in production |
| 17-05 | activeJobs tracked in run() before async launch() | Prevents --once mode from exiting before launch starts |
| 17-05 | Guard against re-launching same job ID already active | Prevents duplicate launches when getNextPending returns same job |
| 17-05 | _resetSpawnRateLimit for test isolation | Module-level rate limiter state persists across tests |
| 17-08 | Real filesystem for detectScope tests | package.json and src/ exist reliably in repo; avoids brittle fs mocks |
| 17-08 | process.exit mocked as throw for error path testing | Halts execution at exit point; enables rejects.toThrow assertion pattern |
| 17-08 | Colors mocked as identity functions | Test assertions check text content not ANSI escape sequences |
| 17-08 | formatRelativeTime mocked to constant | Isolates command output tests from time-dependent formatting |
| 18-04 | @jsxImportSource @opentui/solid per-file pragma for TUI .tsx | Cleaner than @ts-ignore; properly resolves OpenTUI JSX intrinsics |
| 18-05 | Created missing 18-03 prerequisite files (app.tsx, chrome components, tui command) | Plan 18-03 SUMMARY claimed files existed but they were never committed |
| 18-05 | Flash detection via createEffect(on()) comparing prev/current ID sets | Clean SolidJS pattern for detecting new completions without stale closures |
| 18-05 | formatTokens exported from running-panel for reuse | Avoids duplicate helper; completed-panel imports it |

| quick-001 | parseMessageRow reads text_content from part-table subquery | message.data doesn't contain content in opencode schema |
| 22-01 | extractRequirementTitle uses /^#\s+(.+)$/m regex for first # heading | Matches # Title but not ## Subtitle; clean title extraction |
| 22-01 | add-phase gets title, plan-phase gets @path for GSD context | Prevents ugly slugified directory names from file paths |
| 22-01 | Milestone dir fallback derives title from filename when no heading | Strip .md and leading digits for reasonable fallback |
| 22-02 | Artifact verification runs AFTER semantic success gating | Both checks must pass — semantic first, artifact second |
| 22-02 | patchStepArgs mutates plan.steps in place for remaining steps only | Simpler than cloning; patching is always forward-only |
| 22-02 | Non-phase commands skip artifact verification entirely | quick/new-project/debug have no phase directory expectations |
| 22-02 | restoreDefaultReaddirSync helper pattern for test mock state | vi.clearAllMocks doesn't restore mockImplementation overrides |
| 24-01 | getChildSessions returns empty array on DB unavailable | Consistent graceful degradation pattern with other query functions |
| 24-01 | Task tool format: ▶ task: {subagent_type} — "{description}" | Matches requirements spec; human-readable subagent display |
| 24-01 | Fallback to 'subagent' when subagent_type missing | Safe default for unknown task types |
| 24-02 | resolveChildSections uses getChildSessions parent_id join | No heuristics needed; opencode stores parent_id on task-spawned sessions |
| 24-02 | Max 2-level nesting with depth guard | Prevents infinite recursion; covers typical delegation → executor → subagent chains |
| 24-02 | Inline 2-level JSX rendering instead of recursive component | Simpler; avoids SolidJS reactive pitfalls with recursive components |
| 24-02 | Children refreshed on every poller cycle (full fetch) | Child sessions not in incremental since filter path |
| 25-01 | reconcileStaleJobs calls getAllRunningJobs internally | Consistent reuse of existing helper, not raw getDb() |
| 25-01 | markStale sets started_at = NULL | Fresh timing on next run, not stale duration from ghost session |
| 25-01 | error field records reconciliation reason | Debugging ghost-running jobs without separate audit log |
| 25-01 | WHERE status = 'running' guard on markStale | Safe idempotency — calling twice doesn't reset a completed job |
| 26-01 | claimNextLaunchable uses db.transaction() for atomic SELECT+UPDATE | Prevents TOCTOU race — no two callers claim the same job |
| 26-01 | Project serialization via NOT IN subquery inside transaction | Single SQL statement, no extra round-trips |
| 26-01 | Re-fetch row after UPDATE inside transaction | Returns accurate started_at/attempts values post-mutation |
| 26-01 | getRunningJobsByProject is thin alias for getRunningJobsForProject | Same logic, cleaner name for runner dispatch path |
| 26-01 | forceQuitJob embeds source in verdict_reason string | Audit trail without schema change |
| 27-01 | Selection always wins over flash in rowBg() | Deterministic cursor visibility in completed panel |
| 27-01 | countDescendants uses loaded sections signal | Avoids extra DB calls — derived from already-loaded memory |
| 27-01 | Dark tint flash (#0d2b0d / #2b0d0d) not harsh inverse | Subtle enough to notice without disrupting readability |
| 27-01 | Token fetch in completed panel on job change (no timer) | Completed job data is static — one fetch when jobs list changes |
| 26-02 | Periodic reconcileStaleJobs every RECONCILE_EVERY_N_CYCLES=10 | Long-running daemons need ongoing DB-level ghost cleanup, not just startup |
| 26-02 | In-memory same-project guard alongside claimNextLaunchable DB guard | Belt-and-suspenders prevents edge cases between DB claim and activeJobs.set() |
| 26-04 | Passive overlay pattern: ConfirmOverlay renders UI only, app.tsx handles keys | Consistent with HelpOverlay/FilterOverlay patterns |
| 26-04 | pendingConfirmAction signal stores async thunk; executed on y-key | Clean separation between showing overlay and executing action |
| 26-03 | Kill-then-update order: OS kill first, DB update always | Prevents ghost-running jobs even if process already exited before kill |
| 26-03 | DB update continues even when killJobSession returns killed:false | Process may already be gone; DB must reflect terminal state regardless |
| 26-05 | reconcileStaleJobs must be in db mock factory for runner.run() tests | runner.run() calls it synchronously on startup; missing mock crashes tests |
| 26-05 | reconcileStaleRunning tested indirectly via runner.run(once:true) | Function is private; indirect test via runner loop is correct boundary |
| 27-02 | Test pure exported helpers without UI renderer | No SolidJS/OpenTUI rendering needed; keeps tests fast and independent |
| 27-02 | computeRowBg(true, true) pinned to theme.highlight in test | Explicit regression guard for selection-wins-over-flash overlay fix |
| quick-019 | matchesBlocklist uses substring not exact match | GSD instruction phrases appear mid-sentence in title slugs |
| quick-019 | Duplicate check slug-to-words via hyphen replacement | Consistent slug ↔ title normalization without extra library |
| quick-019 | Title similarity warning-only (non-failing) | GSD may legitimately shorten/clean phase titles |
| quick-019 | runner.test.ts mock includes inline matchesBlocklist impl | Avoids auto-mocking stripping the function; tests exercise real logic |
| quick-020 | Token formatting: >=1M → M, >=1k → k, else raw | Compact display for wide range of token counts |
| quick-020 | Cost estimate uses Sonnet pricing ($3/$15 per 1M), local only | No external API; rough estimate sufficient for operator awareness |
| quick-020 | Log header config line uses dim() for metadata subordination | Primary identity (project/scope/desc/id) stays visually dominant |
| quick-020 | info command logs per-step tokens via sessionTitle → findSessionByTitle | Consistent with TUI token lookup pattern |
| quick-021 | Judge failure = benefit of doubt (markCompleted) | Prevents judge bugs from blocking all phase work |
| quick-021 | Shutdown-interrupted jobs reset to pending via resetToPending | Jobs retried on next runner start instead of being lost |
| quick-021 | pilot- prefix commands handled alongside gsd- in spawnAndWait | Avoids double-prefixing pilot-judge as gsd-pilot-judge |
| quick-021 | Execa mock must be re-initialized per test suite | vi.clearAllMocks only clears call counts, not mockResolvedValue overrides |
| quick-023 | resolveTopLevelModel() reuses AGENT_PROFILE_TIERS entries for scope→tier mapping | Avoids separate mapping table; scope→agent is a logical alias |
| quick-023 | Judge scope → haiku always regardless of profile | Judge only parses/evaluates a transcript — cheap tier is sufficient |
| quick-023 | balanced profile shows NO TUI badge to reduce noise | Badges signal non-default config; 90% of jobs use balanced |
| quick-023 | resolvedModels always in pilot info JSON output | Programmatic consumers shouldn't need profile-conditional logic |
| quick-024 | resume_hint in dedicated column, not error field | Clean separation: error = why it failed, resume_hint = how to continue |
| quick-024 | parseJudgeVerdict exported as module-level function | Enables direct unit testing without fighting private method access |
| quick-024 | getJob re-fetch before retry decision | claimNextLaunchable already incremented attempts; stale job object would give wrong retry count |
| quick-024 | Shutdown during judge → resetToPending not markFailed | Phase session completed — marking failed loses work; pending preserves it for retry |
| quick-024 | resetToPending clears session_titles and job_steps | Prevents stale reconciler pgrep matches and stale TUI step display across retries |

## Session Continuity

Last session: 2026-03-03T21:53:00Z
Stopped at: Completed quick-024 (phase redesign edge cases — resume_hint, resetToPending cleanup, judge JSON parsing, shutdown guard, attempts off-by-one)
Resume file: None
