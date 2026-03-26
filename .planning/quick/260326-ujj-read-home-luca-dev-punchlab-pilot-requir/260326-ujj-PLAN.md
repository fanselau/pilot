---
phase: quick
plan: 260326-ujj
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/types.ts
  - src/core/opencode-db.ts
  - src/core/job-detail-query.ts
  - test/core/opencode-db.test.ts
  - test/core/job-detail-query.test.ts
autonomous: true
requirements:
  - EXACT-ANCHOR-01
  - EXACT-ANCHOR-02
  - EXACT-ANCHOR-03
  - EXACT-ANCHOR-04
must_haves:
  truths:
    - "Task-spawned subsession sections render immediately after the exact parent task tool call in the same step stream"
    - "Multiple task-spawned child sessions inside one parent step keep the order of the parent task calls, not child first-activity timestamps"
    - "Nested child sessions still render recursively with the same depth metadata and visibility semantics"
    - "Child sessions discovered only via session.parent_id remain visible through a secondary fallback path"
    - "Web and TUI consumers keep using the same grouped timeline contract without UI-only reordering hacks"
  artifacts:
    - path: "src/core/types.ts"
      provides: "Timeline/session part contract for exact spawned child session IDs"
    - path: "src/core/opencode-db.ts"
      provides: "Robust task tool parsing that extracts spawned child session IDs from DB-grounded task output"
    - path: "src/core/job-detail-query.ts"
      provides: "Exact task-part anchored recursive section stitching with explicit fallback for unanchored children"
    - path: "test/core/opencode-db.test.ts"
      provides: "Regression coverage for task_id extraction across structured and multiline tool output"
    - path: "test/core/job-detail-query.test.ts"
      provides: "Regression coverage for anchored order, multiple children, nested children, and fallback visibility"
  key_links:
    - from: "src/core/opencode-db.ts"
      to: "src/core/job-detail-query.ts"
      via: "SessionPart/Timeline tool-summary spawned child session ID fields"
      pattern: "spawnedSessionId"
    - from: "src/core/job-detail-query.ts"
      to: "web/src/components/step-content-pane.tsx"
      via: "Ordered group.sections array rendered directly in section order"
      pattern: "sections.map"
---

<objective>
Replace heuristic child-session placement in the Pilot job-detail timeline with exact task-part anchoring from the OpenCode DB.

Purpose: Subsession content is currently stitched into a step by child first-activity timing, which makes child timelines appear at the end of a step or otherwise detached from the exact `task` call that spawned them. This plan makes exact `task_id` mapping the primary source of truth and keeps the existing fallback path only for older or malformed data.

Output: Extended parsing/types for spawned child session IDs plus a recursive timeline builder that inserts child sections immediately after the matching parent task item.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/pilot-web-exact-task-anchored-subsession-positioning.md
@.planning/PROJECT.md
@src/core/types.ts
@src/core/opencode-db.ts
@src/core/job-detail-query.ts
@web/src/components/step-content-pane.tsx
@test/core/opencode-db.test.ts
@test/core/job-detail-query.test.ts

<interfaces>
From `src/core/types.ts`:
```typescript
export interface SessionPart {
  id: string;
  messageId: string;
  role: string;
  type: string;
  createdAt: number;
  tool?: string;
  toolInput?: string;
  toolInputRaw?: string;
  toolOutput?: string;
  toolStatus?: string;
  text?: string;
  patchFiles?: string[];
}

export interface TimelineToolSummaryItem {
  kind: 'tool-summary';
  sessionId: string;
  partId: string;
  createdAt: number;
  tool: string;
  toolInput?: string;
  toolInputRaw?: string;
  toolOutput?: string;
  toolStatus?: string;
  patchFiles?: string[];
}

export interface TimelineSection {
  sessionId: string;
  parentSessionId: string | null;
  title: string;
  status: 'active' | 'done' | 'unknown';
  models: string[];
  durationMs: number | null;
  depth: number;
  items: StepTimelineItem[];
}
```

From `src/core/opencode-db.ts`:
```typescript
function getSessionParts(sessionId: string, since?: number): SessionPart[]
```

From `web/src/components/step-content-pane.tsx`:
```tsx
return sections.map((section, sectionIdx) => (
  <Fragment key={`${section.sessionId}-${sectionIdx}`}>
    {section.depth > 0 && <SubsessionHeader section={section} ... />}
    {!collapsed.has(section.sessionId) && (
      <div>
        {section.items.map((item) => <TimelineItemRenderer item={item} ... />)}
      </div>
    )}
  </Fragment>
))
```

The web UI already trusts `group.sections` order. Fix the ordering in the shared core model instead of adding React-only reordering.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend task tool parsing/types with exact spawned child session IDs</name>
  <files>src/core/types.ts, src/core/opencode-db.ts, test/core/opencode-db.test.ts</files>
  <behavior>
    - A `task` tool part exposes the spawned child session ID when tool output contains `task_id: child-123`
    - Extraction still works when `task_id:` appears inside multiline or JSON-stringified output with surrounding prose
    - Existing task tool input summaries remain unchanged
    - Non-task tools and task parts without a parseable `task_id:` do not invent IDs or regress existing output fields
  </behavior>
  <action>
    Add exact anchoring data to the parsing layer for `EXACT-ANCHOR-01` and `EXACT-ANCHOR-04`.

    1. In `src/core/types.ts`, add `spawnedSessionId?: string` to `SessionPart` and to `TimelineToolSummaryItem` so the parsed model and emitted timeline item can both retain the exact child-session anchor.
    2. In `src/core/opencode-db.ts`, add a focused helper that inspects `task` tool output for the exact `task_id:` marker. The helper must accept string or structured output, stringify structured payloads safely, tolerate multiline formatting, and extract only the ID after `task_id:`. Do not derive IDs from timestamps, titles, or `parent_id`.
    3. Populate `spawnedSessionId` only for `type === 'tool' && tool === 'task'`. Keep `toolInput`, `toolInputRaw`, and `toolOutput` behavior intact so existing UI chips and summaries still work.
    4. Add parser tests in `test/core/opencode-db.test.ts` for: exact single-line output, multiline output with surrounding prose, missing/unparseable `task_id`, and a non-task tool control case.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core/opencode-db.test.ts --reporter=verbose</automated>
  </verify>
  <done>
    `getSessionParts()` returns task parts with `spawnedSessionId` when the DB output contains `task_id: ...`, existing summaries are unchanged, and focused parser regressions pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace heuristic interleaving with exact task-anchored recursive section stitching</name>
  <files>src/core/job-detail-query.ts, src/core/types.ts, test/core/job-detail-query.test.ts</files>
  <behavior>
    - Render order becomes parent content -> task item -> matching child section -> remaining parent content
    - Multiple task calls in one parent step place each child section after its own task call, preserving parent task order
    - Nested child sessions anchor recursively inside the child session stream when child task parts spawn grandchildren
    - Child sessions found via `session.parent_id` but lacking `task_id` mapping remain visible through a secondary fallback path
  </behavior>
  <action>
    Implement `EXACT-ANCHOR-02` and `EXACT-ANCHOR-03` in the shared timeline builder.

    1. In `src/core/job-detail-query.ts`, remove child first-seen timestamps as the primary placement rule. Instead, build an explicit parent-task-part -> child-session map from parsed task parts that carry `spawnedSessionId`, keyed by the parent session and `partId`.
    2. Replace the current single root-session interleave block with a recursive section-expansion helper that walks a session's own items in order. When it hits a `tool-summary` item for a `task` part with anchored child session(s), flush the current parent batch into a section, emit the anchored child session's section(s) immediately after that item, then continue the parent stream. Keep depth/title/status/models/duration wiring identical to today's `TimelineSection` contract.
    3. Preserve correct ordering when multiple task-spawned child sessions occur in one step by using parent task-item order as the primary ordering signal. If multiple children ever map to the same task part, emit them deterministically by child session creation time.
    4. Keep a clearly secondary fallback: any child session reached through `getChildSessions()` / `session.parent_id` that was not matched to a task part must still render after that parent's anchored stream, ordered deterministically, without dropping visibility. This fallback must not override an exact anchor when one exists.
    5. Update timeline-item creation so task `tool-summary` items carry `spawnedSessionId` through the emitted model for traceability/debugging.
    6. Add focused regressions in `test/core/job-detail-query.test.ts` covering: one task + one child, multiple task calls + multiple children in one step, the prior append-at-step-end failure shape, nested child sessions, and missing/unparseable `task_id` fallback visibility.
    7. Keep web/TUI consumers unchanged; the improvement should come from corrected `group.sections` ordering, not UI-specific resorting.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/core/opencode-db.test.ts test/core/job-detail-query.test.ts --reporter=verbose && npm run build && cd web && npx tsc --noEmit</automated>
  </verify>
  <done>
    Exact task-part anchoring is the primary placement mechanism, nested child ordering remains intact, fallback children still render, and both shared-core and web type/build checks pass.
  </done>
</task>

</tasks>

<verification>
- `npx vitest run test/core/opencode-db.test.ts test/core/job-detail-query.test.ts` passes
- `npm run build` passes in the repo root
- `cd web && npx tsc --noEmit` passes against the shared core type changes
- Timeline order for anchored children matches parent task placement rather than child first-activity timestamps
- Fallback children without recoverable `task_id` remain visible
</verification>

<success_criteria>
- Normal task-spawned subsessions render directly after the exact parent `task` tool call that created them
- No step-end append behavior remains when exact `task_id` mapping is available
- Multiple and nested child-session cases preserve deterministic order and depth metadata
- Older/malformed data still shows child sessions through fallback instead of dropping them
- No React-only reordering logic is needed; shared core timeline data is unambiguous
</success_criteria>

<output>
After completion, create `.planning/quick/260326-ujj-read-home-luca-dev-punchlab-pilot-requir/260326-ujj-SUMMARY.md`
</output>
