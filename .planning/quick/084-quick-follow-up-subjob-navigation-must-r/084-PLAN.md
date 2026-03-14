---
phase: 084
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/session-activity.tsx
  - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
  - test/core/job-detail-query.test.ts
autonomous: true

must_haves:
  truths:
    - "Clicking a fork card in the timeline navigates to the correct child session detail"
    - "Clicking different fork cards sequentially shows the correct session data each time (no stale state)"
    - "SessionActivity resets pagination when sessionId changes"
    - "Multiple child sessions under the same parent each resolve to their unique session detail"
  artifacts:
    - path: "web/src/components/session-activity.tsx"
      provides: "Session activity with proper sessionId-change handling"
      contains: "useEffect.*sessionId|key.*sessionId"
    - path: "web/src/routes/jobs.$jobId.sessions.$sessionId.tsx"
      provides: "Session drill-in route with key-based remount"
    - path: "test/core/job-detail-query.test.ts"
      provides: "Tests verifying child session ID uniqueness in fork cards"
      contains: "multiple children.*fork-card|fork-card.*unique"
  key_links:
    - from: "web/src/components/timeline-fork-card.tsx"
      to: "/jobs/$jobId/sessions/$sessionId"
      via: "Link params using item.sessionId"
      pattern: "sessionId.*item\\.sessionId"
    - from: "web/src/routes/jobs.$jobId.sessions.$sessionId.tsx"
      to: "web/src/components/session-activity.tsx"
      via: "sessionId prop keyed for remount"
    - from: "src/core/job-detail-query.ts getJobTimeline"
      to: "src/core/opencode-db.ts getChildSessions"
      via: "child.id → fork-card.sessionId"
      pattern: "sessionId.*child\\.id"
---

<objective>
Fix child session drill-in navigation so clicking a fork card in the timeline reliably opens the correct child session detail, even when navigating between multiple children.

Purpose: The timeline fork cards link to session detail routes using `item.sessionId`, which is the real opencode session ID from `getChildSessions(parentId)`. The backend mapping is correct, but the frontend `SessionActivity` component manages pagination state via `useState` that does NOT reset when `sessionId` changes (React reuses the component instance since the route structure is the same). This causes stale session data to display when navigating between child sessions.

Output: Fixed session activity component with proper sessionId-change handling, keyed remount on the drill-in route, and test coverage for multiple-child fork card uniqueness.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/components/session-activity.tsx
@web/src/components/timeline-fork-card.tsx
@web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
@src/core/job-detail-query.ts
@test/core/job-detail-query.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix SessionActivity stale state on sessionId change and key session drill-in route</name>
  <files>
    web/src/components/session-activity.tsx
    web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
  </files>
  <action>
**Root cause:** `SessionActivity` uses `useState` for `pages`, `cursor`, `hasMore`, and `loadingMore`. When the parent route's `$sessionId` param changes, React reuses the component instance without remounting — so these state values persist from the previous session. The `useQuery` only calls its `queryFn` on cache miss, meaning `setPages([result.parts])` doesn't fire for cached sessions, leaving stale data visible.

**Fix 1 — `session-activity.tsx`:** Add a `useEffect` that resets ALL pagination state when `sessionId` changes:

```typescript
// Reset pagination state when sessionId changes
useEffect(() => {
  setPages([])
  setCursor(undefined)
  setHasMore(true)
  setLoadingMore(false)
}, [sessionId])
```

Place this right after the `useState` declarations (before the `useQuery`). This ensures pagination state is always fresh for the current session, regardless of React Query cache state.

**Fix 2 — `jobs.$jobId.sessions.$sessionId.tsx`:** Add a `key={sessionId}` prop to `SessionActivity` so React fully remounts the component when `sessionId` changes. This is a belt-and-suspenders approach that complements the useEffect:

```tsx
<SessionActivity key={sessionId} sessionId={sessionId} initialLimit={30} />
```

Also add `key={sessionId}` to the children query so it refetches properly:

Verify that the `useQuery` for children already has `sessionId` in the query key (it does: `['session-children', sessionId]`), so it will refetch. No change needed there.

**Do NOT:**
- Change the backend `getJobTimeline` or `getChildSessions` — the fork card sessionId mapping (`child.id`) is already correct
- Modify the `TimelineForkCard` component — it correctly passes `item.sessionId` to the Link
- Add index-based assumptions or title-based heuristics
  </action>
  <verify>
    Run `npx tsc --noEmit` in the web directory to verify no type errors. Manually verify the useEffect import exists and the key prop is present.
  </verify>
  <done>
    `SessionActivity` resets pagination state on `sessionId` change. `SessionDrillIn` keys `SessionActivity` by `sessionId` to force remount. No type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add test coverage for multiple-child fork card uniqueness</name>
  <files>
    test/core/job-detail-query.test.ts
  </files>
  <action>
Add a new test in the `getJobTimeline` describe block that verifies multiple child sessions each produce a fork card with a **unique, correct sessionId**.

**Test: "produces unique fork-card sessionIds for multiple children"**

Setup:
- Mock `getJob` returning a job with `sessionTitles: JSON.stringify(['root'])`
- Mock `findSessionByTitle('root')` → `'sess-root'`
- Mock `getSessionParts('sess-root')` → empty array (no root activity needed)
- Mock `getChildSessions('sess-root')` → three children:
  - `{ id: 'child-aaa', title: 'Worker A', timeCreated: 1000, timeUpdated: 2000 }`
  - `{ id: 'child-bbb', title: 'Worker B', timeCreated: 1100, timeUpdated: 2100 }`
  - `{ id: 'child-ccc', title: 'Worker C', timeCreated: 1200, timeUpdated: 2200 }`
- Mock `getChildSessions` for each child → empty array (no grandchildren)
- Mock standard token/model/message/done responses for each child

Assertions:
1. The timeline has exactly 3 fork-card items (plus any completion cards for done children)
2. Extract all fork-card items and verify their `sessionId` values are `['child-aaa', 'child-bbb', 'child-ccc']`
3. Verify all fork-card sessionIds are unique (no duplicates): `new Set(ids).size === ids.length`
4. Verify each fork card's `parentSessionId` is `'sess-root'`
5. Verify fork cards are sorted chronologically by `createdAt`

**Test: "getSessionChildSummaries returns correct sessionIds for drill-in"**

Setup:
- Mock `getChildSessions(parentId)` → two children with distinct IDs
- Mock standard token/model/message/done responses

Assertions:
1. Each returned `SessionSummary` has a unique `sessionId` matching the child's real ID
2. Each has `parentSessionId` matching the parent
3. `sessionId` values are NOT derived from title or index — verify by having children with same title prefix but different IDs

Follow existing test patterns in the file (use `makeJob`, `makePart` helpers, same mock setup/teardown).
  </action>
  <verify>
    Run `npx vitest run test/core/job-detail-query.test.ts` — all tests pass, including the new ones.
  </verify>
  <done>
    Two new tests verify that multiple child sessions produce unique, correct sessionIds in fork cards and child summaries. Tests catch any regression where child session IDs become ambiguous or index-based.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in web/ directory (no type errors from the fix)
2. `npx vitest run test/core/job-detail-query.test.ts` passes (all existing + new tests)
3. Code review: `SessionActivity` has a `useEffect` that resets state on `sessionId` change
4. Code review: `SessionDrillIn` passes `key={sessionId}` to `SessionActivity`
5. Code review: No brittle index-based assumptions introduced
</verification>

<success_criteria>
- SessionActivity properly resets its pagination state when sessionId changes
- Navigating between fork cards in the timeline shows the correct child session each time
- Multiple child sessions produce unique, verifiable sessionIds in fork cards
- Tests cover the multi-child mapping scenario and catch regressions
- No type errors, all tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/084-quick-follow-up-subjob-navigation-must-r/084-SUMMARY.md`
</output>
