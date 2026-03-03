---
phase: quick-021
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # GSD commands (pilot-gsd repo)
  - ~/dev/punchlab/pilot-gsd/commands/gsd-phase.md
  - ~/dev/punchlab/pilot-gsd/commands/pilot-judge.md
  # Runner + delegate simplification
  - src/core/runner.ts
  - src/core/delegate.ts
  - src/core/db.ts
  - src/core/types.ts
  # Tests
  - test/core/runner.test.ts
  - test/core/delegate.test.ts
autonomous: true
must_haves:
  truths:
    - "Phase jobs spawn a single gsd-phase session instead of 3-4 separate step sessions"
    - "gsd-phase orchestrates add→plan→execute via Task() subagents in one session"
    - "After gsd-phase session completes, runner spawns pilot-judge to evaluate results"
    - "Judge reads opencode DB transcript and outputs structured JSON verdict"
    - "Runner uses judge verdict (pass/fail/partial) to decide complete/retry/fail"
    - "Interrupted/shutdown jobs are reset to pending, not marked failed"
    - "Milestone jobs with directory requirements spawn chained per-file phase jobs"
  artifacts:
    - path: "~/dev/punchlab/pilot-gsd/commands/gsd-phase.md"
      provides: "Single-session phase orchestrator command"
    - path: "~/dev/punchlab/pilot-gsd/commands/pilot-judge.md"
      provides: "Phase result evaluator command using opencode DB"
    - path: "src/core/runner.ts"
      provides: "Simplified runner with judge-based evaluation"
    - path: "src/core/delegate.ts"
      provides: "Simplified delegate with single-step phase delegation"
  key_links:
    - from: "src/core/delegate.ts"
      to: "gsd-phase.md"
      via: "fallbackPlan returns single { command: 'phase', args }"
    - from: "src/core/runner.ts"
      to: "pilot-judge.md"
      via: "spawnAndWait after phase session completes"
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "resetToPending for retryable failures"
---

<objective>
Redesign phase mode to use a single-session orchestrator + judge evaluation pattern, replacing the current multi-step delegation → regex evaluation approach.

Purpose: Phase mode has ~36% success rate because 4 AIs play telephone through heuristic regex matching. This redesign makes phase mode work like quick mode (1 session) with a separate judge for evaluation.

Output: gsd-phase command, pilot-judge command, simplified runner.ts and delegate.ts with judge-based evaluation replacing evaluateStepResult/verifyStepArtifacts/verifyWithGraceWindow.
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
@./.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/pilot-cli.md (sections 5, 8, 9 for runner/lifecycle reference)
@src/core/runner.ts
@src/core/delegate.ts
@src/core/db.ts
@src/core/types.ts
@src/core/opencode-db.ts
@~/dev/punchlab/pilot-gsd/commands/gsd-execute-phase.md (template for GSD command format)
@~/dev/punchlab/pilot-gsd/commands/gsd-delegate.md (existing delegation command)
@~/dev/punchlab/pilot-gsd/commands/gsd-quick.md (template for single-session orchestration)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create gsd-phase.md and pilot-judge.md GSD commands</name>
  <files>
    ~/dev/punchlab/pilot-gsd/commands/gsd-phase.md
    ~/dev/punchlab/pilot-gsd/commands/pilot-judge.md
  </files>
  <action>
**gsd-phase.md** — Single-session phase orchestrator command.

Create at `~/dev/punchlab/pilot-gsd/commands/gsd-phase.md` following the existing GSD command format (frontmatter with description, argument-hint, tools).

Frontmatter:
```yaml
---
description: "Orchestrate full phase lifecycle (add→plan→execute) in a single session"
argument-hint: "<description-or-@path> [--phase N] [--resume] [--auto]"
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
  task: true
---
```

The command body should instruct the AI to:

1. Parse arguments: extract requirement source (inline description OR @path to requirement file), --phase N flag, --resume flag, --auto flag
2. Read `.planning/STATE.md` and `.planning/ROADMAP.md` for project context (frontmatter/titles only — stay lean)
3. **Determine phase:** If `--phase N` provided, use that phase number. Otherwise check if a phase already exists for this requirement (scan ROADMAP.md for matching title). If no match, will create one.
4. **If no phase exists:** Call `/gsd-add-phase` via Task() with the requirement title as description. Read the result summary to get the phase number. On failure, retry ONCE, then report failure in final message.
5. **If phase exists but no plans (or no --resume):** Call `/gsd-plan-phase <N> --auto` via Task(). If requirement is a file path, include `@<path>` in the args. On failure, retry ONCE, then report failure.
6. **Execute phase:** Call `/gsd-execute-phase <N>` via Task(). On failure, report what was accomplished and what failed.
7. **If --resume:** Skip add-phase and plan-phase. Scan `.planning/phases/<NN>-*/` for PLAN.md files without matching SUMMARY.md. Execute only remaining plans by calling `/gsd-execute-phase <N> --gaps-only` or similar.

Key behavioral rules:
- Stay LEAN — orchestrator context should be ~20-30k tokens max. Delegate ALL heavy work (code reading, editing, testing) to subagents.
- Read only frontmatter/titles from .planning files, never full content.
- Each subagent (add-phase, plan-phase, execute-phase) gets its own fresh context window.
- If phase has >6 plans, split into two execute-phase calls.
- Final message MUST include a clear result summary: what was done, what succeeded, what failed.
- Final message should mention the phase number, how many plans were executed, and whether all completed.

**pilot-judge.md** — Phase result evaluator command.

Create at `~/dev/punchlab/pilot-gsd/commands/pilot-judge.md`.

Frontmatter:
```yaml
---
description: "Evaluate whether a phase job succeeded by reading opencode DB transcript"
argument-hint: "<requirement-path-or-description> <session-title>"
model: haiku
tools:
  read: true
  bash: true
---
```

The command body should instruct the AI to:

1. Parse arguments: first arg is the requirement path or inline description, second arg is the session title of the phase session to evaluate.
2. Read the requirement file (if a path) to understand what was supposed to happen.
3. Query the opencode DB for the session transcript. Use bash to run: `sqlite3 ~/.local/share/opencode/opencode.db` with queries to get:
   - Session ID from title: `SELECT id FROM session WHERE title = '<title>' ORDER BY time_created DESC LIMIT 1`
   - Message summary: `SELECT json_extract(data, '$.role') as role, substr(COALESCE((SELECT GROUP_CONCAT(json_extract(p.data, '$.text'), char(10)) FROM part p WHERE p.message_id = m.id AND json_extract(p.data, '$.type') = 'text'), ''), 1, 500) as content FROM message m WHERE session_id = '<id>' ORDER BY time_created ASC`
   - Tool call errors: parts with error status
   - The final assistant message (most important — contains result summary)
4. Evaluate: Did the session accomplish the requirement? Check for:
   - Evidence of completed work (commits, file changes mentioned)
   - Error patterns (compilation failures, test failures, crashes)
   - The final message's tone and content (success summary vs error report)
5. Output ONLY a JSON code block with the verdict:
```json
{
  "verdict": "pass|fail|partial",
  "confidence": 0.85,
  "summary": "Human-readable summary for TUI/notifications",
  "retryRecommendation": "none|retry-full|retry-resume",
  "retryHint": "Optional hint for resume, e.g. 'Resume from plan 03'"
}
```

Rules:
- `pass`: Requirement clearly accomplished. Evidence of commits, tests passing, artifacts created.
- `partial`: Some work done but incomplete. Recommend retry-resume.
- `fail`: No meaningful progress or fundamental error. Recommend retry-full (or none if max attempts).
- Model override: Use haiku for speed and cost (this is a cheap evaluation, not creative work).
- Session should complete in <30 seconds.
- Do NOT hallucinate — if the transcript doesn't contain enough info, say confidence is low and verdict is "partial".
  </action>
  <verify>
    Both files exist and have valid YAML frontmatter:
    - `head -10 ~/dev/punchlab/pilot-gsd/commands/gsd-phase.md` shows frontmatter with description, tools
    - `head -10 ~/dev/punchlab/pilot-gsd/commands/pilot-judge.md` shows frontmatter with model: haiku
  </verify>
  <done>
    gsd-phase.md is a complete single-session orchestrator command that delegates to add-phase, plan-phase, execute-phase via Task() calls.
    pilot-judge.md is a complete evaluator command that reads opencode DB transcripts and outputs structured JSON verdicts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Simplify delegate.ts for single-step phase delegation + add resetToPending to db.ts</name>
  <files>
    src/core/delegate.ts
    src/core/db.ts
    src/core/types.ts
    test/core/delegate.test.ts
  </files>
  <action>
**delegate.ts changes:**

Modify `fallbackPlan()` so that for `scope === 'phase'`, it generates a SINGLE step `{ command: 'phase', args: '<args>' }` instead of the current 3-step add→plan→execute sequence.

In `resolvePhaseForFallback()`:
- Replace the 3-step return with a single step:
  ```typescript
  return {
    steps: [{ command: 'phase', args: buildPhaseArgs(job) }],
    reasoning: 'Single-session phase orchestration via gsd-phase',
  };
  ```

Add a new helper `buildPhaseArgs(job: Job): string`:
- If `job.requirementPath` exists: `@${job.requirementPath} --auto`
- If description is a bare number: `--phase ${job.description.trim()} --auto`
- Otherwise: `${job.description} --auto`

Also update the `fallbackPlan` `phase` case when `!hasPlanning`:
- Replace the 3-step new-project + plan + execute with:
  ```typescript
  return {
    steps: [
      { command: 'new-project', args: buildNewProjectArgs(job) },
      { command: 'phase', args: buildPhaseArgs(job) },
    ],
    reasoning: 'Fallback: project not initialized, running new-project then single-session phase',
  };
  ```

For `scope === 'milestone'`:
- If `requirementPath` is a directory with multiple .md files: Do NOT generate per-file steps in delegate. Instead, return a single step `{ command: 'phase', args: ... }` for just the first file. The runner will handle milestone decomposition (Task 3 handles this).
- Actually, keep the existing milestone behavior for now — milestone decomposition at runner level is a separate concern. Just update the milestone steps to use `phase` command instead of separate add/plan/execute steps per file.

Update `buildMilestonePlan()`:
- Replace the per-file 3-step (add→plan→execute) with per-file single step: `{ command: 'phase', args: '@${filePath} --auto' }`

The delegation AI path (`attemptDelegation`) can remain for now — it will naturally start producing single-step plans once gsd-delegate.md is updated, but the fallback is what matters for reliability.

**db.ts changes:**

Add `resetToPending(id: string, resumeHint?: string)` function:
```typescript
function resetToPending(id: string, resumeHint?: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        started_at = NULL,
        error = ?,
        current_step = 0
    WHERE id = ?
  `).run(resumeHint ? `Reset: ${resumeHint}` : null, id);
}
```

Add `judge_verdict TEXT` column to the jobs schema via migration in `migrateSchema()`:
```typescript
"ALTER TABLE jobs ADD COLUMN judge_verdict TEXT",
```

Add `updateJudgeVerdict(id: string, verdict: string)` function:
```typescript
function updateJudgeVerdict(id: string, verdict: string): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET judge_verdict = ? WHERE id = ?').run(verdict, id);
}
```

Export both new functions.

**types.ts changes:**

Add `judgeVerdict` to the `Job` interface:
```typescript
judgeVerdict: string | null;  // JSON string of judge verdict
```

Update `JobRow` mapping in db.ts to include `judge_verdict` field and map it in `rowToJob()`.

**Test updates:**

Update `test/core/delegate.test.ts`:
- Update existing tests for `resolvePhaseForFallback` to expect single `{ command: 'phase' }` step instead of 3 steps.
- Update `buildMilestonePlan` tests to expect `phase` command steps.
- Add test for new `buildPhaseArgs` helper.
  </action>
  <verify>
    `npx vitest run test/core/delegate.test.ts` — all tests pass with updated expectations.
    `npx tsc --noEmit` — no type errors from the new judgeVerdict field and resetToPending function.
  </verify>
  <done>
    delegate.ts generates single `{ command: 'phase' }` step for all phase-scope jobs.
    db.ts has resetToPending() and updateJudgeVerdict() functions with judge_verdict column migration.
    types.ts Job interface includes judgeVerdict field.
    All delegate tests pass with updated expectations.
  </done>
</task>

<task type="auto">
  <name>Task 3: Simplify runner.ts — judge-based evaluation, remove multi-step heuristics</name>
  <files>
    src/core/runner.ts
    test/core/runner.test.ts
  </files>
  <action>
**Runner launch() simplification:**

The current `launch()` method has a complex multi-step loop with inter-step artifact verification, semantic success gating, grace windows, and arg patching. Replace this with a simple pattern:

1. Delegate (get single-step plan)
2. Spawn phase session (spawnAndWait)
3. Spawn judge session (spawnAndWait)
4. Parse judge verdict
5. Act on verdict

Rewrite `launch()`:

```typescript
private async launch(job: Job): Promise<void> {
  const config = getConfig();
  const projectDir = path.isAbsolute(job.project)
    ? job.project
    : path.join(config.projectDir, job.project);

  try {
    this.patchModelsForJob(job, projectDir);

    // Step 1: Delegation — get execution plan (typically single step for phase jobs)
    updateSessionTitles(job.id, [`pilot-delegate-${job.id}-1`]);
    let plan: DelegationPlan;
    try {
      plan = await delegate(job, projectDir);
    } catch (err) {
      throw new Error(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    updateDelegationPlan(job.id, plan);

    // Step 2: Execute each step
    let allStepsCompleted = true;
    for (let i = 0; i < plan.steps.length; i++) {
      if (this.shuttingDown) {
        allStepsCompleted = false;
        skipRemainingSteps(job.id, i, 'Runner shutdown');
        break;
      }

      const step = plan.steps[i];
      const ts = Date.now().toString(36).slice(-4);
      const title = truncateTitle(`${job.project}-${step.command}-${job.id}-${ts}`, 80);
      this.activeJobs.set(job.id, { job, title });
      updateSessionTitles(job.id, [title]);
      this.patchModelsForJob(job, projectDir);

      const currentStepRowId = recordStep(job.id, i, step.command, step.args, title);

      try {
        await this.spawnAndWait(projectDir, step.command, step.args, title);
      } catch (spawnErr) {
        const sessionId = findSessionByTitle(title);
        completeStep(currentStepRowId, 'failed', null,
          spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
          sessionId ?? null);
        throw spawnErr;
      }

      const sessionId = findSessionByTitle(title);
      completeStep(currentStepRowId, 'completed', null, null, sessionId ?? null);
      advanceStep(job.id);

      // Step 3: For phase/milestone commands, spawn judge
      if (step.command === 'phase') {
        const judgeVerdict = await this.runJudge(job, projectDir, title);

        if (judgeVerdict) {
          updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));

          if (judgeVerdict.verdict === 'fail') {
            if (judgeVerdict.retryRecommendation !== 'none' && job.attempts < job.maxAttempts) {
              resetToPending(job.id, judgeVerdict.retryHint);
              process.stderr.write(
                `[runner] Judge verdict: fail (retryable). Resetting ${job.id} to pending.\n`
              );
              return; // Don't mark completed or failed — it's pending again
            }
            throw new Error(`Judge verdict: fail — ${judgeVerdict.summary}`);
          }

          if (judgeVerdict.verdict === 'partial') {
            if (judgeVerdict.retryRecommendation === 'retry-resume' && job.attempts < job.maxAttempts) {
              resetToPending(job.id, judgeVerdict.retryHint ?? '--resume');
              process.stderr.write(
                `[runner] Judge verdict: partial. Resetting ${job.id} to pending with resume hint.\n`
              );
              return;
            }
            // Partial but no retries left — accept as completed
            process.stderr.write(
              `[runner] Judge verdict: partial (no retries left). Accepting ${job.id}.\n`
            );
          }

          // verdict === 'pass' or accepted partial — fall through to markCompleted
        }
        // If judge failed to produce verdict, fall through to markCompleted (benefit of doubt)
      }
    }

    if (allStepsCompleted) {
      markCompleted(job.id);
    } else {
      // Shutdown interrupted — reset to pending instead of cancel
      resetToPending(job.id, 'Interrupted by shutdown');
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    markFailed(job.id, error);
  } finally {
    this.activeJobs.delete(job.id);
  }
}
```

**Add `runJudge()` private method:**

```typescript
interface JudgeVerdict {
  verdict: 'pass' | 'fail' | 'partial';
  confidence: number;
  summary: string;
  retryRecommendation: 'none' | 'retry-full' | 'retry-resume';
  retryHint?: string;
}

private async runJudge(job: Job, projectDir: string, phaseSessionTitle: string): Promise<JudgeVerdict | null> {
  const ts = Date.now().toString(36).slice(-4);
  const judgeTitle = truncateTitle(`pilot-judge-${job.id}-${ts}`, 80);

  // Build judge args: requirement source + session title
  const requirementArg = job.requirementPath ?? job.description;
  const judgeArgs = `${requirementArg} ${phaseSessionTitle}`;

  try {
    await this.spawnAndWait(projectDir, 'pilot-judge', judgeArgs, judgeTitle);
  } catch (err) {
    process.stderr.write(
      `[runner] Judge session failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return null; // Judge failure = benefit of doubt
  }

  // Parse judge output from opencode DB
  const sessionId = findSessionByTitle(judgeTitle);
  if (!sessionId) return null;

  const lastMsg = getLastMessage(sessionId);
  if (!lastMsg) return null;

  try {
    const jsonMatch = lastMsg.content.match(/```json\s*\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : lastMsg.content.trim();
    const verdict = JSON.parse(jsonStr) as JudgeVerdict;

    // Validate required fields
    if (!['pass', 'fail', 'partial'].includes(verdict.verdict)) return null;
    return verdict;
  } catch {
    process.stderr.write(`[runner] Failed to parse judge verdict from session ${judgeTitle}\n`);
    return null;
  }
}
```

**Note about gsd- prefix:** The `spawnAndWait` method prepends `gsd-` to commands automatically. But `pilot-judge` doesn't have `gsd-` prefix. Update spawnAndWait to handle this:
- Change the line `const gsdCommand = command.startsWith('gsd-') ? command : \`gsd-${command}\`;`
- To: `const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : \`gsd-${command}\`;`

**Delete these functions from runner.ts** (they are fully replaced by the judge):
- `evaluateStepResult()` — the entire function and its `StepVerdict` interface
- `verifyStepArtifacts()` — the entire function and its `ArtifactVerification` interface
- `verifyWithGraceWindow()` — the entire method on the Runner class
- `patchStepArgs()` — no longer needed with single-step execution
- `scanPhaseDirs()` — only used by verifyStepArtifacts
- `findPhaseDir()` — only used by verifyStepArtifacts

**Update exports** at the bottom of runner.ts:
- Remove: `evaluateStepResult`, `scanPhaseDirs`, `verifyStepArtifacts`, `patchStepArgs` from exports
- Remove: `StepVerdict` type export
- Add: `JudgeVerdict` type export (if needed externally, otherwise keep private)

**Shutdown handler change:**
In the main `run()` loop, when `shuttingDown` is true and there are active jobs, the jobs should be reset to pending (not cancelled). This is already handled by the new launch() code above — when `this.shuttingDown` is true, it calls `resetToPending` instead of `cancel`.

**Import updates:**
Add imports for `resetToPending` and `updateJudgeVerdict` from `./db.js`.
Remove `cancel` import if no longer used elsewhere (check — it may still be needed for force-quit).

**Test updates for runner.test.ts:**
- Remove tests for `evaluateStepResult`, `verifyStepArtifacts`, `patchStepArgs`, `scanPhaseDirs`
- Update the launch flow tests to expect:
  1. Single phase step (not 3 separate steps)
  2. Judge session spawned after phase session
  3. Judge verdict parsing
  4. resetToPending called on retryable failures
- Add test for `runJudge` verdict parsing (pass, fail, partial cases)
- Add test for judge failure (null verdict → benefit of doubt → markCompleted)
- Add test for shutdown → resetToPending instead of cancel

Keep all pre-spawn check tests (disableSnapshotGc, checkMemory, etc.) — those are unchanged.
Keep killJobSession tests — unchanged.
  </action>
  <verify>
    `npx vitest run test/core/runner.test.ts` — all tests pass.
    `npx tsc --noEmit` — no type errors.
    `grep -c 'evaluateStepResult\|verifyStepArtifacts\|verifyWithGraceWindow\|patchStepArgs\|scanPhaseDirs' src/core/runner.ts` returns 0 (all removed).
  </verify>
  <done>
    runner.ts launch() uses simple spawn-phase → spawn-judge → act-on-verdict pattern.
    evaluateStepResult, verifyStepArtifacts, verifyWithGraceWindow, patchStepArgs, scanPhaseDirs all deleted.
    Shutdown resets interrupted jobs to pending via resetToPending.
    Judge verdict (pass/fail/partial) drives completion/retry/failure decisions.
    All runner tests pass with the new patterns.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — full type check passes
2. `npx vitest run` — all test suites pass
3. `ls ~/dev/punchlab/pilot-gsd/commands/gsd-phase.md ~/dev/punchlab/pilot-gsd/commands/pilot-judge.md` — both GSD commands exist
4. `grep -c 'evaluateStepResult' src/core/runner.ts` — returns 0 (removed)
5. `grep -c 'verifyStepArtifacts' src/core/runner.ts` — returns 0 (removed)
6. `grep -c 'resetToPending' src/core/db.ts` — returns non-zero (function exists)
7. `grep "command: 'phase'" src/core/delegate.ts` — single-step phase delegation confirmed
</verification>

<success_criteria>
- Phase jobs produce ONE gsd-phase session (not 3-4 separate sessions)
- Judge runs as separate session after phase session completes
- Runner uses judge verdict JSON, not regex heuristics, to evaluate results
- Retryable failures reset jobs to pending (not failed)
- Shutdown-interrupted jobs reset to pending (not cancelled)
- All existing tests pass (with updated expectations)
- No regressions in quick-scope job handling (quick jobs unchanged)
</success_criteria>

<output>
After completion, create `.planning/quick/021-phase-redesign-single-session-orchestrat/021-SUMMARY.md`
</output>
