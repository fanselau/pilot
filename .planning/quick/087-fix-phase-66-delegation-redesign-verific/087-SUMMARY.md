---
phase: quick-087
plan: 01
subsystem: build
tags: [postbuild, prompts, dist, tsc]

dependency-graph:
  requires: [phase-66]
  provides: ["dist/prompts/ copy during build"]
  affects: []

tech-stack:
  added: []
  patterns: ["shell command chaining in npm scripts"]

key-files:
  created: []
  modified: ["package.json"]

decisions: []

metrics:
  duration: "51s"
  completed: "2026-03-16"
---

# Quick Task 087: Fix Phase 66 Delegation Redesign Verification — Prompt File Copy

**One-liner:** Extend postbuild to copy src/prompts/*.md → dist/prompts/ so delegate.ts and runner.ts can load .md prompts at runtime.

## What Changed

Phase 66 introduced intent-based delegation with .md prompt files loaded at runtime via `import.meta.url`-relative paths (delegate.ts → delegate.md, runner.ts → judge.md). TypeScript's `tsc` only emits .ts → .js files, so `src/prompts/*.md` files were never copied to `dist/prompts/`, causing runtime crashes when running from dist/.

### Task 1: Add prompt file copy to postbuild script

Prepended `mkdir -p dist/prompts && cp src/prompts/*.md dist/prompts/` to the existing postbuild script in package.json. The existing shebang-patching Node one-liner is preserved after the copy step.

**Verified:**
- `npm run build` completes successfully
- `dist/prompts/delegate.md` and `dist/prompts/judge.md` exist after build
- `node dist/index.js --help` runs without module load errors

### Task 2: Verify tests pass

Full test suite passes: **1164 tests across 55 test files**, zero failures. No regressions from the postbuild change.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build` succeeds | ✓ |
| `ls dist/prompts/` shows delegate.md and judge.md | ✓ |
| `node dist/index.js --help` runs without errors | ✓ |
| `npx vitest run` passes (1164/1164) | ✓ |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a81366e | fix(quick-087): copy prompt .md files to dist/prompts/ during postbuild |
