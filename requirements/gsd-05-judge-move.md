# Judge System — Move Into Pilot

## Problem
The judge prompts (`gsd-judge.md`, `pilot-judge.md`) live in the pilot-gsd fork. They need to move into Pilot's codebase since we're removing the fork. The judge also needs to integrate with the new intent-based runner for auto-retry.

## Goal
Judge prompts become Pilot-internal. Judge verdict feeds directly into the runner's retry logic.

## Requirements

### Must Have

- [ ] Copy judge prompts to `src/prompts/judge.md` and `src/prompts/pilot-judge.md` in Pilot's codebase
- [ ] Update `runJudge()` in runner.ts to load judge prompt from `src/prompts/` and pass to opencode session as inline prompt (not `--command gsd-judge`)
- [ ] Judge reads upstream GSD's VERIFICATION.md output (same format as before — no parsing changes needed)
- [ ] Judge should also read `VALIDATION.md` (Nyquist output) when present for richer verdicts
- [ ] Judge verdict JSON includes `retryRecommendation` field: `'retry-resume'` | `'retry-full'` | `null`
  - `retry-resume` → runner uses `--gaps` (targeted fixes from VERIFICATION.md)
  - `retry-full` → runner re-runs full plan+execute
  - `null` → no retry recommended (clean pass or unrecoverable failure)
- [ ] Judge verdict includes `retryHint` field: free-text guidance for the next attempt (passed as context to delegation AI on retry)
- [ ] Judge respects provider mode: spawn on Codex when hybrid mode is active (check role)
- [ ] Remove `gsd-judge` and `pilot-judge` command references from pilot-gsd

### Nice to Have
- [ ] Judge reads `UI-REVIEW.md` when present (UI verification scores)
- [ ] Judge confidence score factors in Nyquist VALIDATION.md coverage level

## Technical Notes
- The judge is a short, read-only session — it reads artifacts and outputs JSON
- Judge model in hybrid mode should be Codex (check role)
- Judge hung detection via DB (gsd-04b) — if judge session issues a `question` tool call, it's caught immediately. No special timeout needed.
- The `retryRecommendation` field is new — existing judge prompts need to be updated to produce it

## Do NOT
- Do NOT have the judge modify any files — it's read-only
- Do NOT have the judge invoke GSD commands — it only reads artifacts
- Do NOT call `--command gsd-judge` anymore — it's Pilot-internal

#### Critical Fixes (from critique)

- [ ] Merge the two judge prompts into ONE canonical format. Use `pilot-judge.md`'s richer format (has retryRecommendation) but update verdict values to: `pass` / `fail` / `partial` (not `succeeded`/`failed`/`doubting`)
- [ ] Update `judge-signal.ts`: `VERDICT_TO_OUTCOME` map must handle `pass`/`fail`/`partial`. Add `partial` as valid outcome.
- [ ] Add `retryRecommendation` and `retryHint` fields to `JudgeSignal` / `ParsedJudgeVerdictPayload` types
- [ ] `retryRecommendation` values: `'retry-resume'` | `'retry-full'` | `'none'` (string, not null)
- [ ] Evidence strategy: read VERIFICATION.md from disk (primary) + query session transcript (secondary). If VERIFICATION.md absent, use transcript only, default to `partial` with confidence ≤ 40.
- [ ] Validate VERIFICATION.md before reading: must be non-empty (>100 bytes) and contain expected headers. If invalid, treat as missing.
- [ ] Judge model in hybrid mode: always Codex. Pass `--model openai/gpt-5.3-codex` when `providerMode === 'hybrid'`.
- [ ] Add `failureFingerprint` field to judge output: short structured list of failing items (for same-failure detection in gsd-07).
