# Phase Redesign Edge Cases & Retry Fixes

## Problem
The phase redesign (`woh3`, quick-021) shipped the core gsd-phase + pilot-judge architecture, but code review found several edge cases in retry/shutdown paths and a missing requirement (milestone decomposition).

## Goal
Harden the phase redesign so retry, shutdown, and milestone paths all work correctly.

## Requirements

### Must Have

- [ ] **`resetToPending` must clean up stale state**
  - Delete old `job_steps` for the job (`DELETE FROM job_steps WHERE job_id = ?`)
  - Clear `session_titles` (set to NULL or empty)
  - This prevents stale steps appearing in TUI and stale session titles matching in reconciler pgrep

- [ ] **Shutdown during judge → resetToPending, not markFailed**
  - In `launch()`, after the phase session completes and before/during judge evaluation, check `this.shuttingDown`
  - If shutting down during judge: call `resetToPending(job.id, 'Interrupted during judge evaluation')` and return
  - The phase session already completed — marking the job as failed loses that work
  - Wrap the judge call specifically:
    ```
    if (this.shuttingDown) { resetToPending(...); return; }
    const verdict = await this.runJudge(...)
    // runJudge throws on shutdown → catch specifically and resetToPending
    ```

- [ ] **Add `resume_hint` column to jobs table**
  - New column: `resume_hint TEXT` on jobs table
  - Migration: `ALTER TABLE jobs ADD COLUMN resume_hint TEXT`
  - `resetToPending(id, resumeHint?)` stores hint in `resume_hint`, NOT in `error` field
  - `buildPhaseArgs()` in delegate.ts reads `job.resumeHint` and appends `--resume` arg when present
  - This way retried phase jobs pick up where they left off instead of starting fresh

- [ ] **Fix judge JSON parsing resilience**
  - Current: tries fenced ```json block, then raw `content.trim()`
  - Add fallback: extract first `{...}` block from content via `/(\{[\s\S]*\})/`
  - Order: fenced block → raw trim → first braces extraction → null
  - Haiku occasionally adds a sentence before or after the JSON

- [ ] **Fix `job.attempts` off-by-one**
  - `claimNextLaunchable` increments `attempts` before `launch()` reads the job
  - The retry check `job.attempts < job.maxAttempts` uses the already-incremented value
  - Either: re-fetch job from DB before retry check, OR document that `maxAttempts=3` means 3 total attempts (2 retries)
  - Recommendation: re-fetch `const freshJob = getJob(job.id)` before the retry decision

- [ ] **Tests for all fixes**
  - Test: resetToPending clears job_steps and session_titles
  - Test: shutdown during judge results in pending status (not failed)
  - Test: JSON parsing handles all three formats (fenced, raw, text-wrapped)
  - Test: resume_hint persists through resetToPending and is read by buildPhaseArgs

### Nice to Have

- [ ] **Milestone decomposition into separate jobs**
  - When a milestone job is launched, instead of creating multiple steps in one job:
    - Create N separate phase jobs with `depends_on` chaining
    - Mark the milestone job as completed after spawning children
    - Each child phase job gets its own judge evaluation and retry budget
  - This is a bigger refactor — can be a separate requirement if needed

## Technical Notes
- `resetToPending` is in `src/core/db.ts`
- `launch()` is in `src/core/runner.ts`  
- `buildPhaseArgs` is in `src/core/delegate.ts`
- `runJudge` is in `src/core/runner.ts`
- The judge session title format is `pilot-judge-{jobId}-{ts}`
- `job_steps` table has FK on `job_id`

## Do NOT
- Change the core gsd-phase → pilot-judge architecture (it's correct)
- Remove benefit-of-doubt on judge failure (null → markCompleted stays)
- Touch milestone decomposition in this requirement (defer to separate req unless trivial)
- Break existing tests — all 320+ must stay green
