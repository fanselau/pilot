---
status: complete
phase: 03-queue-runner-lifecycle
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md
started: 2026-02-20T17:40:00Z
updated: 2026-02-20T17:43:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TypeScript Compilation
expected: `tsc --noEmit` passes with zero errors
result: pass

### 2. Test Suite
expected: All tests pass (200/200)
result: pass

### 3. Build Output
expected: `tsc` produces dist/ with all Phase 3 files, shebang line in index.js
result: pass

### 4. Core Files Exist
expected: runner.ts, lifecycle.ts, spawn.ts, phase-state.ts, lock.ts, postmortem.ts all exist in src/core/
result: pass

### 5. Phase 3 Types in types.ts
expected: SpawnOptions, SpawnResult, PhaseState, RunnerJob, RunnerOptions exported
result: pass

### 6. Help Output — Grouped Commands
expected: `pilot --help` shows grouped command listing matching spec format with Queue Management, Project Lifecycle, Project Management sections
result: pass

### 7. Version Output
expected: `pilot --version` shows "0.1.0"
result: pass

### 8. pilot run --help
expected: Shows --max-parallel, --max-retries, --once, --dry-run, --force options
result: pass

### 9. pilot stop — No Runner
expected: "Runner not running" message, exit 0
result: pass

### 10. pilot stop --json — No Runner
expected: JSON output with status "not_running" and timestamp
result: pass

### 11. pilot add — Invalid Mode
expected: Error message listing valid modes, exit code 2
result: pass

### 12. pilot add — Nonexistent Project
expected: Error "Project directory not found", exit code 1
result: pass

### 13. pilot add — Dry Run
expected: Shows what would be added without modifying QUEUE.md
result: pass

### 14. pilot add --dry-run --json
expected: JSON with action "dry-run", entry object, and line string
result: pass

### 15. pilot build --no-run --json
expected: Detects continue-all mode (project has .planning/), JSON with runner_started: false
result: pass

### 16. pilot build — Queue Append
expected: Appends entry to QUEUE.md with correct format
result: pass

### 17. pilot run --dry-run --json
expected: JSON with action "dry-run", empty entries array (no launchable entries)
result: pass

### 18. pilot run --dry-run
expected: Human output shows "Scanning queue...", "Queue empty", PID display, config display
result: pass

### 19. pilot plan — Nonexistent Project
expected: Error "Project directory not found", exit code 1
result: pass

### 20. pilot plan — Real Project Spawn
expected: Spawns opencode with gsd-plan-phase, correct title, stdio inherit
result: pass

### 21. pilot execute — Real Project Spawn
expected: Spawns opencode with gsd-execute-phase, correct title, stdio inherit
result: pass

### 22. pilot milestone — Invalid Subcommand
expected: Error listing valid subcommands (new, complete, audit, gaps), exit code 2
result: pass

### 23. pilot config --json
expected: JSON with config values, claude_binary found, timestamp
result: pass

### 24. Unknown Command — Exit Code
expected: Exit code 2 (usage error)
result: pass

### 25. Missing Required Argument — Exit Code
expected: "missing required argument" message, exit code 2
result: pass

### 26. Core Module: lock.ts
expected: withQueueLock uses proper-lockfile with 30s stale, 5 retries
result: pass

### 27. Core Module: postmortem.ts
expected: logPostmortem appends JSONL to pilot-job-history.jsonl with correct schema
result: pass

### 28. Core Module: spawn.ts — Pre-spawn Checks
expected: All 5 checks implemented: git gc disable, memory check, config validation, binary check, title truncation
result: pass

### 29. Core Module: spawn.ts — Snapshot Global Repo
expected: disableSnapshotGc handles both `snapshot/*/` repos AND `snapshot/global` explicitly
result: pass

### 30. Core Module: spawn.ts — Config Validation
expected: Checks permission (singular, not permissions), instructions must be array not string
result: pass

### 31. Core Module: spawn.ts — Binary Resolution
expected: Checks opencode/claude in PATH then default install locations, caches result
result: pass

### 32. Core Module: phase-state.ts — STATE File Priority
expected: Reads STATE file first, maps to PhaseState, falls back to inference
result: pass

### 33. Core Module: phase-state.ts — Inference Chain
expected: UAT check -> plan count -> git commits, correct state returned for each
result: pass

### 34. Core Module: runner.ts — State Machine
expected: mainLoop with scan->launch->reap cycle, EventEmitter events
result: pass

### 35. Core Module: runner.ts — Same-Project Sequential
expected: runningProjects Set prevents launching same-project entries
result: pass

### 36. Core Module: runner.ts — Dependency Check
expected: dependsOn entries checked against doneProjects Set
result: pass

### 37. Core Module: runner.ts — Lifecycle Mode Dispatch
expected: LIFECYCLE_MODES Set routes build-full/continue/continue-all/build-to-phase/add-and-build to launchLifecycleMode
result: pass

### 38. Core Module: runner.ts — Direct Spawn Dispatch
expected: run-command mode falls through to launchDirectSpawn with spawnSession
result: pass

### 39. Core Module: runner.ts — Synthetic PIDs
expected: Lifecycle modes tracked with negative PIDs, reap/shutdown/waitForAnyCompletion handle both positive and negative PIDs
result: pass

### 40. Core Module: runner.ts — Success Detection
expected: New commits OR .planning changes OR exit 0. NOT >= 8 messages heuristic.
result: pass

### 41. Core Module: runner.ts — Graceful Shutdown
expected: SIGTERM -> 15s wait -> SIGKILL via tree-kill, mark entries back to pending, cleanup PIDs
result: pass

### 42. Core Module: runner.ts — markEntryPending
expected: Helper strips status prefix from ## header line for retry flow
result: pass

### 43. Core Module: lifecycle.ts — build-full Rejection
expected: Throws error if .planning/ already exists (hard requirement)
result: pass

### 44. Core Module: lifecycle.ts — All 6 Modes
expected: build-full, continue, continue-all, build-to-phase, add-and-build, run-command all implemented
result: pass

### 45. Core Module: lifecycle.ts — Phase Cycle
expected: While loop with state switch: needs-plan->plan, needs-execute->execute, needs-verify->verify, needs-gaps->gap closure
result: pass

### 46. Core Module: lifecycle.ts — Gap Closure
expected: Max 3 cycles, renames stale UAT, runs plan --gaps + execute --gaps-only + verify
result: pass

### 47. Core Module: lifecycle.ts — spawnAndWait
expected: Synchronous (non-detached) execa with reject:false, uses resolved binary
result: pass

### 48. Commands: All 13 Lifecycle Wrappers Wired
expected: plan, execute, verify, quick, debug, scope, insert, remove, research, milestone, todos, map, init all registered in index.ts
result: pass

### 49. Commands: scope --build Wired
expected: scope.ts with --build flag adds to queue and starts runner
result: pass

### 50. Commands: init Creates Project Dir + Setup
expected: mkdir, setupProject call, gsd-new-project spawn with --auto flag
result: pass

## Summary

total: 50
passed: 50
issues: 0
pending: 0
skipped: 0

## Gaps

(none)
