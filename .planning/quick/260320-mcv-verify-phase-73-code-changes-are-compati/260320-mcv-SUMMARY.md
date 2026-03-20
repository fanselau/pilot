---
phase: quick
plan: mcv
subsystem: core/runner,core/skills
tags: [skills-system-v2, jit-install, runner, compatibility-fix]
dependency_graph:
  requires: [260320-m85]
  provides: [installSkillsForJob-jit-pattern, runner-uses-jit-skills]
  affects: [src/core/skills.ts, src/core/runner.ts, test/core/runner.test.ts, test/core/runner-recovery.test.ts]
tech_stack:
  added: []
  patterns: [jit-npx-skills-install, rmSync-cleanup-after-spawn]
key_files:
  created: []
  modified:
    - src/core/skills.ts
    - src/core/runner.ts
    - test/core/runner.test.ts
    - test/core/runner-recovery.test.ts
decisions:
  - "installSkillsForJob uses npx skills add CLI for JIT project-local install — no cpSync from ~/.pilot/skills/ cache"
  - "runner.ts cleans up .opencode/skill/ in finally block via rmSync (replaces cleanupInjectedSkills)"
  - "Old injectSkills/cleanupInjectedSkills kept in skills.ts for backward compat but runner no longer calls them"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-20"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase quick Plan mcv: Verify Phase 73 Code Changes Compatibility Summary

**One-liner:** Replaced old `injectSkills`/`cleanupInjectedSkills` cycle in runner.ts with `installSkillsForJob()` using JIT `npx skills add` CLI; runner now installs skills directly into project `.opencode/skill/` and cleans up via `rmSync`.

## Objective

Address the remaining Phase 73 incompatibility with updated requirements: runner.ts still used the old `injectSkills`/`cleanupInjectedSkills` pattern (copying from `~/.pilot/skills/` cache). Replace with `installSkillsForJob()` which uses the `skills` CLI to install JIT directly into the project.

Previous quick task m85 already removed `categories?: string[]` from `DelegationIntent` — this task completes the remaining fix.

## Compatibility Verification Results

| Requirement | Status | Details |
|-------------|--------|---------|
| `runner.ts` uses `installSkillsForJob()` instead of `injectSkills()`/`cleanupInjectedSkills()` | ✅ FIXED | Task 1 replaced the old pattern with JIT install and rmSync cleanup |
| `installSkillsForJob()` uses JIT `npx skills add` — NOT cpSync from `~/.pilot/skills/` cache | ✅ CONFIRMED | `execa('npx', ['skills', 'add', skill.source, '--skill', skill.name, '--agent', 'opencode', '--yes'])` |
| `runner.ts` cleans up `.opencode/skill/` in finally block | ✅ FIXED | `rmSync(.opencode/skill/, { recursive: true, force: true })` replaces `cleanupInjectedSkills()` |
| `delegate.ts` does not assign categories in delegation output | ✅ CLEAN | Reads `job.categories` for skills hint only; no AI-assigned categories |
| `DelegationIntent` has no vestigial categories field | ✅ CLEAN | Fixed by m85 — confirmed still clean |
| No code reads `intent.categories` | ✅ CLEAN | `grep -r "intent\.categories"` returns zero matches in `src/` |

## Changes Made

### Task 1: Create installSkillsForJob() and replace inject/cleanup in runner

**Commit:** `3aa40a7`

**In `src/core/skills.ts`:**
- Added `installSkillsForJob(categories, projectDir)` async function using `execa('npx', ['skills', 'add', ...])` for JIT install
- Checks for existing `.opencode/skill/<name>` before attempting install (idempotent)
- Kept old `injectSkills` and `cleanupInjectedSkills` exports intact for backward compat

**In `src/core/runner.ts`:**
- Added `existsSync`, `rmSync` to `node:fs` imports
- Replaced `resolveSkillsForJob`/`injectSkills`/`cleanupInjectedSkills` import with `installSkillsForJob`
- Replaced inject block: `await installSkillsForJob(job.categories ?? null, projectDir)` with log on install
- Replaced `cleanupInjectedSkills(projectDir)` in finally with `rmSync(.opencode/skill/)` cleanup

**In `test/core/runner.test.ts`** (2 locations):
- Updated `vi.doMock('../core/skills.js')` to expose `installSkillsForJob: vi.fn(async () => [])`

**In `test/core/runner-recovery.test.ts`:**
- Updated `vi.mock('../core/skills.js')` to expose `installSkillsForJob: vi.fn(async () => [])`

### Task 2: Final compatibility audit (read-only)

All grep checks pass:
1. `grep -rn "injectSkills|cleanupInjectedSkills" src/core/runner.ts src/core/delegate.ts src/core/types.ts` — **zero matches** ✅
2. `grep -rn "bootstrapDefaultSkills" src/core/runner.ts src/core/delegate.ts` — **zero matches** ✅
3. `grep -rn "intent\.categories" src/` — **zero matches** ✅
4. `installSkillsForJob` confirmed to use `npx skills add` CLI (not cpSync cache-copy) ✅
5. `runner.ts` confirmed to import and call `installSkillsForJob` ✅

## Verification

- `npx tsc --noEmit` — ✅ Passes (zero type errors)
- `npx vitest run` — ✅ Passes (57 test files, 1213 tests, 0 failures)
- `grep -rn "injectSkills|cleanupInjectedSkills" src/core/runner.ts` — ✅ Zero matches
- `grep -rn "intent\.categories" src/` — ✅ Zero matches
- `grep -n "installSkillsForJob" src/core/runner.ts` — ✅ Lines 81 and 653 (import + call)
- `grep -n "npx.*skills|skills.*add" src/core/skills.ts` — ✅ Lines 536 and 561 (JIT install)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/core/skills.ts` has `installSkillsForJob` export at line 521+
- [x] `src/core/runner.ts` imports `installSkillsForJob` (not injectSkills/cleanupInjectedSkills)
- [x] `src/core/runner.ts` calls `installSkillsForJob(job.categories ?? null, projectDir)` in launch()
- [x] `src/core/runner.ts` has NO `cleanupInjectedSkills` call; cleans up `.opencode/skill/` via rmSync
- [x] Commit `3aa40a7` exists in git log
- [x] TypeScript compiles cleanly (zero errors)
- [x] All 1213 tests pass
