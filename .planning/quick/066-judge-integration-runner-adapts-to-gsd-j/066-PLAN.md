---
phase: 066-judge-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - src/core/callback.ts
  - src/core/types.ts
  - test/core/runner.test.ts
autonomous: true

must_haves:
  truths:
    - "Runner calls gsd-judge (not gsd-verify-phase) after execute-phase steps"
    - "Judge JSON verdict determines job outcome (succeeded/failed/doubting)"
    - "Judge crash or unparseable output results in benefit-of-doubt pass"
    - "Callback webhook payload includes verdict, confidence, and reason"
    - "All existing tests pass with updated verification logic"
  artifacts:
    - path: "src/core/runner.ts"
      provides: "runJudge() replacing runVerification(), updated isJudge check"
      contains: "gsd-judge"
    - path: "src/core/callback.ts"
      provides: "Verdict/reason/confidence in webhook payload"
      contains: "verdict"
    - path: "src/core/types.ts"
      provides: "JudgeVerdict type with succeeded/failed/doubting"
  key_links:
    - from: "runner.ts launch()"
      to: "runJudge()"
      via: "called after execute-phase step completes"
    - from: "runJudge()"
      to: "spawnAndWait + exportSessionFromDb"
      via: "spawns gsd-judge session, extracts JSON from last assistant message"
    - from: "runner.ts markCompleted/markFailed"
      to: "notifyJobCompletion()"
      via: "fires callback for ALL outcomes including judge crash"
---

<objective>
Replace the runner's VERIFICATION.md disk-parsing verification step with a gsd-judge AI session that outputs structured JSON. The judge spawns after execute-phase, its JSON verdict determines job outcome, and its reason string flows into the callback webhook payload.

Purpose: Eliminate brittle VERIFICATION.md file parsing in favor of a lightweight AI judge that produces structured JSON verdicts — same pattern already proven in delegation.
Output: Updated runner.ts, callback.ts, types.ts, and tests.
</objective>

<context>
@src/core/runner.ts
@src/core/callback.ts
@src/core/types.ts
@src/core/delegate.ts (JSON extraction pattern reference — parseDelegationOutput + exportSessionFromDb)
@src/core/opencode-db.ts (exportSessionFromDb, findSessionByTitle)
@test/core/runner.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace runVerification with runJudge and update types</name>
  <files>
    src/core/runner.ts
    src/core/types.ts
  </files>
  <action>
**In src/core/types.ts:**
- No changes needed — Job type already has `judgeVerdict: string | null`. The JudgeVerdict interface lives in runner.ts (module-local). Leave types.ts alone unless the DelegationStep comment mentions "verify-phase" (update comment if so).

**In src/core/runner.ts:**

1. **Update the JudgeVerdict interface** (lines 67-73). Replace the old shape with the new one:
   ```ts
   interface JudgeVerdict {
     verdict: 'succeeded' | 'failed' | 'doubting';
     confidence: number;
     reason: string;
   }
   ```
   Remove `retryRecommendation` and `retryHint` — not part of new judge output.

2. **Delete the VerificationResult interface** (lines 75-81) — dead type.

3. **Delete the entire `runVerification` method** (lines 815-900) — replaced by `runJudge`.

4. **Delete the entire `parseVerificationResult` function** (lines 1209-1303) — dead code (no more VERIFICATION.md parsing).

5. **Update parseJudgeVerdict** (lines 1317-1353). Change the verdict validation from `['pass', 'fail', 'partial']` to `['succeeded', 'failed', 'doubting']`. Keep the three JSON extraction formats (fenced, raw, text-wrapped) — they work well.

6. **Add new `runJudge` private method** to the Runner class (where runVerification was). Pattern it after the delegation JSON extraction in delegate.ts:
   ```ts
   private async runJudge(job: Job, projectDir: string, step: DelegationStep): Promise<JudgeVerdict | null> {
     const phaseNum = step.args.match(/(\d+)/)?.[1];
     if (!phaseNum) {
       process.stderr.write(`[runner] runJudge: no phase number found in step args "${step.args}"\n`);
       return null;
     }

     const ts = Date.now().toString(36).slice(-4);
     const judgeTitle = truncateTitle(`pilot-judge-${job.id}-${ts}`, 80);
     updateSessionTitles(job.id, [judgeTitle]);

     // Cap judge at 15 minutes
     const judgeTimeoutMs = 15 * 60 * 1000;

     try {
       await this.spawnAndWait(projectDir, 'gsd-judge', `${job.id} ${phaseNum}`, judgeTitle, judgeTimeoutMs);
     } catch (err) {
       const msg = errMsg(err);
       if (msg.includes('timed out')) {
         process.stderr.write(`[runner] Judge timed out after 15m for ${judgeTitle} — benefit of doubt\n`);
       } else {
         process.stderr.write(`[runner] Judge session failed: ${msg}\n`);
       }
       return null; // Benefit of doubt on spawn failure or timeout
     }

     // Extract JSON from judge session output (same pattern as delegation)
     const sessionId = findSessionByTitle(judgeTitle);
     if (!sessionId) {
       process.stderr.write(`[runner] runJudge: session not found for ${judgeTitle}\n`);
       return null;
     }

     try {
       const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
       if (exported.messages.length > 0) {
         const lastAssistant = [...exported.messages]
           .reverse()
           .find(m => m.role === 'assistant');
         if (lastAssistant) {
           const content = String(lastAssistant.content ?? '');
           return parseJudgeVerdict(content, judgeTitle);
         }
       }
     } catch (err) {
       process.stderr.write(`[runner] runJudge: session export failed for ${judgeTitle}: ${errMsg(err)}\n`);
     }

     return null; // Benefit of doubt
   }
   ```

7. **Add `exportSessionFromDb` to the import** from `./opencode-db.js` (line 46). It's already used in delegate.ts, just not imported in runner.ts yet.

8. **Update the execute-phase judge call** in `launch()` (lines 650-692). Replace the `runVerification` call + its VerificationResult handling with:
   ```ts
   const judgeVerdict = await this.runJudge(job, projectDir, step);

   if (judgeVerdict === null) {
     // Judge crash or unparseable — benefit of doubt
     updateJudgeVerdict(job.id, JSON.stringify({
       verdict: 'succeeded',
       confidence: 0,
       reason: 'judge unavailable',
     }));
   } else if (judgeVerdict.verdict === 'succeeded') {
     updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
   } else if (judgeVerdict.verdict === 'doubting') {
     updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
     if (judgeVerdict.confidence < 50) {
       // Low confidence doubt — treat as fail
       throw new Error(judgeVerdict.reason);
     }
     // confidence >= 50 — treat as pass, fall through
   } else {
     // 'failed'
     updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
     throw new Error(judgeVerdict.reason);
   }
   ```

9. **Update `isJudge` check** (line 949). Change from:
   ```ts
   const isJudge = command === 'pilot-judge' || command === 'gsd-verify-phase';
   ```
   to:
   ```ts
   const isJudge = command === 'gsd-judge';
   ```

10. **Update exports** (line 1620-1621). Remove `parseVerificationResult` from exports. Remove `VerificationResult` from type exports. Keep `parseJudgeVerdict` and `JudgeVerdict` exports.

11. **Update the comment on line 651** from "Run gsd-verify-phase..." to "Run gsd-judge..."

12. **Update the "verification shutdown guard" comment** (line 646) to say "judge shutdown guard".
  </action>
  <verify>
    Run `npx tsc --noEmit` — must pass with no errors.
    Grep for `gsd-verify-phase` in src/ — must return 0 results.
    Grep for `VERIFICATION.md` in src/core/runner.ts — must return 0 results.
    Grep for `parseVerificationResult` in src/ — must return 0 results.
    Grep for `VerificationResult` in src/ — must return 0 results.
  </verify>
  <done>
    runner.ts spawns gsd-judge (not gsd-verify-phase), extracts JSON from session output, maps verdict to job outcome with benefit-of-doubt on failure. All old verification code removed. TypeScript compiles clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add verdict/reason/confidence to callback webhook payload</name>
  <files>
    src/core/callback.ts
  </files>
  <action>
In `notifyJobCompletion()` in callback.ts, enrich the webhook payload with judge verdict data when available.

1. After the duration calculation (line 87), add judge verdict extraction:
   ```ts
   // Extract judge verdict if available
   let verdict: { verdict: string; confidence: number; reason: string } | null = null;
   if (job.judgeVerdict) {
     try {
       verdict = JSON.parse(job.judgeVerdict) as { verdict: string; confidence: number; reason: string };
     } catch { /* ignore parse errors */ }
   }
   ```

2. Add verdict reason to the message lines (after the duration line):
   ```ts
   if (verdict?.reason) {
     lines.push(`Verdict: ${verdict.verdict} (confidence: ${verdict.confidence}%)`);
     lines.push(`Reason: ${verdict.reason.slice(0, 300)}`);
   }
   ```

3. Add verdict fields to the `body` object so OpenClaw receives structured data:
   ```ts
   if (verdict) {
     body.verdict = verdict.verdict;
     body.confidence = verdict.confidence;
     body.reason = verdict.reason;
   }
   ```
  </action>
  <verify>
    Run `npx tsc --noEmit` — must pass.
    Grep for `verdict` in src/core/callback.ts — should find the new fields.
  </verify>
  <done>
    Callback webhook payload includes verdict, confidence, and reason from judge. OpenClaw receives structured verdict data alongside the existing message.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update tests for new judge verdict shape and remove verification tests</name>
  <files>
    test/core/runner.test.ts
  </files>
  <action>
1. **Update imports** (line 28): Remove `parseVerificationResult` from the import. Keep `parseJudgeVerdict`, `getDynamicMaxParallel`, `hasSystemdRunUser`, `_resetSystemdRunCache`.

2. **Update parseJudgeVerdict tests** (lines 32-115): Change ALL test verdict values from `'pass'`/`'fail'`/`'partial'` to `'succeeded'`/`'failed'`/`'doubting'`. Update the expected valid verdicts accordingly. The `retryRecommendation` field is gone — remove it from test inputs and assertions. Replace `summary` with `reason` in test inputs.

   Specific changes for each test:
   - "parses verdict from fenced json block": verdict `'pass'` → `'succeeded'`, remove retryRecommendation, `summary` → `reason`
   - "parses verdict from raw JSON": verdict `'fail'` → `'failed'`, remove retryRecommendation/retryHint, `summary` → `reason`
   - "parses verdict from text-wrapped JSON": verdict `'partial'` → `'doubting'`, remove retryRecommendation, `summary` → `reason`
   - "returns null for invalid verdict field": Keep this — `'unknown'` should still return null
   - "handles whitespace in fenced JSON blocks": verdict `'pass'` → `'succeeded'`, remove retryRecommendation, `summary` → `reason`

3. **Delete the entire `parseVerificationResult` describe block** (lines 183-293) — dead tests for dead code.

4. **Update the "no auto-retry" tests** (lines 296-325): These test parseJudgeVerdict with old field names. Update to new shape:
   - Test at line 299: Change verdict `'fail'` → `'failed'`, `summary` → `reason`, remove `retryRecommendation`. Update test name and assertion to focus on the verdict being 'failed' (no longer about retry).
   - Test at line 312: Same treatment — update to new shape. These can be simplified since retryRecommendation is gone. Consider renaming the describe to "judge verdict edge cases" and testing doubting with confidence thresholds instead.

5. **Add new test for doubting verdict**:
   ```ts
   it('parses doubting verdict with confidence', () => {
     const content = JSON.stringify({
       verdict: 'doubting',
       confidence: 45,
       reason: 'Tests pass but coverage is low',
     });
     const result = parseJudgeVerdict(content);
     expect(result).not.toBeNull();
     expect(result!.verdict).toBe('doubting');
     expect(result!.confidence).toBe(45);
     expect(result!.reason).toBe('Tests pass but coverage is low');
   });
   ```

6. **Update module doc comment** (lines 1-6): Remove mention of `parseVerificationResult` and `VERIFICATION.md`.
  </action>
  <verify>
    Run `npx vitest run test/core/runner.test.ts` — all tests must pass.
    Run `npx vitest run` — full test suite must pass (419+ tests).
    Grep for `parseVerificationResult` in test/ — must return 0 results.
    Grep for `VERIFICATION.md` in test/ — must return 0 results.
    Grep for `gsd-verify-phase` in test/ — must return 0 results.
  </verify>
  <done>
    All runner tests updated to new judge verdict shape. Old verification tests removed. Full test suite passes.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `npx vitest run` passes (419+ tests)
- `grep -r 'gsd-verify-phase' src/` returns nothing
- `grep -r 'VERIFICATION.md' src/core/runner.ts` returns nothing
- `grep -r 'parseVerificationResult' src/ test/` returns nothing
- `grep -r 'VerificationResult' src/ test/` returns nothing
- `grep 'gsd-judge' src/core/runner.ts` finds the new command name
- `grep 'isJudge.*gsd-judge' src/core/runner.ts` confirms updated check
</verification>

<success_criteria>
1. Runner spawns `gsd-judge <jobId> <phaseNum>` after execute-phase (not gsd-verify-phase)
2. Judge JSON extracted from session output using same pattern as delegation
3. Verdict mapping: succeeded→complete, failed→fail, doubting≥50→pass, doubting<50→fail
4. Judge crash/unparseable → benefit of doubt (succeeded, confidence 0, reason "judge unavailable")
5. Callback payload includes verdict, confidence, reason fields
6. Zero references to gsd-verify-phase, VERIFICATION.md, parseVerificationResult, or VerificationResult remain
7. All tests pass
</success_criteria>
