# No Activity = Failure, Not Success

## Problem
When an opencode session exits immediately (e.g. missing GSD commands, crash, OOM), the execution produces zero transcript. The judge either:
1. Has nothing to evaluate → crashes → "benefit of doubt" → markCompleted ✅
2. Or can't find the session → returns null → markCompleted ✅

This means jobs that did literally nothing show as green/completed. This is misleading and breaks trust in the pipeline.

## Goal
Jobs with no actual activity should be marked as failed, not completed. It's fine to say "unknown" or "inconclusive" — but green when nothing happened is wrong.

## Requirements

### Must Have
- [ ] Before running the judge, check if the execution session produced ANY meaningful output (at least 1 assistant message with content)
- [ ] If no activity detected: mark as failed with reason "No activity detected — session may have crashed or exited immediately"
- [ ] This check should NOT count delegation sessions — only the execution step session
- [ ] Failed due to no-activity should still be retryable (resetToPending if attempts < maxAttempts)

### Nice to Have  
- [ ] Add a new verdict type: `"inconclusive"` for when the judge genuinely can't determine pass/fail (as opposed to crash)
- [ ] In `pilot status`, show a different icon for "completed but inconclusive" vs "completed and verified"
- [ ] Log a warning when benefit-of-doubt is applied: `⚠ Judge failed — marking as completed (benefit of doubt)` so it's visible in runner logs

### Edge Cases
- A session that only has 1-2 tool calls and a short response might be legitimate (e.g. "file already exists, nothing to do") — don't set the threshold too high
- The check should be: "does the opencode session exist AND have at least 1 assistant message?" — not "did it produce a lot of output"

## Technical Notes
- Check `findSessionByTitle(title)` — if it returns null, no session was created at all → definite failure
- If session exists, query `SELECT COUNT(*) FROM message WHERE session_id = ? AND role = 'assistant'` from opencode's DB
- This goes in the runner's `launch()` method, after `spawnAndWait()` returns but before calling the judge
- The "benefit of doubt" fallback at line ~442 in runner.ts should be limited: only apply when the judge crashes AND the session has real activity

## Do NOT
- Remove the judge entirely — it's valuable for real evaluations
- Set an arbitrary token/message threshold that would reject legitimate short sessions
- Change how the judge itself works — this is a pre-judge guardrail
