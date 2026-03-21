# Phase 80: Web UI Attribution + Mobile Overflow Hardening - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/web-ui-attribution-and-mobile-overflow.md)

<domain>
## Phase Boundary

This phase delivers three interrelated improvements to the Pilot web UI:
1. Fix timeline attribution so items that belong to real steps (especially late judge/final-step activity) are grouped correctly instead of landing in `Unattributed`
2. Audit and fix mobile horizontal overflow across main data viewers AND child/sub-session views
3. Bring child/sub-session drill-in views up to the same quality/polish level as the main job detail interface

</domain>

<decisions>
## Implementation Decisions

### Attribution Fix
- Reproduce and identify why `Unattributed` timeline items still appear for real jobs after the activity/timeline fixes
- Determine root cause: timeline attribution logic in core/data layer, session-title/session-id matching gaps, timing window attribution failures, or web rendering/grouping issue
- Fix attribution so items that clearly belong to a real step (especially late judge/final-step activity) are grouped under the correct step instead of `Unattributed`
- Preserve the unattributed fallback bucket only for genuinely unassignable content
- Add verification using at least one real job where unattributed content previously appeared

### Mobile Overflow
- Audit the main mobile job-detail/data-viewer surfaces for horizontal overflow
- Audit child/sub-session drill-in views for layout regressions, weaker UX, and horizontal overflow
- Ensure the UI never exceeds viewport width on mobile across the main data viewers and child/sub-session views
- For long lines / code-like / tool-input / preview content, contain overflow safely using wrapping, truncation, or inner scrolling as appropriate
- Verify on mobile-sized viewport(s) that the outer page/container does not horizontally overflow

### Child/Sub-Session Polish
- Bring child/sub-session interfaces closer to the quality/polish level of the main job detail experience without rewriting them unnecessarily

### Documentation
- Write a clear SUMMARY.md documenting: root cause of unattributed content, whether it was data-layer or web-layer, what mobile overflow cases were fixed

### Do NOT
- Do not remove the unattributed bucket entirely just to hide the symptom
- Do not hardcode special cases for one single job id
- Do not regress the newly restored dashboard activity preview or job detail timeline rendering
- Do not solve mobile overflow by clipping important content without a readable fallback

### Claude's Discretion
- Specific CSS/Tailwind approach for overflow containment (wrapping vs truncation vs inner scroll per surface)
- Whether attribution fix is in `resolveStepIndex()` or elsewhere based on diagnosis
- Exact mobile breakpoint and test viewport width(s) for verification
- How to improve child/sub-session UI quality (layout, density, spacing) within the constraint of not rewriting unnecessarily

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Attribution Logic
- `src/core/job-detail-query.ts` — Contains `resolveStepIndex()`, `getJobTimeline()`, and all step-grouped timeline logic
- `src/core/opencode-db.ts` — Session/part query functions used by timeline

### Web UI Components (Main Data Viewers)
- `web/src/components/timeline-stream.tsx` — Step-grouped timeline rendering
- `web/src/components/step-content-pane.tsx` — Split-pane content with continuous scroll
- `web/src/components/split-pane-detail.tsx` — Main job detail layout (desktop + mobile)
- `web/src/components/job-list.tsx` — Dashboard job list

### Web UI Components (Child/Sub-Session)
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Session drill-in route
- `web/src/components/session-activity.tsx` — Session activity display
- `web/src/components/subagent-card.tsx` — Inline sub-agent cards
- `web/src/components/branch-lifecycle-block.tsx` — Branch lifecycle block

### Shared UI Primitives
- `web/src/components/session-overview.tsx` — Session overview component
- `web/src/components/tool-summary-chips.tsx` — Tool summary chips
- `web/src/components/syntax-highlight.tsx` — Syntax highlighting with long content

</canonical_refs>

<specifics>
## Specific Ideas

- Investigation should focus on `resolveStepIndex()` in `src/core/job-detail-query.ts` — specifically how late judge/session activity is attributed to steps via the 3-tier attribution (sessionId match → sessionTitle match → time window)
- The session drill-in view at `jobs.$jobId.sessions.$sessionId.tsx` is notably less polished than the main job detail
- Mobile overflow requirement is strict: no page-level horizontal spill on common phone widths
- The `SyntaxHighlight` component and tool input display in `ToolSummaryRow` are likely overflow sources
- Existing mobile handling in `split-pane-detail.tsx` uses `useIsMobile()` with tabs — check this covers child views too

</specifics>

<deferred>
## Deferred Ideas

### Nice to Have (lower priority)
- Add a focused regression test for step attribution if there is already a practical test seam around grouped timeline generation
- Add a lightweight mobile overflow safeguard/regression assertion if practical
- Improve any labels/empty states around unattributed content so they are clearer when a true fallback is being shown

</deferred>

---

*Phase: 80-web-ui-attribution-mobile-overflow-hardening*
*Context gathered: 2026-03-21 via PRD Express Path*
