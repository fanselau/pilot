---
status: complete
phase: 05-integration-fixes
source: 05-01-PLAN.md, 05-02-PLAN.md, 05-03-PLAN.md, 05-04-PLAN.md
started: 2026-02-20T20:20:00Z
updated: 2026-02-20T20:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Setup Creates .opencode/ Directory (Not .claude/)
expected: `pilot setup /tmp/test` creates `.opencode/` with symlinks to pilot-gsd
result: issue
reported: "Setup creates `.claude/` directory instead of `.opencode/`. Running `pilot setup /tmp/pilot-uat-test` outputs: '✓ Created .claude/command/ → .../pilot-gsd/commands' etc. The `.opencode/` directory does not exist. Confirmed by `ls -la /tmp/pilot-uat-test/.opencode/` → 'No such file or directory'"
severity: blocker

### 2. Setup Creates opencode.json (Not claude.json)
expected: `pilot setup` creates `opencode.json` with correct permission format matching spawn.ts validateConfig
result: issue
reported: "Setup creates `claude.json` (not `opencode.json`) with wrong format: `{\"permissions\": {\"allow\": [\"**\"]}}`. The spawn.ts validateConfig expects `{\"permission\": {\"read\": {\"**\": \"allow\"}, ...}}` — note: singular 'permission' not 'permissions', and sub-objects per type not an allow array. opencode.json does not exist. This means any project set up by pilot will FAIL pre-spawn validation."
severity: blocker

### 3. Setup .gitignore Uses Correct Directory Name
expected: `.gitignore` contains `.opencode/` entry
result: issue
reported: ".gitignore contains `.claude/` instead of `.opencode/`. The entry added is '.claude/' which would not ignore the correct directory if the fix to use .opencode/ is applied."
severity: major

### 4. Setup Warns On Real Directories (Not Symlinks) in .opencode/
expected: If `.opencode/command/` is a real directory (not a symlink), warn instead of overwriting
result: issue
reported: "No real-directory detection exists in setup.ts. The exists() check (line 103) treats both symlinks and real directories the same — it just checks existence. No lstat() call to differentiate symlinks from real directories. The result.skipped message says 'already exists' without distinguishing type."
severity: major

### 5. Status Returns In <5s With Running Processes
expected: `pilot status` completes in <5s even with running PIDs (no 30s CPU sampling hang)
result: issue
reported: "src/commands/status.ts line 68 calls `computeStuckScore()` which invokes `sampleCpu(pid, 3, 10_000)` — 3 samples × 10 seconds = 30 seconds per process. No `computeStuckScoreFast` function exists in stuck.ts. With 3 running processes, status would hang for ~90 seconds."
severity: blocker

### 6. Status Excludes Queue Runner PID From Stuck Scoring
expected: Queue runner PID is detected and excluded from the stuck detection loop
result: issue
reported: "src/commands/status.ts detects runnerPid at line 92 but does NOT filter pidEntries before the stuck detection loop at lines 66-73. All PIDs including the queue runner are scored for stuckness. No `scorablePidEntries` filter exists."
severity: major

### 7. CPU Sampling Has Timeout Cap
expected: sampleCpu has an optional timeout parameter (max 3s total) so stuck scoring doesn't hang indefinitely
result: issue
reported: "sampleCpu signature at stuck.ts line 190 is `sampleCpu(pid, count, intervalMs)` — no timeoutMs parameter. computeStuckScore at line 355 calls `sampleCpu(pid, 3, 10_000)` without any timeout. Each process can block for 30+ seconds."
severity: major

### 8. run-command Mode Extracts Command From Args Correctly
expected: For queue entry `project | run-command | quick fix navbar`, spawn receives command='quick' args='fix navbar'
result: pass
reported: "Fixed in commit d1bbb56. runner.ts lines 373-374 correctly split: `entry.args.split(' ')[0]` for command, `entry.args.split(' ').slice(1).join(' ')` for args. However, NO TEST EXISTS for this fix — needs regression test."

### 9. Runner --once Waits For Launched Jobs To Complete
expected: With `--once`, runner launches all launchable entries, then waits for them all to complete before exiting
result: issue
reported: "runner.ts mainLoop has dead code at lines 171-175 (`if (this.opts.once && entry === null)` can never fire — when entry is null, the else branch at line 159 handles it). The wait-for-all block at line 182 IS gated on --once which is correct. However, the flow is fragile: for --once with a single entry, after launch (entry !== null), next scan returns null → enters else branch → if activeJobs > 0, waitForAnyCompletion() → job finishes → rescans → entry null, activeJobs 0 → breaks → wait-for-all block is no-op. This works but only accidentally; the dead code suggests the logic was intended differently."
severity: minor

### 10. Update Uses Explicit Remote/Branch
expected: `pilot update` uses `git pull origin <branch>` instead of bare `git pull`
result: issue
reported: "src/commands/update.ts line 35 uses `execa('git', ['pull'], ...)` — bare git pull without specifying remote or branch. This fails when branch has no upstream tracking set (fresh clones)."
severity: major

### 11. Update Sets Upstream Tracking
expected: `pilot update` attempts to set upstream tracking before pulling
result: issue
reported: "No upstream tracking logic exists in update.ts. The command goes directly to `git pull` without any `git branch --set-upstream-to` attempt."
severity: major

### 12. Regression Test: Setup Creates .opencode/ Symlinks
expected: test/core/setup.test.ts exists with tests verifying .opencode/ directory and symlinks
result: issue
reported: "test/core/setup.test.ts does not exist. No test coverage for setup behavior."
severity: major

### 13. Regression Test: run-command Spawns Correct Command
expected: test/core/runner.test.ts exists with tests for run-command arg extraction
result: issue
reported: "test/core/runner.test.ts does not exist. The d1bbb56 fix has zero test coverage."
severity: major

### 14. Regression Test: Status Skips Queue Runner PID
expected: test/commands/status.test.ts has test verifying runner PID exclusion
result: issue
reported: "No test for runner PID exclusion in status.test.ts. The existing 5 tests don't cover this scenario."
severity: major

### 15. Regression Test: --once Waits For Job Completion
expected: test/core/runner.test.ts has test verifying --once waits
result: issue
reported: "test/core/runner.test.ts does not exist. No test for --once behavior."
severity: major

## Summary

total: 15
passed: 1
issues: 14
pending: 0
skipped: 0

## Gaps

- truth: "Setup creates .opencode/ directory with symlinks"
  status: failed
  reason: "Setup creates .claude/ directory instead of .opencode/. All references in src/core/setup.ts use '.claude' — variable name claudeDir, path '.claude/', result messages."
  severity: blocker
  test: 1
  root_cause: "src/core/setup.ts line 77: `const claudeDir = path.join(absDir, '.claude')`. All symlink paths and messages reference .claude instead of .opencode."
  artifacts:
    - path: "src/core/setup.ts"
      issue: "All directory references use .claude instead of .opencode (lines 77, 94, 104, 110)"
  missing:
    - "Rename all .claude references to .opencode in setup.ts"
  debug_session: ""

- truth: "Setup creates opencode.json with correct permission format"
  status: failed
  reason: "Creates claude.json with {permissions: {allow: ['**']}} instead of opencode.json with {permission: {read: {'**': 'allow'}, ...}}"
  severity: blocker
  test: 2
  root_cause: "src/core/setup.ts lines 118-133: creates 'claude.json' with wrong schema. spawn.ts validateConfig expects 'permission' (singular) with sub-objects per type."
  artifacts:
    - path: "src/core/setup.ts"
      issue: "Wrong filename (claude.json) and wrong config format (permissions.allow vs permission.read/write/edit/bash/external_directory)"
    - path: "src/core/spawn.ts"
      issue: "Reference — validateConfig expects permission.{read,write,edit,bash,external_directory}['**'] = 'allow'"
  missing:
    - "Change filename to opencode.json"
    - "Change config to {permission: {read: {'**': 'allow'}, write: {'**': 'allow'}, edit: {'**': 'allow'}, bash: {'**': 'allow'}, external_directory: {'**': 'allow'}}}"
  debug_session: ""

- truth: ".gitignore contains .opencode/ entry"
  status: failed
  reason: ".gitignore adds .claude/ instead of .opencode/"
  severity: major
  test: 3
  root_cause: "src/core/setup.ts lines 137-151: all .gitignore logic references '.claude/' instead of '.opencode/'"
  artifacts:
    - path: "src/core/setup.ts"
      issue: "Lines 141, 143, 144, 149 reference .claude/ in gitignore"
  missing:
    - "Update .gitignore handling to use .opencode/"
  debug_session: ""

- truth: "Setup warns on real directories (not symlinks)"
  status: failed
  reason: "No lstat() check to distinguish symlinks from real directories"
  severity: major
  test: 4
  root_cause: "src/core/setup.ts line 103: uses exists() which returns true for both symlinks and real directories. No lstat().isSymbolicLink() check."
  artifacts:
    - path: "src/core/setup.ts"
      issue: "Missing lstat check to detect real directories vs symlinks"
  missing:
    - "Add lstat() check: if exists AND not symlink, warn about real directory"
  debug_session: ""

- truth: "pilot status returns in <5s with running processes"
  status: failed
  reason: "Uses computeStuckScore with 30s CPU sampling per process"
  severity: blocker
  test: 5
  root_cause: "src/commands/status.ts line 68 calls computeStuckScore() which calls sampleCpu(pid, 3, 10_000). No computeStuckScoreFast exists."
  artifacts:
    - path: "src/commands/status.ts"
      issue: "Line 13 imports computeStuckScore, line 68 calls it"
    - path: "src/core/stuck.ts"
      issue: "No computeStuckScoreFast export, no timeout on sampleCpu"
  missing:
    - "Add computeStuckScoreFast to stuck.ts (skip CPU sampling)"
    - "Update status.ts to use computeStuckScoreFast"
  debug_session: ""

- truth: "Queue runner PID excluded from stuck scoring in status"
  status: failed
  reason: "runnerPid detected but not used to filter pidEntries before stuck loop"
  severity: major
  test: 6
  root_cause: "src/commands/status.ts: runner PID check (lines 85-98) happens AFTER stuck scoring loop (lines 65-73). Even if reordered, no filter logic exists."
  artifacts:
    - path: "src/commands/status.ts"
      issue: "No scorablePidEntries filter, runner PID check after stuck loop"
  missing:
    - "Move runner PID detection before stuck scoring"
    - "Add scorablePidEntries = pidEntries.filter(e => e.pid !== runnerPid)"
  debug_session: ""

- truth: "sampleCpu has timeout cap"
  status: failed
  reason: "No timeoutMs parameter on sampleCpu"
  severity: major
  test: 7
  root_cause: "src/core/stuck.ts line 190: sampleCpu(pid, count, intervalMs) has no timeout parameter"
  artifacts:
    - path: "src/core/stuck.ts"
      issue: "sampleCpu signature missing timeoutMs, computeStuckScore calls without timeout"
  missing:
    - "Add optional timeoutMs parameter to sampleCpu"
    - "Pass 3000 timeout from computeStuckScore"
  debug_session: ""

- truth: "pilot update uses explicit remote/branch"
  status: failed
  reason: "Uses bare git pull"
  severity: major
  test: 10
  root_cause: "src/commands/update.ts line 35: `execa('git', ['pull'], ...)` — no origin or branch specified"
  artifacts:
    - path: "src/commands/update.ts"
      issue: "Line 35 uses bare git pull"
  missing:
    - "Detect current branch, use git pull origin <branch>"
  debug_session: ""

- truth: "pilot update sets upstream tracking"
  status: failed
  reason: "No upstream tracking logic in update.ts"
  severity: major
  test: 11
  root_cause: "src/commands/update.ts: goes straight to git pull without any branch --set-upstream-to"
  artifacts:
    - path: "src/commands/update.ts"
      issue: "No upstream tracking setup attempt"
  missing:
    - "Add best-effort git branch --set-upstream-to before pull"
  debug_session: ""

- truth: "test/core/setup.test.ts verifies .opencode/ symlinks and config"
  status: failed
  reason: "File does not exist"
  severity: major
  test: 12
  root_cause: "Phase 5 Plan 04 not yet executed"
  artifacts: []
  missing:
    - "Create test/core/setup.test.ts with integration tests"
  debug_session: ""

- truth: "test/core/runner.test.ts verifies run-command and --once"
  status: failed
  reason: "File does not exist"
  severity: major
  test: 13, 15
  root_cause: "Phase 5 Plan 04 not yet executed"
  artifacts: []
  missing:
    - "Create test/core/runner.test.ts with unit tests"
  debug_session: ""

- truth: "test/commands/status.test.ts verifies runner PID exclusion"
  status: failed
  reason: "No test for runner PID exclusion"
  severity: major
  test: 14
  root_cause: "Phase 5 Plan 04 not yet executed"
  artifacts: []
  missing:
    - "Add runner PID exclusion test to status.test.ts"
  debug_session: ""
