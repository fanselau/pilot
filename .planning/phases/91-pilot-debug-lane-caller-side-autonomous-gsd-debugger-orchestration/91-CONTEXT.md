# Phase 91: Pilot Debug Lane — Caller-Side Autonomous gsd-debugger Orchestration - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-debug-lane-caller-side-autonomous-gsd-debugger.md)

<domain>
## Phase Boundary

This phase fixes Pilot's unattended debug lane. Today, `scope=debug` jobs route through `gsd-debug` — an interactive orchestrator that calls `question`/`mcp_question` prompts, hangs unattended jobs, and causes cascading failures (recovery routes into phase-style judge logic that fails with "unknown phase number").

The fix: Pilot caller/runner logic must **directly spawn `gsd-debugger`** (the autonomous worker agent) with prefilled context, handle its checkpoint outcomes caller-side, and keep the entire flow in a dedicated debug lifecycle — never touching phase-style judge logic.

**Constraint:** No modifications to installed GSD files (`.opencode/get-shit-done/`, upstream clone). All changes in Pilot caller/runner logic only.

</domain>

<decisions>
## Implementation Decisions

### Debug Routing
- For `scope=debug`, Pilot must stop routing jobs to `gsd-debug` (interactive orchestrator)
- Pilot must instead spawn `gsd-debugger` directly from caller/runner logic
- The `intentToSteps` method's `debug` case must change from `{ command: 'debug', args }` (which maps to `gsd-debug`) to directly spawning `gsd-debugger` with prefilled context

### Prefilled Debugger Prompt
- Pilot must construct a prefilled debugger prompt that includes: issue summary, symptoms/context, debug file path, `<mode>` with `symptoms_prefilled: true`, and a goal appropriate for autonomous Pilot debug runs
- The prompt is passed as an inline prompt to `spawnAndWait` (same pattern as judge sessions), NOT via `--command gsd-debugger`

### Debug-Specific Lifecycle
- Debug jobs must use a debug-specific lifecycle and must not be treated like phase jobs
- Debug jobs must never be routed into phase-style judge logic or any logic that assumes `plan-phase` / `execute-phase` history or a phase number
- No judge step after debug steps — the debugger self-verifies

### Outcome Parsing
- Pilot must parse direct `gsd-debugger` outcomes from the session transcript, handling: `ROOT CAUSE FOUND`, `INVESTIGATION INCONCLUSIVE`, `CHECKPOINT REACHED`, `DEBUG COMPLETE`
- When `gsd-debugger` returns `CHECKPOINT REACHED` with `Type: human-verify` after successful self-verification, Pilot must autonomously spawn a continuation debugger itself (providing `confirmed fixed` checkpoint response)
- If a debug run returns `human-action` or `decision` checkpoint type, Pilot must fail/block clearly with explicit reason instead of hanging

### Interactive Prompt Handling
- Interactive prompt leaks (`question`, `mcp_question`) must no longer hang unattended debug jobs
- The hung-on-prompt detection already exists in the runner — but the hung continuation path must NOT re-delegate debug jobs into phase-style judge logic

### Debug Artifacts
- Preserve debug session artifacts/state in `.planning/debug/` and keep continuation inside the debug lane
- Debug runs that self-verify successfully must reach terminal success without manual intervention

### the agent's Discretion
- Exact structure of the debug result parser (inline functions vs. separate module)
- Whether to create a new `executeDebugStep` method or modify `executeCommandStep`
- Logging format and detail level for debug lifecycle stages
- How to extract the session transcript for outcome parsing (can reuse existing `exportSessionFromDb` pattern)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/pilot-debug-lane-caller-side-autonomous-gsd-debugger.md` — Full requirements and acceptance criteria

### Runner Architecture
- `src/core/runner.ts` — Runner with `intentToSteps()` (line ~926), `executeCommandStep()` (line ~1082), `spawnAndWait()` (line ~1616), `executeJudgeStep()` (line ~1133)
- `src/core/delegate.ts` — Delegation AI intent system, `parseIntentOutput()`, `reDelegateForContinuation()`
- `src/core/types.ts` — `DelegationIntent` type union (line ~200), `SessionState` (line ~227)

### Model Configuration
- `src/core/models.ts` — `AGENT_MODELS` contains `gsd-debugger` model entries for all provider modes

</canonical_refs>

<specifics>
## Specific Ideas

- The `gsd-debugger` agent supports autonomous investigation/fix loops with prefilled symptoms — Pilot should leverage the `symptoms_prefilled: true` mode
- The `spawnAndWait` inline prompt pattern (used for judge sessions) is the correct approach for debug sessions too — avoids the `--command gsd-debug` path entirely
- Case studies from incident chain: `ovm4`, `po5n`, `y6f5` — validate the new path resolves these failure modes
- The existing `hung-on-prompt` → `HungSessionError` path correctly detects interactive hangs but the recovery handler re-delegates incorrectly for debug jobs

</specifics>

<deferred>
## Deferred Ideas

- Nice-to-have: Better status/logging for debug lifecycle differentiation (direct investigation vs. autonomous continuation vs. truly blocked checkpoints)
- Nice-to-have: Small internal abstraction for debug result parsing so future debug-lane changes are not bolted onto phase logic

</deferred>

---

*Phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration*
*Context gathered: 2026-03-23 via PRD Express Path*
