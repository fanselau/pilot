---
status: complete
phase: 12-critical-fixes-per-requirements-overnight-fixes-md
source: (no SUMMARY.md files — plans not executed)
started: 2026-02-21T02:34:00Z
updated: 2026-02-21T02:37:00Z
---

## Current Test

[testing complete]

## Tests

### 1. sessions.ts uses opencode binary (not claude)
expected: All execa calls use 'opencode' binary, not 'claude'
result: issue
reported: "sessions.ts line 35 calls execa('claude', ['session', 'list', '--format', 'json']) and line 91 calls execa('claude', ['export', sessionId]). Both should use 'opencode'."
severity: blocker

### 2. sessions.ts has 5-second timeout on subprocess calls
expected: All execa calls include { timeout: 5000 } option
result: issue
reported: "Neither execa call in sessions.ts has a timeout option. This causes `pilot status` and `pilot stuck` to hang indefinitely when the claude binary doesn't exist."
severity: blocker

### 3. SessionInfo.message_count is optional
expected: types.ts defines message_count as optional (message_count?: number)
result: issue
reported: "src/core/types.ts line 48 defines `message_count: number` (required, not optional). toSessionInfo() on line 157 rejects sessions without message_count."
severity: blocker

### 4. pilot status does not hang
expected: `pilot status --json` completes within 5 seconds
result: issue
reported: "`timeout 8 npx tsx src/index.ts status --json` exits with code 124 (killed by timeout). Command hangs because sessions.ts calls non-existent claude binary."
severity: blocker

### 5. pilot stuck does not hang
expected: `pilot stuck --json` completes within 5 seconds
result: issue
reported: "`timeout 8 npx tsx src/index.ts stuck --json` exits with code 124 (killed by timeout). Same root cause as status — calls claude binary."
severity: blocker

### 6. init.ts references .opencode/ not .claude/
expected: init.ts checks for .opencode/ directory existence
result: issue
reported: "src/commands/init.ts line 30 has `const claudeDir = path.join(projectDir, '.claude')`. Should be `.opencode`. Variable name is also `claudeDir`."
severity: major

### 7. spawn.ts has no claude binary fallbacks
expected: spawn.ts only checks for opencode binary, no claude.json fallback
result: issue
reported: "spawn.ts line 157 tries ['opencode.json', 'claude.json']. Line 234 tries ['opencode', 'claude']. Line 249 includes ~/.claude/bin/claude path. Lines 263-264 reference claude in error message."
severity: major

### 8. Progress never exceeds 100%
expected: Progress percentage capped at 100% for all projects
result: issue
reported: "`pilot projects --json` shows pet-portraits: 1100%, real-estate-staging: 120%. Neither progress.ts nor projects.ts uses Math.min(100, ...) to cap the value."
severity: major

### 9. config.ts uses opencode-first binary detection
expected: Config checks opencode binary first, JSON key is opencode_binary, human label shows opencode
result: issue
reported: "config.ts line 29 checks ~/.claude/bin/claude FIRST, then opencode. JSON output uses `claude_binary` key (line 82). Human output shows 'claude' label (line 111). Variable names are `claudeFound`/`claudePath`."
severity: major

### 10. setup.ts generates spec-correct opencode.json format
expected: Generated opencode.json uses `permission: { read: {"**": "allow"}, ... }` (singular, per-type)
result: issue
reported: "setup.ts lines 122-126 generate `{ permissions: { allow: ['**'] } }` — wrong in two ways: (1) uses 'permissions' plural instead of 'permission' singular, (2) uses flat allow array instead of per-type allow objects. Variable name still `claudeConfig`/`claudeJsonPath`."
severity: major

### 11. README.md exists
expected: README.md file exists with project description, quick start, commands, config, architecture sections
result: issue
reported: "README.md file does not exist."
severity: major

### 12. LICENSE file exists
expected: LICENSE file exists with MIT license text
result: issue
reported: "LICENSE file does not exist."
severity: minor

### 13. package.json has metadata fields
expected: package.json has description, keywords, repository, author, license fields
result: issue
reported: "package.json is missing all metadata fields: description=false, license=false, author=false, repository=false."
severity: major

### 14. Test suite passes
expected: All existing tests pass
result: pass

### 15. TypeScript compiles without errors
expected: `npx tsc --noEmit` succeeds
result: pass

### 16. pilot queue works correctly
expected: `pilot queue --json` returns queue data without hanging
result: pass

### 17. pilot config works correctly
expected: `pilot config --json` returns config data (functional, though naming is wrong per test 9)
result: pass

## Summary

total: 17
passed: 4
issues: 13
pending: 0
skipped: 0

## Gaps

- truth: "sessions.ts uses opencode binary for all subprocess calls"
  status: failed
  reason: "sessions.ts calls execa('claude', ...) on lines 35 and 91"
  severity: blocker
  test: 1
  root_cause: "Phase 12 Plan 01 not executed — sessions.ts still references claude binary"
  artifacts:
    - path: "src/core/sessions.ts"
      issue: "Lines 35, 91: execa('claude', ...) should be execa('opencode', ...)"
  missing:
    - "Replace 'claude' with 'opencode' in all execa calls"
    - "Add { timeout: 5000 } option to both execa calls"
  debug_session: ""

- truth: "All subprocess calls have 5-second timeout"
  status: failed
  reason: "No timeout option on execa calls — causes hanging commands"
  severity: blocker
  test: 2
  root_cause: "Phase 12 Plan 01 not executed"
  artifacts:
    - path: "src/core/sessions.ts"
      issue: "Lines 35, 91: missing { timeout: 5000 } option"
  missing:
    - "Add { timeout: 5000 } to execa call on line 35"
    - "Add { timeout: 5000 } to execa call on line 91"
  debug_session: ""

- truth: "SessionInfo.message_count is optional"
  status: failed
  reason: "message_count is required (number), not optional (number | undefined)"
  severity: blocker
  test: 3
  root_cause: "Phase 12 Plan 01 not executed — types.ts unchanged"
  artifacts:
    - path: "src/core/types.ts"
      issue: "Line 48: message_count: number should be message_count?: number"
    - path: "src/core/sessions.ts"
      issue: "Line 157: typeof obj.message_count !== 'number' rejects sessions without message_count"
  missing:
    - "Change message_count to optional in SessionInfo interface"
    - "Update toSessionInfo to accept sessions without message_count"
  debug_session: ""

- truth: "pilot status does not hang"
  status: failed
  reason: "Command hangs indefinitely — killed by 8-second timeout"
  severity: blocker
  test: 4
  root_cause: "sessions.ts calls non-existent 'claude' binary without timeout"
  artifacts:
    - path: "src/core/sessions.ts"
      issue: "Claude binary call with no timeout"
  missing:
    - "Fix binary name and add timeout (covered by gaps 1-3)"
  debug_session: ""

- truth: "pilot stuck does not hang"
  status: failed
  reason: "Command hangs indefinitely — killed by 8-second timeout"
  severity: blocker
  test: 5
  root_cause: "Same as pilot status — sessions.ts dependency"
  artifacts:
    - path: "src/core/sessions.ts"
      issue: "Claude binary call with no timeout"
  missing:
    - "Fix binary name and add timeout (covered by gaps 1-3)"
  debug_session: ""

- truth: "init.ts references .opencode/ not .claude/"
  status: failed
  reason: "Line 30 references .claude directory with claudeDir variable"
  severity: major
  test: 6
  root_cause: "Phase 12 Plan 02 not executed"
  artifacts:
    - path: "src/commands/init.ts"
      issue: "Line 30: const claudeDir = path.join(projectDir, '.claude')"
  missing:
    - "Change '.claude' to '.opencode'"
    - "Rename variable claudeDir to opencodeDir"
  debug_session: ""

- truth: "spawn.ts has no claude fallback paths"
  status: failed
  reason: "spawn.ts still tries claude binary and claude.json as fallbacks"
  severity: major
  test: 7
  root_cause: "Phase 12 Plan 02 not executed"
  artifacts:
    - path: "src/core/spawn.ts"
      issue: "Lines 157, 234, 249, 263-264: claude references remain"
  missing:
    - "Remove claude.json from config validation loop"
    - "Remove claude from binary check loop"
    - "Remove ~/.claude/bin/claude from candidate paths"
    - "Update error message"
  debug_session: ""

- truth: "Progress never exceeds 100%"
  status: failed
  reason: "pet-portraits: 1100%, real-estate-staging: 120%"
  severity: major
  test: 8
  root_cause: "Phase 12 Plan 02 not executed — no Math.min(100, ...) cap in progress.ts or projects.ts"
  artifacts:
    - path: "src/core/progress.ts"
      issue: "Line 155: Math.round((doneCount / totalPhases) * 100) without cap"
    - path: "src/core/projects.ts"
      issue: "Line 110: Math.round((donePhases / totalPhases) * 100) without cap"
  missing:
    - "Wrap both calculations with Math.min(100, ...)"
    - "Cap donePhases at totalPhases in projects.ts"
  debug_session: ""

- truth: "config.ts checks opencode first, uses opencode_binary JSON key"
  status: failed
  reason: "Checks claude first, uses claude_binary key, shows 'claude' label"
  severity: major
  test: 9
  root_cause: "Phase 12 Plan 02 not executed"
  artifacts:
    - path: "src/commands/config.ts"
      issue: "Lines 29-31: claude path checked first. Line 82: claude_binary JSON key. Line 111: 'claude' label."
  missing:
    - "Reorder candidate paths: opencode first"
    - "Rename variables: claudeFound/claudePath → binaryFound/binaryPath"
    - "Change JSON key to opencode_binary"
    - "Change human label to 'opencode'"
  debug_session: ""

- truth: "setup.ts generates spec-correct opencode.json with permission (singular) format"
  status: failed
  reason: "Generates { permissions: { allow: ['**'] } } instead of { permission: { read: {'**': 'allow'}, ... } }"
  severity: major
  test: 10
  root_cause: "Phase 12 Plan 02 not executed"
  artifacts:
    - path: "src/core/setup.ts"
      issue: "Lines 122-126: wrong permissions format. Lines 118, 122: claudeJsonPath/claudeConfig var names"
  missing:
    - "Change 'permissions' to 'permission' (singular)"
    - "Change flat allow array to per-type allow objects (read, write, edit, bash, external_directory)"
    - "Rename variables to configJsonPath/opencodeConfig"
  debug_session: ""

- truth: "README.md exists with required sections"
  status: failed
  reason: "README.md file does not exist"
  severity: major
  test: 11
  root_cause: "Phase 12 Plan 03 not executed"
  artifacts: []
  missing:
    - "Create README.md with description, quick start, commands, config, architecture, license sections"
  debug_session: ""

- truth: "LICENSE file exists with MIT license"
  status: failed
  reason: "LICENSE file does not exist"
  severity: minor
  test: 12
  root_cause: "Phase 12 Plan 03 not executed"
  artifacts: []
  missing:
    - "Create LICENSE file with MIT license text, 2026 PunchLab copyright"
  debug_session: ""

- truth: "package.json has metadata fields"
  status: failed
  reason: "Missing description, keywords, repository, author, license fields"
  severity: major
  test: 13
  root_cause: "Phase 12 Plan 03 not executed"
  artifacts:
    - path: "package.json"
      issue: "Missing description, keywords, repository, author, license fields"
  missing:
    - "Add description, keywords, repository, author, license fields to package.json"
  debug_session: ""
