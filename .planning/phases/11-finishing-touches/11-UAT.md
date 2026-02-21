---
status: complete
phase: 11-finishing-touches
source: 11-01-PLAN.md, 11-02-PLAN.md, 11-03-PLAN.md, 11-04-PLAN.md
started: 2026-02-21T00:00:00Z
updated: 2026-02-21T00:03:00Z
---

## Current Test

[testing complete]

## Tests

### 1. `pilot doctor` command exists
expected: Command `pilot doctor` is recognized and runs health checks
result: issue
reported: "Command not recognized — 'error: too many arguments. Expected 0 arguments but got 1.' Exit code 2. The `doctor` command does not exist; commander interprets 'doctor' as an argument to the default command."
severity: blocker

### 2. `pilot doctor --json` outputs check results
expected: JSON output with timestamp and checks array for 9 health checks
result: issue
reported: "Command not found — same error as test 1. No JSON output produced."
severity: blocker

### 3. `pilot doctor --fix` auto-fixes issues
expected: Fixable issues (stale PIDs, zombies, gc.auto) auto-repaired and reported
result: issue
reported: "'error: unknown option --fix' — command does not exist, so --fix flag is also absent"
severity: blocker

### 4. Core doctor module exists (src/core/doctor.ts)
expected: File src/core/doctor.ts exists with runDoctor, DoctorResult, DoctorCheck exports
result: issue
reported: "File does not exist. `ls src/core/doctor.ts` returns 'No such file or directory'"
severity: blocker

### 5. Doctor tests exist (test/core/doctor.test.ts)
expected: Test file with tests for all 9 health checks
result: issue
reported: "File does not exist. No tests for doctor module."
severity: blocker

### 6. Notification module exists (src/core/notifications.ts)
expected: File exists with loadNotificationConfig, sendNotification, NotificationConfig exports
result: issue
reported: "File does not exist. `ls src/core/notifications.ts` returns 'No such file or directory'"
severity: blocker

### 7. Runner log module exists (src/core/runner-log.ts)
expected: File exists with createRunnerLogger, getRunnerLogPath, rotateRunnerLogs exports
result: issue
reported: "File does not exist. `ls src/core/runner-log.ts` returns 'No such file or directory'"
severity: blocker

### 8. `pilot log runner` shows runner log
expected: When session arg is "runner", display runner log from ~/.pilot/logs/
result: issue
reported: "'Error: Session not found: runner' — log command does not have runner special-case. Falls through to fuzzy session search and fails."
severity: major

### 9. `pilot tail runner` follows runner log
expected: When session arg is "runner", tail the runner log file
result: issue
reported: "Not tested directly, but since runner-log.ts doesn't exist and tail.ts has no runner handling, this is missing."
severity: major

### 10. `pilot run --notify` flag exists
expected: --notify flag appears in `pilot run --help`
result: issue
reported: "--notify not shown in run --help output. Only shows: --max-parallel, --max-retries, --once, --dry-run, --force"
severity: major

### 11. `pilot run --quiet` flag exists
expected: --quiet flag appears in `pilot run --help`
result: issue
reported: "--quiet not shown in run --help output"
severity: major

### 12. Runner log rotation (keep 7 days)
expected: Old runner logs older than 7 days are cleaned up
result: issue
reported: "runner-log.ts does not exist — no log rotation implemented"
severity: major

### 13. Notification tests exist
expected: test/core/notifications.test.ts with webhook tests
result: issue
reported: "File does not exist"
severity: major

### 14. Runner log tests exist
expected: test/core/runner-log.test.ts with log writing and rotation tests
result: issue
reported: "File does not exist"
severity: major

### 15. `pilot cleanup` command exists
expected: Command recognized with --dry-run, --all, --keep-days flags
result: issue
reported: "'error: too many arguments' — cleanup command not registered in commander. Not recognized."
severity: blocker

### 16. `pilot cleanup --dry-run` shows what would be cleaned
expected: Dry-run output showing stale PIDs, old logs, orphans without removing
result: issue
reported: "'error: unknown option --dry-run' — command not found"
severity: blocker

### 17. `pilot cleanup --json` outputs structured result
expected: JSON with timestamp, dryRun, actions array
result: issue
reported: "Command not found"
severity: blocker

### 18. Core cleanup module exists (src/core/cleanup.ts)
expected: File exists with runCleanup, CleanupResult, CleanupOptions exports
result: issue
reported: "File does not exist"
severity: blocker

### 19. Cleanup tests exist (test/core/cleanup.test.ts)
expected: Tests for stale PID removal, old log detection, orphan detection
result: issue
reported: "File does not exist"
severity: blocker

### 20. `pilot setup --verify <dir>` validates existing setup
expected: --verify flag re-checks setup without modifying
result: issue
reported: "'error: unknown option --verify' — flag not added to setup command"
severity: major

### 21. Setup validates symlinks after creation
expected: After creating symlinks, verify they resolve
result: issue
reported: "Not testable — setup.ts doesn't have verifySetup function"
severity: major

### 22. `pilot run --no-tui` flag exists
expected: --no-tui flag appears in `pilot run --help`
result: issue
reported: "--no-tui not shown in run --help output"
severity: minor

### 23. Build output has executable permission
expected: dist/index.js has chmod +x (755 or 775)
result: issue
reported: "dist/index.js has permission 664 (not executable). No postbuild script to chmod +x."
severity: major

### 24. Build output has shebang
expected: First line of dist/index.js is #!/usr/bin/env node
result: pass

### 25. package.json has bin field
expected: "bin": { "pilot": "./dist/index.js" }
result: pass

### 26. Cross-project parallel build tests exist
expected: test/commands/parallel.test.ts verifies parallel execution
result: issue
reported: "File does not exist — no parallel build integration tests"
severity: major

### 27. TUI smoke test exists
expected: test/commands/tui-smoke.test.ts verifies TUI launch without crash
result: issue
reported: "File does not exist. Existing test/tui/ tests cover panel rendering but no dedicated smoke test."
severity: minor

### 28. TypeScript compiles cleanly
expected: `npx tsc --noEmit` passes with no errors
result: pass

### 29. All existing tests pass
expected: `npx vitest run` — all 337 tests pass
result: pass

### 30. Build succeeds
expected: `npm run build` produces dist/ with no errors
result: pass

### 31. Existing commands work (regression)
expected: status, queue, projects, progress, add, verify, config all functional
result: pass
note: "status --json times out (known Phase 5 issue). All other commands work correctly."

### 32. Doctor in help output grouped under Setup
expected: `pilot --help` shows doctor in Setup group
result: issue
reported: "doctor not shown in --help output — command not registered"
severity: major

### 33. Cleanup in help output grouped under Setup
expected: `pilot --help` shows cleanup in Setup group
result: issue
reported: "cleanup not shown in --help output — command not registered"
severity: major

## Summary

total: 33
passed: 5
issues: 28
pending: 0
skipped: 0

## Gaps

- truth: "`pilot doctor` validates entire setup and reports pass/fail for each check"
  status: failed
  reason: "Phase 11 Plan 01 has not been executed. No src/core/doctor.ts, src/commands/doctor.ts, or test/core/doctor.test.ts files exist. The doctor command is not registered in index.ts."
  severity: blocker
  test: 1, 2, 3, 4, 5, 32
  root_cause: "Plan 11-01 not executed — no SUMMARY.md exists, no code written"
  artifacts:
    - path: "src/core/doctor.ts"
      issue: "File does not exist"
    - path: "src/commands/doctor.ts"
      issue: "File does not exist"
    - path: "test/core/doctor.test.ts"
      issue: "File does not exist"
  missing:
    - "Execute Plan 11-01: core doctor module + command + tests"
  debug_session: ""

- truth: "Runner sends webhook POST on job complete/fail/stuck events and writes its own log"
  status: failed
  reason: "Phase 11 Plan 02 has not been executed. No src/core/notifications.ts, src/core/runner-log.ts exist. No --notify/--quiet flags on run command. No runner special-case in log/tail commands."
  severity: blocker
  test: 6, 7, 8, 9, 10, 11, 12, 13, 14
  root_cause: "Plan 11-02 not executed — no SUMMARY.md exists, no code written"
  artifacts:
    - path: "src/core/notifications.ts"
      issue: "File does not exist"
    - path: "src/core/runner-log.ts"
      issue: "File does not exist"
    - path: "test/core/notifications.test.ts"
      issue: "File does not exist"
    - path: "test/core/runner-log.test.ts"
      issue: "File does not exist"
  missing:
    - "Execute Plan 11-02: notifications module, runner log module, wire into run/log/tail"
  debug_session: ""

- truth: "`pilot cleanup` removes stale PIDs, old logs, and orphaned processes"
  status: failed
  reason: "Phase 11 Plan 03 has not been executed. No src/core/cleanup.ts, src/commands/cleanup.ts exist. No --verify flag on setup command."
  severity: blocker
  test: 15, 16, 17, 18, 19, 20, 21, 33
  root_cause: "Plan 11-03 not executed — no SUMMARY.md exists, no code written"
  artifacts:
    - path: "src/core/cleanup.ts"
      issue: "File does not exist"
    - path: "src/commands/cleanup.ts"
      issue: "File does not exist"
    - path: "test/core/cleanup.test.ts"
      issue: "File does not exist"
  missing:
    - "Execute Plan 11-03: cleanup module + command, setup --verify, tests"
  debug_session: ""

- truth: "Build output is ready for global install; parallel and TUI tests exist"
  status: failed
  reason: "Phase 11 Plan 04 has not been executed. dist/index.js not executable (664), no postbuild script, no --no-tui flag, no parallel.test.ts or tui-smoke.test.ts."
  severity: major
  test: 22, 23, 26, 27
  root_cause: "Plan 11-04 not executed — no SUMMARY.md exists, no code written"
  artifacts:
    - path: "test/commands/parallel.test.ts"
      issue: "File does not exist"
    - path: "test/commands/tui-smoke.test.ts"
      issue: "File does not exist"
    - path: "package.json"
      issue: "Missing postbuild script for chmod +x"
  missing:
    - "Execute Plan 11-04: postbuild chmod, --no-tui flag, parallel tests, TUI smoke test"
  debug_session: ""
