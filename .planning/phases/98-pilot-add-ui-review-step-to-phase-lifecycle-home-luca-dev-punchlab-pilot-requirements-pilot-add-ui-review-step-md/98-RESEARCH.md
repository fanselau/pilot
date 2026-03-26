# Phase 98: Pilot - Add UI Review Step to Phase Lifecycle - Research

**Researched:** 2026-03-26
**Domain:** Runner lifecycle extension for advisory post-judge UI audits
**Confidence:** HIGH

## Summary

Phase 98 should extend the existing phase runner, not invent a second lifecycle. Pilot already has three key primitives that make this feature fit cleanly: deterministic phase-step construction in `src/core/runner.ts`, artifact-aware UI-phase recovery (`UI-SPEC.md`), and step-level operator surfaces (`pilot status`, `pilot info`, `pilot log`, web timeline) that read from `job_steps`.

The safest design is to treat `ui-review` as an advisory runner step that is queued only after a successful settled phase result. That means:

- do not insert `ui-review` into the initial `intentToSteps()` array before judge
- do not let `ui-review` participate in `judge:gaps`, `judge:failed`, or `judge:hung` continuation sources
- do not add a new LLM decision surface for UI review eligibility
- do derive eligibility deterministically from existing signals: original `intent.uiPhase`, prior `ui-phase` step history, and/or an existing `UI-SPEC.md`

The main implementation trap is the current judge-pass branch in `executeJudgeStep()`: it cancels all pending steps and returns. If `ui-review` is modeled as an initial pending step, judge pass will delete it as stale work. The correct insertion point is the judge-pass branch itself, after stale-step cleanup and before final completion.

**Primary recommendation:** add a small shared helper module for UI review artifact and eligibility rules, then wire runner pass-path append + advisory recovery semantics on top of it. Keep `completed_pending_review` approvals unchanged for this rollout; they are human-driven post-run state, not the autonomous phase lifecycle path this feature is targeting.

## Standard Stack

No new dependencies are needed.

| Library / Tool | Version | Purpose | Why Standard |
| -------------- | ------- | ------- | ------------ |
| `better-sqlite3` | `^12.6.2` | Existing `job_steps` storage and step-state transitions | Already the source of truth for operator-visible lifecycle state |
| `execa` | `^9.5.0` | Existing detached `opencode run` step execution path | `spawnAndWait()` already standardizes GSD command execution |
| `get-shit-done-cc` | `~1.24.0` | Provides `gsd-ui-review` workflow contract | Phase 98 should call the existing command, not replace it |
| `vitest` | `^2.1.0` | Regression tests for helper logic and runner behavior | Mandatory for advisory/non-blocking safety rules |

## Architecture Patterns

### Pattern 1: Shared UI Artifact Helpers

Create a small core helper module for:

- finding `*-UI-SPEC.md`
- finding `*-UI-REVIEW.md`
- deriving UI-review eligibility from existing signals
- resolving advisory artifact outcomes for `ui-phase` and `ui-review`

Why: the runner, CLI surfaces, and semantic labeling all need the same filesystem and lifecycle rules. Repeating them in `runner.ts`, `status.ts`, `info.ts`, and `log.ts` will drift immediately.

### Pattern 2: Post-Pass Step Append, Not Initial Step Insertion

Queue `ui-review` only when judge reaches a settled success path.

Recommended pass-path shape:

1. Judge passes
2. Cancel stale pending continuation steps
3. Check `isUiReviewEligible(...)`
4. If eligible and no existing `UI-REVIEW.md`, append `{ command: 'ui-review', args: String(phaseNumber) }`
5. Let the normal step loop execute the advisory review
6. Final job completion happens after the loop drains

This preserves the existing rule that judge is the completion gate while still allowing an advisory audit to happen before the runner marks the job fully done.

### Pattern 3: Advisory Recovery Semantics

`ui-review` must never trigger re-delegation or gap closure.

Recommended artifact outcome rules:

- `ui-phase` + artifact exists -> `completed`
- `ui-phase` + no artifact -> existing fail/skip behavior stays unchanged
- `ui-review` + artifact exists -> `completed`
- `ui-review` + no artifact after hung/non-clean exit -> `skipped`

For `ui-review`, a missing artifact is advisory failure, not lifecycle failure. The step should record why it skipped, but the job should still be allowed to complete.

### Pattern 4: Deterministic Eligibility, No New DB Column

Do not add a new persisted `uiEligible` field in this rollout.

Eligibility can be derived from existing state:

- `job.delegationPlan.intent.uiPhase === true`
- any prior `job_steps.command === 'ui-phase'`
- `findExistingUiSpec(projectDir, phaseNumber) !== null`

This keeps the change additive, avoids a DB migration, and still survives judge-driven continuation cycles because both `job.delegationPlan` and phase artifacts persist across retries.

### Pattern 5: Distinct Semantic Labeling for `ui-review`

Today, core/web semantic helpers only know about planning, execution, judge, gap variants, recovery, quick, and fast lanes. Without explicit handling, `ui-review` will collapse into generic execution. Phase 98 should add a first-class `UI Review` label in:

- `src/core/job-detail-query.ts`
- `web/src/lib/step-semantics.ts`
- session-title parsing paths (`ui-review` must be recognized like `ui-phase`)

## Validation Architecture

### Test Infrastructure

| Property | Value |
| -------- | ----- |
| Framework | `vitest` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run test/core/ui-review.test.ts test/core/runner.test.ts --reporter=dot` |
| Full suite command | `npm test` |
| Estimated runtime | ~45-60 seconds for focused suites, longer for full suite |

### Recommended Sampling

- After helper-module work: run the focused core suite
- After runner lifecycle wiring: rerun focused core suite
- After CLI observability changes: run `status`, `info`, and `log` command tests
- After semantic labeling changes: run `job-detail-query` plus any new web helper tests
- Before verification: run `npm test`

## Common Pitfalls

### Pitfall 1: Inserting `ui-review` Into the Original Step List

**What goes wrong:** judge pass cancels the pending `ui-review` step as stale work.

**How to avoid:** append `ui-review` from the judge-pass branch, not from `intentToSteps()`.

### Pitfall 2: Letting `ui-review` Use Generic Hung Continuation

**What goes wrong:** an advisory visual audit creates `judge:hung` recovery steps or full redelegation loops.

**How to avoid:** treat `ui-review` hung/no-artifact outcomes as `skipped`, never `handleHungContinuation()`.

### Pitfall 3: Adding a New `uiEligible` Storage Field

**What goes wrong:** unnecessary DB migration and more state to keep consistent across retries.

**How to avoid:** derive eligibility from `delegationPlan`, prior steps, and phase artifacts.

### Pitfall 4: Forgetting Operator-Surface and Semantic Updates

**What goes wrong:** the runner records `ui-review`, but users only see a mysterious extra command or generic execution label.

**How to avoid:** update CLI badges/labels, `KNOWN_GSD_COMMANDS`, branch-identity regexes, and semantic step labels in the same phase.

### Pitfall 5: Treating Manual Review Approval as Autonomous Lifecycle

**What goes wrong:** `pilot review --approve` becomes coupled to daemon-only step continuation or blocking advisory audits.

**How to avoid:** keep `completed_pending_review` approval semantics unchanged in this rollout. Phase 98 targets the autonomous runner path after direct judge success; the manual approval lane is only "if applicable" and is not currently part of the unattended phase loop.

## Sources

### Primary (HIGH confidence)

- Repository code: `src/core/runner.ts`
- Repository code: `src/core/db.ts`
- Repository code: `src/core/types.ts`
- Repository code: `src/commands/status.ts`
- Repository code: `src/commands/info.ts`
- Repository code: `src/commands/log.ts`
- Repository code: `src/core/job-detail-query.ts`
- Repository code: `web/src/lib/step-semantics.ts`
- Repository docs: `requirements/pilot-add-ui-review-step.md`
- Repository docs: `.opencode/get-shit-done/workflows/ui-review.md`
- Prior implementation summaries: `.planning/phases/87-pilot-ui-phase-first-class-delegation-step-for-async-runner-mode/87-02-SUMMARY.md`
- Prior implementation summaries: `.planning/phases/94-ui-phase-completion-should-not-fail-the-phase-pipeline/94-01-SUMMARY.md`

## Metadata

- Research date: 2026-03-26
- Valid until: 2026-04-25
