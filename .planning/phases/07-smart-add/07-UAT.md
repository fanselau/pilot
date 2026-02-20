---
status: complete
phase: 07-smart-add
source: 07-03-SUMMARY.md, 07-04-SUMMARY.md
started: 2026-02-20T21:24:00Z
updated: 2026-02-20T21:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Core smart-add module exists with all exported functions
expected: src/core/smart-add.ts exports detectScope, detectProjectState, parseRequirementsFile, generateRequirementsContent, resolveInternalMode
result: pass
evidence: File exists at 316 lines. All 5 functions exported at L310-316. No UI deps (pure core module).

### 2. Smart-add test suite covers all scenarios
expected: test/core/smart-add.test.ts with 30 test cases covering scope detection, parsing, project state, mode resolution
result: pass
evidence: File exists at 415 lines. 30 tests across 5 describe blocks. All pass in vitest run.

### 3. Scope detection classifies milestone correctly
expected: Files with 10+ items and phase headers → milestone. Directories → milestone. Multiple Must Have sections → milestone.
result: pass
evidence: Unit tests verify: 12 items + phase headers → milestone, 11 items + 2x Must Have → milestone, directory → milestone. CLI e2e: `pilot add pilot requirements/smart-add.md --dry-run` detects "milestone (24 requirement items with phase/section headers)".

### 4. Scope detection classifies phase correctly
expected: Files with 3-10 items (no phase headers) → phase. Edge case: exactly 3 → phase, exactly 10 no headers → phase.
result: pass
evidence: Unit tests verify: 7 items → phase, exactly 3 → phase, exactly 10 no headers → phase.

### 5. Scope detection classifies quick correctly
expected: String description (no file) → quick. Files with <3 items → quick.
result: pass
evidence: Unit tests verify: string input → quick, 2 items → quick. CLI e2e: `pilot add pilot "fix bug" --dry-run` detects "quick (String description (no requirements file))".

### 6. add.ts rewritten with smart routing (no GSD modes exposed)
expected: src/commands/add.ts uses detectScope + detectProjectState, accepts (project, input, opts) signature. No VALID_MODES array.
result: pass
evidence: 262 lines. Imports detectScope, detectProjectState, generateRequirementsContent, resolveInternalMode from smart-add.ts. `grep VALID_MODES src/commands/add.ts` returns zero matches. No mode argument in CLI.

### 7. build.ts delegates entirely to addCommand
expected: src/commands/build.ts imports addCommand, no direct QUEUE.md writes, no mode detection
result: pass
evidence: 69 lines. L11 imports addCommand, L24 calls it. No direct readFile/writeFile of QUEUE.md. No mode detection logic.

### 8. index.ts updated with new command signatures
expected: `<requirement>` replaces `<mode>` in add command. Help text shows "Smart add to queue" and "Smart add + run".
result: pass
evidence: L280: `<requirement>` argument. L281: "Smart add: auto-detects scope and queues work". Help output shows `add <project> <req>` and `build <project> [req]`. L75: "Smart add to queue", L76: "Smart add + run".

### 9. Types added to types.ts
expected: SmartAddScope, ScopeDetectionResult, ProjectStateResult, SmartAddDecision exported from types.ts
result: pass
evidence: types.ts L176-210. SmartAddScope (L178), ScopeDetectionResult (L180-186), ProjectStateResult (L188-200), SmartAddDecision (L202-210).

### 10. --dry-run shows plan without queuing
expected: `pilot add project req --dry-run` shows what would happen, does NOT write to QUEUE.md
result: pass
evidence: CLI e2e: `pilot add pilot "fix bug" --dry-run` outputs "Dry run - would queue:" with project/scope/mode/description. Integration test confirms withQueueLock NOT called in dry-run.

### 11. --as override works correctly
expected: `pilot add project req --as phase` overrides auto-detection. Invalid scope exits with code 2.
result: pass
evidence: CLI e2e: `pilot add pilot "fix bug" --dry-run --as phase` detects "phase (--as phase override)" with mode "add-and-build". `pilot add pilot "fix bug" --as invalid-scope` exits 2 with "Error: Invalid scope 'invalid-scope'. Valid: quick, phase, milestone".

### 12. Project state detection handles all states
expected: Missing dir → error. No .opencode → auto-setup. Already queued → warn. Currently running → warn.
result: pass
evidence: CLI e2e: `pilot add nonexistent "fix bug"` exits 1 with "Error: Project directory not found". `pilot add pilot "fix bug" --dry-run` shows warnings: "already queued (add-and-build)" and "currently running". 7 unit tests cover all states.

### 13. No GSD modes exposed to user
expected: No build-full, continue-all, add-and-build, run-command visible in help or user-facing output
result: pass
evidence: `grep -r VALID_MODES src/` returns zero matches. Help output shows `<req>` not `<mode>`. Dry-run output shows "Scope: quick" not "Mode: build-full". Internal modes only appear in queue entries (correct behavior).

### 14. All 260 tests pass with zero regressions
expected: vitest run passes all tests, tsc --noEmit clean
result: pass
evidence: `npx vitest run`: 260 passed (260) across 13 test files. `npx tsc --noEmit`: zero errors. `npx tsc` (build): zero errors.

### 15. JSON output for add --dry-run
expected: Valid JSON with timestamp, scope, internalMode, requirementsPath
result: issue
reported: "Double JSON output when using `pilot add project req --dry-run --json`. Two separate JSON objects are emitted — one from addCommand (L202-210 in add.ts) and one from index.ts (L288-294). Non-dry-run path is correct (only index.ts emits)."
severity: minor

### 16. Requirements file generation for non-quick string input
expected: When --as phase with string description, generates .md file in project/requirements/
result: pass
evidence: CLI e2e: `pilot add pilot "fix bug" --dry-run --as phase` shows "Requirements: .../requirements/fix-bug.md". Integration test confirms mkdir + writeFile called for requirements dir. Generated content includes # heading, ## Problem, ### Must Have, - [ ] checkbox, ## Do NOT.

## Summary

total: 16
passed: 15
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "pilot add --json --dry-run should output exactly one JSON object"
  status: failed
  reason: "Double JSON output: addCommand internally calls outputJson for dry-run path (add.ts L202-210), and index.ts action handler also calls outputJson (L288-294). Results in two JSON objects printed to stdout."
  severity: minor
  test: 15
  root_cause: "addCommand has its own JSON output for dry-run, but index.ts also unconditionally outputs JSON when opts.json is set. The two paths should be consolidated — either addCommand handles all JSON output, or index.ts handles it. Current split creates duplication only on the dry-run path."
  artifacts:
    - path: "src/commands/add.ts"
      issue: "Lines 202-210: outputs JSON for dry-run when isJsonMode()"
    - path: "src/index.ts"
      issue: "Lines 288-294: always outputs JSON when opts.json is true, duplicating dry-run output"
  missing:
    - "Remove JSON output from addCommand dry-run path (let index.ts handle all JSON), OR remove JSON output from index.ts action handler (let addCommand handle all its own JSON)"
  debug_session: ""
