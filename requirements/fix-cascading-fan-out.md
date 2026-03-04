# Fix Cascading Fan-Out Bug (CRITICAL)

## Problem

When a phase job gets stale-reset by the reconciler, the old opencode session's child processes keep running. The new attempt spawns fresh sessions. When each old+new session completes a step, it independently triggers spawning the next step — causing exponential fan-out.

Real-world impact observed on job 3fz8:
- 3x `add-phase` ran (should be 1)
- 4x `plan-phase` ran (should be 1)
- 4x `execute-phase` ran concurrently against the same repo
- ~4x token cost, git conflicts, potential working tree corruption

## Root Cause

Two issues:

### 1. `markStale` doesn't kill orphaned child processes
When reconciler detects a stale job and resets it to pending, it only updates the DB. The old opencode processes (and their spawned subagents) keep running as orphans. When the job restarts, the old sessions AND new sessions both run.

### 2. No guard against duplicate step spawns
In the runner's step-completion handler (`waitForStepCompletion` / the polling loop), when a session for step N finishes, it spawns step N+1 without checking if N+1 is already running or spawned. With multiple sessions for step N (from fan-out), each completion independently triggers N+1.

## Requirements

### Must Have

- [ ] **Kill orphaned processes on stale reset**: When `markStale` (or the reconciler) resets a job, find and kill ALL opencode processes matching that job's session titles before clearing them from DB
  - Parse `job.sessionTitles` JSON before clearing it
  - For each title, find the PID (via `pgrep -f` or process table) and send SIGTERM
  - Wait briefly (1-2s) then SIGKILL any survivors
  - Only then clear session_titles and reset to pending

- [ ] **Guard step spawns with a lock/check**: Before spawning step N+1, verify:
  1. The job is still in `running` state (not reset/cancelled)
  2. No session title for step N+1 already exists in `job.sessionTitles`
  3. The `current_step` in DB matches what we expect
  Use an atomic DB check (SELECT + compare) before the spawn call.

- [ ] **Single step-completion handler**: Ensure only ONE completion event per step triggers the next spawn. Options:
  - Use a DB column `step_N_spawned` flag (set atomically with UPDATE WHERE)
  - Or use the existing `current_step` as a CAS (compare-and-swap): only spawn if `current_step = N` then set to `N+1` atomically

- [ ] **Kill all job processes on `pilot kill --force`**: The kill command should find and terminate all processes matching any session title for that job, not just the "latest" one

### Nice to Have

- [ ] Log warnings when duplicate sessions are detected for the same step
- [ ] Add a `pilot ps` command showing all opencode processes and which job they belong to
- [ ] Periodic orphan scan: find opencode processes whose session titles don't match any running job

## Technical Notes

### Atomic step advancement
```typescript
// In the runner, when step N completes:
const advanced = db.prepare(`
  UPDATE jobs SET current_step = ? 
  WHERE id = ? AND status = 'running' AND current_step = ?
`).run(nextStep, jobId, currentStep);

if (advanced.changes === 0) {
  // Another handler already advanced — skip spawning
  return;
}
// Safe to spawn step N+1
```

### Process cleanup in markStale
```typescript
function markStale(id: string): void {
  const job = getJob(id);
  if (job?.sessionTitles) {
    const titles = JSON.parse(job.sessionTitles);
    for (const title of titles) {
      killProcessByTitle(title); // pgrep -f title → kill
    }
  }
  // Then do the DB reset as before
}
```

### Key files to modify
| File | Changes |
|------|---------|
| `src/core/db.ts` | Atomic step advancement CAS, process kill in markStale |
| `src/core/runner.ts` | Guard spawns with CAS check, single completion handler |
| `src/commands/kill.ts` | Kill all matching processes, not just latest |

## Do NOT

- Do NOT use file-based locks — DB is the single source of truth
- Do NOT skip the process kill step — orphans are the root cause
- Do NOT rely on session title dedup alone — that's a band-aid, not a fix
- Do NOT change the delegation/GSD orchestrator — this is purely a runner/DB issue
