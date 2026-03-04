# Phase Delegation: Revert to Multi-Step Spawning

## Problem

The single-session `gsd-phase` orchestrator is broken because Task() subagents don't get command inlining. When gsd-phase calls `Task("Run /gsd-add-phase ...")`, the subagent receives `/gsd-add-phase` as literal text, not as a command to execute. The subagent then goes rogue and tries to implement the feature itself instead of following the add-phase workflow.

Additionally, `plan-phase --auto` has a broken auto-advance that calls execute-phase via Task() internally — same problem. And if delegation also outputs execute-phase as a step, execution happens twice.

## Solution

Revert to multi-step delegation where each GSD command runs in its own opencode session spawned by the runner. Each session gets proper command inlining via `opencode run --command gsd-add-phase`.

## Requirements

### 1. Delegation Output: Multi-Step Plans

Change `delegate.ts` to output separate steps instead of single `{ command: 'phase' }`:

```javascript
// OLD (broken):
{ steps: [{ command: 'phase', args: '@requirements/foo.md --auto' }] }

// NEW (working):
{ steps: [
  { command: 'add-phase', args: 'Feature Title' },
  { command: 'plan-phase', args: '6 @requirements/foo.md' },  // NO --auto
  { command: 'execute-phase', args: '6' }
]}
```

### 2. State-Aware Step Selection

Delegation must check project state and skip steps that aren't needed:

**Check for existing phase:**
- Scan `.planning/phases/` for directory matching the requirement title (fuzzy match on slug)
- If found → skip add-phase, use that phase number

**Check for existing plans:**
- Look for `*-PLAN.md` files in the phase directory
- If plans exist → skip plan-phase

**Check for executed plans:**
- Compare `*-PLAN.md` count vs `*-SUMMARY.md` count
- If all plans have summaries → skip execute-phase (phase already complete)

Example scenarios:
- New requirement, no phase → `[add-phase, plan-phase, execute-phase]`
- Phase exists, no plans → `[plan-phase, execute-phase]`
- Phase exists, plans exist, not executed → `[execute-phase]`
- Phase fully complete → empty steps or skip job

### 3. Remove --auto from plan-phase

Never pass `--auto` to plan-phase in delegation args. The `--auto` flag triggers a broken Task() call to execute-phase inside plan-phase, which:
1. Doesn't work (Task() can't inline commands)
2. Would double-execute if delegation also has execute-phase step

### 4. Update pilot-gsd: Remove Auto-Advance Task()

In `pilot-gsd/get-shit-done/workflows/plan-phase.md`, remove or disable the auto-advance section that spawns execute-phase via Task():

```markdown
## 14. Auto-Advance Check
...
Spawn execute-phase as Task:  ← REMOVE THIS
```

Options:
- **Option A:** Remove auto-advance entirely — plan-phase just plans, delegation handles execution
- **Option B:** Keep auto-advance but use a different mechanism (e.g., exit with special code that runner interprets)

Recommend Option A for simplicity.

### 5. Remove gsd-phase Command

Since we're not using the single-session orchestrator anymore:
- Remove `gsd-phase` from delegation's valid commands
- Optionally delete `pilot-gsd/commands/gsd-phase.md` or mark it deprecated

### 6. Fix TUI Kill (Bonus)

The TUI kill shortcut (K) only works when `panelFocus() === 'running'`. It should also work:
- In detail view when viewing a running job
- When any panel is focused but a running job is selected

## Files to Modify

**pilot repo:**
- `src/core/delegate.ts` — revert resolvePhaseForFallback to multi-step, add state checking
- `src/core/runner.ts` — ensure it handles multi-step plans correctly (should already work)
- `src/tui/app.tsx` — fix K shortcut to work in detail view

**pilot-gsd repo:**
- `get-shit-done/workflows/plan-phase.md` — remove auto-advance Task() section
- `commands/gsd-phase.md` — deprecate or remove

## Acceptance Criteria

- [ ] `pilot add project requirements/foo.md` with new requirement creates 3-step plan: add-phase → plan-phase → execute-phase
- [ ] Each step runs in separate opencode session with proper command inlining
- [ ] Existing phase (with plans) skips add-phase and plan-phase, only runs execute-phase
- [ ] Fully completed phase results in no steps (or job marked complete immediately)
- [ ] No `--auto` flag in plan-phase args
- [ ] TUI K shortcut works from detail view on running jobs
- [ ] pilot-gsd plan-phase no longer attempts Task() auto-advance

## Do NOT

- Keep the single-session gsd-phase approach — Task() subagents can't execute commands
- Pass --auto to plan-phase — triggers broken auto-advance
- Assume delegation AI will figure out the steps — use deterministic state checking
