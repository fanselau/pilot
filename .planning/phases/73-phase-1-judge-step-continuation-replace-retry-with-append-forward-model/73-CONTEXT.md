# Phase 73: Judge & Step Continuation — Replace Retry with Append-Forward Model - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/judge-and-retry-v2.md)

<domain>
## Phase Boundary

Replace the entire retry system with an append-forward step model. Jobs get a mutable, append-only step list. The runner executes steps sequentially. When something goes wrong (judge finds gaps, hung session, partial failure), new steps are **appended** with a clear reason — never retry, never go backwards.

This is the single largest runner architectural change since v2 — it replaces retry logic, judge-driven retry scheduling, hung-session retry, and same-failure fingerprinting with one unified mechanism: "ask the delegation AI what to do next."

</domain>

<decisions>
## Implementation Decisions

### Remove Old Retry System (complete removal)
- Delete `scheduleVerificationRetry` method from `src/core/runner.ts`
- Delete `RetryableVerificationFailure` type from `src/core/runner.ts:107-112`
- Delete `normalizeRetryRecommendation` from `src/core/runner.ts:216-224`
- Delete `buildRetryAttemptSummary` method
- Delete `isSameFailureFingerprint` comparison
- Remove retry budget / retry count from judge flow entirely
- Remove `retryRecommendation`, `retryHint`, `failureFingerprint` from judge verdict type
- Remove hung-session retry logic that shares `canRetry()` / `incrementRetryCount()`
- Remove `retry_hint`, `last_failure_fingerprint` DB fields from judge path
- Remove `job_retry_attempts` table writes for judge retries
- Update `src/core/judge-signal.ts` — remove retry field parsing
- Update `src/core/job-detail-query.ts` — remove retry-based rendering

### New: Step Records Schema
- `JobStep` interface: `id` (auto-gen), `jobId`, `index` (0-based), `command`, `args`, `source` (StepSource), `status` ('pending'|'running'|'completed'|'failed'|'skipped'), `sessionId?`, `sessionTitle?`, `reason?`, `startedAt?`, `completedAt?`, `error?`
- `StepSource` type: `'delegation'` | `'judge:gaps'` | `'judge:hung'` | `'judge:failed'` | `'operator'`
- New `job_steps` table in SQLite — append-only, forward status transitions only
- Foreign key to jobs table, index enforces execution order

### New: Runner Step Execution Loop
- Runner processes steps from DB, not from in-memory delegation output
- After judge `gaps_found`: call delegation AI again with step history + gaps
- After hung session: call delegation AI again with hung context
- Delegation re-query produces new steps that are appended to `job_steps`
- Step cap (default 10) prevents infinite loops
- `while (hasMorePendingSteps(jobId))` loop replaces current intent routing

### New: Delegation Re-Query
- `reDelegateForContinuation(job, context)` — new function in `src/core/delegate.ts`
- Sends current step history + judge verdict/gaps + project state to delegation AI
- Delegation AI outputs new steps to append
- Re-query uses same delegation prompt + model, with additional context section
- Re-query sessions must be properly attributed to the job

### New: Judge Verdict (aligned with GSD)
- Verdicts: `"passed"` | `"gaps_found"` | `"failed"` (replaces `pass`/`fail`/`partial`)
- `gaps` array required when verdict is `gaps_found`
- Judge reads VERIFICATION.md as primary evidence (GSD-native)
- Remove `retryRecommendation`, `retryHint`, `failureFingerprint` from prompt
- Remove `doubting` verdict — old `doubting` treated as `gaps_found` during transition

### Fix: Session Attribution in TUI/WebUI
- Every opencode session spawned by the runner MUST be linked to its step via `sessionId` on the step record
- Delegation re-query sessions also get step records (command: `re-delegate`, source: `judge:gaps` etc.)
- TUI/WebUI renders steps as the primary timeline, with sessions nested under their step
- "Load more activity" works because it follows the step chain, not raw session discovery

### Notifications
- Notify on terminal outcomes only: `passed` (completed), `failed` (blocked)
- Notification includes full step history summary
- Intermediate gap-fill steps are silent — no notification until terminal

### Claude's Discretion
- Exact table schema column types and default values for `job_steps` (within the interface constraints)
- Internal helper function signatures and naming
- Step cap configuration mechanism (hardcoded constant vs config)
- Error message wording for step cap exceeded
- Whether to keep the current `job_steps` table name or rename it (the requirements spec says new `job_steps` table but one already exists — need to migrate/extend it)
- How to handle the transition period for in-flight jobs that may still have old-style step records

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/judge-and-retry-v2.md` — Complete PRD with schema, pseudocode, and file-by-file change list

### Core Files (Modified)
- `src/core/runner.ts` — Replace delegation step loop + retry logic with step execution loop
- `src/core/delegate.ts` — Add `reDelegateForContinuation()`, update delegation output to write step records
- `src/core/db.ts` — Extend `job_steps` table, add step CRUD functions, remove/deprecate retry fields
- `src/core/types.ts` — Update `JobStep`, add `StepSource` type, update `DelegationIntent` (add `categories` field)
- `src/core/judge-signal.ts` — Update for new verdict schema, remove retry fields
- `src/core/job-detail-query.ts` — Render steps instead of retry attempts
- `src/prompts/judge.md` — New verdict schema (`passed`/`gaps_found`/`failed`)
- `src/prompts/delegate.md` — Add re-query context section + categories output

### Notification
- `src/core/callback.ts` — Include step history in notification

</canonical_refs>

<specifics>
## Specific Ideas

### Step Execution Loop Pseudocode (from PRD)
```
while (hasMorePendingSteps(jobId)) {
  step = getNextPendingStep(jobId)
  markStepRunning(step.id)

  if (step.command === 'judge') {
    verdict = runJudge(...)
    markStepCompleted(step.id)

    if (verdict === 'passed') → markJobCompleted
    if (verdict === 'failed') → markJobFailed
    if (verdict === 'gaps_found') → reDelegateForGaps(job, verdict)
  } else {
    spawnAndWait(step.command, step.args, ...)
    markStepCompleted(step.id, sessionId)
  }

  if (getTotalStepCount(jobId) > MAX_STEPS) → markJobFailed("step cap reached")
}
```

### Step Timeline Example
```
Job created:
  Step 1: plan-phase 31           [delegation]     ✓
  Step 2: execute-phase 31        [delegation]     ✓
  Step 3: judge                   [delegation]     → gaps_found

  Step 4: plan-phase 31 --gaps    [judge:gaps]     ✓   ← appended at runtime
  Step 5: execute-phase 31 --gaps-only [judge:gaps] ✓   ← appended at runtime
  Step 6: judge                   [judge:gaps]     → passed

Job complete ✅
```

### Cross-Phase Notes
- Phase 2 (skills) depends on this step loop. Skills are injected via `prepareProjectForSpawn()` which wraps each step's spawn.
- Phase 3 (codex) hooks into the step spawn lifecycle. Content adaptation runs per-step.
- `DelegationIntent` gets `categories` as optional field now to avoid second schema migration.

### Existing `doubting` Verdict Migration
- Remove `doubting` from accepted verdicts
- Old judge output with `doubting` → treat as `gaps_found` during transition
- Old `partial` → treat as `gaps_found`

### Node Repair (stays as-is)
GSD's `node_repair` (task-level RETRY/DECOMPOSE/PRUNE/ESCALATE within execution) is complementary and should NOT be touched.

</specifics>

<deferred>
## Deferred Ideas

### Nice to Have (not blocking for this phase)
- `pilot info <id>` shows full step timeline with sources and session links
- `pilot log <id>` shows steps inline with session transcripts
- `pilot steps <id>` — dedicated step history view
- Configurable step cap via `~/.pilot/config.json`
- `pilot add-step <jobId> <command> <args>` — operator can manually append steps to a running job
- WebUI step visualization: timeline view showing initial delegation steps + appended steps with different colors/badges per source

</deferred>

---

*Phase: 73-phase-1-judge-step-continuation-replace-retry-with-append-forward-model*
*Context gathered: 2026-03-20 via PRD Express Path*
