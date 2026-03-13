---
phase: quick-082
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/actions.ts
  - web/src/lib/use-actions.ts
  - test/web/actions.test.ts
autonomous: true
must_haves:
  truths:
    - "Action execution (retry, cancel, force-quit, unblock) surfaces success/failure toast feedback"
    - "Action predicate tests cover paused job state for retry-job, cancel-job, and force-quit-job"
  artifacts:
    - path: "web/src/lib/actions.ts"
      provides: "Toast emission in execute handlers"
      contains: "toastManager.add"
    - path: "test/web/actions.test.ts"
      provides: "Paused-state predicate coverage"
      contains: "paused"
  key_links:
    - from: "web/src/lib/actions.ts"
      to: "web/src/components/ui/toast"
      via: "toastManager.add() calls in execute handlers"
      pattern: "toastManager\\.add"
---

<objective>
Close two Phase 62 verification gaps: (1) add toast feedback for action execution, (2) add paused-state action predicate tests.

Purpose: Satisfy the two remaining must-have failures from Phase 62 verification (11/13 → 13/13).
Output: Updated actions.ts with toast calls, updated actions.test.ts with paused-state coverage.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/62-pilot-web-ui-phase-2-agent-frontend-merged-chronological-detail-flow-inline-subagent-cards-and-proactive-action-parity/62-pilot-web-ui-phase-2-agent-frontend-merged-chronological-detail-flow-inline-subagent-cards-and-proactive-action-parity-VERIFICATION.md
@web/src/lib/actions.ts
@web/src/lib/use-actions.ts
@web/src/components/ui/toast.tsx
@web/src/routes/index.tsx (lines 68-75 for toast pattern)
@test/web/actions.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add toast feedback to action execute handlers</name>
  <files>web/src/lib/actions.ts</files>
  <action>
Import `toastManager` from `~/components/ui/toast` at the top of actions.ts.

Wrap each mutation action's execute handler in try/catch to emit success/failure toasts:

1. **retry-job**: On success → `toastManager.add({ title: 'Job Retried', description: 'Job re-queued for another attempt', type: 'success' })`. On failure → `toastManager.add({ title: 'Retry Failed', description: error message, type: 'error' })`.

2. **cancel-job**: On success → `toastManager.add({ title: 'Job Cancelled', description: 'Job has been cancelled', type: 'success' })`. On failure → `toastManager.add({ title: 'Cancel Failed', description: error message, type: 'error' })`.

3. **force-quit-job**: On success → `toastManager.add({ title: 'Job Force Quit', description: 'Job has been forcefully terminated', type: 'success' })`. On failure → `toastManager.add({ title: 'Force Quit Failed', description: error message, type: 'error' })`.

4. **unblock-project**: On success → `toastManager.add({ title: 'Project Unblocked', description: 'Project block status cleared', type: 'success' })`. On failure → `toastManager.add({ title: 'Unblock Failed', description: error message, type: 'error' })`.

Each handler should keep the existing `invalidateQueries()` call inside the try block after the server function call. The catch block should extract the error message (`err instanceof Error ? err.message : 'Unknown error'`), emit the failure toast, and NOT re-throw (fire-and-forget UX).

Do NOT touch the navigation actions (view-job-detail, back-to-dashboard, refresh) — they don't need toasts.
  </action>
  <verify>Run `npx tsc --noEmit` from the web directory to verify no type errors. Grep actions.ts for `toastManager.add` — should appear 8 times (4 success + 4 failure).</verify>
  <done>All four mutation actions (retry, cancel, force-quit, unblock) emit success toasts on completion and error toasts on failure via toastManager.</done>
</task>

<task type="auto">
  <name>Task 2: Add paused-state action predicate tests</name>
  <files>test/web/actions.test.ts</files>
  <action>
Add paused-state test cases to the existing test file:

1. **In `retry-job availability` describe block**, add:
   ```
   it('is disabled when job status is paused', () => { ... })
   ```
   Create context with `status: 'paused'`, verify retry is disabled with reason `'Job is not in failed state'`.

2. **In `cancel-job availability` describe block**, add:
   ```
   it('is disabled when job status is paused', () => { ... })
   ```
   Create context with `status: 'paused'`, verify cancel is disabled with reason `'Job is not active'` (paused is NOT in ACTIVE_STATUSES set).

3. **In `force-quit-job availability` describe block**, add:
   ```
   it('is disabled for paused status', () => { ... })
   ```
   Create context with `status: 'paused'`, verify force-quit is disabled with reason `'Job is not running'`.

4. **In `resolveActions integration` describe block**, add a new test:
   ```
   it('returns correct availability for paused job state', () => { ... })
   ```
   Create context with `status: 'paused'` and a project path. Assert:
   - retry-job: disabled (not failed)
   - cancel-job: disabled (not active)
   - force-quit-job: disabled (not running)
   - unblock-project: enabled (has project)
   - view-job-detail: enabled (has job)
   - back-to-dashboard: enabled (always)
   - refresh: enabled (always)

Follow the exact same patterns used for existing status tests (use `makeContext`, `findAction`, same assertion style).
  </action>
  <verify>Run `bun test test/web/actions.test.ts` — all tests pass including the 4 new paused-state tests.</verify>
  <done>Action predicate tests cover paused state for retry-job, cancel-job, force-quit-job individually and in the integration matrix.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes (no type errors from toast import or try/catch changes)
2. `bun test test/web/actions.test.ts` passes with all existing + 4 new paused-state tests
3. `bun test` full suite still passes (no regressions)
4. Grep `web/src/lib/actions.ts` for `toastManager.add` → 8 occurrences
5. Grep `test/web/actions.test.ts` for `paused` → at least 4 test blocks
</verification>

<success_criteria>
- All four mutation action execute handlers emit success/failure toasts via toastManager
- Paused-state action predicates covered by 4 new test cases (3 individual + 1 integration matrix)
- Full test suite passes with no regressions
- Phase 62 verification gaps 11 and 13 are closed
</success_criteria>

<output>
After completion, create `.planning/quick/082-quick-follow-up-phase-62-toast-feedback-/082-SUMMARY.md`
</output>
