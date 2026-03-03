# Pilot Requirement: Phase Execution Success Contract + Safe Phase Mapping

## Problem
Pilot can mark `phase` jobs as completed even when `gsd-execute-phase` produced a semantic failure (e.g., no matching phase directory/plans). Also, phase fallback currently maps requirement-file titles directly into `execute-phase` args, which often does not correspond to executable phase identifiers.

## Goal
Ensure Pilot phase jobs are reliable and semantically correct:
1. Correct command mapping for file-based phase requests
2. Accurate job status based on execution outcome, not only process lifecycle
3. No false `completed` status on shutdown/interruption

## Requirements

### R1 — Safe phase delegation mapping
When `scope=phase` and project has `.planning/ROADMAP.md`:
- If `requirement_path` is present and does **not** resolve to existing executable phase identifier:
  - delegation must either:
    - run `add-phase -> plan-phase -> execute-phase`, or
    - fail fast with explicit actionable error (no execution attempt)
- Must not blindly call `execute-phase <job.description>` for arbitrary markdown titles.

### R2 — Semantic success gating
Runner must not call `markCompleted` unless command-specific success is verified.

Minimum for `execute-phase`:
- parse final assistant output and detect explicit failure markers (`ERROR`, `no matching phase`, etc.)
- on failure marker: `markFailed` with extracted reason

### R3 — Interruption-safe status
If runner stops/reloads while a job has remaining steps:
- job status must become `cancelled` (or `failed` with reason `interrupted`), never `completed`.

### R4 — Step-level observability
Persist per-step run metadata in DB:
- command
- args
- session title/id
- started_at/completed_at
- step_status
- completion_verdict_source (e.g., `semantic-check`, `artifact-check`)

### R5 — CLI safety warning for ambiguous phase inputs
`pilot add <project> <file.md>` auto-detected as `phase` should emit warning when no matching phase is discoverable:
- suggest `--as quick`
- or suggest explicit phase lifecycle (add/plan/execute)

## Acceptance Criteria

1. Reproduce old failure case (`phase` job from arbitrary requirement title) now returns `failed` with actionable reason OR automatically creates/plans phase then executes.
2. Any `execute-phase` semantic error cannot end as `completed`.
3. Runner shutdown during job cannot produce false completed status.
4. `pilot log`/status can show step-level verdicts for debugging.

## Non-goals
- Redesign GSD workflows themselves
- Add heavy ML-based output parsing

## Suggested implementation notes
- Add `evaluateStepResult(command, sessionId)` in runner.
- Add `job_steps` table for step-level audit.
- In phase delegate fallback, prefer explicit phase identifier resolution from `.planning/phases/*`.
