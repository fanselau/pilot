---
status: resolved
trigger: "Job detail UI shows unattributed session where it should be classified as Continuation Delegation. Concrete case: job 'cbfs' — continuation/routing session after judge/gap flow renders as unattributed/random instead of being semantically attached and labeled as Continuation Delegation."
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED — pilot-redelegate-* sessions (continuation delegations) were not discovered by getJobTimeline() because it only filtered for pilot-delegate-* prefix. Now both prefixes are discovered and redelegate sessions get their own "Continuation Delegation" group.
test: All 58 tests pass (56 existing + 2 new), full suite 1276 tests pass
expecting: Job 'cbfs' continuation/routing session now renders as "Continuation Delegation" in the UI
next_action: Await human verification on job 'cbfs'

## Symptoms

expected: When a continuation/routing session occurs after a judge/gap flow in a job, it should be classified and labeled as "Continuation Delegation" in the job detail UI, and semantically attached to the parent execution tree.
actual: The continuation/routing session after judge/gap flow renders as "unattributed" or "random" in the job detail UI instead of being properly classified as "Continuation Delegation". Concrete case is job 'cbfs'.
errors: No explicit error messages — this is a semantic classification/attribution bug where the session type is not being correctly resolved.
reproduction: Look at job 'cbfs' in the job detail UI. The continuation/routing session that follows the judge/gap flow should show as Continuation Delegation but instead shows as unattributed.
started: Unknown — classification/modeling issue in the execution-tree resolution pipeline.

## Eliminated

## Evidence

- timestamp: 2026-03-23T00:01:00Z
  checked: delegate.ts session title naming patterns
  found: Initial delegation uses `pilot-delegate-${job.id}-${attempt}-${ts}` (line 428). Continuation delegation uses `pilot-redelegate-${job.id}-${attempt}-${ts}` (line 164). Different prefixes.
  implication: These are discoverable by different prefix patterns.

- timestamp: 2026-03-23T00:02:00Z
  checked: job-detail-query.ts delegation discovery filter (line 626-627)
  found: `const delegationPrefix = 'pilot-delegate-${jobId}-'` — only matches initial delegation sessions. `pilot-redelegate-*` sessions are NOT matched because 'pilot-redelegate-' does NOT start with 'pilot-delegate-'.
  implication: Continuation delegation sessions never get synthetic step refs. Their content gets attributed via Tier 3 contiguous time windows to whatever step they fall within (usually the judge step), or falls to unattributed.

- timestamp: 2026-03-23T00:03:00Z
  checked: computeSemanticLabel function (line 568-584)
  found: `computeSemanticLabel('delegation', source)` returns 'Continuation Delegation' when source.startsWith('judge:'). Returns 'Delegation' otherwise. The classification logic is CORRECT — the problem is that redelegate sessions never get synthetic step refs, so they never reach this classification.
  implication: Fix must create synthetic step refs for pilot-redelegate-* sessions with source starting with 'judge:'.

- timestamp: 2026-03-23T00:04:00Z
  checked: runner.ts continuation handlers (lines 1229-1335)
  found: All three continuation paths (handleGapsContinuation, handleFailedContinuation, handleHungContinuation) call reDelegateForContinuation() and then updateSessionTitles() with the result._sessionTitle. So redelegate sessions ARE in the job's sessionTitles.
  implication: Redelegate sessions are in the BFS queue but don't get their own step group — their content merges into adjacent step groups.

- timestamp: 2026-03-23T00:05:00Z
  checked: Test verification
  found: 2 new tests pass — (1) redelegate sessions get their own Continuation Delegation group with correct source and semanticLabel, content not in unattributed or judge groups; (2) source is correctly inferred from resulting judge-sourced steps (judge:failed, judge:gaps, etc.)
  implication: Fix is mechanically correct.

## Resolution

root_cause: getJobTimeline() in job-detail-query.ts only discovered initial delegation sessions (pilot-delegate-*) for synthetic step ref creation. Continuation delegation sessions (pilot-redelegate-*) have a different title prefix and were completely missed by the discovery logic. Without a synthetic step ref, their content got attributed to adjacent step time windows (misclassified under the judge step) or fell to unattributed. The computeSemanticLabel() function correctly handles the delegation→Continuation Delegation mapping when source starts with 'judge:', but this code path was never reached for redelegate sessions because they never became step refs.
fix: Added pilot-redelegate-* session discovery alongside pilot-delegate-* in getJobTimeline(). Creates synthetic step refs for them with command='delegation' and source inferred from subsequent judge-sourced steps (falls back to 'judge:continuation'). Both delegation types are combined chronologically with sequential negative indices. Updated BFS queue setup and post-BFS child mapping to cover all synthetic sessions.
verification: 58/58 tests pass (including 2 new tests), full suite 1276/1276 pass, TypeScript compilation clean
files_changed: [src/core/job-detail-query.ts, test/core/job-detail-query.test.ts]
