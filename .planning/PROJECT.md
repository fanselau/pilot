# Judge System — Move Into Pilot

## What This Is

A reliability feature that moves the judge prompts from the pilot-gsd fork into Pilot's own codebase (`src/prompts/`), merges the two divergent judge prompt formats into one canonical format, and enriches the verdict with retry recommendation fields that feed directly into the runner's retry logic. The judge becomes a Pilot-internal inline prompt session — no more `--command gsd-judge`.

## Core Value

Judge verdicts must include actionable retry recommendations (`retry-resume` / `retry-full` / `none`) and failure fingerprints so the runner can make intelligent retry decisions without operator intervention.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Merge two judge prompts into ONE canonical prompt at `src/prompts/judge.md`
- [ ] Update verdict values from `succeeded`/`failed`/`doubting` to `pass`/`fail`/`partial`
- [ ] Add `retryRecommendation`, `retryHint`, and `failureFingerprint` to verdict output
- [ ] Update `runJudge()` to use inline prompt from `src/prompts/` instead of `--command gsd-judge`
- [ ] Judge reads VERIFICATION.md (primary) + session transcript (secondary) for evidence
- [ ] Judge reads VALIDATION.md when present for richer verdicts
- [ ] Update `VERDICT_TO_OUTCOME` map for new verdict values including `partial`
- [ ] Add `retryRecommendation` and `retryHint` fields to `JudgeSignal` / `ParsedJudgeVerdictPayload` types
- [ ] Judge model in hybrid mode: always Codex/GPT-5.4 (check role)
- [ ] Remove `gsd-judge` and `pilot-judge` command references from pilot-gsd
- [ ] Add `failureFingerprint` field to judge output for same-failure detection

### Out of Scope

- Full gsd-07 auto-retry implementation — this phase adds verdict fields only; retry logic is a separate phase
- UI-REVIEW.md reading — nice-to-have, not blocking
- Judge confidence factoring in Nyquist VALIDATION.md coverage level — nice-to-have
- Judge modifying files — judge is read-only
- Judge invoking GSD commands — judge only reads artifacts

## Context

- Pilot is at Phase 97+ — mature codebase with established patterns (Phase 97 added full settings page with config management UI)
- Two judge prompts exist in `pilot-gsd/commands/`: `gsd-judge.md` (active, uses `succeeded`/`failed`/`doubting`) and `pilot-judge.md` (unused, has richer format with `pass`/`partial`/`fail` + `retryRecommendation`)
- `runJudge()` in `runner.ts` (line 1049) currently calls `--command gsd-judge` via `spawnAndWait()`
- `parseJudgeVerdict()` in `runner.ts` (line 1498) validates verdict is one of `['succeeded', 'failed', 'doubting']`
- `VERDICT_TO_OUTCOME` in `judge-signal.ts` maps `succeeded→pass`, `failed→fail`, `doubting→doubt`
- `ParsedJudgeVerdictPayload` in `judge-signal.ts` has `verdict`, `confidence`, `reason` fields — needs `retryRecommendation`, `retryHint`, `failureFingerprint`
- `HungSessionError` + retry budget already implemented in Phase 67 — judge retry can share this infrastructure
- The delegation pipeline (Phase 66) uses inline prompts from `src/prompts/delegate.md` — same pattern for judge
- Judge model resolution uses `_top:judge` scope in `models.ts` — GPT-5.4 in hybrid/openai-only modes
- VERIFICATION.md is produced by gsd-verify-phase (Phase 31) and is the primary evidence source

## Constraints

- **Tech stack**: TypeScript, Bun, SQLite (better-sqlite3), existing Pilot codebase patterns
- **Read-only judge**: Judge must never modify files or invoke GSD commands
- **Backward compat**: `parseJudgeVerdict()` must handle both old format (`succeeded`/`failed`/`doubting`) and new format (`pass`/`fail`/`partial`) during transition
- **Provider mode**: Judge must use check-role model (GPT-5.4 in hybrid), configurable via `_top:judge` scope
- **Evidence strategy**: VERIFICATION.md from disk (primary) + session transcript via DB (secondary); if VERIFICATION.md absent, use transcript only with confidence ≤ 40

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Merge into ONE prompt, not keep two | Two prompts with different formats creates drift and confusion | — Pending |
| Use `pilot-judge.md` richer format as base | Has retryRecommendation, structured format | — Pending |
| Verdict values: `pass`/`fail`/`partial` (not `succeeded`/`failed`/`doubting`) | Cleaner, shorter, standard terminology | — Pending |
| `retryRecommendation`: string `'retry-resume'`/`'retry-full'`/`'none'` (not null) | Explicit string is safer than null for JSON parsing | — Pending |
| Inline prompt (src/prompts/) not opencode command | Matches delegation pipeline pattern, removes pilot-gsd dependency | — Pending |
| VERIFICATION.md primary + transcript secondary | VERIFICATION.md is structured machine-readable evidence; transcript is fallback | — Pending |

---
*Last updated: 2026-03-25 after Phase 97 completion — settings page with full configuration management in web UI*
