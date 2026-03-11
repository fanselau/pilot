---
phase: quick-079
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/types.ts
  - src/core/db.ts
  - src/core/git-recovery.ts
  - src/core/runner.ts
  - test/core/db.test.ts
  - test/core/git-recovery.test.ts
  - test/core/runner-recovery.test.ts
autonomous: true

must_haves:
  truths:
    - "Dirty-start preflight classifies dirty state against Pilot provenance instead of blanket clean/dirty gating"
    - "A same-project follow-up job can start on dirty state when it matches the most recent Pilot baseline with no interference"
    - "Launch is blocked when dirty state is unattributed, manually changed, HEAD/branch drifted, or merge/rebase/conflict state exists"
    - "Pilot records a per-project dirty baseline snapshot with project path, branch, HEAD, porcelain payload, timestamp, and job id"
    - "Blocked and allowed outcomes emit explicit reason strings (blocked:/allowed:) suitable for logs and diagnosis"
    - "Regression tests cover safe continuation, manual interference, untracked junk, HEAD drift, conflict state, and retry after Pilot-produced dirty completion"
  artifacts:
    - path: "src/core/db.ts"
      provides: "Persistent project dirty baseline storage and lookup in pilot.db"
      contains: "project_dirty_baselines"
    - path: "src/core/git-recovery.ts"
      provides: "Git-state snapshot + provenance classification helpers"
      exports: ["getBranchOrNull", "getPorcelainStatus", "detectGitConflictState", "classifyDirtyStart"]
    - path: "src/core/runner.ts"
      provides: "Provenance-aware launch guard integrated before delegation, plus baseline recording on terminal runs"
      contains: "blocked: manual/untracked changes not attributable to Pilot"
    - path: "test/core/runner-recovery.test.ts"
      provides: "End-to-end launch guard behavior tests for safe and unsafe dirty starts"
    - path: "test/core/git-recovery.test.ts"
      provides: "Unit tests for conflict/head/porcelain classification behavior"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "read last project baseline before launch; write updated baseline after terminal run"
      pattern: "getLatestProjectDirtyBaseline|upsertProjectDirtyBaseline"
    - from: "src/core/runner.ts"
      to: "src/core/git-recovery.ts"
      via: "classify dirty-start state and emit allow/block reason"
      pattern: "classifyDirtyStart"
    - from: "test/core/runner-recovery.test.ts"
      to: "src/core/runner.ts"
      via: "scenario assertions on allowed continuation vs explicit blocked reasons"
      pattern: "allowed: continuation-safe|blocked:"
---

<objective>
Implement a provenance-aware dirty-start guard so Pilot can continue same-project phase queues when dirt is known to come from the immediately preceding Pilot run, while still blocking unsafe local state.

Purpose: Remove noisy false failures (`guarded-dirty-start`) in project-serial queues without weakening safety against manual edits, history drift, or conflict states.
Output: Persistent dirty baselines in pilot.db, launch-time dirty-state classification in runner preflight, explicit reasoned allow/block messaging, and focused regression tests.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/core/types.ts
@src/core/db.ts
@src/core/git-recovery.ts
@src/core/runner.ts
@test/core/db.test.ts
@test/core/git-recovery.test.ts
@test/core/runner-recovery.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add persistent per-project dirty baselines in pilot.db</name>
  <files>src/core/types.ts, src/core/db.ts, test/core/db.test.ts</files>
  <action>
Add a first-class dirty-baseline persistence layer in the existing SQLite metadata store (not ad-hoc filesystem state):

1. In `src/core/types.ts`, add a `ProjectDirtyBaseline` type that includes at minimum:
   - `project`
   - `branch`
   - `headCommit`
   - `statusPorcelain` (raw `git status --porcelain=v1 --untracked-files=normal` payload)
   - `recordedAt`
   - `jobId`

2. In `src/core/db.ts`, create `project_dirty_baselines` table (if missing) during DB init/test init with columns matching the type above and `project` as the per-project key.

3. Add DB helpers:
   - `upsertProjectDirtyBaseline(...)` to store/replace the latest baseline for a project
   - `getLatestProjectDirtyBaseline(project)` to retrieve the current baseline for launch classification

4. Export these helpers from `db.ts` and keep their API synchronous like existing DB helpers.

5. Extend `test/core/db.test.ts` to verify:
   - baseline round-trip persists all required fields
   - a second write for the same project replaces the baseline
   - job id/timestamp and porcelain payload are preserved for attribution

Do not introduce separate JSON state files; keep provenance state inside pilot.db.
  </action>
  <verify>Run `npx vitest run test/core/db.test.ts` and confirm new baseline persistence tests pass.</verify>
  <done>`pilot.db` stores and returns a usable per-project dirty baseline containing project/branch/head/porcelain/timestamp/job-id metadata.</done>
</task>

<task type="auto">
  <name>Task 2: Replace blanket dirty-start refusal with provenance classification in runner preflight</name>
  <files>src/core/git-recovery.ts, src/core/runner.ts</files>
  <action>
Implement and wire a conservative provenance classifier:

1. In `src/core/git-recovery.ts`, add helpers to snapshot current launch state:
   - branch resolution (`git branch --show-current` or equivalent detached-safe form)
   - full porcelain payload capture (`git status --porcelain=v1 --untracked-files=normal`)
   - conflict/in-progress detection for merge, rebase, cherry-pick, and unmerged index state

2. Add `classifyDirtyStart(...)` that compares current dirty state to the latest baseline and returns explicit allow/block result + reason text. Enforce:
   - `allowed: continuation-safe dirty tree matches prior Pilot baseline` when branch/head/porcelain match and no conflict state exists
   - `blocked: manual/untracked changes not attributable to Pilot` when porcelain differs or provenance is missing/low-confidence
   - `blocked: HEAD moved outside Pilot` on branch/head drift
   - `blocked: merge/rebase/conflict state detected` when repository is in conflict/in-progress state

3. In `src/core/runner.ts` launch preflight:
   - keep git-worktree and `updateJobRecoveryStart(...)` behavior
   - replace current `startedDirty && !allowDirtyStart` blanket refusal with classifier call against `getLatestProjectDirtyBaseline(job.project)`
   - allow launch only when classifier returns allowed; otherwise throw with classifier reason text
   - emit explicit allow log message when continuation-safe dirty state is accepted
   - keep conservative default: if attribution cannot be proven, block

4. Record updated baseline snapshots via `upsertProjectDirtyBaseline(...)` after terminal runs that pass preflight (completed and execution-failed runs), but do not overwrite baseline when preflight blocks before execution starts.

5. Preserve `allow_dirty_start` storage for backward compatibility, but do not treat it as a blanket bypass for provenance-blocking causes.
  </action>
  <verify>Run `npx vitest run test/core/git-recovery.test.ts test/core/runner-recovery.test.ts` and confirm dirty-start guard scenarios pass with explicit allow/block reasons.</verify>
  <done>Runner launch decisions are provenance-aware: continuation-safe Pilot dirt is allowed, and unsafe/uncertain dirt is blocked with specific cause text.</done>
</task>

<task type="auto">
  <name>Task 3: Add required scenario coverage for continuation-safe and unsafe interference paths</name>
  <files>test/core/git-recovery.test.ts, test/core/runner-recovery.test.ts</files>
  <action>
Expand tests to cover the requirement matrix end-to-end:

1. `test/core/runner-recovery.test.ts`:
   - allows same-project immediate continuation when dirty state matches last baseline
   - blocks when manual tracked edit appears after baseline
   - blocks when new unrelated untracked files appear
   - blocks on HEAD/branch drift
   - blocks on merge/rebase/conflict state
   - allows retry/next launch after a Pilot-produced dirty completion baseline
   - asserts explicit reason text prefix (`allowed:` / `blocked:`) in stderr or stored failure message

2. `test/core/git-recovery.test.ts`:
   - validates conflict/in-progress detection signals
   - validates deterministic porcelain/branch/head comparison behavior for classifier outputs

3. Update prior dirty-start expectations to provenance semantics (no blanket clean-only behavior assumptions).

Keep mocks deterministic and continue following existing execa-mocking style in these suites.
  </action>
  <verify>Run `npx vitest run test/core/db.test.ts test/core/git-recovery.test.ts test/core/runner-recovery.test.ts` and ensure all pass.</verify>
  <done>Tests prove safe continuation works and all unsafe/manual/conflict/drift paths still block with explicit reasons.</done>
</task>

</tasks>

<verification>
```bash
npx vitest run test/core/db.test.ts
npx vitest run test/core/git-recovery.test.ts test/core/runner-recovery.test.ts
npx vitest run test/core/db.test.ts test/core/git-recovery.test.ts test/core/runner-recovery.test.ts
```
</verification>

<success_criteria>
- Launch no longer fails on dirty state that exactly matches the last Pilot baseline for the same project
- Launch still blocks on manual/unattributed dirt, HEAD/branch drift, and conflict/in-progress git states
- Baseline snapshots are persisted with project, branch, head commit, porcelain payload, timestamp, and job id
- Blocked launches contain specific `blocked:` reason text; accepted continuation-safe launches emit explicit `allowed:` reason text
- Targeted recovery/guard test suites pass with new scenario coverage
</success_criteria>

<output>
After completion, create `.planning/quick/079-provenance-aware-dirty-guard-for-pilot-p/079-SUMMARY.md`
</output>
