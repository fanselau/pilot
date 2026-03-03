---
phase: quick-024
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/db.ts
  - src/core/types.ts
  - src/core/runner.ts
  - src/core/delegate.ts
  - test/core/db.test.ts
  - test/core/runner.test.ts
  - test/core/delegate.test.ts
autonomous: true

must_haves:
  truths:
    - "resetToPending clears job_steps and session_titles so stale data doesn't appear in TUI or pgrep matching"
    - "Shutdown during judge evaluation resets job to pending (not failed), preserving completed phase work"
    - "resume_hint is stored in a dedicated column and read by buildPhaseArgs to append --resume"
    - "Judge JSON parsing handles fenced blocks, raw JSON, and text-wrapped JSON with surrounding sentences"
    - "job.attempts off-by-one is addressed by re-fetching job before retry decision"
  artifacts:
    - path: "src/core/db.ts"
      provides: "resetToPending with job_steps/session_titles cleanup + resume_hint column migration"
      contains: "DELETE FROM job_steps WHERE job_id"
    - path: "src/core/runner.ts"
      provides: "Shutdown-during-judge guard + off-by-one fix + resilient JSON parsing"
      contains: "shuttingDown"
    - path: "src/core/delegate.ts"
      provides: "buildPhaseArgs reads resumeHint for --resume flag"
      contains: "resumeHint"
    - path: "src/core/types.ts"
      provides: "resumeHint field on Job interface"
      contains: "resumeHint"
  key_links:
    - from: "src/core/db.ts"
      to: "src/core/types.ts"
      via: "resume_hint column mapped to Job.resumeHint"
      pattern: "resumeHint"
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "resetToPending called on shutdown-during-judge"
      pattern: "resetToPending"
    - from: "src/core/delegate.ts"
      to: "src/core/types.ts"
      via: "buildPhaseArgs reads job.resumeHint"
      pattern: "resumeHint"
---

<objective>
Harden the phase redesign (quick-021) retry, shutdown, and judge paths by fixing 5 edge cases:
1. resetToPending must clean up stale job_steps + session_titles
2. Shutdown during judge → resetToPending, not markFailed
3. Add resume_hint column to jobs table (not overloading error field)
4. Fix judge JSON parsing resilience (handle text-wrapped JSON)
5. Fix job.attempts off-by-one (re-fetch before retry decision)

Purpose: Prevent stale TUI data, lost phase work on shutdown, and silent retry failures.
Output: Hardened db.ts, runner.ts, delegate.ts, types.ts with full test coverage.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/phase-redesign-edge-cases-and-retry-fixes.md
@src/core/db.ts
@src/core/runner.ts
@src/core/delegate.ts
@src/core/types.ts
@test/core/db.test.ts
@test/core/runner.test.ts
@test/core/delegate.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB layer — resetToPending cleanup + resume_hint column</name>
  <files>src/core/db.ts, src/core/types.ts, test/core/db.test.ts</files>
  <action>
  1. **Add `resume_hint` column migration** in `migrateSchema()`:
     - Add: `"ALTER TABLE jobs ADD COLUMN resume_hint TEXT"` to the migrations array

  2. **Add `resume_hint` to JobRow interface and rowToJob mapper**:
     - Add `resume_hint: string | null` to `JobRow`
     - Map to `resumeHint: row.resume_hint` in `rowToJob()`

  3. **Add `resumeHint` field to Job interface** in `src/core/types.ts`:
     - Add: `resumeHint: string | null;` after the `error` field

  4. **Fix `resetToPending` to clean up stale state**:
     - DELETE all job_steps for the job: `db.prepare('DELETE FROM job_steps WHERE job_id = ?').run(id);`
     - Clear session_titles: set `session_titles = NULL` in the UPDATE
     - Store resumeHint in the NEW `resume_hint` column (NOT in `error`):
       ```typescript
       function resetToPending(id: string, resumeHint?: string): void {
         const db = getDb();
         db.prepare(`
           UPDATE jobs
           SET status = 'pending',
               started_at = NULL,
               error = NULL,
               current_step = 0,
               session_titles = NULL,
               resume_hint = ?
           WHERE id = ?
         `).run(resumeHint ?? null, id);
         // Clean up step records from previous attempt
         db.prepare('DELETE FROM job_steps WHERE job_id = ?').run(id);
       }
       ```
     - Note: error is now cleared (NULL) instead of being overloaded with "Reset: ..." text

  5. **Add a getter for resume_hint**: Add `getResumeHint(id: string): string | null` helper, or simply ensure it's available via `getJob(id).resumeHint`.

  6. **Tests in db.test.ts** — add a new describe block `resetToPending`:
     - Import `resetToPending` and `getJobSteps` in test imports
     - Test: resetToPending sets status='pending', clears started_at, clears session_titles
     - Test: resetToPending deletes all job_steps for the job
     - Test: resetToPending stores resume_hint in dedicated column (not error)
     - Test: resetToPending with no resumeHint sets resume_hint to null
     - Test: resume_hint persists through getJob and is accessible as `job.resumeHint`
  </action>
  <verify>
  Run `npx vitest run test/core/db.test.ts` — all existing tests pass plus new resetToPending tests pass.
  Check: `getJob(id).resumeHint` returns the stored hint after resetToPending.
  Check: `getJobSteps(id)` returns empty array after resetToPending.
  Check: `getJob(id).sessionTitles` is null after resetToPending.
  Check: `getJob(id).error` is null after resetToPending (not overloaded).
  </verify>
  <done>
  - resume_hint column exists via migration
  - Job interface has resumeHint field
  - resetToPending clears job_steps, session_titles, and stores hint in resume_hint column
  - All db.test.ts tests pass including new resetToPending suite
  </done>
</task>

<task type="auto">
  <name>Task 2: Runner — shutdown-during-judge guard + off-by-one fix + JSON parsing resilience</name>
  <files>src/core/runner.ts, test/core/runner.test.ts</files>
  <action>
  1. **Fix judge JSON parsing resilience** in `runJudge()` method:
     - Current code tries: fenced ```json block → raw `content.trim()`
     - Add third fallback: extract first `{...}` block via `/(\{[\s\S]*\})/`
     - New parsing order:
       ```typescript
       try {
         const jsonMatch = lastMsg.content.match(/```json\s*\n([\s\S]*?)\n```/);
         let jsonStr: string;
         if (jsonMatch) {
           jsonStr = jsonMatch[1];
         } else {
           // Try raw trim first
           try {
             JSON.parse(lastMsg.content.trim());
             jsonStr = lastMsg.content.trim();
           } catch {
             // Fallback: extract first {...} block (handles text-wrapped JSON)
             const braceMatch = lastMsg.content.match(/(\{[\s\S]*\})/);
             if (braceMatch) {
               jsonStr = braceMatch[1];
             } else {
               process.stderr.write(`[runner] No JSON found in judge output for session ${judgeTitle}\n`);
               return null;
             }
           }
         }
         const verdict = JSON.parse(jsonStr) as JudgeVerdict;
         if (!['pass', 'fail', 'partial'].includes(verdict.verdict)) return null;
         return verdict;
       } catch {
         process.stderr.write(`[runner] Failed to parse judge verdict from session ${judgeTitle}\n`);
         return null;
       }
       ```

  2. **Add shutdown-during-judge guard** in `launch()` method:
     - BEFORE calling `this.runJudge()`, check `this.shuttingDown`:
       ```typescript
       if (step.command === 'phase') {
         // Check shutdown before starting judge
         if (this.shuttingDown) {
           resetToPending(job.id, 'Interrupted before judge evaluation');
           process.stderr.write(`[runner] Shutdown during phase — resetting ${job.id} to pending (phase completed, judge skipped)\n`);
           return; // Don't mark completed or failed — it's pending for retry
         }

         let judgeVerdict: JudgeVerdict | null;
         try {
           judgeVerdict = await this.runJudge(job, projectDir, title);
         } catch (judgeErr) {
           // If judge threw because of shutdown, reset to pending
           if (this.shuttingDown) {
             resetToPending(job.id, 'Interrupted during judge evaluation');
             process.stderr.write(`[runner] Shutdown during judge — resetting ${job.id} to pending\n`);
             return;
           }
           // Non-shutdown judge error: benefit of doubt
           judgeVerdict = null;
         }

         if (judgeVerdict) {
           // ... existing verdict handling
         }
       }
       ```

  3. **Fix job.attempts off-by-one** in judge verdict handling:
     - `claimNextLaunchable()` already incremented `attempts` before `launch()` was called
     - The retry check `job.attempts < job.maxAttempts` uses the stale pre-increment value from the `job` object passed to `launch()`
     - Fix: re-fetch the job from DB before retry decisions:
       ```typescript
       if (judgeVerdict.verdict === 'fail') {
         const freshJob = getJob(job.id);
         if (judgeVerdict.retryRecommendation !== 'none' && freshJob && freshJob.attempts < freshJob.maxAttempts) {
           resetToPending(job.id, judgeVerdict.retryHint);
           // ...
           return;
         }
         throw new Error(`Judge verdict: fail — ${judgeVerdict.summary}`);
       }

       if (judgeVerdict.verdict === 'partial') {
         const freshJob = getJob(job.id);
         if (judgeVerdict.retryRecommendation === 'retry-resume' && freshJob && freshJob.attempts < freshJob.maxAttempts) {
           // ...
         }
       }
       ```

  4. **Tests in runner.test.ts** — add new describe blocks:
     - **JSON parsing resilience**: Test the 3-format parsing (can be tested by examining runJudge behavior with different getLastMessage return values — but since runJudge is private, test indirectly via launch() or extract parsing into a helper). Alternatively, extract the parsing logic into an exported `parseJudgeVerdict(content: string): JudgeVerdict | null` function for direct testing:
       - Test: fenced ```json block → parsed correctly
       - Test: raw JSON content → parsed correctly
       - Test: text-wrapped JSON ("Here is my evaluation: {...}") → parsed correctly
       - Test: no JSON at all → returns null
     - **Shutdown during judge**: Mock the flow where shuttingDown becomes true between phase session completion and judge — verify resetToPending is called (not markFailed)
     - **Off-by-one**: Verify that getJob is called before retry decision to get fresh attempts count

  NOTE: Consider extracting judge JSON parsing into a standalone exported function `parseJudgeVerdict(content: string): JudgeVerdict | null` to make it easily testable. This avoids fighting the private method testing challenge.
  </action>
  <verify>
  Run `npx vitest run test/core/runner.test.ts` — all existing tests pass plus new tests pass.
  Run `npx vitest run` — full suite green, no regressions.
  </verify>
  <done>
  - Judge JSON parsing handles fenced, raw, and text-wrapped formats
  - Shutdown during judge resets to pending (preserving completed phase work)
  - job.attempts re-fetched from DB before retry decision (no off-by-one)
  - parseJudgeVerdict exported and tested for all 3 formats + failure case
  - All runner.test.ts tests pass
  </done>
</task>

<task type="auto">
  <name>Task 3: Delegate — buildPhaseArgs reads resumeHint + tests</name>
  <files>src/core/delegate.ts, test/core/delegate.test.ts</files>
  <action>
  1. **Update `buildPhaseArgs` to read `resumeHint`** from the job:
     - Current signature: `buildPhaseArgs(job: Job): string`
     - Add logic: if `job.resumeHint` is truthy, append `--resume` to the args
     - Example:
       ```typescript
       function buildPhaseArgs(job: Job): string {
         let args: string;
         if (job.requirementPath) {
           args = `@${job.requirementPath} --auto`;
         } else if (/^\d+$/.test(job.description.trim())) {
           args = `--phase ${job.description.trim()} --auto`;
         } else {
           args = `${job.description} --auto`;
         }

         // Append resume flag when job has a resume hint from prior attempt
         if (job.resumeHint) {
           args += ' --resume';
         }

         return args;
       }
       ```

  2. **Tests in delegate.test.ts** — add tests for resumeHint behavior:
     - Test: buildPhaseArgs with no resumeHint → no --resume flag
     - Test: buildPhaseArgs with resumeHint set → appends --resume
     - Test: buildPhaseArgs with resumeHint + requirementPath → `@path --auto --resume`
     - Test: buildPhaseArgs with resumeHint + bare number → `--phase N --auto --resume`

  Note: The `Job` type already has all fields; just need to pass a job with `resumeHint: 'some hint'` in tests to verify the flag is appended.
  </action>
  <verify>
  Run `npx vitest run test/core/delegate.test.ts` — all existing tests pass plus new resumeHint tests pass.
  Run `npx vitest run` — full suite green (320+ tests), no regressions.
  </verify>
  <done>
  - buildPhaseArgs appends --resume when job.resumeHint is truthy
  - Tests cover all combinations: no hint, hint + requirementPath, hint + bare number, hint + description
  - Full test suite passes with zero regressions
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run` — full test suite passes (320+ tests, zero failures)
2. `npx tsc --noEmit` — type checks pass (resume_hint properly typed end-to-end)
3. Manual: review that resetToPending in db.ts includes DELETE FROM job_steps and session_titles = NULL
4. Manual: review that runner.ts checks shuttingDown before and during runJudge
5. Manual: review that runner.ts re-fetches job via getJob before retry decision
6. Manual: review that judge JSON parsing tries 3 formats in order
</verification>

<success_criteria>
- All 5 Must Have requirements from the spec are implemented
- resume_hint column added via migration (backward-compatible ALTER TABLE)
- resetToPending cleans up stale job_steps + session_titles
- Shutdown during judge → resetToPending (not markFailed)
- Judge JSON parsing handles fenced, raw, and text-wrapped formats
- job.attempts off-by-one fixed via re-fetch before retry decision
- buildPhaseArgs appends --resume when resumeHint is set
- Full test suite (320+ tests) passes with zero regressions
- No Nice to Have items touched (milestone decomposition deferred)
</success_criteria>

<output>
After completion, create `.planning/quick/024-requirements-phase-redesign-edge-cases-a/024-SUMMARY.md`
</output>
