# Plan-Phase Artifact Gating + Grace Window (Fix early false failures)

## Problem
`plan-phase --auto` jobs are being marked failed by artifact checks even though PLAN.md files are created shortly after.

Observed pattern:
- Runner marks `plan-phase` step complete too early (semantic/transport-level signal).
- Immediate artifact check runs before planner/subagent file writes finish.
- Job fails with: `plan-phase X did not create any PLAN.md files`.
- Minutes later, PLAN.md files exist in phase directory.

This creates false failures, noisy queue state, and duplicated work.

## Goal
Make `plan-phase` completion robust and race-safe:
- Do not fail if planning artifacts are still being materialized.
- Tie completion/failure to both session liveness and artifact presence over a bounded grace window.

## Requirements

### Must Have
- [ ] **Step-completion gating for `plan-phase`**
  - `plan-phase` cannot be considered final-success until required artifacts exist.
  - Semantic success text alone is insufficient for terminal success.

- [ ] **Artifact grace window with retries**
  - On initial artifact-miss, retry check for bounded duration (e.g., configurable 60–180s).
  - Retry cadence should be short (e.g., 2–5s), with clear logs.

- [ ] **Session-aware waiting**
  - While `plan-phase` session is still active/recently-updating, do not immediately fail artifact check.
  - Only fail when artifacts absent AND session has exited or idle beyond threshold.

- [ ] **Deterministic terminal conditions**
  - Success: artifacts present within grace window.
  - Failure: artifacts absent after grace window + inactive/idle session.
  - Error message must include timing context (window elapsed, session last update).

- [ ] **No duplicate phase pollution**
  - Prevent cascading retries from creating extra add/plan phases when previous plan-phase eventually materializes files.

- [ ] **Structured logs**
  - Emit explicit runner events for:
    - artifact check started
    - retry attempts
    - session active/inactive decision
    - final pass/fail reason

- [ ] **Tests**
  - Reproduce race where PLAN files appear after initial miss but within grace window → job should pass.
  - Reproduce no-files + dead session → job should fail.
  - Ensure non-plan commands keep existing artifact behavior unchanged.

### Nice to Have
- [ ] Config knobs in runner config for grace duration and poll interval.
- [ ] Status hint (`artifact pending`) during grace window.

## Acceptance Criteria
- Jobs like prior `hiow/41fl/fdkp` no longer false-fail when PLAN files are written shortly after step return.
- Runner logs clearly show retry timeline and final decision basis.
- Queue state remains consistent (no manual DB interventions needed for this failure class).

## Do NOT
- Do NOT remove artifact checks entirely.
- Do NOT rely only on semantic message parsing for plan-phase success.
- Do NOT block forever waiting for artifacts; bounded timeout required.