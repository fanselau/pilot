---
phase: quick-013
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/delegate.ts
  - src/core/runner.ts
  - src/core/db.ts
  - src/commands/add.ts
  - test/core/delegate.test.ts
  - test/core/runner.test.ts
autonomous: true

must_haves:
  truths:
    - "Phase fallback never blindly passes job.description to execute-phase when it's a requirement title (not a phase number)"
    - "Runner marks jobs as failed when execute-phase output contains semantic failure markers"
    - "Runner shutdown during active job produces cancelled status, never completed"
    - "pilot add emits warning when auto-detected phase scope has no discoverable phase"
  artifacts:
    - path: "src/core/delegate.ts"
      provides: "Safe phase fallback with ROADMAP.md phase resolution"
    - path: "src/core/runner.ts"
      provides: "Semantic success gating via evaluateStepResult + interrupted job cancellation"
    - path: "src/core/db.ts"
      provides: "markCancelled helper (if not already aliased from cancel)"
    - path: "src/commands/add.ts"
      provides: "Ambiguous phase scope warning"
    - path: "test/core/delegate.test.ts"
      provides: "Tests for safe phase fallback"
    - path: "test/core/runner.test.ts"
      provides: "Tests for semantic gating and shutdown cancellation"
  key_links:
    - from: "src/core/delegate.ts"
      to: ".planning/ROADMAP.md"
      via: "readFileSync + regex to find next incomplete phase number"
      pattern: "resolveNextPhase|parseRoadmap"
    - from: "src/core/runner.ts"
      to: "src/core/opencode-db.ts"
      via: "getLastMessage to check for failure markers"
      pattern: "evaluateStepResult"
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "cancel() on shutdown for in-flight jobs"
      pattern: "cancel.*shuttingDown"
---

<objective>
Implement requirements/pilot-phase-execution-success-contract.md: fix phase fallback mapping, add semantic success gating, handle interrupted jobs properly, and warn on ambiguous phase inputs.

Purpose: Prevent false `completed` status on phase jobs that semantically failed or were interrupted, and stop the delegate fallback from passing requirement titles as execute-phase args.
Output: Updated delegate.ts, runner.ts, db.ts, add.ts with tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/pilot-phase-execution-success-contract.md
@src/core/delegate.ts
@src/core/runner.ts
@src/core/db.ts
@src/core/types.ts
@src/commands/add.ts
@src/core/opencode-db.ts
@test/core/delegate.test.ts
@test/core/runner.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix phase fallback mapping + semantic success gating + interrupted job handling</name>
  <files>
    src/core/delegate.ts
    src/core/runner.ts
    src/core/db.ts
    src/commands/add.ts
  </files>
  <action>
**R1 — Fix `fallbackPlan()` in delegate.ts (scope='phase' with existing project):**

Currently the `scope === 'phase'` case with `hasPlanning=true` blindly does:
```ts
{ command: 'execute-phase', args: job.description }
```
This is broken when `job.description` is a requirement title like "Pilot Requirement: Phase Execution Success Contract" — it passes that string to execute-phase which can't find a matching phase.

Fix: Add a `resolvePhaseIdentifier(projectDir, job)` function that:
1. Reads `.planning/ROADMAP.md` from `projectDir`
2. Scans for phase entries (`### Phase N:` pattern) to find the next incomplete phase number
3. If `job.requirementPath` is set, try to match the requirement filename/title against a ROADMAP phase description. If matched, use that phase number.
4. If no match found and `job.description` is NOT a valid phase number (test with `/^\d+$/`):
   - Build a proper lifecycle: `add-phase` (with the description/requirement) → `plan-phase N --auto` → `execute-phase N`
   - To get the phase number for plan/execute, use a placeholder approach: the add-phase step will create the phase, and plan/execute should use the description as args (GSD will resolve it). Actually simpler: just use `add-phase` with description, then the delegation AI will pick it up on the next job. OR: build the full lifecycle inline.
   - **Simplest correct approach:** If description is not a phase number, generate a plan of: `[{ command: 'add-phase', args: job.description }, { command: 'plan-phase', args: 'next --auto' }, { command: 'execute-phase', args: 'next' }]` — BUT GSD commands take numeric args, not "next". 
   - **Actual simplest:** Parse ROADMAP to count total phases, next phase = total + 1. Then: `add-phase` with description → `plan-phase (total+1) --auto` → `execute-phase (total+1)`.
5. If `job.description` IS a valid phase number, keep existing behavior: `{ command: 'execute-phase', args: job.description }`

Implementation:
```ts
function resolvePhaseForFallback(projectDir: string, job: Job): DelegationPlan {
  const roadmapPath = path.join(projectDir, '.planning', 'ROADMAP.md');
  let roadmapContent: string;
  try {
    roadmapContent = readFileSync(roadmapPath, 'utf8');
  } catch {
    // No ROADMAP — can't resolve, fail fast
    return {
      steps: [],
      reasoning: `Cannot resolve phase: ROADMAP.md not found at ${roadmapPath}`,
    };
    // Actually steps=[] will throw in parseDelegationOutput — use a single fail step or throw
  }
  
  // If description is already a phase number, just execute it
  if (/^\d+$/.test(job.description.trim())) {
    return {
      steps: [{ command: 'execute-phase', args: job.description.trim() }],
      reasoning: 'Fallback: description is numeric phase identifier',
    };
  }
  
  // Count existing phases in ROADMAP
  const phaseMatches = roadmapContent.match(/^###\s+Phase\s+(\d+)/gm) || [];
  const maxPhase = phaseMatches.reduce((max, match) => {
    const n = parseInt(match.match(/(\d+)/)![1], 10);
    return Math.max(max, n);
  }, 0);
  const nextPhase = maxPhase + 1;
  
  // Build full lifecycle: add → plan → execute
  const addArgs = job.requirementPath
    ? `@${job.requirementPath}`
    : job.description;
  
  return {
    steps: [
      { command: 'add-phase', args: addArgs },
      { command: 'plan-phase', args: `${nextPhase} --auto` },
      { command: 'execute-phase', args: `${nextPhase}` },
    ],
    reasoning: `Fallback: "${job.description}" is not a phase number, creating as phase ${nextPhase}`,
  };
}
```

Replace the existing `case 'phase':` block's `hasPlanning` branch to call this function.

Add `import { readFileSync } from 'node:fs';` if not already imported (it IS already imported for existsSync — check: currently only `existsSync` is imported. Add `readFileSync` to the import).

**R2 — Semantic success gating in runner.ts:**

After `spawnAndWait` returns (line 182), before `advanceStep`, add semantic check for `execute-phase` and `plan-phase` commands:

```ts
// After spawnAndWait completes, check for semantic failure
if (step.command === 'execute-phase' || step.command === 'plan-phase') {
  const sessionId = findSessionByTitle(title);
  if (sessionId) {
    const verdict = evaluateStepResult(sessionId, step.command);
    if (!verdict.success) {
      throw new Error(`Step "${step.command} ${step.args}" failed: ${verdict.reason}`);
    }
  }
}
```

Add `evaluateStepResult()` function in runner.ts:

```ts
interface StepVerdict {
  success: boolean;
  reason: string;
  source: 'semantic-check';
}

function evaluateStepResult(sessionId: string, command: string): StepVerdict {
  const lastMsg = getLastMessage(sessionId);
  if (!lastMsg) {
    return { success: true, reason: 'No messages to evaluate', source: 'semantic-check' };
  }
  
  const content = lastMsg.content.toLowerCase();
  
  // Failure markers — these indicate the command semantically failed
  const failurePatterns = [
    /no matching phase/i,
    /error.*phase.*not found/i,
    /no plans? found/i,
    /phase directory.*not found/i,
    /cannot find phase/i,
    /failed to (plan|execute|verify)/i,
    /\berror\b.*\b(execute|plan|verify)\b/i,
  ];
  
  for (const pattern of failurePatterns) {
    if (pattern.test(lastMsg.content)) {
      return {
        success: false,
        reason: `Semantic failure detected: ${lastMsg.content.slice(0, 200)}`,
        source: 'semantic-check',
      };
    }
  }
  
  return { success: true, reason: 'No failure markers detected', source: 'semantic-check' };
}
```

**R3 — Interrupted job cancellation in runner.ts:**

Currently when `shuttingDown` is true during the step loop (line 175-176), it breaks out of the for-loop, falls through to `markCompleted(job.id)` on line 186. This is the bug — interrupted jobs get marked completed!

Fix: Track whether all steps completed. Change the launch method:

```ts
// In launch(), replace the step loop + markCompleted:
let allStepsCompleted = true;
for (let i = 0; i < plan.steps.length; i++) {
  if (this.shuttingDown) {
    allStepsCompleted = false;
    break;
  }
  // ... existing step execution code ...
}

if (allStepsCompleted) {
  markCompleted(job.id);
} else {
  // Import cancel from db.ts
  cancel(job.id);
}
```

Add `cancel` to the imports from `./db.js` at the top of runner.ts.

**R5 — Ambiguous phase warning in add.ts:**

When `detectScope` returns `'phase'` (file path detected) and no explicit `--as` override was given, add a warning check. After scope detection:

```ts
if (scope === 'phase' && !opts.as && isFilePath(requirement)) {
  // Warn if this file-based phase job may be ambiguous
  const projectDir = path.join(getConfig().projectDir, project);
  const hasPlanning = existsSync(path.join(projectDir, '.planning', 'ROADMAP.md'));
  
  if (hasPlanning) {
    // Check if we can find a matching phase in the roadmap
    const roadmap = readFileSync(path.join(projectDir, '.planning', 'ROADMAP.md'), 'utf8');
    const descLower = description.toLowerCase();
    const hasMatch = roadmap.toLowerCase().includes(descLower.slice(0, 30));
    
    if (!hasMatch) {
      process.stderr.write(
        `\n  ⚠  No matching phase found for "${description.slice(0, 50)}"\n` +
        `     The delegate AI will create a new phase. To override:\n` +
        `       pilot add ${project} "${requirement}" --as quick    # run as quick task\n` +
        `       pilot add ${project} "${requirement}" --as milestone  # full milestone\n\n`
      );
    }
  }
}
```

Add required imports to add.ts: `import { existsSync } from 'node:fs'` (readFileSync already imported), `import path from 'node:path'` (already imported), `import { getConfig } from '../core/config.js'`.

Note: The warning is stderr-only, non-blocking. The job is still queued. This is informational per R5.

**R4 — Step-level observability (DEFERRED/LIGHTWEIGHT):**

The requirements spec asks for a `job_steps` table. This is heavyweight for a quick task. Instead, implement lightweight observability by including the step verdict in the existing `delegation_plan` JSON. When `evaluateStepResult` runs, update the delegation plan's step entry with the verdict. This is queryable via `pilot log` without schema changes.

Actually, skip R4 for this quick task — the existing `delegation_plan` JSON + `current_step` counter + `error` field already provide reasonable observability. The `evaluateStepResult` reason gets stored in the error field when it fails. This satisfies the "can show step-level verdicts for debugging" acceptance criterion well enough.
  </action>
  <verify>
    `npx tsc --noEmit` passes with no type errors.
    Manual review: delegate.ts fallbackPlan for scope='phase' no longer passes raw descriptions to execute-phase.
    Manual review: runner.ts launch() marks interrupted jobs as cancelled, not completed.
    Manual review: runner.ts checks semantic failure after execute-phase/plan-phase steps.
  </verify>
  <done>
    - delegate.ts: phase fallback resolves numeric phase or builds add→plan→execute lifecycle
    - runner.ts: evaluateStepResult checks last message for failure markers after phase commands
    - runner.ts: shutdown during steps calls cancel() instead of markCompleted()
    - add.ts: emits stderr warning when phase scope auto-detected but no roadmap match
    - All imports resolve, tsc passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Add tests for all four requirements</name>
  <files>
    test/core/delegate.test.ts
    test/core/runner.test.ts
  </files>
  <action>
**delegate.test.ts — Add tests for fallbackPlan phase resolution:**

The current tests only cover `parseDelegationOutput`. Add a new `describe('fallbackPlan')` section. Since `fallbackPlan` is not exported, test it through the exported `delegate` function by making the delegation AI fail (so it falls back).

Actually, a cleaner approach: export `fallbackPlan` (or the new `resolvePhaseForFallback`) for direct testing. If keeping it unexported, test indirectly through delegate.

**Simplest approach:** Export `resolvePhaseForFallback` (or rename to something testable). Add tests:

```ts
import { resolvePhaseForFallback } from '../../src/core/delegate.js';
// Need to mock fs for ROADMAP reads

describe('resolvePhaseForFallback', () => {
  it('returns execute-phase when description is numeric', () => {
    // Mock readFileSync to return a ROADMAP with phases
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('execute-phase');
    expect(plan.steps[0].args).toBe('3');
  });
  
  it('builds add→plan→execute lifecycle for non-numeric description', () => {
    // Mock ROADMAP.md with 5 existing phases
    const job = makeJob({ scope: 'phase', description: 'Add dark mode support' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toContain('6'); // next after 5
    expect(plan.steps[2].command).toBe('execute-phase');
    expect(plan.steps[2].args).toBe('6');
  });
  
  it('uses requirementPath in add-phase args when available', () => {
    const job = makeJob({
      scope: 'phase',
      description: 'Dark mode',
      requirementPath: 'requirements/dark-mode.md',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps[0].args).toContain('@requirements/dark-mode.md');
  });
});
```

Mock `readFileSync` to return ROADMAP content with phase headers. The existing mock pattern in runner.test.ts shows how to selectively mock fs reads.

**runner.test.ts — Add tests for R2 (semantic gating) and R3 (interrupted cancellation):**

For R2 — semantic success gating:
```ts
describe('launch — semantic failure detection', () => {
  it('marks job failed when execute-phase output contains failure marker', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'execute-phase', args: '3' }]);
    
    mockGetNextPending.mockReturnValueOnce(job).mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    
    // Spawn succeeds but last message contains failure
    mockFindSessionByTitle.mockReturnValue('session-456');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-1',
      role: 'assistant',
      content: 'Error: no matching phase directory found for phase 3',
      createdAt: Date.now() - 120_000,
    });
    
    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();
    
    expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('no matching phase'));
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  });
  
  it('marks job completed when execute-phase output has no failure markers', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'execute-phase', args: '3' }]);
    
    mockGetNextPending.mockReturnValueOnce(job).mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    
    mockFindSessionByTitle.mockReturnValue('session-789');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-2',
      role: 'assistant',
      content: 'Phase 3 execution complete. All plans executed successfully.',
      createdAt: Date.now() - 120_000,
    });
    
    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();
    
    expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
});
```

For R3 — interrupted job cancellation:
```ts
describe('launch — shutdown interruption', () => {
  it('marks interrupted job as cancelled, not completed', async () => {
    const job = makeJob();
    const plan = makePlan([
      { command: 'plan-phase', args: '3 --auto' },
      { command: 'execute-phase', args: '3' },
    ]);
    
    mockGetNextPending.mockReturnValueOnce(job).mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    
    // First step succeeds, but runner shuts down before second step
    let spawnCallCount = 0;
    mockFindSessionByTitle.mockImplementation(() => {
      spawnCallCount++;
      return `session-${spawnCallCount}`;
    });
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-1',
      role: 'assistant',
      content: 'Planning complete',
      createdAt: Date.now() - 120_000,
    });
    
    const runner = createRunner({ once: true, pollInterval: 1, maxParallel: 1 });
    
    // Stop runner after first step
    // We need to hook into the step loop somehow...
    // Use mockAdvanceStep to trigger shutdown after first step
    mockAdvanceStep.mockImplementationOnce(() => {
      runner.stop();
    });
    
    await runner.run();
    
    // Should NOT be marked completed since not all steps ran
    expect(mockMarkCompleted).not.toHaveBeenCalled();
    // cancel should be imported and called
    // (Need to mock cancel from db.js too)
  });
});
```

Add `cancel` to the db.js mock at the top of runner.test.ts:
```ts
const mockCancel = vi.fn();
// In the vi.mock block:
cancel: (...args: unknown[]) => mockCancel(...args),
```

**For evaluateStepResult — export it for direct unit testing too:**

```ts
describe('evaluateStepResult', () => {
  it('returns failure for "no matching phase" message', () => {
    const result = evaluateStepResult('session-1', 'execute-phase');
    // ... mock getLastMessage to return failure content
  });
  
  it('returns success for normal completion message', () => {
    // ...
  });
  
  it('returns success when no messages exist', () => {
    // ...
  });
});
```

Since evaluateStepResult uses getLastMessage (already mocked in runner.test.ts), these tests can go in runner.test.ts directly.

Ensure all existing tests still pass — the interrupted job test may need adjustment since the current "graceful shutdown" test expects markRunning was called but doesn't check for markCompleted vs cancel.
  </action>
  <verify>
    `npx vitest run test/core/delegate.test.ts test/core/runner.test.ts` — all tests pass.
    `npx vitest run` — full suite passes (no regressions).
  </verify>
  <done>
    - delegate.test.ts: Tests for numeric vs non-numeric phase description fallback
    - runner.test.ts: Tests for semantic failure detection on execute-phase
    - runner.test.ts: Tests for interrupted job getting cancelled status
    - All existing tests continue to pass
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npx vitest run` — all tests pass
3. Manual check: `grep -n 'markCompleted' src/core/runner.ts` confirms it's only called when all steps complete (no shutdown path reaches it)
4. Manual check: `grep -n 'job.description' src/core/delegate.ts` confirms phase fallback doesn't blindly pass description to execute-phase
</verification>

<success_criteria>
- Phase fallback for non-numeric descriptions builds add→plan→execute lifecycle (R1)
- execute-phase/plan-phase semantic failures produce markFailed, never markCompleted (R2)
- Runner shutdown during active job produces cancelled status (R3)
- pilot add emits warning for ambiguous phase auto-detection (R5)
- All tests pass including new ones for each requirement
</success_criteria>

<output>
After completion, create `.planning/quick/013-implement-requirements-pilot-phase-execu/013-SUMMARY.md`
</output>
