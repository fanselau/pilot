---
phase: "080"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tui/components/footer-bar.tsx
  - src/tui/app.tsx
  - test/tui/shortcuts.test.ts
autonomous: true

must_haves:
  truths:
    - "Pressing an inapplicable shortcut (r on running, x on completed, K on pending) shows a brief flash/status message instead of silent no-op"
    - "Footer hints in detail view show only the actions valid for the currently-viewed job's status"
    - "Footer hints in dashboard queue panel do NOT advertise r retry (queue items are pending, not retryable)"
    - "Tests exercise the actual keyboard handler branching logic, not just string constants"
  artifacts:
    - path: "src/tui/app.tsx"
      provides: "Flash feedback on inapplicable shortcut press"
    - path: "src/tui/components/footer-bar.tsx"
      provides: "Context-sensitive detail view hints based on job status"
    - path: "test/tui/shortcuts.test.ts"
      provides: "Tests that call keyboard handler logic and verify branching"
  key_links:
    - from: "src/tui/app.tsx"
      to: "src/tui/state.ts"
      via: "confirmMessage signal used as flash feedback channel"
    - from: "src/tui/components/footer-bar.tsx"
      to: "src/tui/state.ts"
      via: "job status determines which action hints render"
---

<objective>
Close three verifier gaps from Phase 59: (1) add visual feedback for inapplicable shortcuts, (2) make footer hints truthful to available actions, (3) strengthen tests to exercise real keyboard handler branching.

Purpose: Make the TUI operator-safe by never advertising actions that silently fail.
Output: Updated footer-bar, app keyboard handler with flash feedback, and real-path shortcut tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/tui/app.tsx — keyboard handler with r/x/K branches that silently do nothing when status doesn't match
@src/tui/components/footer-bar.tsx — getFooterHint() and HINTS/DASHBOARD_PANEL_HINTS with static detail hints
@src/tui/state.ts — PilotState signals including selectedJob, confirmMessage
@test/tui/shortcuts.test.ts — existing tests that only check string constants, not handler behavior
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make footer hints truthful to context</name>
  <files>src/tui/components/footer-bar.tsx, src/tui/app.tsx</files>
  <action>
Fix two footer truthfulness issues:

**A. Queue panel hint — remove `r retry`:**
In `DASHBOARD_PANEL_HINTS.queue`, remove `r retry` from the hint string. Queue jobs are pending — they can be cancelled (`x cancel`) but NOT retried. The hint currently reads `r retry │ x cancel`; it should just show `x cancel`.

**B. Detail view hint — make dynamic based on job status:**
The detail view HINTS entry is static (`r retry │ x cancel │ K kill │ ? help │ esc back`) regardless of job status. Make `getFooterHint` accept an optional `jobStatus` parameter (type `JobStatus | undefined` imported from `../../core/types.js`). When `view === 'detail'` and `jobStatus` is provided:
- `status === 'pending'` → show `x cancel` only (no retry, no kill)
- `status === 'running'` → show `K kill` only (no retry, no cancel)
- `status === 'failed'` or `status === 'cancelled'` → show `r retry` only (no cancel, no kill)
- `status === 'completed'` → show none of r/x/K (job is done)
- Always include `? help │ esc back` regardless of status.

In `app.tsx`, update the `<FooterBar>` invocation to pass the selected job's status when in detail view. The detail view has `state.detailJobId()` — look up the job from running/queue/completed lists and pass its status. If no job is found, omit jobStatus (falls back to the static HINTS.detail).

Keep the legacy `HINTS` export unchanged for backward compatibility. Only the `getFooterHint()` function and the `FooterBar` component need changes.
  </action>
  <verify>
Run `npx vitest run test/tui/shortcuts.test.ts` — existing footer tests pass (update any that now fail due to queue hint change).
Run `npx tsc --noEmit` — no type errors.
  </verify>
  <done>
Queue panel footer no longer shows `r retry`.
Detail view footer shows only the action shortcuts valid for the current job status.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add flash feedback for inapplicable shortcuts + real keyboard-path tests</name>
  <files>src/tui/app.tsx, src/tui/state.ts, test/tui/shortcuts.test.ts</files>
  <action>
**A. Flash feedback on inapplicable shortcut press:**

Add a `flashMessage` signal to `createPilotState()` in state.ts: `const [flashMessage, setFlashMessage] = createSignal<string>('');` — export both getter and setter.

In `app.tsx`, when a shortcut key is pressed but inapplicable, set a brief flash message:
- `r` pressed but job is NOT failed/cancelled → `setFlashMessage('retry: not available (job is ' + job.status + ')')` (or `'retry: no job selected'` if selectedJob is null)
- `x` pressed but job is NOT pending → `setFlashMessage('cancel: not available (job is ' + job.status + ')')`
- `K` pressed but job is NOT running → `setFlashMessage('kill: not available (job is ' + job.status + ')')`
- `u` pressed in projects panel but project is NOT blocked → `setFlashMessage('unblock: project is not blocked')`

Auto-clear flash after 2 seconds: `setTimeout(() => setFlashMessage(''), 2000)`.

Render the flash message in the FooterBar: if `flashMessage()` is non-empty, show it (in a dimmed warning color like `theme.muted` or a subtle yellow) instead of the normal hints. The FooterBar component should accept an optional `flash` prop.

The keyboard handler branches already have the status guards — just add `else` clauses with `setFlashMessage(...)` after the existing `if (job && ...)` checks. For example, in the `r` handler:
```
if (key.sequence === 'r') {
  const job = state.selectedJob();
  if (job && (job.status === 'failed' || job.status === 'cancelled')) {
    // ... existing retry logic
  } else {
    state.setFlashMessage(job ? `retry: not available (${job.status})` : 'retry: no job selected');
    setTimeout(() => state.setFlashMessage(''), 2000);
  }
  return;
}
```

**B. Extract keyboard handler for testability:**

In `app.tsx`, extract the keyboard handler callback into a named exported function: `export function handleKeyPress(key: TuiKeyEvent, state: PilotStateStore, renderer: { destroy: () => void }): void`.

The current `useKeyboard((key) => { ... })` body becomes this function. The `useKeyboard` call becomes `useKeyboard((key: TuiKeyEvent) => handleKeyPress(key, state, renderer))`.

Also export the `TuiKeyEvent` interface from `app.tsx`.

**C. Write real keyboard-path tests:**

In `test/tui/shortcuts.test.ts`, add a new describe block `'Keyboard handler branching (real handler)'` that:

1. Imports `handleKeyPress` and `TuiKeyEvent` from `../../src/tui/app.js`
2. Creates a real `PilotState` by importing and calling `createPilotState` from `../../src/tui/state.js` (the SolidJS mock from the existing test file already mocks solid-js primitives)
3. Creates a mock renderer `{ destroy: vi.fn() }`
4. Tests these scenarios by calling `handleKeyPress(key, state, renderer)`:

   - **r on a running job → sets flashMessage, does NOT call retry:**
     Set `state.setRunning([{...mockJob, status: 'running'}])`, `state.setPanelFocus('running')`, `state.setSelectedIndex(0)`.
     Call `handleKeyPress({ name: 'r', sequence: 'r', ctrl: false, meta: false, shift: false }, state, renderer)`.
     Assert `state.flashMessage()` contains 'retry: not available'.

   - **x on a completed job → sets flashMessage:**
     Set `state.setCompleted([{...mockJob, status: 'completed'}])`, `state.setPanelFocus('completed')`.
     Call `handleKeyPress({ name: 'x', sequence: 'x', ... }, state, renderer)`.
     Assert `state.flashMessage()` contains 'cancel: not available'.

   - **K on a pending job → sets flashMessage:**
     Set `state.setQueue([{...mockJob, status: 'pending'}])`, `state.setPanelFocus('queue')`.
     Call `handleKeyPress({ name: 'K', sequence: 'K', ... }, state, renderer)`.
     Assert `state.flashMessage()` contains 'kill: not available'.

   - **r on a failed job → calls retry (no flash):**
     Mock `retry` from pilot-db.ts. Set state with a failed job.
     Call `handleKeyPress({ name: 'r', sequence: 'r', ... }, state, renderer)`.
     Assert `state.flashMessage()` is empty string.

   - **q on dashboard → calls renderer.destroy:**
     Call `handleKeyPress({ name: 'q', sequence: 'q', ... }, state, renderer)`.
     Assert `renderer.destroy` was called.

Create a `mockJob` helper at the top of the test file with all required Job fields filled with defaults (use valid types from `core/types.ts`).

The key point: these tests call `handleKeyPress` directly, proving that the real branching logic works. If someone removes the status guard from the `r` handler, the "r on running job → flash" test breaks. This is what the verifier means by "exercise the real keyboard path."

Note: The existing mocks for `solid-js` and `@opentui/solid` at the top of the test file should be sufficient. Also add mocks for `../../src/tui/data/pilot-db.js` (mock `retry`, `cancel`, `fetchQueueData`, `fetchRecentData`, `unblockProject`, `deregisterProject`, `fetchProjectData`) and `../../src/core/db.js` (mock `forceQuitJob`), `../../src/core/runner.js` (mock `killJobSession`).
  </action>
  <verify>
Run `npx vitest run test/tui/shortcuts.test.ts` — all tests pass including the new keyboard handler tests.
Run `npx tsc --noEmit` — no type errors.
Run `npx vitest run` — full suite passes.
  </verify>
  <done>
Pressing an inapplicable shortcut shows a flash message in the footer instead of silently doing nothing.
Tests call the real `handleKeyPress` function with mock state, proving branching logic is wired correctly.
A removed status guard would break a specific test.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx vitest run test/tui/shortcuts.test.ts` passes — all new and existing tests
3. `npx vitest run` passes — no regressions in full suite
4. Manual spot-check: review that `getFooterHint('dashboard', 'queue')` does NOT contain 'r retry'
5. Manual spot-check: review that `getFooterHint('detail', undefined, 'running')` does NOT contain 'r retry' or 'x cancel'
</verification>

<success_criteria>
- Footer never advertises r retry in queue panel or for non-retryable jobs in detail view
- Footer never advertises x cancel for non-pending jobs in detail view
- Footer never advertises K kill for non-running jobs in detail view
- Inapplicable shortcut press shows brief flash feedback
- At least 5 new tests exercise handleKeyPress with different status/key combinations
- Build and all tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/080-quick-follow-up-phase-59-tui-feedback-fo/080-SUMMARY.md`
</output>
