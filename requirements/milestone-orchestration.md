# Milestone Orchestration: Child Jobs + depends_on

## Problem

Milestone scope is broken. Current behavior:
- `gsd-new-milestone` is never called
- `buildMilestonePlan()` creates one giant flat step list (add-phase/plan-phase/execute-phase × N)
- If any phase fails, the entire job fails with no recovery
- No way to pause, resume, or skip individual phases
- `depends_on` field exists in DB but isn't enforced in the runner

## Goal

Milestone jobs become **coordinators** that spawn child phase jobs, with proper dependency chaining and failure handling.

## Requirements

### Must Have

- [ ] **Enforce `depends_on` in runner**: `claimNextLaunchable()` SQL query must check that dependent jobs are completed before claiming
- [ ] **Milestone coordinator flow**: When scope=milestone, delegation outputs `new-milestone` (or `new-project --auto` for uninitialized). After that step completes, runner reads ROADMAP.md and spawns child phase-scope jobs with sequential `depends_on` chaining
- [ ] **Child job spawning**: Runner needs a `spawnChildJobs(parentJobId, projectDir)` function that:
  - Reads `.planning/ROADMAP.md` to find phase numbers
  - Creates one phase-scope job per phase with `depends_on` pointing to previous phase job
  - Links child jobs to parent milestone job (add `milestone_id` or `parent_job_id` field)
- [ ] **Milestone pause on failure**: When a child phase job fails, set milestone status to "paused" and skip remaining dependent jobs (don't dequeue them)
- [ ] **CLI commands**: `pilot milestone status <id>`, `pilot milestone resume <id>` (retry failed phase), `pilot milestone skip <id>` (skip failed phase, continue)
- [ ] **Telegram notification on pause**: When milestone pauses, notify human with milestone name, which phase failed, and resume/skip commands

### Nice to Have

- [ ] `pilot milestone abort <id>` — cancel all remaining phases
- [ ] `pilot milestone list` — show active/paused milestones
- [ ] Configurable review policy: `none` (autonomous), `on-failure` (default), `each-phase` (pause after every phase)

## Technical Notes

- `depends_on` already exists in `types.ts:41` and `db.ts:32` — just needs enforcement in SQL WHERE clause
- Milestone state can be tracked via parent job status + child job statuses (no separate state file needed)
- Runner step loop stays unchanged — child jobs are normal phase-scope jobs
- The milestone coordinator job completes after spawning children (it doesn't wait)

## Do NOT

- Add step injection to the runner loop — keep it simple
- Auto-retry failed AI phases — failures are rarely transient
- Build a DAG scheduler — phases are sequential
- Make the runner stateful — state lives in DB/files
