---
status: complete
phase: 02-cli-commands
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md
started: 2026-02-20T16:38:00Z
updated: 2026-02-20T16:46:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TypeScript Compilation
expected: `tsc --noEmit` passes with zero errors
result: pass

### 2. Test Suite
expected: All unit and integration tests pass
result: pass
notes: 200/200 tests pass across 9 test files (config, queue-parser, sessions, stuck, projects, output, format, status commands, queue commands)

### 3. pilot --help (Grouped Command Listing)
expected: Usage banner, options section, then 6 grouped sections (Monitoring, Setup, Queue Management, Project Lifecycle, Project Management, Dashboard) matching spec format exactly
result: pass
notes: Output matches spec character-for-character. Groups: Monitoring (7 cmds), Setup (3), Queue Management (4), Project Lifecycle (7), Project Management (6), Dashboard (1)

### 4. pilot --version
expected: Prints "0.1.0" and exits 0
result: pass

### 5. pilot status (Default Command)
expected: Dashboard with "N running  N stuck  N queued" summary, Running/Queued/Completed sections
result: issue
reported: "status command takes ~30s because scanPidFiles picks up gsd-queue-pid (the queue runner PID) and computeStuckScore does CPU sampling (3x10s). The queue runner PID should be excluded from session scanning."
severity: major

### 6. pilot (No Args = Default Status)
expected: Same output as `pilot status`
result: pass
notes: Correctly dispatches to status command

### 7. pilot s (Status Alias)
expected: Same as `pilot status`
result: pass

### 8. pilot status --json
expected: Valid PilotStatusJson with timestamp, summary, sessions (running/stuck/suspect), queue, completed, runner fields
result: pass
notes: JSON structure matches spec schema exactly. Has timestamp, summary counts, session arrays, queue items, runner status. The "queue" session appearing as stuck is the same issue as test 5.

### 9. pilot status -v (Verbose)
expected: Table with PID, SESSION, RUNTIME, LOG IDLE, SCORE columns
result: pass
notes: Table renders correctly with proper formatting

### 10. pilot queue
expected: Grouped display showing In Progress/Queued/Done/Failed sections with correct icons
result: pass
notes: Shows "In Progress" with ⟳ icon, "1 active item(s)" footer. Matches spec format.

### 11. pilot queue --json
expected: JSON with timestamp, queue array (each: status, project, mode, args, description, line_num), active_count
result: pass
notes: All fields present and correctly typed

### 12. pilot q (Queue Alias)
expected: Same as `pilot queue`
result: pass

### 13. pilot stuck
expected: Table with PID, SESSION, RUNTIME, LOG IDLE, SCORE headers. Stuck/Suspect sections.
result: pass
notes: Output format matches spec exactly. Shows "Stuck Processes (threshold: 90m)" header with separator.

### 14. pilot stuck --json
expected: JSON with timestamp, threshold_minutes, stuck array, suspect array; each entry has pid, session, runtime_seconds, log_staleness_seconds, score, verdict, signals
result: pass
notes: All fields present. Signals include name, points, detail as specified.

### 15. pilot config
expected: Configuration table showing all PILOT_* env vars, NO_COLOR, and claude binary detection
result: pass
notes: Shows all 6 env vars with resolved values plus claude binary path with "(found)" status

### 16. pilot config --json
expected: JSON with timestamp, config object, claude_binary object
result: pass
notes: config has all 6 keys, claude_binary has found (bool) and path

### 17. pilot log <nonexistent>
expected: "Session not found: nonexistent-session" on stderr, exit code 1
result: pass

### 18. pilot tail <nonexistent>
expected: "Log file not found: /tmp/gsd-nonexistent-session.log", exit code 1
result: pass

### 19. pilot projects
expected: Borderless table with PROJECT, BRANCH, GIT, STATE, PROGRESS columns. Progress bar + percentage.
result: issue
reported: "Progress percentage overflows past 100% for some projects — pet-portraits shows 1100%, real-estate-staging shows 120%. The progress bar visually caps at 100% but the text label shows the raw unclamped value."
severity: minor

### 20. pilot projects --json
expected: JSON with timestamp, projects array (each: name, path, branch, gitState, planningState, progress, etc.)
result: issue
reported: "Same overflow — progress field contains 1100 for pet-portraits, 120 for real-estate-staging. Should be capped at 100."
severity: minor

### 21. pilot p (Projects Alias)
expected: Same as `pilot projects`
result: pass

### 22. pilot progress pilot
expected: Per-phase breakdown with status icons, overall progress bar, current phase, next action, blockers
result: pass
notes: Shows "50% (2/4 phases)", correct phase statuses, "Next action: plan phase 3", "Blockers: none"

### 23. pilot progress (Auto-Detect CWD)
expected: Detect project from cwd (walk up to find .planning/), show progress for that project
result: pass
notes: Correctly detects "pilot" project from cwd

### 24. pilot progress --json pilot
expected: JSON with progress object containing overall, phases array, currentPhase, nextAction, blockers
result: pass

### 25. pilot pg (Progress Alias)
expected: Same as `pilot progress`
result: pass

### 26. pilot setup <dir>
expected: Creates .claude/ with 3 symlinks (command→commands, agents, get-shit-done), claude.json, .gitignore, git init. Reports each with ✓ prefix.
result: pass
notes: All artifacts created correctly. Symlinks point to correct targets in pilot-gsd.

### 27. pilot setup <existing-dir> (Idempotency)
expected: Skips existing artifacts with ○ prefix, doesn't overwrite claude.json
result: pass
notes: "Skipped" messages for all 6 artifacts. claude.json not overwritten.

### 28. pilot setup --json <dir>
expected: JSON with timestamp, dir, created array, skipped array, errors array
result: pass

### 29. pilot update
expected: Runs git pull in PILOT_GSD_DIR, reports result
result: pass
notes: Command works correctly. In test environment, git pull fails due to no upstream tracking (environment issue, not code bug). Error message is clear.

### 30. Exit Code 2 — Unknown Command
expected: "error: too many arguments..." on stderr, exit code 2
result: pass

### 31. Exit Code 2 — Missing Required Argument
expected: "error: missing required argument 'session'" on stderr, exit code 2
result: pass

### 32. Exit Code 1 — Runtime Error
expected: Error message on stderr, exit code 1
result: pass
notes: Tested with `pilot log nonexistent` and `pilot tail nonexistent`

### 33. Stub Commands (Phase 2/3 Not-Yet-Implemented)
expected: "Error: <command> command not yet implemented", exit code 1
result: pass
notes: Tested run, add, build, tui — all return correct message and exit 1

### 34. NO_COLOR Support
expected: No ANSI escape codes in output when NO_COLOR=1
result: pass
notes: Verified with `cat -v` — no escape sequences, only Unicode characters for UI elements

### 35. --json Suppresses Human Output
expected: Only JSON on stdout when --json flag set, no color codes, no spinners
result: pass
notes: process.stdout.write used (not console.log), human output suppressed via isJsonMode()

## Summary

total: 35
passed: 32
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "status command completes in reasonable time (<5s) without long-running CPU sampling"
  status: failed
  reason: "scanPidFiles picks up gsd-queue-pid as session 'queue', triggering computeStuckScore's 30s CPU sampling. The queue runner PID is infrastructure, not a session."
  severity: major
  test: 5
  root_cause: "scanPidFiles() in core/process.ts does not exclude the special gsd-queue-pid file. The status command then calls computeStuckScore on every PID from scanPidFiles, including the queue runner."
  artifacts:
    - path: "src/core/process.ts"
      issue: "scanPidFiles() includes gsd-queue-pid in results — should filter it out or provide a mechanism to exclude the queue runner PID"
    - path: "src/commands/status.ts"
      issue: "Iterates all PID entries through computeStuckScore without filtering queue runner"
  missing:
    - "Filter gsd-queue-pid from scanPidFiles results (e.g., skip when session === 'queue')"
    - "Or: add excludeQueue parameter to scanPidFiles"
  debug_session: ""

- truth: "Project progress percentage is always between 0-100%"
  status: failed
  reason: "pet-portraits shows progress: 1100, real-estate-staging shows progress: 120 in JSON and human output"
  severity: minor
  test: 19
  root_cause: "detectPlanningState() in core/projects.ts counts donePhases from phase directories (SUMMARY files >= PLAN files) but totalPhases from ROADMAP.md (### Phase N: lines). When a project has more phase directories than ROADMAP entries, the percentage exceeds 100%."
  artifacts:
    - path: "src/core/projects.ts"
      issue: "Line 110: percent = Math.round((donePhases / totalPhases) * 100) is not clamped to 100"
  missing:
    - "Clamp percent to Math.min(100, Math.round(...))"
    - "Or: ensure donePhases never exceeds totalPhases"
  debug_session: ""

- truth: "Project progress JSON shows percentage capped at 100"
  status: failed
  reason: "Same root cause as test 19 — progress field in JSON is unclamped"
  severity: minor
  test: 20
  root_cause: "Same as test 19 — detectPlanningState returns unclamped percentage"
  artifacts:
    - path: "src/core/projects.ts"
      issue: "Same as test 19"
  missing:
    - "Same fix as test 19"
  debug_session: ""
