---
status: complete
phase: 01-scaffolding-core
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md
started: 2026-02-20T15:26:00Z
updated: 2026-02-20T15:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TypeScript Compilation (npm run build)
expected: `tsc` compiles all source files to dist/ with zero errors, producing .js and .d.ts files for all 12 modules
result: pass

### 2. Test Suite Passes (vitest run)
expected: All tests pass — 190 tests across 7 test files in under 5 seconds
result: pass

### 3. Type Check (tsc --noEmit)
expected: No type errors across the entire codebase
result: pass

### 4. Compiled Output Structure
expected: dist/core/ contains 9 modules (config, process, progress, projects, queue-parser, sessions, setup, stuck, types) as .js + .d.ts pairs; dist/util/ contains 3 modules (colors, format, output) as .js + .d.ts pairs — total 24 files
result: pass

### 5. core/types.ts Exports All Spec Interfaces
expected: 11 interfaces matching spec exactly: PilotConfig, QueueEntry, QueueItem, SessionInfo, StuckSignal, StuckAssessment, StuckSession, PilotStatusJson, ProjectInfo, PhaseProgress, ProgressInfo
result: pass

### 6. core/config.ts Resolves All Env Vars
expected: getConfig() resolves PILOT_QUEUE_FILE, PILOT_LOG_DIR, PILOT_STUCK_THRESHOLD, PILOT_PROJECT_DIR, PILOT_GSD_DIR, NO_COLOR with correct defaults and tilde expansion
result: pass

### 7. core/queue-parser.ts Parses QUEUE.md v5
expected: parseQueue, parseQueueFile, markEntry all exported; handles all 4 status types (pending, running, done, failed); extracts metadata (depends-on, timeout); 41 tests
result: pass

### 8. core/stuck.ts Scoring Algorithm
expected: 5-signal weighted scoring with correct thresholds (39=healthy, 40=suspect, 69=suspect, 70=stuck); pure scoreFromSignals separated from I/O; 58 tests
result: pass

### 9. core/sessions.ts Fuzzy Matching
expected: 3-step matching (exact title → case-insensitive contains → null); message count caching with 60s TTL; 20 tests
result: pass

### 10. core/process.ts PID Management
expected: Read/write/remove PID files with gsd- prefix; scanPidFiles returns alive-only; isProcessAlive handles EPERM; getProcessRuntime from /proc
result: pass

### 11. core/projects.ts Project Scanning
expected: scanProjects enumerates directories with git branch/dirty state + .planning detection; 23 tests
result: pass

### 12. core/progress.ts Phase Progress
expected: getProgress returns ProgressInfo with per-phase status, overall %, next action, blockers
result: pass

### 13. core/setup.ts Symlink Creation
expected: setupProject creates .claude/ dir, 3 symlinks (command→commands, agents→agents, get-shit-done→get-shit-done), claude.json, .gitignore, git init; skips existing files
result: issue
reported: "claude.json generated with `permissions: { allow: ['**'] }` instead of spec's `permission: { read: { '**': 'allow' }, write: { '**': 'allow' }, ... }`. The spec explicitly warns about this field name (singular vs plural) and structure."
severity: major

### 14. util/output.ts JSON/Human Branching
expected: setJsonMode/isJsonMode/outputJson/outputHuman exported; uses process.stdout.write (not console.log); auto-adds timestamp to JSON; 8 tests
result: pass

### 15. util/format.ts Duration/Truncation
expected: formatDuration, truncateString, truncateTitle, formatProgressBar exported; handles edge cases; 25 tests
result: pass

### 16. util/colors.ts NO_COLOR Support
expected: 9 named color exports (dim, bold, green, red, yellow, cyan, blue, magenta, gray) returning identity functions when NO_COLOR set
result: pass

### 17. Architecture: Zero UI Deps in core/
expected: No imports of picocolors, chalk, ink, react, or cli-table3 in any src/core/ file
result: pass

### 18. Architecture: No `any` Types
expected: Zero uses of `any` type in src/ (excluding comments/type definitions)
result: pass

### 19. Architecture: No Default Exports
expected: Zero `export default` in any src/ file
result: pass

### 20. Architecture: No require() Calls
expected: Zero `require(` in any src/ file — ESM only
result: pass

### 21. Architecture: Import Direction
expected: core/ modules never import from commands/ or tui/; acyclic dependency graph: types → config → (other core modules)
result: pass

### 22. ESM Compliance
expected: package.json `type: module`; all internal imports use .js extensions; tsconfig uses Node16 moduleResolution
result: pass

### 23. Test Fixtures Match Spec
expected: queue-v5-sample.md matches Appendix A format (7 entries, all status types, metadata); sessions.json has 5 mock sessions; export.json has messages with tool calls
result: pass

### 24. commands/ Directory Empty
expected: src/commands/ is empty — Phase 1 produces no CLI rendering code
result: pass

### 25. tsconfig.json Matches Spec
expected: ES2022 target, Node16 module/moduleResolution, strict true, declaration true, jsx react-jsx
result: pass

### 26. vitest.config.ts Matches Spec
expected: globals true, include test/**/*.test.ts pattern
result: pass

### 27. package.json Matches Spec
expected: @punchlab/pilot name, 0.1.0 version, ESM type, bin pilot→dist/index.js, engines node>=20, correct deps
result: pass

## Summary

total: 27
passed: 26
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "claude.json should use `permission` (singular) field with per-operation structure per spec §4"
  status: failed
  reason: "setup.ts generates `permissions: { allow: ['**'] }` (plural, flat) instead of `permission: { read: { '**': 'allow' }, write: { '**': 'allow' }, edit: { '**': 'allow' }, bash: { '**': 'allow' }, external_directory: { '**': 'allow' } }`. The spec Pre-spawn checks §5 explicitly warns: 'permission field (NOT permissions — singular!)'"
  severity: major
  test: 13
  root_cause: "Incorrect claude.json schema in setupProject() — uses newer/different permissions format rather than the spec-mandated format. Lines 122-126 of src/core/setup.ts."
  artifacts:
    - path: "src/core/setup.ts"
      issue: "claude.json schema mismatch with spec"
  missing:
    - "Change permissions object from `{ permissions: { allow: ['**'] } }` to `{ permission: { read: { '**': 'allow' }, write: { '**': 'allow' }, edit: { '**': 'allow' }, bash: { '**': 'allow' }, external_directory: { '**': 'allow' } } }`"
  debug_session: ""
