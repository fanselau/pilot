---
phase: quick-017
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - test/core/runner.test.ts
autonomous: true

must_haves:
  truths:
    - "plan-phase artifact check retries with grace window instead of failing immediately"
    - "Grace window polls for artifacts while session is still active/recently active"
    - "Only fails when artifacts absent AND session exited/idle beyond threshold"
    - "Non-plan-phase commands keep existing artifact behavior unchanged"
    - "Runner logs emit structured events for artifact retry timeline"
  artifacts:
    - path: "src/core/runner.ts"
      provides: "Grace window artifact verification for plan-phase"
      contains: "graceWindowMs"
    - path: "test/core/runner.test.ts"
      provides: "Tests for grace window and session-aware artifact checks"
      contains: "grace"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/opencode-db.ts"
      via: "isSessionActive + getLastMessage for session liveness during grace"
      pattern: "isSessionActive.*sessionId"
---

<objective>
Implement plan-phase artifact gating with grace window and session-aware retries.

Purpose: Fix false failures where `plan-phase` jobs fail artifact checks because PLAN.md files haven't been written yet when the session is still active. The runner needs a bounded retry window that checks both artifact presence AND session liveness before declaring failure.

Output: Updated runner.ts with grace window logic + comprehensive tests.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/plan-phase-artifact-gating-and-grace-window.md
@src/core/runner.ts
@src/core/opencode-db.ts
@test/core/runner.test.ts
@src/core/config.ts
@src/core/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add grace window artifact verification for plan-phase in runner.ts</name>
  <files>src/core/runner.ts</files>
  <action>
Replace the current 2-retry artifact check logic in the `launch()` method (lines ~236-247) with a session-aware grace window specifically for `plan-phase` commands. The existing behavior for all other commands (add-phase, execute-phase, quick, etc.) MUST remain unchanged.

**Current flow (lines 236-247):**
```
await this.sleep(2000);
let verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
if (!verification.ok) {
  await this.sleep(3000);
  verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
}
```

**New flow:**
1. For `plan-phase` steps ONLY: call a new `verifyWithGraceWindow()` method instead.
2. For ALL OTHER steps: keep existing 2s + 3s retry behavior exactly as-is.

**New method: `private async verifyWithGraceWindow()`**

Parameters: `projectDir: string, step: DelegationStep, prevPhaseDirs: string[], sessionTitle: string`
Returns: `ArtifactVerification`

Logic:
- Define constants: `GRACE_WINDOW_MS = 120_000` (2 minutes), `POLL_INTERVAL_MS = 3_000` (3 seconds).
- Initial 2s sleep (same as current).
- First check: call `verifyStepArtifacts()`. If ok, return immediately.
- If not ok, enter grace window loop:
  - Log: `[runner] Artifact check failed for ${step.command}, entering grace window (${GRACE_WINDOW_MS/1000}s)...`
  - Loop while elapsed < GRACE_WINDOW_MS and not shuttingDown:
    - Sleep POLL_INTERVAL_MS.
    - Check session liveness:
      - Call `findSessionByTitle(sessionTitle)` to get sessionId.
      - If sessionId found: call `isSessionActive(sessionId)` and `getLastMessage(sessionId)`.
      - Session is "alive" if: `isSessionActive()` returns true, OR last message was updated within 60s.
    - Retry `verifyStepArtifacts()`.
    - If ok: log `[runner] Artifacts appeared after ${elapsed}ms grace window` and return ok.
    - If not ok AND session is NOT alive:
      - Log `[runner] Artifacts still missing and session inactive (last update: ${ageMs}ms ago). Failing.`
      - Return the failed verification result (do NOT continue polling).
    - If not ok AND session IS alive:
      - Log `[runner] Artifacts not yet present, session still active. Retrying... (${elapsed}ms / ${GRACE_WINDOW_MS}ms)`
  - After grace window exhausted:
    - Log `[runner] Grace window exhausted (${GRACE_WINDOW_MS}ms). Final artifact check failed: ${verification.error}`
    - Return the failed verification.

**Wire it into launch():**
Replace lines ~236-247 in the launch() method:

```typescript
// Inter-step artifact verification
await this.sleep(2000);
let verification: ArtifactVerification;
if (step.command === 'plan-phase') {
  verification = await this.verifyWithGraceWindow(projectDir, step, prevPhaseDirs, title);
} else {
  verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
  if (!verification.ok) {
    await this.sleep(3000);
    verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
  }
}
process.stderr.write(`[runner] Artifact check for ${step.command}: ${verification.ok ? 'passed' : verification.error}\n`);
if (!verification.ok) {
  throw new Error(`Step "${step.command} ${step.args}" artifact check failed: ${verification.error}`);
}
```

Import `isSessionActive` and note that `findSessionByTitle` and `getLastMessage` are already imported at the top of runner.ts.

**Do NOT:**
- Change the `verifyStepArtifacts()` function itself.
- Change artifact behavior for `add-phase`, `execute-phase`, or non-phase commands.
- Make the grace window apply to anything except `plan-phase`.
- Add config env vars for this (keep constants in the function; "Nice to Have" from spec, skip for now).
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Run `npx vitest run test/core/runner.test.ts` — all existing tests pass (non-plan-phase behavior unchanged).
  </verify>
  <done>
The `launch()` method uses `verifyWithGraceWindow()` for `plan-phase` steps. All other steps use the original 2s+3s retry. The grace window checks both artifact presence and session liveness, with structured log output at each stage.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add tests for grace window artifact verification</name>
  <files>test/core/runner.test.ts</files>
  <action>
Add a new `describe('plan-phase grace window artifact verification')` block in the runner test file. This requires testing the full launch flow with plan-phase steps and varying artifact/session timing.

**Test cases to add:**

1. **"plan-phase succeeds immediately when PLAN.md exists on first check"**
   - Set up mockPhaseDirEntries/Files with PLAN.md present.
   - Verify markCompleted called, no grace window entered.

2. **"plan-phase succeeds within grace window when PLAN.md appears late"**
   - First call to readdirSync for phase dir returns no PLAN.md files.
   - After N calls (simulating polling), switch mock to return PLAN.md files.
   - Session is active during grace period (mockIsSessionActive returns true).
   - Verify markCompleted called (not markFailed).
   - Verify stderr contains "grace window" and "Artifacts appeared" messages.

3. **"plan-phase fails when artifacts missing and session is dead"**
   - mockPhaseDirEntries has phase dir but mockPhaseDirFiles never includes PLAN.md.
   - Session is NOT active (mockIsSessionActive returns false).
   - Last message is old (createdAt = Date.now() - 120_000).
   - Verify markFailed called with "artifact check failed" message.
   - Verify stderr contains "session inactive" message.

4. **"plan-phase fails after grace window exhausted even with active session"**
   - mockPhaseDirFiles never includes PLAN.md.
   - Session IS active the whole time.
   - Use a short timeout override: Override the grace window by making the runner's sleep resolve immediately (or use the existing mock patterns).
   - Note: Since GRACE_WINDOW_MS is a constant, the test should work with real timing constraints. To avoid long test duration, consider that the existing mock for sleep (`this.sleep`) resolves near-instantly since there's no real timer. The grace window loop will cycle through quickly.
   - Verify markFailed called with "artifact check failed" message.

5. **"non-plan-phase commands still use old 2-retry behavior"** (existing test `non-phase commands skip artifact verification` already covers this, but add one for execute-phase to confirm it does NOT use grace window)
   - execute-phase with no SUMMARY.md.
   - Verify it fails on the 2nd retry, does NOT enter grace window.
   - No "grace window" messages in stderr.

**Mock setup details:**
- Use the existing `mockPhaseDirEntries`/`mockPhaseDirFiles` mechanism.
- For the "appears late" test: Use a counter in the readdirSync mock. First N calls return empty, then return PLAN.md files. Something like:
  ```typescript
  let artifactCallCount = 0;
  vi.mocked(mockReaddirSync).mockImplementation(((dirPath: unknown) => {
    const dp = String(dirPath);
    if (dp.endsWith('.planning/phases')) return ['03-ui'];
    if (dp.includes('.planning/phases/')) {
      artifactCallCount++;
      return artifactCallCount > 3 ? ['03-01-PLAN.md'] : ['STATE'];
    }
    return [];
  }) as typeof mockReaddirSync);
  ```
- All tests need `mockSuccessfulSpawn()` or equivalent for the spawnAndWait part, plus `mockGetLastMessage` returning a message with success pattern for the semantic check (since plan-phase goes through semantic check before artifact check).
- Add `const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);` for tests that verify log output.

**Important:** Follow the existing test patterns in runner.test.ts:
- Use `makeJob()` and `makePlan()` helpers.
- Each test has 30000ms timeout.
- Reset mocks in beforeEach using existing `restoreDefaultReaddirSync()`.
- Clean up SIGTERM/SIGINT listeners in afterEach.
  </action>
  <verify>
Run `npx vitest run test/core/runner.test.ts` — all tests pass including new grace window tests.
Run `npx vitest run` — full test suite passes (no regressions).
  </verify>
  <done>
At least 4 new test cases covering: immediate success, late artifact appearance within grace window, failure on dead session, and grace window exhaustion. All tests pass. Full suite passes.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npx vitest run test/core/runner.test.ts` — all tests pass
3. `npx vitest run` — full suite, no regressions
4. Review stderr output in test spies: confirms structured log events for artifact check started, retries, session active/inactive, and final pass/fail
</verification>

<success_criteria>
- plan-phase steps use grace window (up to 120s) with 3s polling for artifact checks
- Grace window is session-aware: fails early if session is dead, keeps retrying while session is active
- All other commands (add-phase, execute-phase, quick, etc.) use the existing 2s+3s retry behavior unchanged
- Structured log output at each decision point in the grace window
- 4+ new tests covering the core scenarios (immediate pass, late appear, dead session, exhaustion)
- Full test suite passes with zero regressions
</success_criteria>

<output>
After completion, create `.planning/quick/017-implement-requirements-plan-phase-artifa/017-SUMMARY.md`
</output>
