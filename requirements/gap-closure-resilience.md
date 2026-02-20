# Gap Closure Resilience

## Problem

When `verify-auto` finds issues, the queue runner enters a "gap closure" cycle:
1. `plan-phase N --gaps` — creates new plans to fix issues
2. `execute-phase N --gaps-only --auto` — executes only the gap plans

If this cycle fails repeatedly (e.g., agent dies after 6 messages), the whole build is marked FAIL. On re-queue, the runner re-enters gap closure because it sees the gap plans exist, creating an infinite failure loop.

### What Happened (2026-02-20, pilot Phase 4 TUI)
- Verify found gaps in the TUI plan → created gap plans 04-03 through 04-05
- Gap closure execution failed 3x (agent couldn't do meaningful work in ~6 messages)
- Build marked FAIL, re-queued, re-entered same gap closure loop
- Had to manually kill runner, remove UAT file, reset STATE, and queue a `run-command` for full `execute-phase 4 --auto`
- The full execute handled the superseded plans correctly on its own

### Root Cause
- `--gaps-only` is designed for when execute already ran successfully and verify found issues
- In this case, original plans 01-02 were NEVER executed — verify ran prematurely on just-planned code
- Gap closure created "superseding" plans but `--gaps-only` can't build from scratch — it only patches
- No guard in the runner to check "was execute actually completed?" before entering gap closure

### How GSD Gap Closure Actually Works
1. `execute-phase N --auto` → runs all plans, creates SUMMARY.md files
2. `verify-auto N` → runs UAT → status: `passed` or `gaps_found`
3. If `gaps_found`: `plan-phase N --gaps` creates targeted fix plans from verify recommendations
4. `execute-phase N --gaps-only --auto` executes ONLY the fix plans (not re-running completed plans)
5. Re-verify

**Critical rule:** Gap closure (`--gaps-only`) should ONLY run after a successful execute produced SUMMARY files. If no SUMMARY files exist for the original plans, the phase was never properly executed — run full execute, not gap closure.

## Goal

Pilot's queue runner must correctly distinguish between "needs full execute" and "needs gap closure" based on phase execution state.

## Requirements

### Must Have
- [ ] Before entering gap closure, check that original plans have SUMMARY.md files — if not, run full `execute-phase` instead
- [ ] Phase cycle state machine: `plan → execute → verify → (if gaps AND summaries exist) gap-closure → re-verify → (if still gaps) FAIL`
- [ ] Never run `--gaps-only` when the phase hasn't been fully executed yet
- [ ] Log clearly: "Phase not yet executed, skipping gap closure — running full execute"
- [ ] `pilot stuck` should detect gap closure on unexecuted phases as a misconfiguration

### Nice to Have  
- [ ] Track gap closure attempts in post-mortem JSONL
- [ ] Alert when a build has been in gap closure for >30 min
- [ ] `pilot run --no-gaps` flag to skip gap closure entirely

## Technical Notes
- This affects the phase cycle engine in the queue runner (Phase 3 code)
- Check for SUMMARY.md files: `ls .planning/phases/{phase}/*-SUMMARY.md | wc -l` vs plan count
- A SUMMARY with "Status: Superseded" does NOT count as executed
- Current bash runner blindly enters gap closure whenever verify says `gaps_found` — no state check

## Do NOT
- Remove gap closure entirely — it's useful when it works (fixing real issues after real execution)
- Use gap closure as a substitute for full execution
- Auto-retry indefinitely — cap total attempts
