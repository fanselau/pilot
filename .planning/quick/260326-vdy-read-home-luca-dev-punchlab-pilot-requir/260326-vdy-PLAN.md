---
phase: quick
plan: 260326-vdy
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/types.ts
  - src/core/verification-artifact.ts
  - src/core/runner.ts
  - src/core/judge-signal.ts
  - src/commands/info.ts
  - src/commands/log.ts
  - test/core/verification-artifact.test.ts
  - test/core/runner.test.ts
  - test/core/runner-continuation-budget.test.ts
  - test/core/judge-signal.test.ts
  - test/commands/info.test.ts
  - test/commands/log.test.ts
autonomous: true
requirements:
  - VERIFY-STRUCT-01
  - VERIFY-ROUTING-02
  - VERIFY-FALLBACK-03
  - VERIFY-OBSERVE-04
  - VERIFY-TEST-05
must_haves:
  truths:
    - "A phase job with structured `VERIFICATION.md` status `gaps_found` and any structured gap entry re-delegates for gap closure even when `human_verification` is also present"
    - "A phase job with structured `VERIFICATION.md` status `human_needed` and no actionable gaps enters explicit human review instead of gap closure"
    - "Missing or unreadable structured verification data never falls back to keyword/prose heuristics and instead takes a deterministic visible safe fallback"
    - "Routing ignores judge prose wording when structured verification data is available"
    - "`pilot info` and `pilot log --summary` show the structured verification basis for re-delegation vs human review decisions"
  artifacts:
    - path: "src/core/verification-artifact.ts"
      provides: "Typed parser and latest-artifact resolver for VERIFICATION.md frontmatter"
    - path: "src/core/runner.ts"
      provides: "Structured verification routing for judge gaps without heuristic human-only keyword checks"
    - path: "src/core/judge-signal.ts"
      provides: "Parsed judge/verification snapshot fields consumable by operator-facing commands"
    - path: "src/commands/info.ts"
      provides: "Structured verification status and counts in detailed job output"
    - path: "src/commands/log.ts"
      provides: "Structured verification routing basis in summary/log output"
    - path: "test/core/verification-artifact.test.ts"
      provides: "Regression coverage for real-world GSD VERIFICATION frontmatter parsing"
    - path: "test/core/runner.test.ts"
      provides: "Regression coverage for actionable-gap, human-needed, mixed, and fallback routing"
  key_links:
    - from: "src/core/verification-artifact.ts"
      to: "src/core/runner.ts"
      via: "typed structured verification snapshot consumed before judge:gaps continuation"
      pattern: "readLatestVerificationArtifact|deriveVerificationRouting"
    - from: "src/core/runner.ts"
      to: "src/core/judge-signal.ts"
      via: "stored judgeVerdict payload enriched with structured verification status and counts"
      pattern: "verificationStatus|actionableGapCount|humanVerificationCount|routingDecision"
    - from: "src/core/judge-signal.ts"
      to: "src/commands/info.ts"
      via: "phase verdict display shows structured verification basis"
      pattern: "buildJudgeSignal|verification"
    - from: "src/core/judge-signal.ts"
      to: "src/commands/log.ts"
      via: "summary rendering shows why Pilot re-delegated or held for review"
      pattern: "buildJudgeSignal|verification"
---

<objective>
Remove Pilot's human-gap keyword heuristics and route post-judge phase continuation from structured GSD verification artifacts.

Purpose: Pilot currently guesses from English prose whether `gaps_found` really means actionable work or only human review. This plan makes `VERIFICATION.md` frontmatter the authority, keeps the fallback explicit instead of heuristic, and exposes the routing basis to operators.

Output: A typed verification-artifact parser, runner routing that consumes structured verification state, and info/log surfaces that show structured status plus actionable vs human-only counts.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/pilot-remove-human-gap-keyword-heuristics.md
@.planning/STATE.md
@src/core/types.ts
@src/core/runner.ts
@src/core/judge-signal.ts
@src/commands/info.ts
@src/commands/log.ts
@src/core/models.ts
@test/core/runner.test.ts
@test/core/runner-continuation-budget.test.ts
@test/core/judge-signal.test.ts
@test/commands/info.test.ts
@test/commands/log.test.ts

<interfaces>
From `src/core/runner.ts`:
```typescript
interface JudgeVerdict {
  verdict: 'succeeded' | 'failed' | 'doubting' | 'pass' | 'fail' | 'partial' | 'passed' | 'gaps_found';
  confidence: number;
  reason: string;
  gaps?: string[];
}
```

From `src/core/db.ts`:
```typescript
function markCompletedPendingReview(id: string, reviewChecklist?: string): void;
function markReviewHold(id: string, reviewReason: string): void;
function updateJudgeVerdict(id: string, judgeVerdict: string): void;
```

From `src/core/judge-signal.ts`:
```typescript
export interface JudgeSignal {
  outcome: JudgeSignalOutcome;
  badge: string;
  confidence: number | null;
  reason: string | null;
  verdict: string | null;
  gaps: string[] | null;
}
```

From `src/core/models.ts`:
```typescript
function parseFrontmatterDocument(frontmatter: string) {
  const doc = parseDocument(frontmatter);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    return null;
  }
  return doc;
}
```

Reuse the repo's existing `yaml.parseDocument` pattern for safe frontmatter parsing instead of regex-only field extraction.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add a typed VERIFICATION artifact parser and routing snapshot</name>
  <files>src/core/types.ts, src/core/verification-artifact.ts, test/core/verification-artifact.test.ts</files>
  <behavior>
    - Test 1: The latest phase-local `*-VERIFICATION.md` file is selected and parsed into typed `status`, `gaps`, and `human_verification` fields
    - Test 2: Real-world GSD frontmatter objects with structured gaps plus manual checks preserve both buckets instead of collapsing them together
    - Test 3: Every structured gap entry counts as actionable unless the structured schema explicitly marks it human-only; prose text alone never changes the actionable count
    - Test 4: Missing or unreadable artifacts return an explicit deterministic fallback snapshot with a machine-readable reason instead of a boolean heuristic
  </behavior>
  <action>
    Implement `VERIFY-STRUCT-01` and the parsing half of `VERIFY-FALLBACK-03`.

    1. Add shared types in `src/core/types.ts` for the structured verification contract Pilot needs to consume: parsed verification status, normalized gap entries, normalized `human_verification` items, parse availability/reason fields, and a compact routing snapshot (`verificationStatus`, `actionableGapCount`, `humanVerificationCount`, `routingDecision`, `routingReason`, `artifactPath`). Keep the types compatible with existing stored `judgeVerdict` JSON so later tasks can surface them in `pilot info` and `pilot log`.
    2. Create `src/core/verification-artifact.ts` as the single source of truth for reading phase-local `VERIFICATION.md` artifacts. It should:
       - locate the newest `*-VERIFICATION.md` under `.planning/phases/{phase}-*/`
       - parse YAML frontmatter with `yaml.parseDocument` and tolerate extra fields / formatting variance GSD already emits
       - normalize `status`, `gaps`, and `human_verification` into typed arrays
       - treat each structured `gap` as actionable by default unless the structured object explicitly says otherwise
       - produce an explicit unavailable/unreadable result with a deterministic reason string when the artifact is missing or malformed
    3. Do not inspect natural-language `reason` prose to decide whether something is human-only. The parser may keep prose fields for display, but actionable-vs-human classification must come from structured fields only.
    4. Add `test/core/verification-artifact.test.ts` covering: latest-file selection, mixed `gaps_found` + `human_verification`, explicit `human_needed`, unreadable frontmatter, and a real-world-shaped `k87k` style gap object with missing test coverage plus manual checks.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core/verification-artifact.test.ts --reporter=verbose</automated>
  </verify>
  <done>
    Pilot has a typed structured verification parser, the latest phase artifact is selected deterministically, actionable gaps are derived from structured fields only, and missing/unreadable artifacts produce an explicit fallback snapshot.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace heuristic judge:gaps routing with structured verification decisions</name>
  <files>src/core/runner.ts, test/core/runner.test.ts, test/core/runner-continuation-budget.test.ts</files>
  <behavior>
    - Test 1: `gaps_found` with one structured actionable gap plus `human_verification` items calls gap continuation, not human-review completion
    - Test 2: Structured `human_needed` with zero actionable gaps enters explicit human review handling and does not call gap continuation
    - Test 3: Missing or unreadable structured verification data takes the explicit safe fallback path and logs why
    - Test 4: Changing judge prose from “manual review” to “needs bug fix” does not change routing when the structured verification artifact is unchanged
    - Test 5: `judge:failed` and `judge:hung` behavior stays untouched by this refactor
  </behavior>
  <action>
    Implement `VERIFY-ROUTING-02`, finish `VERIFY-FALLBACK-03`, and remove the old heuristic path entirely.

    1. In `src/core/runner.ts`, delete `isHumanOnlyRemaining()` and remove every call/export/test that exists only to support keyword/prose routing. Do not leave it behind as a silent fallback.
    2. In `executeJudgeStep()`, when the judge returns a gap-style verdict (`gaps_found`, `doubting`, `partial`), read the structured verification snapshot from `src/core/verification-artifact.ts` before deciding what to do. Make the decision matrix explicit:
       - structured `status: passed` -> normal completion path
       - structured `status: gaps_found` with any actionable gaps -> `handleGapsContinuation()`
       - structured `status: human_needed`, or zero actionable gaps plus explicit human verification work -> human-review path, not gap closure
       - missing/unreadable/unrecognized structured artifact -> deterministic safe fallback (`review_hold` with explicit reason in logs and `resume_hint`), never keyword inference
       - if both actionable gaps and `human_verification` exist, actionable gaps always win
    3. Persist the routing basis into stored judge metadata via `updateJudgeVerdict(...)` so downstream commands can read `verificationStatus`, `actionableGapCount`, `humanVerificationCount`, `routingDecision`, and the artifact path without rescanning the filesystem.
    4. Keep `judge:failed` and `judge:hung` recovery logic unchanged except for any harmless type updates required by the new stored snapshot.
    5. Rewrite the runner regression coverage so it proves the new contract instead of the removed heuristic contract. `test/core/runner.test.ts` and `test/core/runner-continuation-budget.test.ts` should cover mixed actionable/manual artifacts, pure human-needed artifacts, missing-artifact fallback, prose-insensitive routing, and the `k87k` class failure where a missing integration test plus human checks must still re-delegate.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core/verification-artifact.test.ts test/core/runner.test.ts test/core/runner-continuation-budget.test.ts --reporter=verbose</automated>
  </verify>
  <done>
    The runner routes gap-style judge outcomes from structured verification data, heuristic human-only inference is gone, mixed actionable/manual artifacts re-delegate, explicit human-needed artifacts go to review, and unreadable artifacts pause in a visible safe fallback state.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Surface structured verification routing in judge signals, info, and log output</name>
  <files>src/core/judge-signal.ts, src/commands/info.ts, src/commands/log.ts, test/core/judge-signal.test.ts, test/commands/info.test.ts, test/commands/log.test.ts</files>
  <behavior>
    - Test 1: `buildJudgeSignal()` parses stored structured verification status and counts from `judgeVerdict`
    - Test 2: `pilot info` shows structured verification status, actionable gap count, human verification count, and routing decision for phase jobs including review states
    - Test 3: `pilot log --summary` shows why Pilot re-delegated vs held for review using structured verification terms, not “looks human-only” prose
  </behavior>
  <action>
    Implement `VERIFY-OBSERVE-04` and finish `VERIFY-TEST-05`.

    1. Extend `src/core/judge-signal.ts` so the parsed judge payload preserves the structured verification snapshot stored by Task 2. Keep backward compatibility with older verdict payloads that lack the new fields.
    2. Update `src/commands/info.ts` to show the structured routing basis for phase jobs, including `completed_pending_review` and `review_hold` states. The output should visibly tell the operator which structured status was used, how many actionable gaps remained, how many human verification checks remained, and whether Pilot chose re-delegation, review completion, or review hold.
    3. Update `src/commands/log.ts` summary output to include the same structured verification basis so operators can tell why Pilot routed a job the way it did from the log view alone.
    4. Avoid vague phrases like “looks human-only” or anything derived from prose heuristics. The displayed explanation should be clearly tied to structured verification counts/status.
    5. Add or update tests in `test/core/judge-signal.test.ts`, `test/commands/info.test.ts`, and `test/commands/log.test.ts` for the new stored fields and human-readable output. Include one backward-compat test proving old verdict payloads still parse cleanly.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core/judge-signal.test.ts test/commands/info.test.ts test/commands/log.test.ts --reporter=verbose && npm run lint</automated>
  </verify>
  <done>
    Operator-facing output clearly shows structured verification status and counts behind routing decisions, older verdict payloads still parse, and TypeScript stays clean.
  </done>
</task>

</tasks>

<verification>
- `npx vitest run test/core/verification-artifact.test.ts test/core/runner.test.ts test/core/runner-continuation-budget.test.ts test/core/judge-signal.test.ts test/commands/info.test.ts test/commands/log.test.ts` passes
- `npm run lint` passes
- `src/core/runner.ts` contains no remaining `isHumanOnlyRemaining` or keyword-based human-gap routing helper
- Mixed artifacts (`gaps` + `human_verification`) re-delegate, pure `human_needed` artifacts enter review, and missing/unreadable artifacts take explicit safe fallback
- `pilot info` and `pilot log --summary` mention structured verification status plus actionable/human counts
</verification>

<success_criteria>
- Pilot no longer infers human-only routing from prose keywords anywhere in the judge:gaps continuation path
- `VERIFICATION.md` frontmatter is the authoritative routing source when available
- Structured `gaps` and `human_verification` remain separate concepts, with actionable gaps winning on mixed artifacts
- Missing or unreadable structured verification data produces a deterministic visible fallback instead of hidden heuristics
- Operators can see exactly why Pilot re-delegated or paused for review from `pilot info` and `pilot log`
</success_criteria>

<output>
After completion, create `.planning/quick/260326-vdy-read-home-luca-dev-punchlab-pilot-requir/260326-vdy-SUMMARY.md`
</output>
