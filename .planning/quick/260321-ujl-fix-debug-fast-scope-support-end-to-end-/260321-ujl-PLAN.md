---
phase: 260321-ujl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/config.ts
  - test/core/config.test.ts
autonomous: true
requirements:
  - SCOPE-CONFIG-01
must_haves:
  truths:
    - "Config file with defaults.scope='fast' loads without validation error"
    - "Config file with defaults.scope='debug' loads without validation error"
    - "Config file with defaults.scope='quick' still loads correctly"
    - "Config file with defaults.scope='phase' still loads correctly"
  artifacts:
    - path: "src/core/config.ts"
      provides: "5-scope config validation"
      contains: "'debug', 'fast'"
    - path: "test/core/config.test.ts"
      provides: "Config scope validation tests for debug and fast"
      contains: "scope: 'fast'"
  key_links:
    - from: "src/core/config.ts"
      to: "src/core/types.ts"
      via: "PilotConfigFile defaults.scope type"
      pattern: "'quick' \\| 'phase' \\| 'debug' \\| 'fast'"
---

<objective>
Fix the last remaining config-layer gap preventing debug/fast scopes from working end-to-end.

Purpose: Quick task 260321-tdm fixed DB schema, migration, and add command, but missed the config validation in `src/core/config.ts:111` which still uses `assertEnum('defaults.scope', ..., ['quick', 'phase', 'milestone'])`. This means users who set `defaults.scope = "fast"` or `defaults.scope = "debug"` in their `~/.pilot/config.json` get a validation error on config load. The config SET command (`pilot config set defaults.scope fast`) already works (config.ts line 143 was updated), but the config LOAD validation rejects the value. Additionally, `milestone` should be removed from the allowed set since it was disabled in Phase 85.

Output: Updated config validation + tests confirming debug/fast scopes in config defaults.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/config.ts (line 111 — assertEnum still uses 3-scope list)
@src/core/types.ts (lines 31, 52 — config defaults type already includes debug/fast)
@src/commands/config.ts (line 143 — SET command already includes debug/fast)
@test/core/config.test.ts (lines 713-738 — existing scope tests, needs debug/fast)
@.planning/quick/260321-tdm-fix-debug-fast-scope-support-end-to-end-/260321-tdm-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/core/types.ts:
```typescript
// Line 31 — Config file type already updated:
scope?: 'quick' | 'phase' | 'debug' | 'fast' | null;

// Line 52 — ConfigFileDefaults already updated:
scope: 'quick' | 'phase' | 'debug' | 'fast' | null;

// Line 75 — DB-level JobScope (includes milestone for backwards compat):
export type JobScope = 'quick' | 'phase' | 'milestone' | 'debug' | 'fast';
```

From src/commands/config.ts:
```typescript
// Line 143 — SET command already correct:
'defaults.scope': { type: 'enum', path: ['defaults', 'scope'], enum: ['quick', 'phase', 'debug', 'fast'] },
```

From src/core/config.ts:
```typescript
// Line 111 — THE BUG — still uses old 3-scope list:
assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'milestone']);
// Should be: ['quick', 'phase', 'debug', 'fast']
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix config assertEnum and add scope tests</name>
  <files>src/core/config.ts, test/core/config.test.ts</files>
  <behavior>
    - Test: config with defaults.scope='fast' loads without error and returns scope='fast'
    - Test: config with defaults.scope='debug' loads without error and returns scope='debug'
    - Test: config with defaults.scope='milestone' is rejected (no longer valid for new config)
    - Existing tests: scope='quick' and scope='phase' still pass (already covered)
  </behavior>
  <action>
    1. In `src/core/config.ts` line 111, change:
       `assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'milestone']);`
       to:
       `assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'debug', 'fast']);`
       This aligns with both `src/core/types.ts` ConfigFileDefaults type and `src/commands/config.ts` SET enum.
       Remove `milestone` because Phase 85 disabled milestone scope — users should not set it as default.

    2. In `test/core/config.test.ts`, after the existing "returns scope: 'milestone'" test (line 731):
       - Update the milestone test to expect a validation error (milestone is no longer valid for config defaults)
       - Add test: "returns scope: 'fast' when set in config" (follows same pattern as quick/phase tests)
       - Add test: "returns scope: 'debug' when set in config" (follows same pattern)

    Pattern for new tests (copy from line 713-719):
    ```typescript
    it('returns scope: "fast" when set in config', () => {
      tempConfigPath = writeTempConfig({ defaults: { scope: 'fast' } });
      process.env.PILOT_CONFIG_FILE = tempConfigPath;
      const defaults = getConfigFileDefaults();
      expect(defaults.scope).toBe('fast');
    });
    ```
  </action>
  <verify>
    <automated>npx vitest run test/core/config.test.ts --reporter=verbose 2>&1 | tail -40</automated>
  </verify>
  <done>
    - `assertEnum` in config.ts uses `['quick', 'phase', 'debug', 'fast']`
    - Config loads with scope='fast' succeed
    - Config loads with scope='debug' succeed
    - Config loads with scope='milestone' fail validation
    - All existing config tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Write SUMMARY.md</name>
  <files>.planning/quick/260321-ujl-fix-debug-fast-scope-support-end-to-end-/260321-ujl-SUMMARY.md</files>
  <action>
    Write SUMMARY.md documenting:
    - What 260321-tdm fixed (DB schema, migration, addJob, add command)
    - What 260321-tdm missed (config.ts assertEnum still had old 3-scope list)
    - What this task fixed (config validation alignment, milestone removal from config defaults, new tests)
    - No manual post-merge steps needed (this is config validation only)
  </action>
  <verify>
    <automated>test -f .planning/quick/260321-ujl-fix-debug-fast-scope-support-end-to-end-/260321-ujl-SUMMARY.md && echo "SUMMARY exists"</automated>
  </verify>
  <done>SUMMARY.md exists with clear explanation of the gap and fix</done>
</task>

</tasks>

<verification>
- `npx vitest run test/core/config.test.ts` — all tests pass including new debug/fast scope tests
- `npx vitest run test/core/db-scope.test.ts` — existing scope DB tests still pass (no regression)
- `grep "assertEnum.*defaults.scope" src/core/config.ts` shows `['quick', 'phase', 'debug', 'fast']`
</verification>

<success_criteria>
- Config validation accepts debug and fast scopes
- Config validation rejects milestone scope (aligns with Phase 85 disable)
- Config SET command and config LOAD validation use matching scope lists
- TypeScript types, config SET, and config LOAD all agree on valid scopes
- All existing tests pass without regression
</success_criteria>

<output>
After completion, create `.planning/quick/260321-ujl-fix-debug-fast-scope-support-end-to-end-/260321-ujl-SUMMARY.md`
</output>
