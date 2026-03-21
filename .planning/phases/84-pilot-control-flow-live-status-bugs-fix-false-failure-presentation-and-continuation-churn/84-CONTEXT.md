# Phase 84: Pilot Control-Flow + Live Status Bugs — Fix False Failure Presentation and Continuation Churn - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-control-flow-and-live-status-bugs.md)

<domain>
## Phase Boundary

Fix a cluster of Pilot control-flow and live-status bugs observed around job `4h7d`:
1. Web UI false-failure presentation (stale loader data gating live refresh)
2. Job detail page freezing on outdated status when job is still active
3. Continuation logic churning through `judge:gaps`/`judge:failed` paths incorrectly
4. Productive runs hitting step-cap due to accumulated continuation steps
5. Incorrect `--gaps-only` execution path appearing in wrong context

This is a **Pilot bug cluster** fix — not broader renderer/timeline redesign work.

</domain>

<decisions>
## Implementation Decisions

### Web UI Live-Status Desync
- Trace and fix the exact web UI live-status desync where job detail pages derive active/not-active behavior from stale loader data instead of the latest query snapshot
- Ensure the job detail page continues live polling / SSE invalidation whenever the latest job state is active, even if the initial route loader snapshot was stale
- Fix the specific false-failure presentation path where the UI can keep showing a failed state while a live verifier/executor session is still active

### Status/Reporting Layer Clarity
- Status/reporting layers must clearly distinguish: truly failed jobs, stale UI snapshots, live jobs still executing, and review-pending/review-hold semantics
- Verify with a real or reconstructed case that the web UI no longer freezes on a stale failed label while the job is still active

### Continuation/Control-Flow Fix
- Investigate and fix the continuation/control-flow behavior that caused `4h7d` to accumulate noisy `judge:gaps`/`judge:failed` follow-up steps instead of staying on a clean path
- Investigate why `execute-phase ... --gaps-only` appeared in this run and ensure gap-only execution is only used when it is actually the correct continuation mode

### Step-Cap Interaction
- Revisit step-cap interaction so productive continuation paths do not get killed in a misleading or low-signal way without clearer reasoning/guardrails

### Case Study
- Use job `4h7d` as the primary case study for all investigation and verification

### Documentation
- Write a clear SUMMARY.md explaining: root cause of the stale failed label, root cause of the bad continuation churn, what changed in active/live status detection, what changed in continuation/step-cap handling

### Do NOT
- Do not paper over this by just hiding failed labels in the UI
- Do not remove continuation behavior entirely if the real issue is wrong continuation classification
- Do not weaken useful observability just to make the UI look cleaner
- Do not mix this with unrelated renderer/timeline semantics work beyond what is necessary to fix false live/failed presentation

### Claude's Discretion
- Implementation approach for live-status fix (reactive query vs polling interval vs SSE)
- Specific refactoring patterns for continuation logic
- Test strategy (targeted regression tests vs broader integration)
- Whether to split investigation from implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/pilot-control-flow-and-live-status-bugs.md` — Primary requirements for this phase

### Web UI Job Detail (live status)
- `src/web/app/routes/jobs.$id.tsx` — Job detail route (loader + live refresh gating)
- `src/web/app/components/job-detail/` — Job detail UI components
- `src/web/app/lib/queries.ts` — Query definitions for job data

### Runner / Continuation Logic
- `src/core/runner.ts` — Queue runner state machine
- `src/core/judge.ts` — Judge integration (verdict handling)
- `src/core/delegate.ts` — Delegation pipeline (continuation paths)

### Step-Cap / Control Flow
- `src/core/runner.ts` — Step cap enforcement
- `src/core/types.ts` — Job/step type definitions

</canonical_refs>

<specifics>
## Specific Ideas

- Job `4h7d` is the primary case study — trace its exact execution path
- The stale-loader-gating bug is likely in the job detail route where `isActive` or similar is derived from loader data instead of the latest reactive query
- Continuation churn may stem from the judge returning `gaps`/`failed` verdicts that the runner treats as requiring new continuation steps when the work was actually productive
- The `--gaps-only` appearance suggests the delegation/continuation classification logic has an incorrect branch

</specifics>

<deferred>
## Deferred Ideas

- Targeted regression test around job-detail active polling/SSE gating (nice-to-have)
- Guardrails/logging for future continuation-path diagnosis (nice-to-have)
- Improved operator-facing wording when a run hits step-cap (nice-to-have)

</deferred>

---

*Phase: 84-pilot-control-flow-live-status-bugs-fix-false-failure-presentation-and-continuation-churn*
*Context gathered: 2026-03-21 via PRD Express Path*
