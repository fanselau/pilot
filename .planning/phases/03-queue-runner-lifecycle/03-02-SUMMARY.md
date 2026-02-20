---
phase: 03-queue-runner-lifecycle
plan: 02
subsystem: cli-commands
tags: [lifecycle, commands, execa, spawn, gsd]
dependency-graph:
  requires: [01-scaffolding, 02-cli-commands]
  provides: [lifecycle-commands, init-command, milestone-routing, todos-routing]
  affects: [03-03, 03-04]
tech-stack:
  added: []
  patterns: [project-dir-resolution, title-truncation, stdio-inherit-spawn, subcommand-routing]
key-files:
  created: []
  modified:
    - src/commands/plan.ts
    - src/commands/execute.ts
    - src/commands/verify.ts
    - src/commands/quick.ts
    - src/commands/debug.ts
    - src/commands/scope.ts
    - src/commands/insert.ts
    - src/commands/remove.ts
    - src/commands/research.ts
    - src/commands/milestone.ts
    - src/commands/todos.ts
    - src/commands/map.ts
    - src/commands/init.ts
decisions:
  - id: inline-helpers
    decision: "Inline truncateTitle/sanitizeArgs in each command file"
    rationale: "spawn.ts from Plan 01 has errors; avoid cross-dependency in parallel wave"
  - id: void-opts
    decision: "Use void opts for commands with no flag passthrough"
    rationale: "Avoids unused parameter lint errors while maintaining consistent function signature"
  - id: reject-false
    decision: "Use reject: false on execa calls"
    rationale: "Allows manual exit code propagation instead of throwing on non-zero exit"
  - id: build-flag-deferred
    decision: "scope --build prints note, deferred to Plan 04"
    rationale: "Queue runner doesn't exist yet; will be wired when runner is implemented"
metrics:
  duration: ~10m
  completed: 2026-02-20
---

# Phase 3 Plan 2: Lifecycle Command Implementations Summary

**One-liner:** 13 lifecycle command stubs replaced with real execa-based gsd-* spawners with project dir resolution, title truncation, and subcommand routing.

## What Was Done

### Task 1: 12 Lifecycle Commands (commit: 6127547)

Replaced all 12 lifecycle command stubs with real implementations following a consistent pattern:

1. **Simple commands** (plan, execute, verify, quick, debug, scope, insert, remove, research, map):
   - Resolve project dir from `PILOT_PROJECT_DIR + project`
   - Validate directory exists via `fs.access` (exit 1 if not found)
   - Build title string, truncated to 80 chars
   - Spawn `opencode run --command gsd-<command>` with `stdio: 'inherit'`
   - Use `reject: false` and propagate exit code via `process.exit`

2. **Flag passthrough**:
   - `plan`: --research, --skip-research, --gaps → appended to args
   - `execute`: --gaps-only → appended to args
   - `verify`: --port → appended to args
   - `scope`: --build → prints deferred note (Plan 04)

3. **Subcommand routers** (milestone, todos):
   - Map subcommand string to gsd-* command name
   - Extract project from first positional arg
   - Pass remaining args to gsd command
   - Error on unknown subcommand (exit 2)

### Task 2: Init Command (commit: 4a34f94)

Special implementation with setup phase:
- Creates project directory with `mkdir({ recursive: true })`
- Checks for `.claude/` dir; runs `setupProject()` if missing
- Reports setup errors (exit 1) and created items to stderr
- Spawns `gsd-new-project` with --auto flag passthrough
- Uses `--` separator when args contain flags

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Inline truncateTitle/sanitizeArgs per file | spawn.ts from Plan 01 has errors; avoid cross-dependency |
| void opts for no-flag commands | Consistent signature without unused-param warnings |
| reject: false on execa | Manual exit code propagation |
| scope --build deferred to Plan 04 | Queue runner not yet implemented |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit`: PASS (zero errors)
- `grep "not yet implemented"` across all 13 files: zero matches
- All commands export correct function names matching index.ts imports

## Next Phase Readiness

- All lifecycle commands functional — Plan 03 (queue runner) and Plan 04 (lifecycle modes) can wire these into automated flows
- The inline truncateTitle/sanitizeArgs could be consolidated into spawn.ts once Plan 01 errors are resolved
