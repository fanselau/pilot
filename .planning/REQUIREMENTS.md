# Requirements: Judge System — Move Into Pilot

**Defined:** 2026-03-16
**Core Value:** Judge verdicts must include actionable retry recommendations and failure fingerprints so the runner can make intelligent retry decisions.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Prompt Consolidation

- [ ] **PRMT-01**: Merge `gsd-judge.md` and `pilot-judge.md` into a single canonical judge prompt at `src/prompts/judge.md`
- [ ] **PRMT-02**: Judge prompt uses `pilot-judge.md` richer format as base with updated verdict values (`pass`/`fail`/`partial`)
- [ ] **PRMT-03**: Judge prompt instructs evidence reading order: VERIFICATION.md (primary), VALIDATION.md (when present), session transcript (secondary)
- [ ] **PRMT-04**: Judge prompt specifies exact JSON output schema including all new fields
- [ ] **PRMT-05**: Judge prompt includes `retryRecommendation` field instructions: `'retry-resume'` for targeted fixes, `'retry-full'` for full re-run, `'none'` for clean pass or unrecoverable
- [ ] **PRMT-06**: Judge prompt includes `retryHint` field instructions: free-text guidance for next attempt
- [ ] **PRMT-07**: Judge prompt includes `failureFingerprint` field instructions: short structured list of failing items

### Runner Integration

- [ ] **RNIN-01**: `runJudge()` loads judge prompt from `src/prompts/judge.md` at module init (same pattern as `delegate.md`)
- [ ] **RNIN-02**: `runJudge()` passes judge prompt as inline prompt to opencode session (not `--command gsd-judge`)
- [ ] **RNIN-03**: `runJudge()` reads VERIFICATION.md from disk and passes content as context in the inline prompt
- [ ] **RNIN-04**: `runJudge()` reads VALIDATION.md from disk when present and passes content as context
- [ ] **RNIN-05**: VERIFICATION.md validation: must be non-empty (>100 bytes) and contain expected headers; if invalid, treat as missing
- [ ] **RNIN-06**: When VERIFICATION.md is absent or invalid, judge uses session transcript only and prompt instructs default to `partial` with confidence ≤ 40
- [ ] **RNIN-07**: `parseJudgeVerdict()` accepts new verdict values: `pass`, `fail`, `partial` (in addition to legacy `succeeded`/`failed`/`doubting` for backward compat)

### Type Updates

- [ ] **TYPE-01**: Add `retryRecommendation` field to `ParsedJudgeVerdictPayload`: `'retry-resume'` | `'retry-full'` | `'none'`
- [ ] **TYPE-02**: Add `retryHint` field to `ParsedJudgeVerdictPayload`: `string | null`
- [ ] **TYPE-03**: Add `failureFingerprint` field to `ParsedJudgeVerdictPayload`: `string[] | null`
- [ ] **TYPE-04**: Add `retryRecommendation`, `retryHint`, `failureFingerprint` fields to `JudgeSignal`
- [ ] **TYPE-05**: Update `JudgeVerdict` interface in `runner.ts` to include `retryRecommendation`, `retryHint`, `failureFingerprint`
- [ ] **TYPE-06**: Update `VERDICT_TO_OUTCOME` map to handle `pass`/`fail`/`partial` (add `partial` as valid outcome mapping to `'doubt'` or new `'partial'` outcome)

### Signal & UI Updates

- [ ] **SGUI-01**: `buildJudgeSignal()` produces correct badge format for `partial` verdict (e.g., `judge:partial 35%`)
- [ ] **SGUI-02**: `JudgeSignalOutcome` type includes `'partial'` as a valid value
- [ ] **SGUI-03**: Judge signal exposes `retryRecommendation` for downstream consumers (runner retry logic, notifications)
- [ ] **SGUI-04**: Existing badge format for `pass` and `fail` unchanged

### Model & Provider

- [ ] **MODL-01**: Judge model in hybrid mode uses GPT-5.4 (check role) — verify existing `_top:judge` scope is correct
- [ ] **MODL-02**: `runJudge()` passes `--model` flag when `providerMode === 'hybrid'` or `providerMode === 'openai-only'`
- [ ] **MODL-03**: `runJudge()` uses inline prompt pattern — model resolution via `resolveTopLevelModel('judge', ...)` (existing pattern)

### Cleanup

- [ ] **CLEN-01**: Remove `gsd-judge` command reference from pilot-gsd (or mark as deprecated/dead)
- [ ] **CLEN-02**: Remove `pilot-judge` command reference from pilot-gsd (or mark as deprecated/dead)
- [ ] **CLEN-03**: Remove `--command gsd-judge` call path from `spawnAndWait()` in runner.ts
- [ ] **CLEN-04**: Update runner tests that reference `gsd-judge` command

### Web UI Attribution + Mobile Overflow Hardening

- [x] **ATTR-01**: Late judge/final-step session activity is attributed to the correct step instead of appearing in Unattributed bucket
- [x] **ATTR-02**: Unattributed bucket only contains genuinely unassignable content (e.g., activity before any step starts)
- [x] **ATTR-03**: resolveStepIndex() uses 5-tier attribution: sessionId → sessionTitle → timeWindow → childSessionTransitivity → lastStepFallback
- [x] **ATTR-04**: Child session transitivity: candidates from sessions spawned by a step's root session are attributed to that step via childToStepIndex map
- [x] **ATTR-05**: Existing 3-tier attribution (sessionId/sessionTitle/timeWindow) remains backward-compatible with no regressions
- [x] **MOB-01**: No page-level horizontal overflow on mobile (375px viewport) across main data viewers (timeline-stream, step-content-pane, job-list)
- [x] **MOB-02**: No page-level horizontal overflow on mobile in child/sub-session drill-in views
- [x] **MOB-03**: Long code/tool-input content is contained via wrapping, truncation, or inner scroll — never clips important content without readable fallback
- [x] **MOB-04**: Responsive margins on step content border-l items reclaim horizontal space on mobile without affecting desktop
- [x] **MOB-05**: Global overflow-x-hidden safeguard on body element as safety net
- [x] **SUB-01**: Child/sub-session drill-in view has visual polish parity with main job detail (StatusBadge, responsive padding, overflow containment)

| Requirement | Phase | Status |
|-------------|-------|--------|
| ATTR-01 | Phase 80 | Complete |
| ATTR-02 | Phase 80 | Complete |
| ATTR-03 | Phase 80 | Complete |
| ATTR-04 | Phase 80 | Complete |
| ATTR-05 | Phase 80 | Complete |
| MOB-01 | Phase 80 | Complete |
| MOB-02 | Phase 80 | Complete |
| MOB-03 | Phase 80 | Complete |
| MOB-04 | Phase 80 | Complete |
| MOB-05 | Phase 80 | Complete |
| SUB-01 | Phase 80 | Complete |

### Timeline Semantics + Renderer Unification

- [x] **TSEM-01**: Steps with known session lineage are attributed to correct step groups (not Unattributed)
- [x] **TSEM-02**: Each step group has a semantic label derived from source + command (e.g., "Execution", "Judge", "Gap Closure")
- [x] **TSEM-03**: A shared helper module (`step-semantics.ts`) maps step source/command to human-readable labels
- [x] **TSEM-04**: Child/sub-session drill-in views use the same renderer primitives as main view
- [ ] **TSEM-05**: Session activity metadata (timestamp/badges) sits in a header row above content, not inline
- [x] **TSEM-06**: Steps tab renamed to Timeline
- [x] **TSEM-07**: Continuation/gap-closure steps are visually distinct (badge + amber accent)
- [ ] **TSEM-08**: Judge verdict is surfaced as a first-class visual object in the timeline
- [ ] **TSEM-09**: All step label surfaces use semantic names (no remaining generic "Step N" fallbacks)

| Requirement | Phase | Status |
|-------------|-------|--------|
| TSEM-01 | Phase 82 | Complete |
| TSEM-02 | Phase 82 | Complete |
| TSEM-03 | Phase 82 | Complete |
| TSEM-04 | Phase 82 | Complete |
| TSEM-05 | Phase 82 | In Progress |
| TSEM-06 | Phase 82 | Complete |
| TSEM-07 | Phase 82 | Complete |
| TSEM-08 | Phase 82 | In Progress |
| TSEM-09 | Phase 82 | In Progress |

### Pilot Human Review Semantics

- [x] **REVIEW-01**: JobStatus type includes `completed_pending_review` and `review_hold` values
- [x] **REVIEW-02**: DB schema allows `completed_pending_review` and `review_hold` status values in CHECK constraint
- [x] **REVIEW-03**: `markCompletedPendingReview()` sets status without calling `blockProject()`
- [x] **REVIEW-04**: `markReviewHold()` sets status without calling `blockProject()`
- [x] **REVIEW-05**: `claimNextLaunchable()` does not skip jobs for projects that have jobs in review states
- [x] **REVIEW-06**: `approveReview()` transitions `completed_pending_review` to `completed`; `resumeFromReviewHold()` transitions `review_hold` to `running`
- [x] **REVIEW-07**: Runner detects when judge verdict leaves only human-review items and transitions to `completed_pending_review`
- [x] **REVIEW-08**: Runner detects mid-phase checkpoint pauses and transitions to `review_hold`
- [x] **REVIEW-09**: `pilot review <id> --approve` on `review_hold` job resumes step execution
- [x] **REVIEW-10**: Notification callback says "review pending" for `completed_pending_review` jobs, not "failed"
- [x] **REVIEW-11**: `pilot review` CLI command with `--approve` and `--reject` flows
- [x] **REVIEW-12**: No auto-job creation happens for review handling
- [x] **REVIEW-13**: CLI `pilot status` shows review states with amber non-failure styling
- [x] **REVIEW-14**: CLI `pilot log` shows review checklist from `resumeHint`
- [x] **REVIEW-15**: TUI dashboard shows review states with distinct non-failure colors in completed panel
- [x] **REVIEW-16**: Web UI `StatusBadge` renders review states with warning/info variant, not destructive

| Requirement | Phase | Status |
|-------------|-------|--------|
| REVIEW-01 | Phase 81 | Complete |
| REVIEW-02 | Phase 81 | Complete |
| REVIEW-03 | Phase 81 | Complete |
| REVIEW-04 | Phase 81 | Complete |
| REVIEW-05 | Phase 81 | Complete |
| REVIEW-06 | Phase 81 | Complete |
| REVIEW-07 | Phase 81 | Complete |
| REVIEW-08 | Phase 83 | Complete |
| REVIEW-09 | Phase 83 | Complete |
| REVIEW-10 | Phase 81 | Complete |
| REVIEW-11 | Phase 81 | Complete |
| REVIEW-12 | Phase 81 | Complete |
| REVIEW-13 | Phase 81 | Complete |
| REVIEW-14 | Phase 81 | Complete |
| REVIEW-15 | Phase 83 | Complete |
| REVIEW-16 | Phase 81 | Complete |

### Pilot UI Phase — First-Class Delegation Step

- [x] **UI-PHASE-INTENT**: DelegationIntent `plan-and-execute` variant includes optional `uiPhase?: boolean` field; no new intent type added
- [x] **UI-PHASE-DELEGATION**: Delegation prompt includes Step 3.5 with explicit criteria for when to set `uiPhase: true` (bar: new visual design a designer would review)
- [x] **UI-PHASE-RUNNER**: Runner `intentToSteps()` conditionally inserts `ui-phase` step between `add-phase` and `plan-phase` when `intent.uiPhase` is true; skips when UI-SPEC already exists
- [x] **UI-PHASE-ASYNC-SAFE**: UI-phase step is gated by `!intent.isGapClosure`; existing UI-SPEC triggers skip (not re-run); no upstream interactive branches invoked
- [x] **UI-PHASE-OBSERVABILITY**: UI-phase step has `reason` field for `pilot info` display; skip events logged to stderr with specific reason; step visible in execution step list
- [x] **UI-PHASE-COMPAT**: Existing `validTypes` array unchanged; `parseIntentOutput` backward-compatible (undefined `uiPhase` = no UI phase); string `uiPhase` normalized to boolean defensively

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-PHASE-INTENT | Phase 87 | Complete |
| UI-PHASE-DELEGATION | Phase 87 | Complete |
| UI-PHASE-RUNNER | Phase 87 | Complete |
| UI-PHASE-ASYNC-SAFE | Phase 87 | Complete |
| UI-PHASE-OBSERVABILITY | Phase 87 | Complete |
| UI-PHASE-COMPAT | Phase 87 | Complete |

### Job Detail Content-First Redesign

- [x] **INFO-PANEL**: Unified Info panel (Sheet component) replaces fragmented actions modal + meta surface; contains status, timestamps, identity, observability, verdict, git, recovery context, and all working job actions
- [x] **TAB-REMOVAL**: Tab bar completely removed from job detail on both desktop and mobile; activity/timeline is the only persistent reading surface
- [x] **SUMMARY-OVERLAY**: Summary available as toggleable Sheet overlay near top layout, not a permanent tab; shows per-step verdictReason content
- [x] **TIMEZONE-FIX**: User-facing timestamps rendered in local timezone via parseSqliteTimestamp → toLocaleString (no misleading UTC/mixed)
- [x] **TOP-LAYOUT**: Content-first compact breadcrumb header (project + job ID + status badge) replacing old card-based header; lighter and more trustworthy
- [x] **NESTED-CHILDREN**: Nested child sessions render as normal-flow embedded content without card chrome; at near top-level density with subtle border-l + bg treatment
- [x] **STICKY-HEADERS**: Nested session headers are sticky with depth-based top/zIndex stacking beneath parent context; step group headers at z-30, nested children at z-20 decreasing
- [x] **COLLAPSIBLE**: Child sessions remain collapsible/foldable with glanceable collapsed identity showing label/status/duration/model
- [x] **FOLLOW-MODE**: Explicit toggleable Follow mode with auto-scroll, 80px deliberate-scroll auto-cancel threshold, sticky FollowModeBar for re-engagement
- [x] **CROSS-DEVICE**: Desktop and mobile share same information architecture; responsive layout adapts presentation, not IA

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFO-PANEL | Phase 88 | Complete |
| TAB-REMOVAL | Phase 88 | Complete |
| SUMMARY-OVERLAY | Phase 88 | Complete |
| TIMEZONE-FIX | Phase 88 | Complete |
| TOP-LAYOUT | Phase 88 | Complete |
| NESTED-CHILDREN | Phase 88 | Complete |
| STICKY-HEADERS | Phase 88 | Complete |
| COLLAPSIBLE | Phase 88 | Complete |
| FOLLOW-MODE | Phase 88 | Complete |
| CROSS-DEVICE | Phase 88 | Complete |

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Evidence

- **EVID-01**: Judge reads `UI-REVIEW.md` when present (UI verification scores)
- **EVID-02**: Judge confidence score factors in Nyquist VALIDATION.md coverage level
- **EVID-03**: Judge session recorded as a `job_step` in audit trail (currently runs outside step tracking)

### Runner Retry Wiring

- **RTRY-01**: Runner uses `retryRecommendation` field to decide retry strategy (`--gaps` vs full re-run)
- **RTRY-02**: Runner uses `retryHint` as context injection for retry delegation prompt
- **RTRY-03**: Runner uses `failureFingerprint` for same-failure detection across retries (gsd-07)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full gsd-07 auto-retry on judge failure | This phase adds verdict fields; retry logic is a separate phase |
| Judge modifying files | Judge is read-only by design |
| Judge invoking GSD commands | Judge only reads artifacts |
| UI-REVIEW.md reading | Nice-to-have, not blocking for move |
| `pilot log`/`pilot info` judge enhancement | Existing display works; enhancements deferred |
| Removing pilot-gsd submodule entirely | Separate effort; this phase only removes judge command references |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRMT-01 | Phase 68 | Pending |
| PRMT-02 | Phase 68 | Pending |
| PRMT-03 | Phase 68 | Pending |
| PRMT-04 | Phase 68 | Pending |
| PRMT-05 | Phase 68 | Pending |
| PRMT-06 | Phase 68 | Pending |
| PRMT-07 | Phase 68 | Pending |
| RNIN-01 | Phase 68 | Pending |
| RNIN-02 | Phase 68 | Pending |
| RNIN-03 | Phase 68 | Pending |
| RNIN-04 | Phase 68 | Pending |
| RNIN-05 | Phase 68 | Pending |
| RNIN-06 | Phase 68 | Pending |
| RNIN-07 | Phase 68 | Pending |
| TYPE-01 | Phase 68 | Pending |
| TYPE-02 | Phase 68 | Pending |
| TYPE-03 | Phase 68 | Pending |
| TYPE-04 | Phase 68 | Pending |
| TYPE-05 | Phase 68 | Pending |
| TYPE-06 | Phase 68 | Pending |
| SGUI-01 | Phase 68 | Pending |
| SGUI-02 | Phase 68 | Pending |
| SGUI-03 | Phase 68 | Pending |
| SGUI-04 | Phase 68 | Pending |
| MODL-01 | Phase 68 | Pending |
| MODL-02 | Phase 68 | Pending |
| MODL-03 | Phase 68 | Pending |
| CLEN-01 | Phase 68 | Pending |
| CLEN-02 | Phase 68 | Pending |
| CLEN-03 | Phase 68 | Pending |
| CLEN-04 | Phase 68 | Pending |
| INFO-PANEL | Phase 88 | Complete |
| TAB-REMOVAL | Phase 88 | Complete |
| SUMMARY-OVERLAY | Phase 88 | Complete |
| TIMEZONE-FIX | Phase 88 | Complete |
| TOP-LAYOUT | Phase 88 | Complete |
| NESTED-CHILDREN | Phase 88 | Complete |
| STICKY-HEADERS | Phase 88 | Complete |
| COLLAPSIBLE | Phase 88 | Complete |
| FOLLOW-MODE | Phase 88 | Complete |
| CROSS-DEVICE | Phase 88 | Complete |

**Coverage:**
- v1 requirements: 83 total (31 Phase 68 + 11 Phase 80 + 9 Phase 82 + 16 Phase 81/83 + 6 Phase 87 + 10 Phase 88)
- Mapped to phases: 83
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-23 after adding Phase 88 requirement traceability*
