# Phase 45: Job Observability, Cost Tracking, and Export - Research

**Researched:** 2026-03-08
**Domain:** Cross-surface observability (CLI + TUI) and portable job exports
**Confidence:** HIGH
**Discovery level:** 0 (internal extension of existing architecture; no new external dependency required)

## Summary

Phase 45 should extend the existing observability foundation, not replace it.

The codebase already has useful primitives:

- Recursive token aggregation in `src/core/opencode-db.ts` (`getSessionTokensRecursive`)
- Job-level actual model persistence (`actual_models` in `pilot.db`) from runner collection
- Deterministic summary surfaces in `pilot log --summary` and triage-first `pilot info`
- TUI tokens/model hints in running/completed/detail views

Current gaps against requirements are mostly consistency and fidelity:

- Model collection is title-based and not reliably recursive for subagent session trees
- Cost estimation is hardcoded to one model profile in rendering code (`info.ts`)
- Token/cost/model semantics are not consistently labeled as requested vs actual vs estimated vs unavailable
- No first-class export command exists
- CLI and TUI show overlapping but not unified observability contracts

**Primary recommendation:** Introduce one shared core observability snapshot module (session-tree grounded, model-aware token + cost estimation) and wire all surfaces (`status`, `info`, `log --summary`, TUI panels/detail, and `pilot export`) to that module.

## Standard Stack

No new external service or SDK is needed.

| Layer | Existing Standard | Why It Fits |
| --- | --- | --- |
| Queue/state persistence | `better-sqlite3` via `src/core/db.ts` | Already authoritative for jobs/steps/checkpoints |
| Ground-truth usage source | opencode DB via `src/core/opencode-db.ts` | Already used for messages/parts/tokens/models |
| CLI surfaces | `commander` command modules in `src/commands/*.ts` | Existing command + JSON/human patterns |
| TUI surfaces | `@opentui/solid` + Solid signals | Existing running/completed/detail rendering path |
| Testing | `vitest` | Existing focused suites across core/commands/tui |

## Current Architecture Reality Check

### What already works

- Session tree relation is available via `session.parent_id` and `getChildSessions(...)`
- Token aggregation already includes `reasoning`, `cache_read`, and `cache_write`
- `job_steps` metadata already captures step result context needed for failure summaries
- Recovery checkpoints (`git_base_commit`/`git_head_commit`) already support change/no-op summaries

### What is still inconsistent

- `getSessionModels(...)` currently resolves by title and does not expose recursive model usage primitives
- Cost estimation is embedded in command rendering (`info.ts`) and assumes one pricing profile
- Status and TUI list surfaces do not provide compact cost/usage anomaly signals
- Export artifact command is missing completely

## Recommended Implementation Slices

### Slice 1: opencode usage primitives (recursive + model-aware)

Add recursive model and per-model token aggregation helpers in `src/core/opencode-db.ts` with deterministic test coverage.

### Slice 2: shared observability + pricing core

Create `src/core/job-observability.ts` and `src/core/pricing.ts` to produce one canonical per-job observability snapshot:

- requested run profile
- observed actual models
- token totals + breakdown
- estimated cost (or explicit unavailable/partial reason)

### Slice 3: CLI observability parity

Update `status`, `info`, and `log --summary` to consume the shared snapshot and expose failure insight consistently across human and JSON output.

### Slice 4: TUI observability parity

Update running/completed/detail surfaces to consume the same shared snapshot semantics (including partial/unavailable labels and mismatch visibility).

### Slice 5: export artifact command

Add `pilot export <job-id>` with markdown MVP artifact generation, sensible default behavior, and explicit output path control.

### Slice 6: docs + full regression

Document estimate semantics and export usage (success + failure examples) and run full test verification.

## Design Constraints to Preserve

- No transcript dump by default in exports
- No fake precision in cost output
- No CLI-only or TUI-only observability forks
- No job execution blocking when observability data is partial
- Prefer conservative undercount + explanation over speculative overcount

## Key Patterns to Reuse

- `what / why / next` operator language from Phase 44 summary surfaces
- Additive JSON output changes (preserve existing fields, add structured observability blocks)
- Pure helper testing strategy for TUI formatting logic (`detail-header`, queue panel style)

## Common Pitfalls and Guards

1. **Double-counting subagent usage**
   - Guard: dedupe by session ID while traversing session trees
2. **Model mismatch false positives**
   - Guard: compare against intended executor model but still show full observed model set
3. **Cost math implied as billing truth**
   - Guard: always label as estimate and include missing-pricing caveats
4. **Inconsistent token totals across surfaces**
   - Guard: all surfaces read from one shared snapshot, not per-command local aggregation
5. **Overly verbose status/TUI rows**
   - Guard: compact badges in list views, detailed breakdowns in `info`, detail view, and export

## Verification Strategy

### Core

- `test/core/opencode-db.test.ts`
- `test/core/job-observability.test.ts` (new)
- `test/core/runner-recovery.test.ts`

### Commands

- `test/commands/info.test.ts`
- `test/commands/log.test.ts`
- `test/commands/status.test.ts`
- `test/commands/export.test.ts` (new)

### TUI

- `test/tui/detail-header.test.ts`
- `test/tui/completed-panel.test.ts`
- `test/tui/running-panel.test.ts` (new)

### Final

- `npm test`

## Sources

### Primary

- `requirements/job-observability-cost-tracking-and-export.md`
- `requirements/tui-observability-overhaul.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/44-qol-introspection-and-queue-grace-period/44-04-SUMMARY.md`
- `.planning/phases/44-qol-introspection-and-queue-grace-period/44-05-SUMMARY.md`
- `src/core/opencode-db.ts`
- `src/core/runner.ts`
- `src/commands/info.ts`
- `src/commands/log.ts`
- `src/commands/status.ts`
- `src/tui/state.ts`
- `src/tui/app.tsx`
- `src/tui/views/detail.tsx`

### Secondary

- `test/core/opencode-db.test.ts`
- `test/commands/info.test.ts`
- `test/commands/log.test.ts`
- `test/commands/status.test.ts`
- `test/tui/detail-header.test.ts`
- `test/tui/completed-panel.test.ts`

## Metadata

- Standard stack confidence: HIGH (already in repo)
- Implementation risk: MEDIUM (cross-surface consistency work touches CLI + TUI)
- Recommendation validity window: until Phase 45 execution starts
