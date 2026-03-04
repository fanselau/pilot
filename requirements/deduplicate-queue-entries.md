# Deduplicate Queue Entries

## Problem
The same requirement can be queued multiple times (e.g. mmx4, y681, jiy3 all for the same bauersachs password-gate task). This wastes runner capacity and can cause conflicts if both run simultaneously on the same project.

## Goal
Prevent duplicate jobs from being queued for the same project + requirement combination.

## Requirements

### Must Have
- [ ] Before inserting a new job, check if a pending or running job already exists with the same `project` (resolved path) AND same `description` or `requirement_path`
- [ ] If duplicate found: print warning `⚠ Job already queued/running: <id>` and exit with code 0 (not an error)
- [ ] Add `--force` or `--allow-duplicate` flag to bypass the check

### Nice to Have
- [ ] Also check recently completed jobs (last 10 minutes) to prevent rapid re-queues of just-finished work
- [ ] Show the existing job's status in the warning message

## Technical Notes
- Check goes in `src/commands/add.ts` after path resolution, before `queueJob()`
- Query the DB: `SELECT id, status FROM jobs WHERE project = ? AND (description = ? OR requirement_path = ?) AND status IN ('pending', 'running')`
- Use the resolved project path for comparison (after the path resolution fix lands)

## Do NOT
- Block `pilot retry <id>` — that's an intentional re-run of a failed job
- Make this check expensive — simple DB query only
