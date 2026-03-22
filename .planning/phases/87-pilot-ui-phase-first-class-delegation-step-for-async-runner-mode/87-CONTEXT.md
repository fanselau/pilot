# Phase 87: Pilot UI Phase — First-Class Delegation Step for Async Runner Mode - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-ui-phase-as-first-class-delegation-step.md)

<domain>
## Phase Boundary

Make `ui-phase` a first-class delegation step in Pilot's async runner. The delegation AI decides whether a phase needs UI-phase handling. The runner executes that step explicitly before planning. This avoids depending on upstream interactive UI gating while keeping the decision smart, phase-specific, and observable.

Scope:
- DelegationIntent type extension for ui-phase awareness
- Runner step insertion for ui-phase before plan-phase
- Delegation prompt update for UI-phase decision-making
- Async-safe policies for upstream interactive branches
- Observability/status surface updates

Out of scope:
- Modifying upstream GSD ui-phase.md workflow itself
- Changing the gsd-ui-researcher or gsd-ui-checker agents
- Changing the plan-phase interactive UI safety gate (upstream concern)

</domain>

<decisions>
## Implementation Decisions

### Delegation Model
- Delegation AI decides whether UI-phase is needed — not keyword grep heuristics
- UI-phase is an explicit orchestration concept, either a new intent field or step type
- The delegation decision must be recorded in job metadata / execution state
- Delegation reads requirement, roadmap context, and codebase context to decide

### Runner Control Flow
- When delegation includes UI-phase, runner executes it explicitly before plan-phase
- Canonical UI phase flow: add-phase → ui-phase → plan-phase → execute-phase → judge
- If UI-SPEC already exists, runner skips ui-phase and continues (no upstream question)
- Non-UI phases preserve today's normal plan/execute flow exactly
- For existing phases, if UI-phase requested and no UI-SPEC exists, runner inserts ui-phase before planning

### Async-Safe Policies
- If UI-SPEC already exists: do NOT invoke upstream ui-phase again — reuse and continue
- Surface that the step was skipped due to existing UI-SPEC
- If upstream revision loop exhausts: do NOT auto-force-approve, do NOT hang — fail clearly with specific UI-phase failure reason
- Treat upstream ui-phase as autonomy-compatible only for first-time UI-SPEC generation
- If runtime behavior introduces unexpected interaction, fail loudly rather than silently stalling

### Observability
- Status/job detail must show whether a phase was routed with UI-phase handling
- Execution steps must visibly include ui-phase when it actually ran
- If ui-phase was skipped (UI-SPEC existed), that must be visible in logs/metadata
- If ui-phase fails, it must be surfaced as a distinct workflow step failure

### Compatibility
- Existing job history and non-UI jobs remain compatible with status surfaces
- Existing plan-and-execute behavior does not regress for ordinary phases
- UI-phase insertion logic should be centralized, not scattered
- Pilot should not silently classify every frontend-ish phase as requiring UI-phase — delegation decides

### Claude's Discretion
- Whether to add a new `uiPhase` boolean field to `plan-and-execute` intent vs creating a separate intent type
- Exact format of the delegation prompt additions for UI-phase decision guidance
- How to detect UI-SPEC existence in the runner (filesystem check pattern)
- Exact stderr logging format for UI-phase skip/run/fail events
- Whether to add UI-phase metadata to the Job type directly or store in delegation payload

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream GSD Workflows
- `.opencode/get-shit-done/workflows/ui-phase.md` — Full upstream ui-phase workflow with interactive branches, revision loop, and gsd-ui-researcher/gsd-ui-checker orchestration
- `.opencode/get-shit-done/workflows/plan-phase.md` — Plan-phase step 5.6 UI Design Contract Gate with frontend indicator detection and interactive prompts
- `.opencode/get-shit-done/workflows/settings.md` — workflow.ui_phase and workflow.ui_safety_gate config keys

### Pilot Core Architecture
- `src/core/types.ts` — DelegationIntent type union, StepSource type, JobStep interface, Job interface
- `src/core/delegate.ts` — Delegation AI module: delegate(), parseIntentOutput(), reDelegateForContinuation(), validTypes array
- `src/core/runner.ts` — Runner: intentToSteps() method (lines 900-981), executeStepLoop(), executeCommandStep(), launch() method
- `src/prompts/delegate.md` — Delegation prompt: decision tree, intent output schema, re-query mode
- `src/core/gsd-config.ts` — AUTONOMOUS_GSD_DEFAULTS including workflow.ui_phase and workflow.ui_safety_gate

</canonical_refs>

<specifics>
## Specific Ideas

- The requirement explicitly states: "In Pilot, UI phase is not a question. It is an explicit delegated workflow step."
- The preferred architecture is: delegation decides → runner executes deterministic step sequence → UI/observability surfaces display step presence and outcome
- The upstream `ui-phase` workflow uses `--command gsd-ui-phase` pattern with the standard spawnAndWait mechanism
- The existing `plan-and-execute` intent already has a step sequence pattern: add-phase → plan-phase → execute-phase → judge. Adding ui-phase between add-phase and plan-phase is the natural insertion point.
- The `ui_safety_gate: false` in PILOT_WINS_PATHS suggests Pilot already overrides this to prevent interactive UI gating in plan-phase. The new work makes ui-phase proactive rather than reactive.

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 87-pilot-ui-phase-first-class-delegation-step-for-async-runner-mode*
*Context gathered: 2026-03-22 via PRD Express Path*
