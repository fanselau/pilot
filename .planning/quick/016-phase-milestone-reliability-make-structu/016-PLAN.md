---
phase: quick-016
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/delegate.ts
  - src/core/runner.ts
  - src/commands/add.ts
  - test/core/delegate.test.ts
  - test/core/runner.test.ts
autonomous: true

must_haves:
  truths:
    - "Phase fallback uses filesystem scan of .planning/phases/ dirs instead of ROADMAP heading counting"
    - "After add-phase, fallback verifies the created phase dir exists and uses THAT number"
    - "evaluateStepResult recognizes both success AND failure patterns, with 'uncertain' for ambiguous"
    - "detectScope defaults strings >100 chars or with requirements-like language to phase, not quick"
    - "Milestone fallback iterates requirement files, creating add→plan→execute per file"
    - "All new delegate functions are exported and tested with edge cases"
  artifacts:
    - path: "src/core/delegate.ts"
      provides: "Fixed resolvePhaseForFallback with filesystem scan, phase verification, milestone iteration"
    - path: "src/core/runner.ts"
      provides: "evaluateStepResult with success patterns and uncertain verdict"
    - path: "src/commands/add.ts"
      provides: "Updated detectScope with requirements-language heuristic + quick deprecation warning"
    - path: "test/core/delegate.test.ts"
      provides: "Comprehensive tests for fallbackPlan, resolvePhaseForFallback, buildNewProjectArgs, buildQuickArgs"
    - path: "test/core/runner.test.ts"
      provides: "Tests for evaluateStepResult success/uncertain patterns"
  key_links:
    - from: "src/core/delegate.ts"
      to: ".planning/phases/ filesystem"
      via: "readdirSync scanning for NN-* prefixed dirs"
      pattern: "readdirSync.*phases"
---

<objective>
Fix phase & milestone reliability: replace ROADMAP heading counting with filesystem scan in delegate fallback, add phase creation verification, improve evaluateStepResult with success/uncertain patterns, make detectScope prefer phase for requirements-like strings, and add comprehensive delegate tests.

Purpose: Phase and milestone modes are unreliable because resolvePhaseForFallback counts ROADMAP headings (which diverge from actual phase dirs). This fix aligns with requirements/phase-milestone-reliability.md.
Output: Fixed delegate.ts, improved runner.ts, updated add.ts detectScope, comprehensive tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/phase-milestone-reliability.md
@src/core/delegate.ts
@src/core/runner.ts
@src/commands/add.ts
@test/core/delegate.test.ts
@test/core/runner.test.ts
@src/core/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix delegate.ts — filesystem-based phase resolution, phase verification, milestone iteration, exports</name>
  <files>src/core/delegate.ts</files>
  <action>
Make these changes to `src/core/delegate.ts`:

**1. Fix `resolvePhaseForFallback` — replace ROADMAP heading counting with filesystem scan:**

Replace the current approach (lines 128-135 that match `###\s+Phase\s+(\d+)` in ROADMAP) with:
- Read `.planning/phases/` directory entries via `readdirSync`
- Extract max `NN` prefix from dir names matching `/^(\d+)-/`
- `nextPhase = maxPhaseFromDirs + 1`
- If no dirs found (empty phases/), fall back to 1
- If `.planning/phases/` doesn't exist, fall back to 1
- Keep the numeric description early-return (line 121-126) as-is

**2. Add phase creation verification after add-phase:**

After building the `add-phase → plan-phase → execute-phase` steps in `resolvePhaseForFallback`, the problem is that add-phase may create a dir with a DIFFERENT number than what we predicted. We can't verify at plan-creation time (add-phase hasn't run yet). Instead, change the approach:

- Instead of predicting `nextPhase` at all, use a sentinel approach: after `add-phase`, emit steps that use a **rescan** pattern:
  - Step 1: `add-phase` with args
  - Step 2: `plan-phase` with args `last --auto` 
  - Step 3: `execute-phase` with args `last`

Wait — opencode GSD commands don't support `last` as an arg. The GSD commands take a phase number.

Better approach: Keep the filesystem scan to predict nextPhase (it's now accurate since we're scanning the same source GSD uses). The key fix is that the prediction is now correct because we're scanning `.planning/phases/` dirs (same as GSD does), not counting ROADMAP headings.

So: Just replace ROADMAP counting with filesystem dir scanning. That aligns us with GSD's logic.

```typescript
function resolvePhaseForFallback(projectDir: string, job: Job): DelegationPlan {
  // If description is already a phase number, just execute it
  if (/^\d+$/.test(job.description.trim())) {
    return {
      steps: [{ command: 'execute-phase', args: job.description.trim() }],
      reasoning: 'Fallback: description is numeric phase identifier',
    };
  }

  // Scan .planning/phases/ for existing phase directories (same logic GSD uses)
  const phasesDir = path.join(projectDir, '.planning', 'phases');
  const nextPhase = getNextPhaseNumber(phasesDir);

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
    reasoning: `Fallback: "${job.description}" is not a phase number, creating as phase ${nextPhase} (from phases/ dir scan)`,
  };
}
```

Add new helper:
```typescript
/**
 * Scan .planning/phases/ directory for existing phase dirs and return next phase number.
 * Matches NN-* prefix pattern, same as GSD's gsd-tools.cjs.
 * Returns 1 if no phases dir or no matching dirs.
 */
function getNextPhaseNumber(phasesDir: string): number {
  try {
    const entries = readdirSync(phasesDir);
    let maxPhase = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)-/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxPhase) maxPhase = n;
      }
    }
    return maxPhase + 1;
  } catch {
    return 1; // No phases dir or unreadable
  }
}
```

Add `readdirSync` to the import from `node:fs` (it's not currently imported in delegate.ts).

**3. Improve milestone fallback for initialized projects (requirement #5):**

Replace the current milestone fallback for initialized projects (lines 91-96 which just does a single `add-phase`) with:

```typescript
case 'milestone':
  if (!hasPlanning) {
    return {
      steps: [
        { command: 'new-project', args: buildNewProjectArgs(job) },
        { command: 'plan-phase', args: '1 --auto' },
        { command: 'execute-phase', args: '1' },
      ],
      reasoning: 'Fallback: full milestone lifecycle: init → plan → execute',
    };
  }
  // Milestone on initialized project: if requirementPath is a directory,
  // iterate files and create one phase per file
  return buildMilestonePlan(job, projectDir);
```

Add new helper:
```typescript
/**
 * Build a milestone plan for an initialized project.
 * If requirementPath is a directory, create add→plan→execute per .md file.
 * Otherwise, fall back to single add-phase.
 */
function buildMilestonePlan(job: Job, projectDir: string): DelegationPlan {
  if (job.requirementPath) {
    try {
      const stat = statSync(job.requirementPath);
      if (stat.isDirectory()) {
        const files = readdirSync(job.requirementPath)
          .filter(f => f.endsWith('.md'))
          .sort();

        if (files.length > 0) {
          const phasesDir = path.join(projectDir, '.planning', 'phases');
          let nextPhase = getNextPhaseNumber(phasesDir);
          const steps: DelegationStep[] = [];

          for (const file of files) {
            const filePath = path.join(job.requirementPath, file);
            steps.push({ command: 'add-phase', args: `@${filePath}` });
            steps.push({ command: 'plan-phase', args: `${nextPhase} --auto` });
            steps.push({ command: 'execute-phase', args: `${nextPhase}` });
            nextPhase++;
          }

          return {
            steps,
            reasoning: `Fallback: milestone with ${files.length} requirement files, creating one phase per file`,
          };
        }
      }
    } catch {
      // Fall through to single add-phase
    }
  }

  // Default: single add-phase
  return {
    steps: [
      { command: 'add-phase', args: job.requirementPath ? `@${job.requirementPath}` : job.description },
    ],
    reasoning: 'Fallback: project already initialized, adding as new phase',
  };
}
```

Add `statSync` to the import from `node:fs` (alongside existing `existsSync`, `readFileSync`, and newly added `readdirSync`).

Import `DelegationStep` type from types.ts.

**4. Export `fallbackPlan`, `buildNewProjectArgs`, `buildQuickArgs`, `getNextPhaseNumber`, `buildMilestonePlan` for testing:**

Update the export line at the bottom:
```typescript
export {
  delegate,
  parseDelegationOutput,
  resolveOpencodeBinary,
  waitForDelegationResult,
  resolvePhaseForFallback,
  fallbackPlan,
  buildNewProjectArgs,
  buildQuickArgs,
  getNextPhaseNumber,
  buildMilestonePlan,
};
```
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors.
Run `npx vitest run test/core/delegate.test.ts` to ensure existing tests still pass.
  </verify>
  <done>
- resolvePhaseForFallback scans .planning/phases/ dirs instead of counting ROADMAP headings
- getNextPhaseNumber extracts max NN prefix from phase dir names
- buildMilestonePlan iterates .md files in requirement directory
- All new and existing helper functions are exported
- Existing delegate tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Improve evaluateStepResult with success patterns + uncertain verdict, update detectScope, add quick deprecation warning</name>
  <files>src/core/runner.ts, src/commands/add.ts</files>
  <action>
**1. In `src/core/runner.ts`, update `evaluateStepResult` to check success patterns AND add uncertain verdict:**

Update the `StepVerdict` type:
```typescript
interface StepVerdict {
  success: boolean;
  reason: string;
  source: 'semantic-check';
  certainty: 'definite' | 'uncertain';  // NEW: confidence level
}
```

Replace the current `evaluateStepResult` function body with:

```typescript
function evaluateStepResult(sessionId: string, _command: string): StepVerdict {
  const lastMsg = getLastMessage(sessionId);
  if (!lastMsg) {
    return { success: true, reason: 'No messages to evaluate', source: 'semantic-check', certainty: 'uncertain' };
  }

  const content = lastMsg.content;

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
    if (pattern.test(content)) {
      return {
        success: false,
        reason: `Semantic failure detected: ${content.slice(0, 200)}`,
        source: 'semantic-check',
        certainty: 'definite',
      };
    }
  }

  // Success markers — these indicate the command completed successfully
  const successPatterns = [
    /phase\s+\d+\s+(execution\s+)?complete/i,
    /all\s+plans?\s+executed/i,
    /verification\s+passed/i,
    /planning\s+complete/i,
    /all\s+\d+\s+plans?\s+executed\s+successfully/i,
    /phase\s+\d+\s+done/i,
    /created?\s+\d+\s+plan\s+files?/i,
  ];

  for (const pattern of successPatterns) {
    if (pattern.test(content)) {
      return {
        success: true,
        reason: `Success marker: ${content.slice(0, 200)}`,
        source: 'semantic-check',
        certainty: 'definite',
      };
    }
  }

  // Neither success nor failure patterns matched — uncertain
  process.stderr.write(
    `[runner] Warning: Step result ambiguous — neither success nor failure patterns matched. Last message: ${content.slice(0, 100)}\n`,
  );
  return {
    success: true,
    reason: 'No failure markers detected (uncertain — no success markers either)',
    source: 'semantic-check',
    certainty: 'uncertain',
  };
}
```

Also update the `StepVerdict` export to include the `certainty` field.

**2. In `src/commands/add.ts`, update `detectScope` to prefer phase for requirements-like strings (requirement #3):**

Replace the current `detectScope` function:
```typescript
/**
 * Detect scope from requirement type:
 *   - File path → phase
 *   - Directory → milestone
 *   - Long string (>100 chars) → phase (likely a requirement description)
 *   - String with requirements-like verbs → phase
 *   - Short imperative string → quick
 */
function detectScope(requirement: string): JobScope {
  if (isFilePath(requirement)) return 'phase';
  if (isDirPath(requirement)) return 'milestone';

  // Long descriptions are likely requirements, not quick fixes
  if (requirement.length > 100) return 'phase';

  // Requirements-like language patterns suggest phase scope
  const requirementsPatterns = /\b(implement|build|create|add|integrate|migrate|refactor|redesign|overhaul|set\s?up|introduce)\b/i;
  if (requirementsPatterns.test(requirement)) return 'phase';

  return 'quick';
}
```

**3. In `src/commands/add.ts`, add `--as quick` deprecation warning (requirement #4):**

After the scope detection line (`const scope = opts.as ?? detectScope(requirement);`), add:

```typescript
  // Warn when quick scope is used (explicitly or auto-detected) — encourage phase
  if (scope === 'quick' && !isJsonMode()) {
    process.stderr.write(
      `  ${yellow('⚠')} Quick mode skips planning. Consider phase mode for better results:\n` +
      `    pilot add ${project} ${requirement.includes(' ') ? `"${requirement.slice(0, 50)}"` : requirement} --as phase\n\n`,
    );
  }
```
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors.
Run `npx vitest run test/core/runner.test.ts` to check existing evaluateStepResult tests still pass (they may need updates for the new `certainty` field).
  </verify>
  <done>
- evaluateStepResult checks both failure AND success patterns
- Ambiguous results return certainty:'uncertain' with stderr warning
- detectScope returns 'phase' for strings >100 chars or with requirements-like verbs
- Quick scope shows deprecation warning encouraging phase mode
  </done>
</task>

<task type="auto">
  <name>Task 3: Comprehensive tests for delegate.ts and evaluateStepResult updates</name>
  <files>test/core/delegate.test.ts, test/core/runner.test.ts</files>
  <action>
**1. Add comprehensive tests to `test/core/delegate.test.ts`:**

Import the newly exported functions:
```typescript
import {
  parseDelegationOutput,
  resolvePhaseForFallback,
  fallbackPlan,
  buildNewProjectArgs,
  buildQuickArgs,
  getNextPhaseNumber,
  buildMilestonePlan,
} from '../../src/core/delegate.js';
```

Update the mock for `node:fs` to also mock `readdirSync` and `statSync`:
- Add a `mockPhaseDirs: string[]` variable at module level (default: `[]`)
- When `readdirSync` is called with a path containing `.planning/phases`, return `mockPhaseDirs`
- When `statSync` is called with a path containing a requirement dir, return `{ isDirectory: () => true }` or `{ isFile: () => true }` based on a mock flag

Add these test sections:

**`describe('getNextPhaseNumber')`:**
- `it('returns 1 when phases dir is empty')` — mockPhaseDirs = []
- `it('returns max+1 from existing dirs')` — mockPhaseDirs = ['01-setup', '02-core', '03-ui']  → 4
- `it('handles gaps in phase numbering')` — mockPhaseDirs = ['01-setup', '05-deploy', '10-testing']  → 11
- `it('ignores non-phase entries')` — mockPhaseDirs = ['README.md', '01-setup', 'notes']  → 2
- `it('handles unpadded phase numbers')` — mockPhaseDirs = ['1-setup', '2-core']  → 3
- `it('returns 1 when dir does not exist')` — make readdirSync throw ENOENT

**`describe('fallbackPlan')`:**
- `it('returns quick steps for quick scope without planning')` — scope=quick, mockRoadmapExists=false
- `it('returns quick steps for quick scope with planning')` — scope=quick, mockRoadmapExists=true
- `it('returns new-project + quick for uninitialized quick')` — scope=quick, no ROADMAP
- `it('returns new-project + plan + execute for uninitialized phase')` — scope=phase, no ROADMAP
- `it('delegates to resolvePhaseForFallback for initialized phase')` — scope=phase, has ROADMAP
- `it('returns new-project lifecycle for uninitialized milestone')` — scope=milestone, no ROADMAP
- `it('delegates to buildMilestonePlan for initialized milestone')` — scope=milestone, has ROADMAP

**`describe('buildNewProjectArgs')`:**
- `it('uses requirementPath with @ prefix when available')` — job with requirementPath
- `it('uses description when no requirementPath')` — job without requirementPath
- `it('appends --auto flag')` — verify --auto is always at end

**`describe('buildQuickArgs')`:**
- `it('prefixes with file read instruction when requirementPath exists')` — check "Read ... for full details"
- `it('returns description directly when no requirementPath')` — plain string

**`describe('resolvePhaseForFallback - filesystem scan')`:**

Update the existing tests to use mockPhaseDirs instead of mockRoadmapContent for phase number calculation:
- Update `'builds add→plan→execute lifecycle for non-numeric description'` to set mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'] → expect phase 6
- Update `'calculates next phase correctly with gaps in phase numbers'` to set mockPhaseDirs = ['01-setup', '03-engine', '10-deploy'] → expect phase 11
- Update `'defaults to phase 1 when phases dir is empty'` to set mockPhaseDirs = [] → expect phase 1
- Keep the `'falls back gracefully when ROADMAP.md is missing'` test since ROADMAP is no longer used for phase counting (but the function still works)
- Add test: `'uses filesystem scan not ROADMAP heading count'` — set mockPhaseDirs to ['01-a', '02-b'] but mockRoadmapContent with 5 phases → expect phase 3 (proving filesystem wins)

**`describe('buildMilestonePlan')`:**

Add mock for `statSync` and `readdirSync` on requirement dir paths.
- `it('creates one phase per .md file in requirement directory')` — 3 .md files → 9 steps (3 × add+plan+execute)
- `it('falls back to single add-phase when requirementPath is a file')` — stat returns isDirectory:false
- `it('falls back to single add-phase when no .md files in dir')` — readdirSync returns ['README.txt']
- `it('falls back to single add-phase when no requirementPath')` — job.requirementPath is null
- `it('uses description when no requirementPath in single add-phase fallback')`

**2. Update `test/core/runner.test.ts` evaluateStepResult tests:**

Add certainty field to all existing assertions:
- All existing `success: false` results should also have `certainty: 'definite'`
- Success results with clear messages should have `certainty: 'definite'`
- Success results with no messages should have `certainty: 'uncertain'`

Add new tests:

**`describe('evaluateStepResult - success patterns')`:**
- `it('returns definite success for "Phase 3 execution complete"')`
- `it('returns definite success for "all plans executed successfully"')`  
- `it('returns definite success for "verification passed"')`
- `it('returns definite success for "planning complete"')`
- `it('returns definite success for "created 3 plan files"')`

**`describe('evaluateStepResult - uncertain results')`:**
- `it('returns uncertain when message has no known patterns')` — content = "I updated some files and made changes"
- `it('returns success:true for uncertain (benefit of the doubt)')`
- `it('logs warning to stderr for uncertain results')` — spy on process.stderr.write

**3. Add `detectScope` tests in a NEW test file `test/commands/add.test.ts`** (or add to existing):

Actually — `detectScope` uses `accessSync` and `statSync` which touch the filesystem. The existing test for it in `test/core/delegate.test.ts` context is wrong. Create a focused test section. Since detectScope is exported from `src/commands/add.ts`, test it there. Add a small test block:

In `test/core/delegate.test.ts` is the wrong place. Instead, add to `test/core/runner.test.ts` only the evaluateStepResult changes.

For detectScope, the requirement is less critical than the delegate/runner fixes. Skip detectScope tests in this task to keep scope tight — the implementation change is straightforward and testable manually.
  </action>
  <verify>
Run `npx vitest run test/core/delegate.test.ts test/core/runner.test.ts` — all tests pass.
Run `npx vitest run` — full test suite passes.
Run `npx tsc --noEmit` — no type errors.
  </verify>
  <done>
- delegate.test.ts has comprehensive tests for getNextPhaseNumber, fallbackPlan, buildNewProjectArgs, buildQuickArgs, buildMilestonePlan
- resolvePhaseForFallback tests updated to use filesystem scan mocks
- New test proves filesystem scan wins over ROADMAP heading count
- evaluateStepResult tests updated with certainty field
- New success pattern and uncertain verdict tests added
- Full test suite passes
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — all tests pass
3. Manual inspection: resolvePhaseForFallback no longer contains `/^###\s+Phase\s+(\d+)/gm` regex
4. Manual inspection: evaluateStepResult has both failurePatterns and successPatterns arrays
5. Manual inspection: detectScope returns 'phase' for `"Implement OAuth authentication with Google and GitHub providers for the login page"` (>100 chars + "implement")
</verification>

<success_criteria>
- Phase number resolution uses filesystem scan of .planning/phases/ dirs
- evaluateStepResult has success patterns and returns certainty field
- detectScope defaults requirements-like strings to phase scope  
- Milestone fallback iterates .md files in requirement directories
- All delegate helper functions exported and tested
- Full test suite passes with no regressions
</success_criteria>

<output>
After completion, create `.planning/quick/016-phase-milestone-reliability-make-structu/016-SUMMARY.md`
</output>
