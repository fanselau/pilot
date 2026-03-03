---
phase: 26-runner-immediate-dispatch-force-quit
plan: "01"
subsystem: db
tags: [sqlite, transactions, serialization, force-quit, runner]
one-liner: "Atomic job claiming with project-level serialization + operator force-quit state transitions in db.ts"

dependency-graph:
  requires: [25-01]
  provides: [claimNextLaunchable, forceQuitJob, getRunningJobsByProject, ForceQuitResult]
  affects: [26-02, runner.ts]

tech-stack:
  added: []
  patterns: [sqlite-transaction, project-serialization, audit-trail]

key-files:
  created: []
  modified:
    - src/core/db.ts

decisions:
  - "claimNextLaunchable uses db.transaction() for atomic SELECT+UPDATE — prevents TOCTOU race"
  - "Project serialization via NOT IN (SELECT DISTINCT project FROM jobs WHERE status='running')"
  - "Re-fetch row after UPDATE inside transaction to return accurate started_at/attempts values"
  - "getRunningJobsByProject is a thin alias for getRunningJobsForProject — same logic, cleaner name for runner dispatch path"
  - "ForceQuitResult exported as interface (not type) for consistency with existing codebase patterns"
  - "forceQuitJob embeds source in verdict_reason string for audit — no separate column needed"
  - "WHERE status='running' guard on job UPDATE inside forceQuitJob — safe if job transitions between guard check and transaction"

metrics:
  duration: "1m 4s"
  completed: "2026-03-03"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 26 Plan 01: DB Transactional Job Claiming + Force Quit Summary

## What Was Built

Three new exported functions and one exported type added to `src/core/db.ts`:

### `claimNextLaunchable(): Job | null`
Atomically selects and claims the next eligible pending job using `db.transaction()`. Within the transaction:
1. `SELECT` the highest-priority pending job whose `project` is **not** currently in `running` status (enforces same-project serialization)
2. `UPDATE` that job to `status='running'`, `started_at=now()`, `attempts+1`
3. Re-fetch and return the mapped `Job`, or `null` if none available

This replaces the separate `getNextPending()` + `markRunning()` two-step that had a TOCTOU race window.

### `getRunningJobsByProject(project: string): Job[]`
Thin alias for `getRunningJobsForProject()` — returns all running jobs for a given project. Provided for the runner's immediate-dispatch code path.

### `ForceQuitResult` (exported interface)
```typescript
interface ForceQuitResult {
  ok: boolean;
  job?: Job;
  reason?: string;
}
```

### `forceQuitJob(id, source, reason?): ForceQuitResult`
Operator-triggered job termination with consistent state transitions:
- Guards: returns `{ok:false}` if job missing or not running
- Inside `db.transaction()`: marks job `failed` (status, completed_at, error) and all `running` job_steps `failed` (status, completed_at, verdict_reason)
- `source` ('cli' | 'tui') embedded in `verdict_reason` for audit trail

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run lint` passes (tsc --noEmit clean)
- All four symbols (`claimNextLaunchable`, `forceQuitJob`, `getRunningJobsByProject`, `ForceQuitResult`) present and exported from `src/core/db.ts`
- Existing functions (`getNextPending`, `getRunningJobsForProject`, etc.) preserved intact
