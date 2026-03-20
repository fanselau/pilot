---
phase: quick-086
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - test/commands/doctor.test.ts
  - test/commands/update.test.ts
  - test/web/actions.test.ts
autonomous: true

must_haves:
  truths:
    - "npx vitest run test/commands/doctor.test.ts passes all tests"
    - "npx vitest run test/commands/update.test.ts passes all tests"
    - "npx vitest run test/web/actions.test.ts passes all tests"
  artifacts:
    - path: "test/commands/doctor.test.ts"
      provides: "Fixed vi.mock factories using importOriginal instead of top-level imports"
    - path: "test/commands/update.test.ts"
      provides: "Fixed vi.mock factory for execa using self-contained mock"
    - path: "test/web/actions.test.ts"
      provides: "Added vi.mock for ~/components/ui/toast path alias"
  key_links: []
---

<objective>
Fix 3 test files with vi.mock initialization failures so the full test suite passes clean.

Purpose: These are pre-existing vi.mock hoisting bugs — vi.mock factories run before imports, so referencing top-level variables (nodeFs, nodeOs, mockExeca) or unresolved path aliases (~/components/ui/toast) in factory functions causes ReferenceError or module resolution failures.

Output: All 3 test files pass individually and as part of the full suite.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@test/commands/doctor.test.ts
@test/commands/update.test.ts
@test/web/actions.test.ts
@test/commands/service.test.ts (reference: working node:os mock pattern using importOriginal)
@test/core/shell-exposure.test.ts (reference: working node:os mock pattern using importOriginal)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix doctor.test.ts vi.mock hoisting for node:fs and node:os</name>
  <files>test/commands/doctor.test.ts</files>
  <action>
The vi.mock factories for `node:fs` and `node:os` reference top-level imports (`nodeFs`, `nodeOs`) that aren't available when the factory runs (vi.mock is hoisted before imports).

Fix BOTH mocks using the `importOriginal` pattern:

1. **node:fs mock** (lines 61-97): Remove the `import * as nodeFs from 'node:fs'` at line 61. Change the vi.mock factory to use `async (importOriginal)`:
   ```ts
   vi.mock('node:fs', async (importOriginal) => {
     const actual = await importOriginal<typeof import('node:fs')>();
     return {
       default: actual,
       accessSync: vi.fn((filePath: string, _mode?: number) => {
         ...same logic but use `actual.readFileSync` and `actual.statSync` and `actual.constants` instead of `nodeFs.*`
       }),
       constants: actual.constants,
       readFileSync: vi.fn((...) => {
         ...same logic, fallback calls use actual.readFileSync(...)
       }),
       statSync: vi.fn((...) => {
         ...same logic, fallback calls use actual.statSync(...)
       }),
       existsSync: actual.existsSync,
     };
   });
   ```

2. **node:os mock** (lines 99-123): Remove the `import * as nodeOs from 'node:os'` at line 99. Change the vi.mock factory to use `async (importOriginal)`, following the working pattern from service.test.ts:
   ```ts
   vi.mock('node:os', async (importOriginal) => {
     const actual = await importOriginal<typeof import('node:os')>();
     return {
       ...actual,
       default: {
         ...actual,
         homedir: () => mockHomedir,
         freemem: () => 8 * 1024 * 1024 * 1024,
         userInfo: () => ({ username: 'testuser' }),
       },
       homedir: () => mockHomedir,
       freemem: () => 8 * 1024 * 1024 * 1024,
       userInfo: () => ({ username: 'testuser' }),
     };
   });
   ```

The mock state variables (`mockHomedir`, `mockUnitContent`, `mockAccessiblePaths`) are fine — they're `let` declarations that vi.mock can reference because they're in the same module scope and only read at call time, not at factory definition time. The issue is specifically the `import * as nodeFs/nodeOs` which aren't available when the hoisted factory runs.
  </action>
  <verify>npx vitest run test/commands/doctor.test.ts — all tests pass</verify>
  <done>All doctor.test.ts tests pass without vi.mock initialization errors</done>
</task>

<task type="auto">
  <name>Task 2: Fix update.test.ts vi.mock hoisting for execa + fix actions.test.ts missing toast mock</name>
  <files>test/commands/update.test.ts, test/web/actions.test.ts</files>
  <action>
**update.test.ts:**
The `vi.mock('execa')` factory at line 21 returns `{ execa: mockExeca }` — but `mockExeca` is declared at line 15 as `const mockExeca = vi.fn()`. Because vi.mock is hoisted, `mockExeca` isn't initialized yet when the factory runs.

Fix: Make the execa mock factory self-contained. Instead of referencing `mockExeca`, create the mock fn inside the factory and export it, OR use the simpler pattern of returning `vi.fn()` from the factory and accessing it via the import:

```ts
vi.mock('execa', () => ({
  execa: vi.fn(),
}));
```

Then change `mockExeca` from a standalone `vi.fn()` to a reference obtained from the mock after import:

```ts
import { execa } from 'execa';
const mockExeca = vi.mocked(execa);
```

Move these lines AFTER the `vi.mock('execa')` call but BEFORE `import { updateCommand }`. Update `beforeEach` — instead of `mockExeca.mockImplementation(...)`, it stays the same since `mockExeca` now points to the mocked function.

Note: The `const mockExeca = vi.fn()` declaration at line 15 should be removed. The variable `mockExeca` should be derived from the mocked import.

**web/actions.test.ts:**
The error is: `Failed to load url ~/components/ui/toast`. The vitest config has no `~` path alias, so when `actions.ts` imports `toastManager` from `~/components/ui/toast`, vitest can't resolve it.

Fix: Add a `vi.mock` for `~/components/ui/toast` before the actions import:

```ts
vi.mock('~/components/ui/toast', () => ({
  toastManager: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
```

Place this mock AFTER the existing `vi.mock('~/lib/server-fns')` block and BEFORE the `import { resolveActions, ... }` line. Check what `toastManager` exports by reading `web/src/components/ui/toast.tsx` briefly to ensure the mock shape matches.
  </action>
  <verify>npx vitest run test/commands/update.test.ts test/web/actions.test.ts — all tests pass</verify>
  <done>Both update.test.ts and actions.test.ts pass without initialization or module resolution errors</done>
</task>

</tasks>

<verification>
Run all 3 fixed test files together:
```bash
npx vitest run test/commands/doctor.test.ts test/commands/update.test.ts test/web/actions.test.ts
```

Then run the full test suite to confirm no regressions:
```bash
npx vitest run
```
</verification>

<success_criteria>
- All 3 test files pass individually
- Full test suite passes with no new failures
- No test logic changes — only mock initialization patterns fixed
</success_criteria>

<output>
After completion, create `.planning/quick/086-fix-phase-65-verification-gaps-3-test-su/086-SUMMARY.md`
</output>
