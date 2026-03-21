# Phase 83: Pilot Human Review Semantics — Phase 81 Follow-up Completion - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-human-review-semantics-phase-81-followup.md)

<domain>
## Phase Boundary

This phase finishes the remaining Phase 81 human-review semantics work that was left incomplete. Job `4h7d` reached 85% completion (17/20 truths) but failed before finishing.

Per the Phase 81 verification (81-VERIFICATION.md), four specific gaps remain:
1. **Mid-phase hold checkpoint detection** — `markReviewHold` is imported in runner.ts but never called
2. **Resume-from-hold execution wiring** — `pilot review --approve` on review_hold sets status to running, but claimNextLaunchable only picks up pending jobs
3. **TUI completed-panel review rendering** — completed_pending_review has no explicit icon/badge/color mapping in the completed panel
4. **REQUIREMENTS.md traceability entries** — REVIEW-01 through REVIEW-16 not present in .planning/REQUIREMENTS.md

</domain>

<decisions>
## Implementation Decisions

### Mid-Phase Hold Checkpoint Detection
- Runner's `executeCommandStep` must detect when a spawned session ends because it hit a checkpoint (human-verify/decision/human-action)
- Detection approach: after spawnAndWait returns, check if the session ended without error but the plan's autonomous flag is false or GSD checkpoint artifacts exist
- When checkpoint pause detected, call `markReviewHold(job.id, reason)` with the checkpoint context
- Notify via callback with review-hold language (already implemented in callback.ts)
- Use artifact-driven detection where possible — check for checkpoint pause indicators in the session/plan rather than fragile prompt-text heuristics

### Resume-From-Hold Execution Wiring
- `resumeFromReviewHold()` already transitions review_hold → running in DB
- The runner's main dispatch loop (`claimNextLaunchable`) only claims `pending` jobs
- Need a mechanism for the runner to pick up a resumed review_hold job and continue its step loop
- Options: (a) change status to pending+re-enqueue, (b) runner watches for running jobs that need continuation, (c) review command directly re-enters step loop
- Since the runner is a persistent daemon, the simplest correct approach is to have `resumeFromReviewHold` set the job back to a state the runner can pick up (pending with step progress preserved)

### TUI Completed-Panel Review Rendering
- `statusIcon()` in completed-panel.tsx needs a case for `completed_pending_review`
- `TERMINAL_STATUSES` set needs to include `completed_pending_review`
- Use amber icon (◑) and color from `statusColors.completed_pending_review` (#FBBF24)
- Review-hold jobs should NOT appear in completed panel (they're in the running/queue panel)

### REQUIREMENTS.md Traceability
- Add REVIEW-01 through REVIEW-16 requirement definitions to .planning/REQUIREMENTS.md
- Add Phase 81 traceability mapping table
- Add Phase 83 as completing the remaining gaps

### Preserve Existing Behavior
- The existing `completed_pending_review` detection in judge step (isHumanOnlyRemaining) MUST NOT be changed
- The no-auto-queue constraint MUST be preserved
- Existing review state display in CLI/web UI MUST NOT regress

### Claude's Discretion
- Exact checkpoint pause detection heuristic (session exit analysis vs artifact check)
- Whether to add a `resumeJob` DB function or modify `resumeFromReviewHold` to reset to pending
- Exact icon choice for completed_pending_review in TUI (can use ◑ matching CLI)
- Test approach — use existing test seams in runner.test.ts and db.test.ts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 81 Artifacts (Case Study)
- `.planning/phases/81-pilot-human-review-semantics-autonomy-first-no-false-failure/81-VERIFICATION.md` — Gaps that this phase closes
- `.planning/phases/81-pilot-human-review-semantics-autonomy-first-no-false-failure/81-01-SUMMARY.md` — DB foundation (types, review state functions)
- `.planning/phases/81-pilot-human-review-semantics-autonomy-first-no-false-failure/81-02-SUMMARY.md` — Runner integration + review CLI
- `.planning/phases/81-pilot-human-review-semantics-autonomy-first-no-false-failure/81-03-SUMMARY.md` — UI display consistency

### Requirements
- `requirements/pilot-human-review-semantics-phase-81-followup.md` — Follow-up PRD

### Source Files to Modify
- `src/core/runner.ts` — executeCommandStep, executeStepLoop, spawnAndWait
- `src/core/db.ts` — claimNextLaunchable, resumeFromReviewHold
- `src/tui/components/completed-panel.tsx` — statusIcon, TERMINAL_STATUSES
- `.planning/REQUIREMENTS.md` — Traceability entries

### Source Files for Context (read-only)
- `src/core/types.ts` — JobStatus type with review states
- `src/core/callback.ts` — Already handles review notification language
- `src/commands/review.ts` — Review CLI command (approve/reject)
- `src/tui/theme.ts` — statusColors with review color definitions

</canonical_refs>

<specifics>
## Specific Ideas

- Job `4h7d` is the primary case study — it's the Phase 81 run that reached 85% but failed before finishing these gaps
- The runner already imports `markReviewHold` at line 66 but never calls it — this is a known incomplete wiring
- `claimNextLaunchable` at db.ts:879 only selects `status = 'pending'` — resumed review_hold jobs need a different pickup mechanism
- The TUI completed panel's `statusIcon` function at completed-panel.tsx:69 has no case for `completed_pending_review` — falls through to default
- `TERMINAL_STATUSES` at completed-panel.tsx:84 is `['completed', 'failed', 'cancelled']` — missing `completed_pending_review`

</specifics>

<deferred>
## Deferred Ideas

- Tests around review-hold detection / resume flow (nice-to-have per requirements)
- Reducing ambiguity between completed_pending_review and review_hold wording across terminal-facing surfaces (nice-to-have)
- Anything related to the runner/control-flow bug that made the original 4h7d run noisy — that's a separate concern

</deferred>

---

*Phase: 83-pilot-human-review-semantics-phase-81-follow-up-completion*
*Context gathered: 2026-03-21 via PRD Express Path*
