# Phase Auto-Retry on Verification Failure

## Problem
When a phase's verification fails (judge returns `fail` or `partial`), Pilot marks the job as failed and blocks the project. The follow-up is always manual. GSD's node repair handles task-level failures, but phase-level failures need Pilot-level retry using `--gaps` mode.

## Goal
Two-layer resilience: GSD node repair for task-level failures (within execution), Pilot auto-retry for phase-level failures (after judge verdict).

## Requirements

### Must Have

- [ ] Add `retry_budget` field to Job type (default: 2, configurable via `pilot add --retries N`)
- [ ] Add `retry_count` field to Job type (starts at 0, incremented on each auto-retry)
- [ ] Add `retry_hint` field to Job type (populated from judge verdict's `retryHint`)
- [ ] In `runPlanAndExecute()` workflow (from runner refactor), after judge returns fail/partial:
  1. Check `retry_count < retry_budget`
  2. If budget remaining:
     - If `retryRecommendation === 'retry-resume'`: create intent `{ type: 'plan-and-execute', phaseNumber: N, isGapClosure: true }`
     - If `retryRecommendation === 'retry-full'`: create intent `{ type: 'plan-and-execute', phaseNumber: N, prdPath: originalPrd }`
     - Increment `retry_count`, store `retryHint` for delegation context
     - Execute the new intent (recursive call in runPlanAndExecute)
  3. If budget exhausted: mark failed, block project, notify Luca with all attempt summaries
- [ ] **Same-failure detection**: If two consecutive retries produce identical VERIFICATION.md failure sets (same failing checks), escalate immediately — don't burn budget on same issue
- [ ] Do NOT block the project during auto-retry — only block when budget exhausted
- [ ] `pilot info <id>` shows retry lineage: "Attempt 2/3"
- [ ] `pilot log <id> --chain` shows combined log across all retry attempts (same job ID, multiple sessions)
- [ ] Default retry budget configurable in `~/.pilot/config.json` as `defaults.retry_budget`

### Nice to Have
- [ ] `pilot add --no-retry` flag to disable auto-retry for a specific job
- [ ] Backoff between retries (30s wait)
- [ ] Aggregate retry stats in `pilot status`

## Technical Notes
- `--gaps` on plan-phase reads VERIFICATION.md and plans targeted fixes only — efficient retry
- Node repair (GSD `workflow.node_repair_budget: 2`) runs WITHIN execute-phase. Auto-retry runs AFTER the full phase. Complementary.
- The retry is within the same job — not a new job in the queue. Same job ID, incremented retry_count.
- `retryHint` from the judge is passed as additional context if the runner needs to re-delegate

## Do NOT
- Do NOT retry on `pass` verdicts or cancelled/killed jobs
- Do NOT re-run full plan+execute on `retry-resume` — use `--gaps`
- Do NOT retry infinitely — hard cap at retry_budget
- Do NOT create infinite loops on same failure — detect and escalate

#### Critical Fixes (from critique)

- [ ] Same-failure detection: judge must output a `failureFingerprint` field — structured list of failing items. Compare fingerprints across retries (exact match = same failure). Do NOT compare free-text VERIFICATION.md content.
- [ ] Before running `--gaps`: validate VERIFICATION.md is non-empty (>100 bytes) and well-formed. If invalid → force `retry-full` even if judge recommended `retry-resume`.
- [ ] `retry_count`, `retry_budget`, `retry_hint` MUST be persisted to the job store (SQLite/queue.json). Runner restart must be able to resume retry loop.
- [ ] `HungSessionError` (from DB-based detection of pending `question` tool calls, see gsd-04b) → also counts against retry budget (shared with judge failures).
- [ ] If GSD session times out, judge may still run on incomplete artifacts. If judge returns `null` (no verdict), treat as `fail` with `retryRecommendation: 'retry-full'` — NOT benefit-of-doubt pass.
