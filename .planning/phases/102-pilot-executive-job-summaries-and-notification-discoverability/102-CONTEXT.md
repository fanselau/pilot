# Phase 102: Pilot — Executive Job Summaries and Notification Discoverability - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-executive-job-summaries-and-notification-format.md)

<domain>
## Phase Boundary

Add a shared executive-summary system for Pilot jobs and make it the source of truth for notifications, a new `pilot summary [id]` command, and `pilot log --summary`. The implementation must stay deterministic, reuse existing Pilot introspection helpers and commit-delta logic, improve drilldown discoverability, surface compact step summaries plus key artifacts/results, and add regression coverage for builder, notification, and CLI behavior.

</domain>

<decisions>
## Implementation Decisions

### Shared Summary Foundation
- **D-01**: Create `src/core/job-summary.ts` as the single shared summary module and move summary business logic out of `src/commands/log.ts`; notifications and CLI surfaces must consume this source of truth
- **D-02**: Export typed `StepExecutiveSummary` and `JobExecutiveSummary` objects from the shared module using the shape defined in the PRD; summary generation must be deterministic and must not call an LLM
- **D-05**: Reuse existing Pilot helpers wherever possible instead of re-deriving behavior differently: `buildJobWhy()`, `buildRetryWhy()`, `buildJobObservability()`, `buildJudgeSignal()`, plus the current commit-delta behavior now embedded in `src/commands/log.ts`

### Step Summary and Assistant Message Rules
- **D-03**: Populate `StepExecutiveSummary.shortSummary` using this strict fallback order: (1) final useful assistant text from the step session, (2) `step.verdictReason`, (3) `step.error`, (4) `null`; the rendered step summary must stay concise enough for one CLI/notification line after truncation
- **D-04**: Add a dedicated helper in `src/core/opencode-db.ts` for the latest useful assistant-authored text message for a session; do not overload `getLastMessage()`, and capture up to the last 3 useful assistant messages across relevant sessions, newest first, skipping empty/tool-only noise
- **D-11**: Surface key artifacts/results cheaply from existing verification artifact paths, step context, and obvious assistant result statements or paths; do not broad-scrape transcripts, do not paste raw tool output/full transcript fragments into summaries, and do not create a second competing summary system

### Notification Contract
- **D-06**: Rewrite `src/core/callback.ts` so notification content is rendered from `JobExecutiveSummary` and leads with: (1) one-line outcome headline, (2) concise `what / why / next`, (3) compact evidence/key result, (4) explicit drilldown commands; keep stable identifiers (`job_id`, `project`, `scope`, `status`) present
- **D-07**: Non-success notification states must use exact operational guidance: failed jobs lead with failure reason plus unblock guidance; `completed_pending_review` and `review_hold` must include the exact `pilot review ...` command before transcript-oriented guidance; preserve the “real event, do not ignore” intent only once and remove generic instruction text like “Acknowledge success...”

### CLI Surfaces
- **D-08**: Add `src/commands/summary.ts` implementing `pilot summary [id]` as the primary human/agent executive-summary entry point; `pilot summary` with no ID uses the same smart default behavior as `pilot log` (latest running job, otherwise a clear error requiring an ID); `--json` emits the structured summary object rather than transcript data
- **D-09**: Keep `pilot log --summary` for backward compatibility, but make it use the shared executive-summary builder and match `pilot summary` on core fields and JSON structure; `pilot log` remains the full-transcript deep-drill command
- **D-10**: Improve CLI discoverability: `pilot status` should surface short next-step commands where action/deeper inspection is needed, `pilot log` help text must explicitly describe `--summary` as executive summary mode, and the new `pilot summary` help text must make the summary-vs-transcript split obvious

### Tests
- **D-12**: Add regression coverage for completed, failed, review-pending, review-hold, verification-routing, and missing-session-data summary paths; test step-summary fallback order, callback prompt shape, `pilot summary`, `pilot log --summary` parity, and status/help discoverability changes

### Agent's Discretion
- Exact truncation lengths for one-line summaries, evidence snippets, and message previews so long as they stay concise and deterministic
- Internal helper decomposition inside `job-summary.ts` and renderer/formatter helpers, provided the shared summary builder remains the single source of truth
- Exact formatting of human-readable headings and bullets, provided the required sections and commands remain easy to scan and copy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Spec
- `requirements/pilot-executive-job-summaries-and-notification-format.md` — full phase spec, required type shape, notification ordering, command behavior, and anti-goals
- `.planning/ROADMAP.md` — Phase 102 slot, dependency on Phase 101, and requirement IDs

### Existing Summary / Introspection Patterns
- `.planning/phases/44-qol-introspection-and-queue-grace-period/44-RESEARCH.md` — prior research for deterministic summary-first CLI surfaces and shared introspection patterns
- `.planning/phases/44-qol-introspection-and-queue-grace-period/44-04-SUMMARY.md` — existing `pilot log --summary` implementation history, commit-delta logic location, and deterministic-summary constraints
- `src/core/job-introspection.ts` — shared `what / why / next` guidance and review/failure action copy
- `src/core/job-observability.ts` — canonical observability snapshot used by summary surfaces
- `src/core/judge-signal.ts` — structured judge/verification snapshot and review-related routing fields

### Current Implementation Targets
- `src/commands/log.ts` — current summary logic that must be extracted into shared code
- `src/core/callback.ts` — current notification prompt builder that must be replaced by summary-based rendering
- `src/commands/status.ts` — current status output where drilldown discoverability must improve
- `src/core/opencode-db.ts` — session/message query helpers and the correct place for useful assistant-text extraction
- `src/index.ts` — CLI registration and help text updates for `pilot summary` and `pilot log --summary`

### Review / Notification Context
- `.planning/phases/101-modular-notification-backends/101-02-SUMMARY.md` — callback fan-out and notification backend constraints that Phase 102 must preserve
- `.planning/phases/81-pilot-human-review-semantics-autonomy-first-no-false-failure/81-01-SUMMARY.md` — review-state semantics and required approve/reject messaging
- `.planning/phases/83-pilot-human-review-semantics-phase-81-follow-up-completion/83-01-SUMMARY.md` — `review_hold` resume behavior and exact runtime meaning of review continuation

</canonical_refs>

<specifics>
## Specific Ideas

- Prefer the final useful assistant text from the current/final step as the most natural narrative summary when present
- Keep `lastAssistantMessages` capped at 3 entries, newest first, and store `stepIndex`, `sessionTitle`, and concise text
- Surface verification artifact paths from judge/verification data before attempting any light assistant-text path extraction
- New summary drilldown commands should always include `pilot summary <jobId>`, `pilot log <jobId>`, and `pilot status --why`; add `pilot review ...` or `pilot unblock ...` when the job state needs them

</specifics>

<deferred>
## Deferred Ideas

- `pilot summary <id> --verbose` or expanded evidence mode
- Later heuristic/result extraction for richer test pass counts or generated artifact names beyond obvious/high-confidence signals
- Any LLM-generated summarization layer
- Later UI/API surfaces that reuse the executive summary object

</deferred>

---

*Phase: 102-pilot-executive-job-summaries-and-notification-discoverability*
*Context gathered: 2026-03-30 via PRD Express Path*
