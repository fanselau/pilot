# Phase 92: Pilot Web UI — Native Subsession Flow Actual Implementation Follow-Up - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-web-ui-native-subsession-flow-actual-implementation-followup.md)

<domain>
## Phase Boundary

This phase delivers the **actual runtime UI rewrite** for native subsession flow in the Pilot Web UI. Phase 90 (job `dthu`) was a false-positive pass — it only performed audit/cleanup/traceability work, not the intended visual/behavioral UI rewrite.

This phase must materially change how subsessions render in the job detail view:
- Subsession content integrated into the same main scroll stream (not a nested widget)
- Same effective indentation level as normal content (no extra nested gutter)
- Nested sticky headers that stack by depth in one shared scroll container
- Foldable subsessions open by default
- Follow mode working inside open subsessions

</domain>

<decisions>
## Implementation Decisions

### Core Layout Rewrite
- Subsession/subagent content MUST render as part of the same main content stream instead of feeling like a separate nested widget/lane
- Text/content from subsessions MUST sit at the same effective indentation level as default content rather than inside an extra nested content gutter
- The implementation MUST change the actual runtime components (step/subsession/timeline/detail flow), not merely add audit comments or traceability entries

### Subsession Behavior
- Subsessions MUST remain foldable (Radix Collapsible or similar)
- Subsessions MUST be open by default
- Scrolling into a subagent/subsession MUST pin its sticky header directly below the parent step header
- Multiple nested subagents/subsessions MUST stack sticky headers by depth in one shared scroll container

### Follow Mode
- Follow mode MUST continue working when the newest visible content is inside an open subagent/subsession

### Semantic Hierarchy
- The implementation MUST preserve the semantic hierarchy model and not regress labels/header meaning while fixing layout/scroll behavior

### Validation
- Validate against real nested job data and confirm the UI actually behaves differently after the change
- This phase CANNOT be considered complete if the visible UI still looks essentially unchanged from the pre-follow-up state

### Nice to Have
- Preserve subtle pastel hierarchy cues while making the content flow feel flatter and more native
- Reduce remaining visual seams between top-level content and nested subsession content

### Agent's Discretion
- Specific CSS approach for flattening the indentation (reducing border-l nesting, removing extra wrappers, etc.)
- Whether to reduce or restructure the DEPTH_PASTELS system or keep it but make it subtler
- Exact pixel/rem values for flattened indentation
- Whether BranchLifecycleBlock needs a rewrite vs. surgical edits
- Whether SessionActivity component needs changes or just its parent wrapper

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Components (current implementation)
- `web/src/components/step-content-pane.tsx` — Main content pane rendering all step groups in continuous scroll
- `web/src/components/branch-lifecycle-block.tsx` — Subsession/subagent collapsible block (key rewrite target)
- `web/src/components/session-activity.tsx` — Session part renderer used inside BranchLifecycleBlock
- `web/src/components/timeline-stream.tsx` — Step-grouped timeline with TimelineItemRenderer dispatching fork-cards to BranchLifecycleBlock
- `web/src/components/split-pane-detail.tsx` — Split-pane layout orchestrating sidebar + content pane
- `web/src/components/follow-mode-bar.tsx` — Follow mode floating bar
- `web/src/components/branch-lifecycle-block.helpers.ts` — Branch identity derivation

### Shared Utilities
- `web/src/lib/step-semantics.ts` — Semantic session type model, icons, colors, labels
- `web/src/lib/format.ts` — Duration formatting

### Phase 90 Context (false-positive — treat as reference only)
- `.planning/phases/90-pilot-web-ui-native-subsession-flow-single-scroll-integration-and-follow-mode/` — Phase 90 was audit/cleanup only

### Requirements
- `requirements/pilot-web-ui-native-subsession-flow-actual-implementation-followup.md` — The authoritative requirements for this phase

</canonical_refs>

<specifics>
## Specific Ideas

### Current Problem Analysis
The current BranchLifecycleBlock wraps each subsession in:
1. A `border-l ${config.borderClass} ${depthBg}` container
2. Inside that, a CollapsibleContent with another `border-l ${config.borderClass} ${depthBg}` wrapper
3. Inside that, SessionActivity adds its own `border-l-2 border-border/40 pl-2 ml-2 sm:pl-3 sm:ml-4` indentation

This triple-nesting creates excessive indentation that makes subsession content feel like a separate lane rather than integrated content.

### Target State
- Subsession content should flow at roughly the same indentation as step-level content
- The sticky header should be the only visual separator, not nested boxes
- Pastel depth cues should be subtle (background tint only), not structural (no additional border-l wrapping)
- The content inside an expanded subsession should look like it belongs to the same scroll stream

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 92-pilot-web-ui-native-subsession-flow-actual-implementation-follow-up*
*Context gathered: 2026-03-23 via PRD Express Path*
