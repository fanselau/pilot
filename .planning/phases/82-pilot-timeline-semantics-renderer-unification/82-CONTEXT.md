# Phase 82: Pilot Timeline Semantics + Renderer Unification - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-timeline-semantics-and-renderer-unification.md)

<domain>
## Phase Boundary

This phase delivers semantic truthfulness, visual coherence, and renderer consistency across the Pilot web UI's timeline, session, and job detail views. Primary case study: job `efwg`.

Four workstreams:
1. **Attribution fix** — reduce Unattributed content by improving `resolveStepIndex()` attribution tiers
2. **Timeline semantics** — replace generic `Step N` / `Steps` labels with semantic labels reflecting actual execution meaning (delegation, execution, judge, gap-closure, etc.)
3. **Top-level status narrative** — remove contradictory status combinations and surface coherent job outcome stories
4. **Renderer unification** — bring child/sub-session drill-in views to the same quality bar as the main job detail renderer, including metadata layout improvements (header-row metadata pattern)

</domain>

<decisions>
## Implementation Decisions

### Attribution
- Investigate and fix remaining `Unattributed` activity/session content where correct step attribution is actually possible
- Preserve `Unattributed` only as a true fallback for genuinely unassignable content

### Timeline Semantics
- Replace generic `Step N` labels with semantic labels derived from `StepSource` + `command` (e.g., "Delegation", "Execution: plan-phase", "Judge", "Gap Closure: execute-phase", etc.)
- Reconsider whether the `Steps` tab naming itself should become more semantic (e.g., "Timeline" or "Execution")
- Make it clear at the UI level whether a timeline segment belongs to: delegation, add-phase/planning, execution, judge, gap-closure planning, gap-closure execution, final judge / review-needed outcome
- Show initial run vs continuation/gap-closure run visually distinct instead of flattened
- Make it visually obvious when a step exists because of a gap/continuation path
- Surface judge output as a first-class visual object: verdict, confidence, short reason/summary, whether initial or gap-closure judge

### Top-Level Status
- Improve the top-level job/session narrative so users can quickly understand real outcomes without digging through transcript fragments
- Remove contradictory top-level state combinations (e.g., showing `failed` while surrounding execution story reads as completed work plus human-review-needed, or showing stale `Building step N` framing when work already finished)

### Renderer Unification
- Child/sub-session drill-ins must use the same core renderer concepts/semantic presentation model as the main session
- Verify whether child/sub-session views currently use a different renderer path, and unify onto shared renderer primitives where practical
- Avoid having a "nice main renderer" and a separate raw/transcript-like child renderer
- Unify spacing, semantic compression, and visual quality across main + child session views

### Metadata Layout
- Update the main renderer layout so timestamp/meta/badges sit in a header row above message/content instead of competing for the same horizontal line
- Increase effective content width by treating metadata as a lightweight block above content rather than inline with it

### Mobile Safety
- Preserve the recent mobile overflow improvements while making these renderer changes
- Verify on mobile that renderer unification does not reintroduce horizontal spill or unreadable wrapping

### Claude's Discretion
- Specific color/icon choices for semantic step type differentiation (use existing badge/status conventions)
- Implementation details for judge verdict first-class display (inline card vs expanded section)
- Exact wording of semantic labels (e.g., "Gap Closure" vs "Continuation" vs "Fix Round")
- How to handle edge cases where step source metadata is missing/incomplete
- Whether to add a compact lifecycle summary at top of page (nice-to-have, not required)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/pilot-timeline-semantics-and-renderer-unification.md` — Full requirements document with Must Have and Nice to Have

### Core Data Layer
- `src/core/job-detail-query.ts` — Timeline query backbone: resolveStepIndex(), getJobTimeline(), StepTimelineGroup construction, attribution logic
- `src/core/types.ts` — StepTimelineGroup, StepTimelineItem, BranchLifecycleItem, JobStepSummary, StepSource type, JobStep interface
- `src/core/opencode-db.ts` — Session queries feeding timeline data

### Web UI Components (Main Renderer)
- `web/src/components/step-content-pane.tsx` — Content pane with step headers showing "Step N" labels, metadata layout
- `web/src/components/step-timeline-sidebar.tsx` — Sidebar with step labels and navigation
- `web/src/components/timeline-stream.tsx` — StepGroupSection with "Step N" / "Unattributed" labels
- `web/src/components/split-pane-detail.tsx` — Split-pane layout with "Steps" tab naming
- `web/src/components/branch-lifecycle-block.tsx` — Fork/child session cards
- `web/src/components/verdict-card.tsx` — Existing verdict display component

### Web UI Components (Child/Sub-session Renderer)
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Child session drill-in route (uses SessionActivity, not main renderer)
- `web/src/components/session-activity.tsx` — Raw part-by-part renderer (lower quality bar)
- `web/src/components/subagent-card.tsx` — Sub-agent summary cards

### Server Functions
- `web/src/lib/server-fns.ts` — Server functions bridging core queries to web UI

</canonical_refs>

<specifics>
## Specific Ideas

- Use job `efwg` as the primary case study and validation target
- The `source` field on `StepTimelineGroup` already carries `'delegation' | 'judge:gaps' | 'judge:hung' | 'judge:failed' | 'operator'` — use this for semantic labeling
- The `command` field carries values like `execute-phase`, `plan-phase`, `quick` — combine with source for rich labels
- The child session drill-in at `jobs.$jobId.sessions.$sessionId.tsx` currently uses `SessionActivity` (raw PartCard renderer) while the main view uses `StepContentPane` + `TimelineItemRenderer` — this is the renderer quality gap to close
- The "Steps" tab in `split-pane-detail.tsx` should become more semantic (e.g., "Timeline")
- Metadata (timestamp, badges) currently sits inline with content in `session-activity.tsx` PartCard — move to header row pattern

</specifics>

<deferred>
## Deferred Ideas

- Compact top-of-page lifecycle summary for multi-stage jobs (nice-to-have)
- Icons/color semantics for planning/execution/judge/review states (nice-to-have)
- Progressive disclosure of raw transcript detail (nice-to-have)
- Deeper human-review state-machine changes (separate phase: Phase 81)

</deferred>

---

*Phase: 82-pilot-timeline-semantics-renderer-unification*
*Context gathered: 2026-03-21 via PRD Express Path*
