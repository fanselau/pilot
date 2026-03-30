# Phase 102: Pilot — Executive Job Summaries and Notification Discoverability - Research

**Researched:** 2026-03-30
**Domain:** Deterministic job summaries, CLI summary surfaces, and notification rendering on top of existing Pilot metadata
**Confidence:** HIGH

## Summary

Phase 102 should be implemented as a shared-summary refactor, not a new telemetry system. The codebase already has almost everything needed: deterministic `what / why / next` guidance in `src/core/job-introspection.ts`, observability snapshots in `src/core/job-observability.ts`, structured judge/verification data in `src/core/judge-signal.ts`, step metadata in `job_steps`, and current commit-delta logic plus summary heuristics in `src/commands/log.ts`.

The real gap is fragmentation. Right now:
- `src/commands/log.ts` owns a private summary model that notifications cannot reuse
- `src/core/callback.ts` still builds a flat metadata-first prompt with generic instruction text
- `getLastMessage()` is the wrong primitive for step summaries because it can return non-assistant or empty/tool-wrapper messages
- status/help surfaces do not consistently point operators toward one obvious “executive summary” command

**Primary recommendation:** Build a single deterministic `buildJobExecutiveSummary(job, steps)` layer in `src/core/job-summary.ts`, add one assistant-text helper in `src/core/opencode-db.ts`, then wire three consumers on top of it: `pilot summary`, `pilot log --summary`, and the callback notification renderer.

## Standard Stack

No new dependencies are needed.

### Core

| Library / Module | Purpose | Why Standard |
|------------------|---------|--------------|
| `better-sqlite3` via `src/core/opencode-db.ts` | session/message queries for assistant text | already owns opencode transcript access and lightweight message/part queries |
| `src/core/job-introspection.ts` | `what / why / next`, review/failure guidance | existing single source of truth for operator-facing next actions |
| `src/core/job-observability.ts` | requested/observed model, token, cost summary | summary surfaces already reuse this and should keep doing so |
| `src/core/judge-signal.ts` | structured verdict + verification routing snapshot | provides exact fields needed for verification/actionable-gap surfacing |
| `commander` via `src/index.ts` | CLI registration/help text | existing command registration pattern for adding `pilot summary` |
| `vitest` | regression coverage | required for deterministic builder, command, and callback verification |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shared deterministic summary builder | keep summary logic in `log.ts` and clone it into `callback.ts`/`summary.ts` | creates immediate drift and violates the PRD’s “no second summary system” rule |
| assistant-text query helper | reuse `getLastMessage()` | wrong semantics because it can return user messages or empty/tool-only assistant wrappers |
| cheap artifact extraction from verification + strong assistant lines | broad transcript scraping | more noise, more cost, more brittle heuristics |
| deterministic summary strings | LLM-generated summarization | extra latency/cost and explicitly out of scope for this rollout |

## Existing Touchpoints

### Current files that already contain the behavior to extend/refactor

- `src/commands/log.ts`
  - owns `LogSummaryData`, `buildSummaryData()`, `resolveCommitDelta()`, human summary rendering, and JSON summary payload
  - already composes `buildJobWhy`, `buildRetryWhy`, `buildJobObservability`, and `buildJudgeSignal`
- `src/core/callback.ts`
  - still uses a flat metadata-first `buildDeliveryPrompt(job)` with generic “Acknowledge success...” instructions and step history dumped before meaning
- `src/core/opencode-db.ts`
  - has `getSessionMessages()` and `getLastMessage()`, but no helper for “latest useful assistant-authored text”
- `src/commands/status.ts`
  - already has action-oriented secondary lines in some guarded cases, so discoverability should extend that pattern rather than invent a new status UI
- `src/index.ts`
  - already registers `pilot log` with `--summary`; this is the place to add `pilot summary` and clarify descriptions

### Current tests worth extending

- `test/core/opencode-db.test.ts`
- `test/core/callback.test.ts`
- `test/commands/log.test.ts`
- `test/commands/status.test.ts`

Add:
- `test/core/job-summary.test.ts`
- `test/commands/summary.test.ts`

## Architecture Patterns

### Pattern 1: Shared Summary Object, Separate Consumers

**What:** `src/core/job-summary.ts` builds the canonical summary object. CLI commands and callback rendering consume it; they do not rebuild summary logic.

**Recommendation:** Keep business logic in builder helpers, not in `summary.ts`, `log.ts`, or `callback.ts`.

### Pattern 2: Assistant Text as High-Signal Summary Source

**What:** For each step, prefer the last useful assistant-authored text message over verdict text or raw errors.

**Recommendation:** Add a focused DB helper that filters to assistant role + non-empty concatenated text content. Do not change `getLastMessage()` semantics because other callers rely on “last message regardless of role.”

### Pattern 3: Summary-First Operator Surfaces

**What:** `pilot summary`, `pilot log --summary`, and notifications should lead with outcome + meaning + next action before metadata and drilldown.

**Recommendation:** Use `buildJobWhy(job)` for action guidance, but let strong final assistant text override `what` when it provides a better narrative summary.

### Pattern 4: Cheap Artifact Surfacing Only

**What:** Key artifacts/results should come from existing structured fields first, then only from obvious/high-confidence assistant text patterns.

**Recommendation:** Prefer `judgeSignal.verification?.artifactPath`, explicit step/session hints, and narrow path extraction from assistant text. Do not scrape tool outputs or patch blobs.

## Recommended Implementation Slices

### Slice 1: Summary Foundation

**Scope:** add assistant-text helper and shared summary builder.

**Files:**
- `src/core/opencode-db.ts`
- `src/core/job-summary.ts`
- `test/core/opencode-db.test.ts`
- `test/core/job-summary.test.ts`

**Acceptance focus:** deterministic builder, fallback order, capped last assistant messages, key artifact collection, clean missing-session behavior.

### Slice 2: CLI Summary Surfaces

**Scope:** add `pilot summary`, register it, and refactor `pilot log --summary` to the shared builder.

**Files:**
- `src/commands/summary.ts`
- `src/commands/log.ts`
- `src/index.ts`
- `test/commands/summary.test.ts`
- `test/commands/log.test.ts`

**Acceptance focus:** shared JSON structure, same smart default semantics as `pilot log`, same core summary fields, transcript mode unchanged when `--summary` not used.

### Slice 3: Notification + Discoverability

**Scope:** callback renderer and status next-step hints.

**Files:**
- `src/core/callback.ts`
- `src/commands/status.ts`
- `test/core/callback.test.ts`
- `test/commands/status.test.ts`

**Acceptance focus:** outcome-first notification sections, exact review/unblock commands, no generic “Acknowledge success...” copy, and concrete status hints for action-needed jobs.

## Concrete Builder Recommendations

### Summary field derivation

| Field | Recommended derivation |
|-------|------------------------|
| `what` | final useful assistant text from active/final step if present, otherwise `buildJobWhy(job).what` |
| `why` | `buildJobWhy(job).why` |
| `next` | `buildJobWhy(job).next` |
| `statusBadge` | `buildJobWhy(job).badge` |
| `outcome` | `completed`→`success`, `failed`/`cancelled`→`failure`, `completed_pending_review`→`review_pending`, `review_hold`→`review_hold`, otherwise `unknown` |
| `currentOrFinalStep` | running step if present, else last step by `stepIndex`, else `null` |
| `failureReason` | failed step verdict reason → job.error → current/final step verdict reason → `null` |
| `judge` | map from `buildJudgeSignal(job)` |
| `verification` | `buildJudgeSignal(job).verification` normalized into the required shape |
| `commitDelta` | reuse the existing `gitBaseCommit` / `gitHeadCommit` logic from `log.ts` |
| `observability` | `buildJobObservability(job)` |
| `lastAssistantMessages` | newest-first capped list from step sessions, max 3 |
| `steps[].shortSummary` | assistant text → verdictReason → error → null |

### Useful assistant text heuristic

Minimum contract for the new helper:
- role must be `assistant`
- concatenated text content must be non-empty after trim
- return the latest matching message only
- do not include tool output rows or user messages

Because `parseMessageRow()` already concatenates `part` rows with `type='text'`, empty/tool-only assistant messages naturally collapse to empty content and can be filtered out cheaply in SQL or immediately after row parsing.

### Artifact extraction order

1. `judgeSignal.verification?.artifactPath`
2. unique path-like tokens from strong assistant summary text or `lastAssistantMessages`
3. nothing else in this first rollout

Cap artifact list to a small unique set (recommended max: 5) and prefer exact paths over prose.

## Validation Architecture

Pilot already has the right test infrastructure for this phase, so no Wave 0 setup is needed.

### Framework
- **Test runner:** Vitest
- **Config:** `vitest.config.ts`
- **Quick targeted commands:**
  - `npx vitest run test/core/opencode-db.test.ts test/core/job-summary.test.ts`
  - `npx vitest run test/commands/summary.test.ts test/commands/log.test.ts`
  - `npx vitest run test/core/callback.test.ts test/commands/status.test.ts`
- **Full suite:** `npm test`

### Sampling recommendation
- after each task: run the targeted Vitest file(s) for that task
- after each plan: run that plan’s full targeted command
- before phase verification: run `npm test`

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| summary copy generation | LLM summarizer | deterministic builder + existing introspection helpers | explicit PRD constraint; keeps tests stable |
| transcript-wide artifact mining | broad tool-output scraping | verification artifact path + strong assistant text only | lower noise and lower implementation risk |
| smart default logic | new resolution rules for `pilot summary` | copy `pilot log` latest-running-job behavior | users already know that contract |
| review/failure action copy | new inline strings everywhere | `buildJobWhy(job)` plus explicit command overrides where required | keeps action guidance aligned across surfaces |

## Common Pitfalls

### Pitfall 1: Builder drift between `summary`, `log`, and notifications

**Avoid by:** making `job-summary.ts` the only place that computes summary fields.

### Pitfall 2: Using `getLastMessage()` for step summaries

**Avoid by:** adding a dedicated assistant-text helper so user messages and empty assistant wrappers do not win.

### Pitfall 3: Reintroducing transcript-heavy notifications

**Avoid by:** capping evidence/messages, preferring structured fields, and removing “Step history” as the lead section.

### Pitfall 4: Discoverability spam in `status`

**Avoid by:** only adding next-step command lines for jobs that genuinely need action or deeper inspection; keep launchable queue rows compact.

### Pitfall 5: Type-fixture churn in tests

**Avoid by:** extending existing `makeJob()` fixtures once per file and adding focused new tests rather than rewriting every fixture ad hoc.
