# Runner Refactor — Intent-Based Dispatch

## Problem
The runner currently loops through `DelegationStep[]` sequentially with hardcoded special cases for `execute-phase` (judge) and `new-milestone` (re-delegate). The new intent-based delegation outputs a single intent, and the runner needs to own the full workflow for each intent type.

## Goal
Replace the step loop with intent dispatch. Each intent type has a dedicated workflow function that knows which GSD commands to spawn, in what order, with what flags.

## Requirements

### Must Have

#### Core Dispatch

- [ ] Replace the `for (step of plan.steps)` loop in `executeJob()` with: `await this.executeIntent(job, projectDir, intent)`
- [ ] `executeIntent()` dispatches on `intent.type` to dedicated workflow functions

#### Workflow Functions

- [ ] **`runQuick(job, projectDir, intent)`**:
  1. Spawn `gsd-quick "<description>" [--full] [--research]` based on `intent.flags`
  2. Description must always be non-empty (prevents AskUserQuestion hang in headless mode)
  3. Done after completion

- [ ] **`runInitProject(job, projectDir, intent)`**:
  1. Spawn `gsd-new-project --auto @<prdPath>`
  2. After completion: re-delegate (project now has `.planning/` with phases)
  3. Execute the new intent from re-delegation

- [ ] **`runNewMilestone(job, projectDir, intent)`**:
  1. Spawn `gsd-new-milestone --auto @<prdPath>`
  2. After completion: re-delegate (roadmap now has phases)
  3. Execute the new intent from re-delegation

- [ ] **`runPlanAndExecute(job, projectDir, intent)`** — the core workflow:
  1. If `intent.addPhaseTitle` set: spawn `gsd-add-phase "<title>"`
  2. Spawn `gsd-ui-phase <N>` before planning (creates UI-SPEC.md which plan-phase expects when `ui_phase: true`). GSD internally skips UI-SPEC generation for non-frontend phases, so safe to always run.
  3. If `intent.isGapClosure`: spawn `gsd-plan-phase <N> --gaps --auto`
     Else if `intent.prdPath`: spawn `gsd-plan-phase <N> --prd <prdPath> --auto`
     Else: spawn `gsd-discuss-phase <N> --auto` first (creates CONTEXT.md), then spawn `gsd-plan-phase <N> --auto`
  4. Spawn `gsd-execute-phase <N> --no-transition`
  5. Run judge → read VERIFICATION.md
  6. If judge passes → mark step complete
  7. If judge fails + retry budget remaining → create `plan-and-execute` intent with `isGapClosure: true`, recurse
  8. If judge fails + budget exhausted → fail job, block project, notify
  **NOTE:** `--prd` is strongly preferred over bare `--auto` on plan-phase because it auto-generates CONTEXT.md from the PRD file, bypassing the blocking "No CONTEXT.md" question. When no prdPath exists, run discuss-phase first.

- [ ] **`runExecuteOnly(job, projectDir, intent)`**:
  1. Spawn `gsd-execute-phase <N> --no-transition`
  2. Run judge → same retry logic as plan-and-execute

- [ ] **`runAuditMilestone(job, projectDir, intent)`**:
  1. Spawn `gsd-audit-milestone`
  2. Read `.planning/v{N}-MILESTONE-AUDIT.md` from project dir
  3. If status `passed` → run `runCompleteMilestone()` internally
  4. If status `gaps_found` → spawn `gsd-plan-milestone-gaps --auto` → re-delegate → execute new intent

- [ ] **`runCompleteMilestone(job, projectDir, intent)`**:
  1. Spawn `gsd-complete-milestone <version>`
  2. Notify Luca with milestone summary

#### Command Spawning

- [ ] `spawnAndWait()` remains the low-level primitive — no interface changes needed
- [ ] **Command naming**: GSD installer creates `command/gsd-*.md` (hyphen-separated). OpenCode `--command` uses filename without `.md`: `--command gsd-plan-phase`. The existing `gsdCommand` construction should work.
- [ ] All `execute-phase` calls MUST include `--no-transition` in args
- [ ] All `plan-phase` calls MUST include `--auto` in args
- [ ] Remove hardcoded `if (step.command === ...)` branches entirely
- [ ] Remove `gsd-judge` special case in spawnAndWait — judge is now Pilot-native (separate requirement)

#### Step Tracking

- [ ] Each GSD command spawned within a workflow is still recorded as a step via `recordStep()` for observability
- [ ] The intent type is recorded on the job for debugging: `updateDelegationPlan(job.id, intent)`
- [ ] Re-delegation after init-project/new-milestone is logged

#### Frontend Detection

- [ ] If job has `frontend` in categories, runner sets `workflow.ui_phase: true` in `.planning/config.json` before spawning plan-phase
- [ ] After job completes, optionally restore `ui_phase: false` (or leave it — project-level preference)

## Technical Notes
- `spawnAndWait()` handles the actual opencode session lifecycle (spawn, poll DB, detect completion)
- The runner calls `patchAgentFrontmatter()` (from model system phase) before each job for model control
- Re-delegation is just calling `delegate(job, projectDir)` again — same function, may return different intent based on updated project state
- `--no-transition` prevents GSD from auto-chaining to next phase. Critical since Pilot controls sequencing.
- `--auto` suppresses interactive questions in plan-phase. Combined with `mode: "yolo"` in config, this should be fully headless.
- `--gaps` on plan-phase reads VERIFICATION.md and plans targeted fixes (not full re-plan)
- `--prd <path>` on plan-phase parses requirements into CONTEXT.md automatically, skipping discuss-phase

## Do NOT
- Do NOT keep the old step loop — replace entirely with intent dispatch
- Do NOT hardcode command-specific behavior in spawnAndWait — that stays generic
- Do NOT chain multiple GSD commands in one opencode session — one command per spawn
- Do NOT set `auto_advance: false` — it's needed for within-phase checkpoint auto-approval. Use `--no-transition` to prevent cross-phase chaining.

#### Critical Fixes (from critique)

- [ ] Max re-delegation depth: 3 per workflow call. If re-delegation returns the same intent type that triggered it, throw immediately (prevents init→init loops).
- [ ] After `runInitProject` completes, re-apply `.planning/config.json` (gsd-new-project may overwrite it).
- [ ] `runPlanAndExecute`: do NOT always run ui-phase. Only run when `job.categories` includes `frontend`. Don't rely on GSD's internal skip — Pilot should be the authoritative controller.
- [ ] `runNewMilestone`: new-milestone has NO `--auto` support. DB-based hung detection (gsd-04b) will catch the pending `question` tool call immediately → kill session → `resetToPending` with "Milestone creation needs manual intervention" → notify Luca. Do NOT `markFailed`.
- [ ] Step recording: each GSD command in a workflow function calls `recordStep()` before spawn and `completeStep()` after. Judge sessions should also be recorded as steps.
- [ ] `retryHint` from judge must be passed to re-delegation context. The workflow function passes `job.retryHint` to `delegate()`.
- [ ] DB-based hung detection from gsd-04b applies to all `spawnAndWait()` calls — detects pending `question` tool calls immediately without timeouts.
