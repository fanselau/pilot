---
phase: quick
plan: 260322-uyd
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - web/src/lib/step-semantics.ts
  - web/src/components/job-list.tsx
autonomous: true
requirements: [FAST-NATIVE-DETECT, FAST-COMPAT-LABEL, FAST-UI]
must_haves:
  truths:
    - "Fast jobs use native gsd-fast when .opencode/command/gsd-fast.md exists in the project"
    - "Fast jobs fall back to gsd-quick compat mode when gsd-fast.md is absent, with a reason recorded in the step"
    - "Web UI displays 'Fast Task' label for native fast steps and correct badge variant"
    - "Quick scope behavior is completely unchanged"
  artifacts:
    - path: "src/core/runner.ts"
      provides: "hasNativeFast() detection + intentToSteps fast case with compat fallback + reason"
    - path: "web/src/lib/step-semantics.ts"
      provides: "command === 'fast' label mappings in formatStepLabel, stepSemanticClass, synthesizeHeaderFields"
    - path: "web/src/components/job-list.tsx"
      provides: "scopeVariant fast badge"
  key_links:
    - from: "src/core/runner.ts intentToSteps fast case"
      to: "createPendingStep reason parameter"
      via: "return step with reason when falling back to compat"
      pattern: "hasNativeFast.*gsd-fast"
---

<objective>
Make Pilot's fast scope use native upstream gsd-fast when the project has it installed; fall back to gsd-quick compat mode with explicit reason in step metadata when not. Add proper UI labeling for fast steps and scope badges.

Purpose: Fast scope currently hardcodes gsd-quick regardless of whether the project supports native gsd-fast. This creates invisible compat behavior with no surfaced labeling.
Output: Capability-detected fast routing, compat reason in step metadata, fast-specific web UI labels and badge.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/runner.ts (intentToSteps fast case at ~line 956, createPendingStep call at ~line 798-799, spawnAndWait gsd- prefix at ~line 1608)
@src/core/db.ts (createPendingStep signature: jobId, stepIndex, command, args, source, reason?)
@web/src/lib/step-semantics.ts (formatStepLabel, stepSemanticClass, synthesizeHeaderFields)
@web/src/components/job-list.tsx (scopeVariant function at ~line 103)

<interfaces>
<!-- Key contracts the executor needs -->

From src/core/db.ts:
```typescript
function createPendingStep(
  jobId: string,
  stepIndex: number,
  command: string,
  args: string,
  source: StepSource,
  reason?: string,  // ← already supports reason, currently unused by initial delegation
): number;
```

From src/core/runner.ts (current fast case):
```typescript
case 'fast': {
  // Fast jobs map to gsd-quick with no flags (lightest path)
  return [{ command: 'quick', args: buildQuickArgs(job) }];
}
```

Step creation loop (line ~797-800):
```typescript
const steps = this.intentToSteps(intent, job, projectDir);
for (let i = 0; i < steps.length; i++) {
  createPendingStep(job.id, i, steps[i].command, steps[i].args, 'delegation');
  //                                                               ^ no reason passed
}
```

From web/src/lib/step-semantics.ts:
```typescript
export function formatStepLabel(group: StepTimelineGroup): string
export function stepSemanticClass(group: StepTimelineGroup): string
export function synthesizeHeaderFields(group: StepTimelineGroup): SynthesizedHeaderFields
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capability detection + intentToSteps fast routing with compat reason</name>
  <files>src/core/runner.ts</files>
  <action>
1. Add a `hasNativeFast(projectDir: string): boolean` function near the top of the Runner class (or as a module-level helper). It checks if `path.join(projectDir, '.opencode', 'command', 'gsd-fast.md')` exists using `existsSync`. This is a synchronous filesystem check — acceptable since it runs once per fast job, not in a hot loop.

2. Update the `intentToSteps` method's `case 'fast'` block:
   - Call `hasNativeFast(projectDir)` (projectDir is already available as the 3rd parameter)
   - If native: return `[{ command: 'fast', args: buildQuickArgs(job) }]`
     (spawnAndWait at line 1608 will auto-expand 'fast' → 'gsd-fast')
   - If compat fallback: return `[{ command: 'quick', args: buildQuickArgs(job), reason: 'compat: gsd-fast not available in project, using gsd-quick' }]`

3. Expand the `intentToSteps` return type from `Array<{ command: string; args: string }>` to `Array<{ command: string; args: string; reason?: string }>` to carry the optional compat reason.

4. Update the step creation loop (~line 797-800) to pass `steps[i].reason` to `createPendingStep`:
   ```typescript
   createPendingStep(job.id, i, steps[i].command, steps[i].args, 'delegation', steps[i].reason);
   ```
   The `createPendingStep` function already accepts an optional `reason` parameter — it just needs to be threaded through.

5. Update the comment on the fast case to explain the detection logic. Do NOT change the `case 'quick'` block or `buildQuickArgs` function at all.

6. Add a `process.stderr.write` log when falling back to compat, e.g.:
   `[runner] Fast scope: gsd-fast not available in ${projectDir}, falling back to gsd-quick compat`
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>
- `intentToSteps` returns `{ command: 'fast' }` when gsd-fast.md exists in project
- `intentToSteps` returns `{ command: 'quick', reason: 'compat: ...' }` when gsd-fast.md absent
- Step creation loop threads reason to createPendingStep
- Quick case is completely untouched
- All existing tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Web UI fast step labels + fast scope badge</name>
  <files>web/src/lib/step-semantics.ts, web/src/components/job-list.tsx</files>
  <action>
**step-semantics.ts changes:**

1. In `formatStepLabel()`: Add a check BEFORE the `group.command === 'quick'` line:
   ```typescript
   if (group.source === 'delegation' && group.command === 'fast') return 'Fast Task'
   ```
   This handles native fast steps. Compat steps (command='quick' on fast-scope jobs) will still show 'Quick Task' — which is accurate since they ran gsd-quick.

2. In `stepSemanticClass()`: Add before the `group.command === 'quick'` check:
   ```typescript
   if (group.command === 'fast') return 'step-fast'
   ```

3. In `synthesizeHeaderFields()`: In the `else if (group.source === 'delegation')` block, add:
   ```typescript
   else if (group.command === 'fast') stage = 'Fast Task'
   ```

**job-list.tsx changes:**

4. In `scopeVariant()`: Add a case for fast scope:
   ```typescript
   case 'fast':
     return 'secondary' as const
   ```
   This gives fast jobs a distinct badge variant (secondary = subtle filled) rather than falling through to outline.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx tsc --noEmit -p web/tsconfig.json 2>&1 | tail -10</automated>
  </verify>
  <done>
- `formatStepLabel` returns 'Fast Task' for command='fast' steps from delegation
- `stepSemanticClass` returns 'step-fast' for fast command steps
- `synthesizeHeaderFields` sets stage='Fast Task' for fast command steps
- `scopeVariant` returns 'secondary' for fast scope jobs
- TypeScript compilation passes with no errors
  </done>
</task>

</tasks>

<verification>
- `npx vitest run` — all existing tests pass (no regressions)
- `npx tsc --noEmit` — full project type-check passes
- Grep for `case 'quick'` in runner.ts intentToSteps — unchanged from before
- Grep for `hasNativeFast` — exists in runner.ts with existsSync check
- Grep for `'Fast Task'` — exists in step-semantics.ts
</verification>

<success_criteria>
- Fast jobs on projects WITH gsd-fast.md → step command is 'fast', spawns gsd-fast
- Fast jobs on projects WITHOUT gsd-fast.md → step command is 'quick' with reason explaining compat fallback
- Web UI shows 'Fast Task' label for native fast steps, 'secondary' badge for fast scope
- Quick scope routing completely unchanged — zero diff in quick case block
- All tests and type checks pass
</success_criteria>

<output>
After completion, create `.planning/quick/260322-uyd-pilot-fast-scope-should-use-native-upstr/260322-uyd-SUMMARY.md`
</output>
