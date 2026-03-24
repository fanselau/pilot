# Phase 94: UI-phase completion should not fail the phase pipeline - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/ui-phase-completion-should-not-fail.md)

<domain>
## Phase Boundary

This phase fixes a lifecycle/status accounting bug where a successful ui-phase step is recorded as a failed step in the job's step history, even when the downstream phase flow (plan-phase, execute-phase) continues normally. The issue was observed in real jobs like `dn02` where step 2 shows `ui-phase 36` as failed but the system proceeds into `plan-phase`. This is NOT a visual UI task — it is pipeline correctness and observability truthfulness.

</domain>

<decisions>
## Implementation Decisions

### Root Cause Investigation
- Reproduce the current behavior from a real or representative UI phase run
- Identify why `ui-phase` is being marked failed even when the flow proceeds into `plan-phase`
- Focus on the `executeCommandStep` error handling path in `src/core/runner.ts`

### Fix Requirements
- Fix the runner lifecycle/status mapping so a successful UI-phase handoff is not recorded as a failed step
- The artifact-recovery path (added in quick task o5h) exists but is insufficient — the error may not always be a catch-block error (e.g., session state detection paths in `spawnAndWait`)
- Preserve real failure reporting for actual UI-phase failures (when UI-SPEC is NOT produced)

### Observability
- `pilot status`, `pilot info`, and `pilot log` must reflect the correct non-failure state for UI-phase completion
- Step status in `job_steps` DB table must show `completed` (not `failed`) when UI-SPEC was produced

### Regression Testing
- Add automated coverage for the specific regression: UI-phase succeeds/hands off, downstream plan-phase continues, and the recorded step status is non-failure
- Verify the fix against the active pattern seen in jobs like `dn02`

### Agent's Discretion
- Implementation approach for root-cause identification (static analysis vs runtime reproduction)
- Test fixture design choices
- Whether to consolidate ui-phase completion detection into a single code path or keep multiple safeguards

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Runner lifecycle
- `src/core/runner.ts` — Runner executeCommandStep (lines 1096-1159), spawnAndWait (lines 1893-2149), intentToSteps ui-phase insertion (lines 978-991)
- `src/core/db.ts` — markStepCompleted/markStepFailed (lines 1524-1568), job_steps schema

### Existing ui-phase recovery
- `.planning/quick/260323-o5h-ui-phase-completion-handoff-detection-de/260323-o5h-SUMMARY.md` — Previous artifact recovery fix (catch-block only)
- `test/core/runner.test.ts` — Existing findExistingUiSpec and isUiPhaseArtifactComplete tests (lines 1065-1146)

### Observability surfaces
- `src/commands/info.ts` — resolveCompactStep, buildFailureContext show step status
- `src/commands/log.ts` — Step status rendering
- `src/core/callback.ts` — Notification step status rendering

### Types
- `src/core/types.ts` — DelegationIntent.uiPhase field (line 206), JobStep type

</canonical_refs>

<specifics>
## Specific Ideas

- The `spawnAndWait` function can throw errors from multiple paths: `crashed` state detection, WAL flush race, timeout, session-not-found, etc.
- The catch block in `executeCommandStep` (line 1132) handles `HungSessionError` specially, then has a ui-phase artifact recovery check, then propagates all other errors
- The problem is likely that `spawnAndWait` returns void (no error) in some paths where the session completed with activity but the process died — but the session state may be detected as `crashed` before the WAL flush race handler kicks in, or the `msgCount > 0` safety net returns successfully from `spawnAndWait` without error, but then `detectCheckpointPause` or some other post-spawnAndWait logic causes the step to be marked differently
- Alternative: the error happens BEFORE the catch block artifact recovery — e.g., a `HungSessionError` on `question` tool call from the GSD ui-phase workflow's interactive prompts (which would be expected since ui-phase has interactive components)

</specifics>

<deferred>
## Deferred Ideas

- Do not change unrelated phase orchestration behavior beyond what is needed to fix the misclassification
- Do not convert genuine UI-phase failures into silent passes
- Do not paper over the issue by hiding the step

</deferred>

---

*Phase: 94-ui-phase-completion-should-not-fail-the-phase-pipeline*
*Context gathered: 2026-03-24 via PRD Express Path*
