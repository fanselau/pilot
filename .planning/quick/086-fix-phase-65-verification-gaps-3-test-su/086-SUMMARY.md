---
phase: quick-086
plan: 01
started: 2026-03-16T08:26:14Z
completed: 2026-03-16
duration: ~3m
subsystem: test
tags: [vitest, vi.mock, hoisting, test-fixes]

key-files:
  modified:
    - test/commands/doctor.test.ts
    - test/commands/update.test.ts
    - test/web/actions.test.ts
---

# Quick 086: Fix 3 Test Files with vi.mock Initialization Failures

**One-liner:** Fix vi.mock hoisting bugs in doctor/update/actions tests by using importOriginal pattern and adding missing toast path alias mock.

## What Changed

### doctor.test.ts — `node:fs` and `node:os` mock hoisting
- Removed `import * as nodeFs from 'node:fs'` and `import * as nodeOs from 'node:os'` that were referenced inside vi.mock factories
- vi.mock is hoisted before imports, so these references caused `ReferenceError: Cannot access '__vi_import_0__' before initialization`
- Replaced with `async (importOriginal)` pattern matching the working service.test.ts reference
- node:os mock simplified from individual re-exports to `...actual` spread

### update.test.ts — execa mock hoisting
- Removed `const mockExeca = vi.fn()` declared at top-level and referenced inside vi.mock factory
- Made vi.mock factory self-contained with `vi.fn()` inline
- Derived `mockExeca` from the mocked import after vi.mock: `const mockExeca = execa as any as ReturnType<typeof vi.fn>`

### actions.test.ts — missing `~/components/ui/toast` mock
- `actions.ts` imports `toastManager` from `~/components/ui/toast` — a path alias vitest cannot resolve
- Added `vi.mock('~/components/ui/toast', ...)` with `toastManager.add` mock matching actual usage

## Verification

- All 3 test files pass individually: 57 tests (16 + 11 + 30)
- Full test suite passes: 1164 tests across 55 files, zero failures

## Commits

| Hash | Description |
|------|-------------|
| 661d8a8 | fix(quick-086): fix doctor.test.ts vi.mock hoisting for node:fs and node:os |
| 1ae7231 | fix(quick-086): fix update.test.ts execa mock hoisting + actions.test.ts missing toast mock |

## Deviations from Plan

None — plan executed exactly as written.
