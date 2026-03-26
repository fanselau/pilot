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

### Phase 89: Pilot Web UI — Nested Sticky Hierarchy, Summary, and Label Fixes

- [x] **SEMANTIC-TYPE-MODEL**: Introduce a SemanticSessionType model (14 canonical types: Delegation, Add Phase, Planning, Execution, Judge, Continuation Delegation, Gap Planning, Gap Execution, Gap Judge, Recovery, Fast Task, Quick Task, Manual, Unattributed) with Lucide icons, pastel colors, and gap flags, used consistently by summary cards, sticky headers, and nested session headers
- [x] **SUMMARY-FIX**: Fix Summary popup empty state — show deliberate fallback with step-count context when no verdict data exists, render semantic icons and Gap badges on summary cards
- [x] **LABEL-FOUNDATION**: Replace vague internal labels (e.g., "gap closure") with human-facing semantic labels derived from the SemanticSessionType model; every displayed session must resolve to exactly one semantic type
- [x] **STICKY-HIERARCHY**: Implement nested sticky header hierarchy — step header at top, first-level sub-agent below it, nested child below both — using position:sticky with computed top values per depth level
- [x] **PASTEL-COLORS**: Add subtle pastel color system for nested regions using DEPTH_PASTELS progression plus per-type bgClass/borderClass from SEMANTIC_TYPE_CONFIG; spacing, padding, and section rhythm (not just background color)
- [x] **HEADER-RENDERING**: Populate sticky headers with three-layer content model: (1) icon + semantic label + status, (2) compact context chips (model, duration, step index), (3) outcome line; use same semantic model across all surfaces
- [x] **EXECUTION-PARENT**: Execution renders as one top-level step with nested child runs; executor sub-sessions appear as nested branches, not separate top-level steps
- [x] **GAP-LABELS**: Gap loop nodes labeled distinctly as Gap Planning, Gap Execution, and Gap Judge with "Gap" badge; visually related to base type but clearly distinguishable
- [x] **ATTRIBUTION-FIX**: Fix session attribution via contiguous time windows and tier 5.5 catch-all so no session renders as Unattributed for well-formed jobs
- [x] **VALIDATION**: Validate implementation against real data from job 82bg to confirm known issues are actually fixed

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEMANTIC-TYPE-MODEL | Phase 89 | Complete |
| SUMMARY-FIX | Phase 89 | Complete |
| LABEL-FOUNDATION | Phase 89 | Complete |
| STICKY-HIERARCHY | Phase 89 | Complete |
| PASTEL-COLORS | Phase 89 | Complete |
| HEADER-RENDERING | Phase 89 | Complete |
| EXECUTION-PARENT | Phase 89 | Complete |
| GAP-LABELS | Phase 89 | Complete |
| ATTRIBUTION-FIX | Phase 89 | Complete |
| VALIDATION | Phase 89 | Complete |

### Phase 90: Pilot Web UI — Native Subsession Flow, Single-Scroll Integration, and Follow Mode

- [x] **NSSF-01**: Subsessions render inline as collapsible blocks (Radix Collapsible) within the single-scroll flow — no separate route, no modal, no card chrome breaking scroll continuity
- [x] **NSSF-02**: Active subsessions at depth < 2 expand by default; done and deep (depth >= 2) subsessions collapse by default
- [x] **NSSF-03**: Nested sticky headers use `position: sticky` with `top = (depth + 1) × 2.25rem` and z-index descending by depth (20 - depth)
- [x] **NSSF-04**: Collapsed identity row shows: semantic icon + label + status badge + role badge (if present) + duration + model (truncated to 100px)
- [x] **SSI-01**: Step sections rendered as `<section>` elements with `id="step-section-{idx}"` and `data-step-index`; sidebar click triggers `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- [x] **SSI-02**: IntersectionObserver scroll-spy with `rootMargin: '-10% 0px -70% 0px'` drives sidebar highlight; virtualization activates at 200+ items via `@tanstack/react-virtual`
- [x] **FM-01**: Follow mode auto-scrolls to bottom on new items; cancels on 80px cumulative upward scroll
- [x] **FM-02**: FollowModeBar appears (`sticky bottom-2 z-40`) only when `isActive=true` AND `autoFollow=false`; "Follow latest" pill re-engages auto-scroll
- [x] **FM-03**: Job active transition re-enables follow mode via useEffect; sidebar step click always cancels follow mode
- [x] **CLEAN-01**: Dead exports (`getBranchDrillInPath`, `selectBranchPreview`, `isPresent`) removed from `branch-lifecycle-block.helpers.ts`

| Requirement | Phase | Status |
|-------------|-------|--------|
| NSSF-01 | Phase 90 | Complete |
| NSSF-02 | Phase 90 | Complete |
| NSSF-03 | Phase 90 | Complete |
| NSSF-04 | Phase 90 | Complete |
| SSI-01 | Phase 90 | Complete |
| SSI-02 | Phase 90 | Complete |
| FM-01 | Phase 90 | Complete |
| FM-02 | Phase 90 | Complete |
| FM-03 | Phase 90 | Complete |
| CLEAN-01 | Phase 90 | Complete |

### Pilot Debug Lane — Caller-Side Autonomous gsd-debugger Orchestration

- [x] **DBG-01**: For `scope=debug`, Pilot stops routing jobs to `gsd-debug` (interactive orchestrator) and spawns `gsd-debugger` directly from caller/runner logic
- [x] **DBG-02**: Pilot constructs a prefilled debugger prompt with issue summary, symptoms, debug file path, and `symptoms_prefilled: true` mode
- [x] **DBG-03**: Debug jobs use a debug-specific lifecycle (`executeDebugFlow`) and are not treated like phase jobs
- [x] **DBG-04**: Debug jobs never enter phase-style judge logic or any logic that assumes plan-phase/execute-phase history
- [x] **DBG-05**: Debug sessions use 'debug' scope for model selection via `resolveTopLevelModel`, not 'judge' scope
- [x] **DBG-06**: Pilot parses `gsd-debugger` outcomes: ROOT CAUSE FOUND, INVESTIGATION INCONCLUSIVE, CHECKPOINT REACHED, DEBUG COMPLETE
- [x] **DBG-07**: CHECKPOINT REACHED with Type: human-verify triggers autonomous continuation (Pilot provides 'confirmed fixed')
- [x] **DBG-08**: CHECKPOINT REACHED with Type: human-action or decision blocks explicitly with reason (markReviewHold, not markFailed)
- [x] **DBG-09**: Interactive prompt leaks (question/mcp_question) no longer hang unattended debug jobs — HungSessionError caught and handled
- [x] **DBG-10**: Debug runs that self-verify successfully reach terminal success without manual intervention
- [x] **DBG-11**: Debug session artifacts preserved in `.planning/debug/` and continuation stays in debug lane
- [x] **DBG-12**: `handleHungContinuation` has safety guard preventing debug jobs from entering phase re-delegation path
- [x] **DBG-13**: `intentToSteps` returns empty array `[]` for debug intent — debug flow bypasses step loop entirely
- [x] **DBG-14**: Integration tests cover all debug outcome types, autonomous continuation, checkpoint blocking, hung session handling, and no-judge validation

| Requirement | Phase | Status |
|-------------|-------|--------|
| DBG-01 | Phase 91 | Complete |
| DBG-02 | Phase 91 | Complete |
| DBG-03 | Phase 91 | Complete |
| DBG-04 | Phase 91 | Complete |
| DBG-05 | Phase 91 | Complete |
| DBG-06 | Phase 91 | Complete |
| DBG-07 | Phase 91 | Complete |
| DBG-08 | Phase 91 | Complete |
| DBG-09 | Phase 91 | Complete |
| DBG-10 | Phase 91 | Complete |
| DBG-11 | Phase 91 | Complete |
| DBG-12 | Phase 91 | Complete |
| DBG-13 | Phase 91 | Complete |
| DBG-14 | Phase 91 | Complete |

### Phase 96: Mobile Summary Panel — Step Navigation and Subsession Chips

- [x] **MOBILE-STEP-NAV**: On mobile viewport, a "Steps" button in the top bar opens a bottom-sheet drawer listing all steps with status icon, command label, status badge, and duration; tapping a step dismisses the drawer and scrolls the content pane to that step
- [x] **MOBILE-SUBSESSION-CHIPS**: On mobile, step headers with subsessions show tappable inline chips (S1, S2, etc.) that scroll to the corresponding fork card within the step

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOBILE-STEP-NAV | Phase 96 | Complete |
| MOBILE-SUBSESSION-CHIPS | Phase 96 | Complete |

### Pilot UI Review Step in Phase Lifecycle

- [x] **UIREV-01**: Pilot appends an explicit `ui-review` step for UI-eligible phase jobs only after judge pass; it is not part of the initial pre-judge step list
- [x] **UIREV-02**: UI-review eligibility is derived deterministically from existing UI signals (`intent.uiPhase`, prior `ui-phase` step, or existing `UI-SPEC.md`) and non-UI phases omit the step
- [x] **UIREV-03**: Existing `UI-REVIEW.md` causes duplicate-safe skip/no-op behavior rather than re-running interactive audit branches
- [x] **UIREV-04**: `ui-review` never runs after judge fail, judge gaps, shutdown/interruption, or retry/redelegation failure paths
- [x] **UIREV-05**: `ui-review` uses advisory artifact-aware recovery: existing `UI-REVIEW.md` => completed, no artifact on hung/non-clean exit => skipped, and neither path re-delegates the job
- [x] **UIREV-06**: Judge remains the only pass/fail/gaps gate; `ui-review` does not change judge verdict storage, retry routing, or gap-closure semantics in the first rollout
- [x] **UIREV-08**: `pilot status`, `pilot info`, and `pilot log` surface `ui-review` ran/skipped/path state separately from judge verdicts
- [x] **UIREV-09**: Core/web timeline semantics classify `ui-review` as `UI Review`, and session-title identity parsing recognizes runner titles containing `ui-review`

| Requirement | Phase | Status |
|-------------|-------|--------|
| UIREV-01 | Phase 98 | Complete |
| UIREV-02 | Phase 98 | Complete |
| UIREV-03 | Phase 98 | Complete |
| UIREV-04 | Phase 98 | Complete |
| UIREV-05 | Phase 98 | Complete |
| UIREV-06 | Phase 98 | Complete |
| UIREV-08 | Phase 98 | Complete |
| UIREV-09 | Phase 98 | Complete |

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
| SEMANTIC-TYPE-MODEL | Phase 89 | Complete |
| SUMMARY-FIX | Phase 89 | Complete |
| LABEL-FOUNDATION | Phase 89 | Complete |
| STICKY-HIERARCHY | Phase 89 | Complete |
| PASTEL-COLORS | Phase 89 | Complete |
| HEADER-RENDERING | Phase 89 | Complete |
| EXECUTION-PARENT | Phase 89 | Complete |
| GAP-LABELS | Phase 89 | Complete |
| ATTRIBUTION-FIX | Phase 89 | Complete |
| VALIDATION | Phase 89 | Complete |
| NSSF-01 | Phase 90 | Complete |
| NSSF-02 | Phase 90 | Complete |
| NSSF-03 | Phase 90 | Complete |
| NSSF-04 | Phase 90 | Complete |
| SSI-01 | Phase 90 | Complete |
| SSI-02 | Phase 90 | Complete |
| FM-01 | Phase 90 | Complete |
| FM-02 | Phase 90 | Complete |
| FM-03 | Phase 90 | Complete |
| CLEAN-01 | Phase 90 | Complete |
| DBG-01 | Phase 91 | Complete |
| DBG-02 | Phase 91 | Complete |
| DBG-03 | Phase 91 | Complete |
| DBG-04 | Phase 91 | Complete |
| DBG-05 | Phase 91 | Complete |
| DBG-06 | Phase 91 | Complete |
| DBG-07 | Phase 91 | Complete |
| DBG-08 | Phase 91 | Complete |
| DBG-09 | Phase 91 | Complete |
| DBG-10 | Phase 91 | Complete |
| DBG-11 | Phase 91 | Complete |
| DBG-12 | Phase 91 | Complete |
| DBG-13 | Phase 91 | Complete |
| DBG-14 | Phase 91 | Complete |

### UI-Phase Completion Pipeline Fix

- [x] **UIFIX-01**: HungSessionError handler in executeCommandStep checks for ui-phase artifact completion (UI-SPEC.md) BEFORE marking step as failed
- [x] **UIFIX-02**: When UI-SPEC artifact exists during HungSessionError for ui-phase step: step marked `completed`, handleHungContinuation NOT called
- [x] **UIFIX-03**: When UI-SPEC artifact does NOT exist during HungSessionError for ui-phase step: existing behavior preserved (step marked `failed`, handleHungContinuation called)
- [x] **UIFIX-04**: `pilot status`, `pilot info`, and `pilot log` reflect correct non-failure state for completed ui-phase steps
- [x] **UIFIX-05**: Regression test covers HungSessionError + ui-phase artifact recovery (both success and failure paths)

| Requirement | Phase | Status |
|-------------|-------|--------|
| UIFIX-01 | Phase 94 | Complete |
| UIFIX-02 | Phase 94 | Complete |
| UIFIX-03 | Phase 94 | Complete |
| UIFIX-04 | Phase 94 | Complete |
| UIFIX-05 | Phase 94 | Complete |

### Redelegation Attribution Identity Preservation

- [x] **REATTR-01**: `extractAgentIdentity()` resolves `pilot-redelegate-*` session titles to `'pilot-redelegate'` instead of generic `'subagent'`
- [x] **REATTR-02**: `extractAgentIdentity()` resolves `pilot-delegate-*` session titles to `'pilot-delegate'` instead of generic `'subagent'`
- [x] **REATTR-03**: `extractAgentIdentity()` resolves `gsd-*` agent names and known GSD command-step patterns (execute-phase, plan-phase, judge, etc.) from session titles
- [x] **REATTR-04**: `extractToolInput()` for task tool preserves `subagent_type` when available, falls back through `model` before defaulting to `'subagent'`
- [x] **REATTR-05**: Web UI `resolveSemanticHint()` classifies redelegate session titles as `'continuation-delegation'` and `deriveBranchIdentity()` extracts meaningful labels from pilot-* and GSD command session titles
- [x] **REATTR-06**: Regression tests cover nested attribution paths that previously lost agent identity

| Requirement | Phase | Status |
|-------------|-------|--------|
| REATTR-01 | Phase 95 | Complete |
| REATTR-02 | Phase 95 | Complete |
| REATTR-03 | Phase 95 | Complete |
| REATTR-04 | Phase 95 | Complete |
| REATTR-05 | Phase 95 | Complete |
| REATTR-06 | Phase 95 | Complete |

### Managed GSD Distribution and Controlled Rollouts

- [x] **MGSD-01**: Pilot stores one explicit approved GSD version as an operator-controlled source of truth, independent of incidental `node_modules` state.
- [x] **MGSD-02**: Pilot detects each managed project's installed GSD version and classifies drift as `matches`, `behind`, `ahead`, or `unknown`.
- [ ] **MGSD-03**: `pilot setup` and `pilot setup --refresh` install or repair only against the approved-version contract and never silently downgrade ahead-of-approved projects.
- [ ] **MGSD-04**: `pilot update` converges Pilot's managed installer to the approved version and performs a controlled rollout across managed projects with per-project outcome reporting.
- [ ] **MGSD-05**: Pilot exposes approved version, installed version, and drift status in first-class operator surfaces and JSON output.
- [x] **MGSD-06**: The supported GSD distribution model is explicit and approved-version-governed even if Pilot still uses `get-shit-done-cc` internally.
- [ ] **MGSD-07**: Regression tests cover approved-version install, refresh safety, rollout behavior, ahead/behind/unknown detection, and partial rollout failure.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MGSD-01 | Phase 100 | Complete |
| MGSD-02 | Phase 100 | Complete |
| MGSD-03 | Phase 100 | Pending |
| MGSD-04 | Phase 100 | Pending |
| MGSD-05 | Phase 100 | Pending |
| MGSD-06 | Phase 100 | Complete |
| MGSD-07 | Phase 100 | Pending |

**Coverage:**
- v1 requirements: 143 total (31 Phase 68 + 11 Phase 80 + 9 Phase 82 + 16 Phase 81/83 + 6 Phase 87 + 10 Phase 88 + 10 Phase 89 + 10 Phase 90 + 14 Phase 91 + 5 Phase 94 + 6 Phase 95 + 8 Phase 98 + 7 Phase 100)
- Mapped to phases: 143
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-26 after adding Phase 100 managed GSD distribution requirements*
