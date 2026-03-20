---
phase: quick-088
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - src/core/callback.ts
  - test/core/callback.test.ts
autonomous: true

must_haves:
  truths:
    - "Budget-exhaustion notification includes session title in message text"
    - "Runner hung error message persists session title for callback to use"
    - "Existing tests pass with no regressions"
  artifacts:
    - path: "src/core/callback.ts"
      provides: "Session title in hung notification enrichment"
      contains: "session_title"
    - path: "src/core/runner.ts"
      provides: "Session title in budget exhaustion error message"
      contains: "sessionTitle"
    - path: "test/core/callback.test.ts"
      provides: "Test coverage for hung notification with session title"
      contains: "session_title"
  key_links:
    - from: "src/core/runner.ts"
      to: "job.error"
      via: "markFailed with budgetMsg containing sessionTitle"
      pattern: "err\\.sessionTitle"
    - from: "src/core/callback.ts"
      to: "notification prompt"
      via: "hung failure enrichment block adds sessionTitles"
      pattern: "sessionTitles"
---

<objective>
Fix Phase 67 verification gap NTFY-02: budget-exhaustion notification must include sessionTitle from HungSessionError metadata in the message text.

Purpose: When a hung session exhausts its retry budget, the notification sent to the team should include the session title so operators can identify which specific session got stuck. Currently only hung_reason and hung_count are included.

Context: The other two verification gaps (RTRY-05 shared retry budget, RTRY-01 --retries flag) have already been resolved in subsequent phases (70+). Only NTFY-02 remains genuinely unfixed.

Output: Updated runner.ts error message, callback.ts notification enrichment, and test coverage.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/runner.ts (lines 750-786 — HungSessionError catch block with budget exhaustion path)
@src/core/callback.ts (lines 96-107 — hung failure notification enrichment in buildDeliveryPrompt)
@src/util/errors.ts (HungSessionError class — has sessionTitle field)
@test/core/callback.test.ts (existing test patterns for buildDeliveryPrompt)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Include sessionTitle in hung budget-exhaustion error and notification</name>
  <files>src/core/runner.ts, src/core/callback.ts</files>
  <action>
  Two changes:

  1. **src/core/runner.ts line 779** — Include `err.sessionTitle` in the `budgetMsg` string:
     Change: `const budgetMsg = \`Retry budget exhausted after ${err.hungReason} hang (tool: ${err.lastToolCall ?? 'unknown'})\`;`
     To: `const budgetMsg = \`Retry budget exhausted after ${err.hungReason} hang (tool: ${err.lastToolCall ?? 'unknown'}, session: ${err.sessionTitle})\`;`

     Also update the escalation message on line 759 similarly:
     Change: `const escalateMsg = \`Escalated: consecutive ${err.hungReason} hangs (tool: ${err.lastToolCall ?? 'unknown'})\`;`
     To: `const escalateMsg = \`Escalated: consecutive ${err.hungReason} hangs (tool: ${err.lastToolCall ?? 'unknown'}, session: ${err.sessionTitle})\`;`

  2. **src/core/callback.ts lines 96-107** — Add session title to hung failure notification enrichment block. After the `hung_count` line, parse `job.sessionTitles` (JSON array) and emit the last session title:

     After `lines.push(\`hung_count: ${job.hungCount ?? 0}\`);` add:
     ```typescript
     if (job.sessionTitles) {
       try {
         const titles = JSON.parse(job.sessionTitles) as string[];
         const lastTitle = titles[titles.length - 1];
         if (lastTitle) {
           lines.push(`session_title: ${lastTitle}`);
         }
       } catch { /* ignore parse failures */ }
     }
     ```
  </action>
  <verify>npx tsc --noEmit (no type errors)</verify>
  <done>budgetMsg and escalateMsg in runner.ts include err.sessionTitle; buildDeliveryPrompt in callback.ts emits session_title for hung failures</done>
</task>

<task type="auto">
  <name>Task 2: Add test coverage for hung notification session title</name>
  <files>test/core/callback.test.ts</files>
  <action>
  Add a new test in the existing describe('notifyJobCompletion') block in test/core/callback.test.ts:

  ```typescript
  it('hung failure prompt includes session title from sessionTitles', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Retry budget exhausted after interactive-prompt hang (tool: question, session: my-phase-session)',
      hungCount: 3,
      lastHungReason: 'interactive-prompt',
      sessionTitles: JSON.stringify(['first-session', 'my-phase-session']),
    }));

    // Hung enrichment section present
    expect(prompt).toContain('hung_reason: interactive-prompt');
    expect(prompt).toContain('hung_count: 3');
    expect(prompt).toContain('session_title: my-phase-session');
    expect(prompt).toContain('interactive input');
  });
  ```

  Note: The makeJob helper uses `...overrides` so hungCount, lastHungReason, and sessionTitles will be passed through. But makeJob doesn't have these in its base — verify they're accepted via Partial<Job> spread. If TypeScript complains about missing fields, add default values to makeJob: `retryBudget: 2, retryCount: 0, hungCount: 0, lastHungReason: null,` in the base object.

  Also add an edge case test:

  ```typescript
  it('hung failure prompt handles null sessionTitles gracefully', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Retry budget exhausted after stuck-tool hang (tool: bash, session: build-session)',
      hungCount: 2,
      lastHungReason: 'stuck-tool',
      sessionTitles: null,
    }));

    expect(prompt).toContain('hung_reason: stuck-tool');
    expect(prompt).toContain('hung_count: 2');
    expect(prompt).not.toContain('session_title:');
  });
  ```
  </action>
  <verify>npx vitest run test/core/callback.test.ts (all tests pass including new ones)</verify>
  <done>Two new tests verify session_title appears in hung notification and handles null gracefully</done>
</task>

<task type="auto">
  <name>Task 3: Run full test suite to confirm no regressions</name>
  <files></files>
  <action>
  Run `npx vitest run` to confirm all existing tests still pass. The runner.test.ts tests at lines 903-925 check that `job.error` contains 'Retry budget exhausted' and 'interactive-prompt' — these should still pass since we're only appending `, session: ...` to the message. Verify that no test assertions break from the added session text.

  If any runner tests fail because they assert exact error message content (e.g., `expect(afterFail.error).toBe(...)` or `expect(afterFail.error).toContain('...')`), update those assertions to account for the new `, session: test-step` suffix.
  </action>
  <verify>npx vitest run (all tests pass, 0 failures attributable to this change)</verify>
  <done>Full test suite passes with no regressions from session title additions</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `npx vitest run test/core/callback.test.ts` passes (including 2 new tests)
- `npx vitest run` full suite passes with no regressions
- `grep -n 'session_title' src/core/callback.ts` shows the new line in hung enrichment
- `grep -n 'sessionTitle' src/core/runner.ts | grep -E 'budgetMsg|escalateMsg'` shows session title in error messages
</verification>

<success_criteria>
- Budget-exhaustion and escalation error messages in runner.ts include the session title from HungSessionError
- Hung failure notification in callback.ts emits `session_title: <title>` from the job's sessionTitles array
- Two new tests in callback.test.ts verify session title presence and null handling
- All existing tests pass with zero regressions
</success_criteria>

<output>
After completion, create `.planning/quick/088-fix-phase-67-session-blocker-handling-ve/088-SUMMARY.md`
</output>
