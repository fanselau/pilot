# Runner Immediate Dispatch + Force Quit Controls

## Problem
Two operational gaps are causing friction in day-to-day use:

1. **Queued jobs are not always dispatched immediately** when capacity exists.
   - Expected behavior: if a slot is free and dependencies are satisfied, the runner should launch work right away.
   - Observed behavior: pending jobs can wait even though no hard blocker exists.

2. **No reliable force-quit control from both CLI and TUI** for running jobs.
   - Operators need an explicit emergency stop mechanism for zombie/stale or clearly bad runs.
   - Current state is inconsistent across surfaces and doesn’t provide a single, trustworthy kill path.

## Goal
Make runner scheduling and operator controls predictable:

- Dispatch jobs immediately whenever there is available parallel capacity and dependency constraints are satisfied.
- Provide first-class force-quit controls in both CLI and TUI that terminate active job execution deterministically and update job state correctly.

## Requirements

### Must Have
- [ ] **Immediate dispatch policy in runner loop**
  - After every runner cycle (launch/reap/reconcile), if active jobs < maxParallel, runner must attempt to launch next eligible pending jobs immediately.
  - “Eligible” = dependencies satisfied, not blocked/cancelled/failed dependency chain, project-level serialization respected.

- [ ] **Event-driven wake-up in daemon mode**
  - New queue insertions should wake scheduler promptly (no long idle wait before dispatch).
  - If filesystem/watch-based wake fails, fallback poll must still dispatch within bounded latency.

- [ ] **Project-level concurrency guard (hard)**
  - Never launch two running jobs for the same project concurrently.
  - Enforce this via DB-backed launch selection/claim (not only in-memory checks).

- [ ] **Stale-running reconciler**
  - If job/step is `running` but underlying session/process no longer exists (or has been inactive past threshold), mark as failed with explicit stale/orphan reason.
  - Reconciler must run periodically and during startup to clean ghost-running jobs.

- [ ] **CLI force-quit command**
  - Add explicit command to terminate a running job by ID (e.g., `pilot kill <id> --force`).
  - Behavior:
    - Resolve active session/process for job
    - Kill process tree/session deterministically
    - Mark `job_steps` and `jobs` as failed/cancelled with reason including operator action
    - Return non-zero exit on failure to terminate

- [ ] **TUI force-quit action**
  - Running panel/detail view must expose force-quit action for selected job.
  - Include confirmation UX (unless operator passed an explicit “no-confirm” mode where applicable).
  - After action, UI refresh must reflect terminal state immediately.

- [ ] **Consistent state transitions**
  - Force-quit outcome must be consistent across CLI and TUI:
    - same final statuses
    - same error/verdict semantics
    - same audit message format

- [ ] **Auditability**
  - Record operator-initiated termination metadata (who/where action came from: CLI or TUI) in job error/verdict or structured logs.

- [ ] **Tests**
  - Runner tests proving immediate dispatch when capacity exists.
  - Tests proving project serialization still blocks same-project parallel launches.
  - Reconciler tests for orphan/stale job cleanup.
  - CLI command tests for successful and failed force-quit paths.
  - TUI interaction tests for force-quit action wiring + state refresh.

### Nice to Have
- [ ] Configurable stale timeout (default sensible for production daemon).
- [ ] `pilot status` indicator for “stale suspected” before reconciler marks failure.
- [ ] Bulk force-quit option for all running jobs in one project.

## Technical Notes
- Use SQLite as source of truth for launch claims and state transitions.
- Prefer transactional “claim next launchable job” semantics to prevent race conditions between runner loops/restarts.
- Ensure force-quit uses process-tree termination and does not leave orphan children.
- Reconciler should not race with legitimate long-running steps; base stale detection on concrete missing process/session evidence + timeout, not timeout alone.
- Keep compatibility with existing `job_steps` schema and `session_titles` behavior.

## Acceptance Criteria
- With `maxParallel=2`, one running job, and one eligible pending job, second job starts immediately (no manual trigger).
- If two pending jobs from same project exist, only one may run at a time even with free global slot.
- `pilot kill <id> --force` terminates active execution and updates DB state in one command.
- TUI force-quit performs equivalent termination and state update as CLI.
- After daemon restart, any orphaned `running` jobs are reconciled to terminal status within one reconciliation cycle.
- No ghost-running jobs remain after reconcile.

## Do NOT
- Do NOT rely solely on UI-level actions for termination without backend state reconciliation.
- Do NOT mark jobs terminal without attempting actual process/session termination first (unless process already confirmed gone).
- Do NOT allow same-project parallel execution while implementing “immediate dispatch.”
- Do NOT introduce best-effort-only kill semantics with silent failures.
