# Phase 81: Pilot Human Review Semantics — Autonomy-First, No False Failure - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-human-review-autonomy.md)

<domain>
## Phase Boundary

This phase makes Pilot treat human verification as a first-class autonomy-compatible review state rather than a failure mode. It covers two distinct situations:

1. **Final review pending** — autonomous work is complete; only human validation remains. The job should land in a non-failure review-pending state.
2. **Mid-phase review hold** — human verification is required before later plans in the same phase should continue. Pilot must preserve execution state cleanly instead of degrading into fail/block.

The implementation boundary is **Pilot's outer layer** (runner verdict interpretation, job/project state model, blocking policy, notifications, CLI/TUI/web status), consuming stable GSD signals rather than rewriting upstream prompting.

</domain>

<decisions>
## Implementation Decisions

### Semantic Model — New Job Statuses
- Introduce new job status vocabulary: at minimum `completed_pending_review` for final-review-pending situations
- `completed_pending_review` is a terminal-ish state where autonomous work is done, but human hasn't validated yet
- For mid-phase review hold, define `review_hold` or equivalent state where the job is paused at a checkpoint boundary
- Both new states MUST NOT trigger project blocking
- Both new states MUST NOT use failure semantics (red icons, "failed" language, blocked badges)

### Verdict Normalization
- The runner's judge verdict handler must distinguish between:
  - **true failure** — code is broken, tests fail → `failed` status + project block
  - **autonomous follow-up needed** — gaps_found/doubting → existing continuation flow (already works)
  - **completed but pending human review** — autonomous work done, human items remain → `completed_pending_review`
  - **paused for human review mid-phase** — checkpoint hit mid-execution → `review_hold`
- Use existing GSD artifacts as canonical source of review intent: checkpoint types in plan frontmatter (`autonomous: false`), verification artifacts/status, continuation/pause artifacts
- Avoid fragile prompt-text heuristics when stable artifacts exist

### Blocking Policy
- `markFailed()` blocks the project — this is correct for true failures
- New `markCompletedPendingReview()` and `markReviewHold()` functions MUST NOT call `blockProject()`
- `claimNextLaunchable()` query MUST treat `completed_pending_review` and `review_hold` as non-blocking for the project (they are NOT in the `running` exclusion set, and they don't trigger blocked project status)
- The queue should continue processing other jobs for the same project when a job is in review-pending state (for `completed_pending_review`)
- For `review_hold`, same-project jobs that depend on the held job should wait, but independent jobs should proceed

### Review Continuation
- When human approves final review: transition `completed_pending_review` → `completed`
- When human finds issues on final review and recovery is feasible: Pilot prefers **forward append / continuation** within the existing job (re-delegate for new steps)
- When recovery is not feasible or unsafe: Pilot surfaces an explicit operator decision point, NEVER auto-queues a new job
- When human decides not to continue: transition to `completed` (accepting as-is) or `cancelled`
- For mid-phase review hold: human approves → resume step execution within the same job; human finds issues → forward-append new steps or stop at operator decision point

### Mid-Phase Review Hold Persistence
- When a mid-phase review hold occurs, Pilot must persist:
  - Phase identity
  - Current plan/progress position (current_step in job_steps)
  - Remaining work (pending steps in job_steps)
  - Human-review request/checklist (from GSD checkpoint artifacts)
  - Enough context to resume safely or stop cleanly at an operator decision point
- The existing `job_steps` table with step status (pending/running/completed/failed/skipped) already tracks intra-phase progress — leverage this

### Detection of Review-Required Situations
- **Final review pending**: After judge verdict, if the only remaining items are human-verify checkpoints (detected from GSD verification artifacts or plan `autonomous: false` frontmatter), classify as review-pending not failed
- **Mid-phase review hold**: When execute-phase encounters a `checkpoint:human-verify`, `checkpoint:decision`, or `checkpoint:human-action` task, the session pauses — Pilot should recognize this pause state and transition to `review_hold` instead of treating it as failure/hung
- Distinguish checkpoint types: `human-verify`, `human-action`, `decision` — don't flatten them into one bucket

### Status/UI Consistency
- Across all surfaces (CLI `pilot status`, TUI dashboard, web UI), review-pending states must show with distinct non-failure styling:
  - `completed_pending_review`: amber/blue "review pending" badge, not red "failed"
  - `review_hold`: amber/blue "review hold" badge, not red "failed"
- Notification callbacks must say "review pending" not "failed" for these states
- `pilot log` must show the review checklist/items that need human attention

### GSD Signal Consumption
- Treat existing GSD artifacts as canonical source:
  - Plan frontmatter `autonomous: false` → plans with human checkpoints
  - Checkpoint task types (`checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`)
  - Verification artifacts (VERIFICATION.md, UAT.md) with human-only remaining items
  - Phase STATE.md position tracking
- Do NOT fork or heavily rewrite upstream GSD prompting
- Do NOT simply relabel all human-review situations as `passed`

### Concrete Case Study
- Use job `efwg` (Web UI Attribution + Mobile Overflow Hardening) as the end-of-phase case study
- In that case: implementation done, automatic gap-closure done, only mobile sweep/UX judgment remained → should have been `completed_pending_review`, not `failed` + blocked

### No Auto-Job Creation
- NEVER auto-queue new jobs as part of review handling or negative-review recovery
- This avoids the same class of over-eager automation removed with auto-retry

### Claude's Discretion
- Exact naming of new status values (`completed_pending_review` vs `review_pending` vs `pending_review`)
- Whether to add a `resume_hint` field or reuse existing `resumeHint` for review checklists
- SQLite migration strategy (ALTER TABLE vs recreate)
- Exact detection heuristic for "only human items remain" in judge verdict interpretation
- Whether `review_hold` needs its own DB status value or can reuse `paused` with a sub-state indicator
- Exact notification template wording for review-pending states
- Whether to add a dedicated `pilot review` CLI command or extend `pilot unblock` semantics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/pilot-human-review-autonomy.md` — Full PRD for this phase

### Runner & State Model
- `src/core/runner.ts` — Runner step loop, judge verdict handling, continuation handlers
- `src/core/db.ts` — SQLite schema, `markFailed()`, `markCompleted()`, `blockProject()`, `claimNextLaunchable()`
- `src/core/types.ts` — `JobStatus`, `Job`, `JobStep` type definitions
- `src/core/judge-signal.ts` — Judge verdict parsing and outcome mapping

### Delegation & Continuation
- `src/core/delegate.ts` — Delegation AI, `reDelegateForContinuation()`
- `src/core/callback.ts` — Notification formatting for completed/failed jobs

### UI Surfaces
- `src/commands/status.ts` — CLI status display
- `src/commands/log.ts` — CLI log display with verdict info
- `src/commands/info.ts` — CLI info display with triage
- `src/commands/unblock.ts` — Project unblock command
- `src/core/job-introspection.ts` — Job triage/why analysis
- `src/tui/state.ts` — TUI state model
- `src/tui/theme.ts` — TUI color mappings
- `web/src/components/ui/status-badge.tsx` — Web UI status badge component
- `web/src/components/job-list.tsx` — Web UI job list with status display

### GSD Integration Points
- `.opencode/get-shit-done/references/checkpoints.md` — Checkpoint type definitions

</canonical_refs>

<specifics>
## Specific Ideas

- The `efwg` job case study: completed implementation + gap-closure, but remaining human-only checks (mobile sweep / UX judgment) caused `failed` + `blocked` status instead of review-pending
- Luca's critical mid-phase case: if review is needed after plan 4 of 8, Pilot must preserve execution state cleanly — the existing `job_steps` table tracks per-step status, which grounds the mid-phase hold design
- The existing `paused` JobStatus value exists in the schema but isn't heavily used — consider reusing it for mid-phase review hold with an indicator of why paused
- The existing `resumeHint` field on Job could store review checklist items
- Migration notes needed: existing `gaps_found` behavior must not silently regress

</specifics>

<deferred>
## Deferred Ideas

- Making review checklists from verification artifacts easy to surface in notifications, CLI/TUI, and web UI (nice-to-have, can be done later)
- Operator-friendly post-review handling pattern (nice-to-have)
- Migration notes for existing `gaps_found` behavior regression prevention (nice-to-have)
- Dedicated status/verdict vocabulary beyond the minimum needed

</deferred>

---

*Phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure*
*Context gathered: 2026-03-21 via PRD Express Path*
