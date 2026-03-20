# Phase 63: Pilot Phase 63 - Research

**Researched:** 2026-03-14
**Domain:** Step-first job detail information architecture for web + TUI
**Confidence:** MEDIUM

## Summary

Phase 63 should be planned as an information architecture refactor, not a styling pass. The current Phase 62 model is a flat merged timeline (`activity`, `tool-summary`, `fork-card`, `completion-card`) plus a separate step panel. That is exactly why detail still feels muddy: step context is detached from timeline context, and one child branch becomes two disconnected UI objects (fork row now, completion row later).

The standard implementation for this phase is: move step grouping and branch lifecycle consolidation into the core composition layer (`src/core/job-detail-query.ts` + `src/core/types.ts`), then render that shared shape in both web and TUI. For web, use TanStack Router nested layout + index route so child drill-in is primary page content (not appended below parent detail). For TUI, keep OpenTUI keyboard routing but add explicit child navigation state (session path stack) and step separators using the same conceptual model as web.

The main planning risk is accidental half-migration: if grouping/lifecycle logic stays in UI components, web and TUI will drift again and tests will miss semantic regressions. Plan this phase around shared DTO contracts, not per-surface patches.

**Primary recommendation:** Replace flat `TimelineItem[]` with `StepGroup[]` + `BranchLifecycleBlock` keyed by `childSessionId` in core, then wire both web and TUI renderers to that one model.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `@tanstack/react-query` | `^5.75.5` (repo) | Server-state caching, cursor pagination, invalidation | Already used in web detail; official `useInfiniteQuery` cursor pattern fits step-group pagination and prevents manual paging bugs. |
| `@tanstack/react-router` | `^1.120.10` (repo) | Nested routing and params for job/session drill-in | Already used; official nested `Outlet` + index route pattern solves child page vs appended content issue. |
| `@tanstack/react-start` | `^1.120.10` (repo) | Server functions boundary (`createServerFn`) | Existing web query/mutation contract; keeps DB access server-only and typed. |
| `@opentui/solid` + `solid-js` | `^0.1.79` + `^1.9.0` | TUI rendering and keyboard handling | Existing TUI architecture; `useKeyboard` is the right primitive for explicit drill-in/back stack behavior. |
| `src/core/job-detail-query.ts` + `src/core/types.ts` | in-repo | Shared detail composition contract | This is where step-aware grouping and branch lifecycle blocks must live to keep web/TUI aligned. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Coss UI `Breadcrumb`, `Card`, `Badge`, `Separator`, `ScrollArea`, `Tabs`, `Sheet` | local generated components (`web/src/components/ui`) on `@base-ui/react@^1.3.0` | Composable detail UI primitives | Use for step containers, branch blocks, breadcrumb context, and constrained scroll surfaces. |
| `better-sqlite3` | `^12.6.2` | Job steps + opencode data access | Continue using existing `db.ts` + `opencode-db.ts`; do not add new storage for this phase. |
| `vitest` | `^2.1.0` | Query/model regression tests | Use for step grouping, lifecycle merge, route behavior, and TUI detail-state tests. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Manual pagination state with `useState` arrays/cursors | `useInfiniteQuery` | Infinite query is less error-prone and has built-in `getNextPageParam`/`maxPages`; manual state caused prior drill-in reset bugs. |
| Splitting branch into `fork-card` + `completion-card` | Single lifecycle branch block keyed by session ID | Single block matches requirement and removes duplicate-object cognitive overhead. |
| Route as `parent detail + <Outlet/>` append | Layout route + index child route | Index child preserves parent view route while allowing session child page to become primary content. |
| Title-based child correlation | `parent_id` lineage via `getChildSessions()` | Title matching is ambiguous; parent_id is authoritative in opencode DB. |

**Installation:**
```bash
cd web && pnpm add @tanstack/react-query @tanstack/react-router @tanstack/react-start
npm install @opentui/core @opentui/solid solid-js
```

## Architecture Patterns

### Recommended Project Structure

```text
src/
├── core/                           # shared detail composition contract
│   ├── types.ts                    # StepGroup + BranchLifecycle DTOs
│   └── job-detail-query.ts         # step-aware timeline composition
├── tui/
│   ├── data/opencode-db.ts         # TUI fetch mapped to shared step model
│   ├── state.ts                    # detail session-path drill-in state
│   └── views/detail.tsx            # step-first renderer + child page mode
└── ...

web/src/
├── lib/server-fns.ts               # step timeline + child path server functions
├── components/
│   ├── step-timeline-stream.tsx    # per-step containers
│   └── branch-lifecycle-block.tsx  # one branch object from spawn -> completion
└── routes/
    ├── jobs.$jobId.tsx             # layout shell + Outlet only
    ├── jobs.$jobId.index.tsx       # parent job detail page
    └── jobs.$jobId.sessions.$sessionId.tsx  # nested child detail page
```

### Pattern 1: Step-First Composition in Core

**What:** Build timeline as `StepGroup[]`, not a single flat `TimelineItem[]`.
**When to use:** Always for job detail queries consumed by web and TUI.
**Example:**
```typescript
// Source: project pattern in src/core/job-detail-query.ts + Phase 63 requirements
type StepGroup = {
  stepIndex: number
  command: string
  status: string
  items: Array<ActivityItem | ToolItem | BranchLifecycleItem>
}

function composeStepGroups(jobId: string): StepGroup[] {
  const steps = getJobSteps(jobId)
  const groups = steps.map((s) => ({
    stepIndex: s.stepIndex,
    command: s.command,
    status: s.status,
    items: [],
  }))

  // 1) Assign session-derived items to step by sessionId/sessionTitle
  // 2) Keep chronological order inside each step group
  // 3) Emit explicit step separators from group boundaries in UI
  return groups
}
```

### Pattern 2: One Branch = One Lifecycle Block

**What:** Keep exactly one branch object per child session ID and update it over time.
**When to use:** Every place that currently emits separate fork/completion rows.
**Example:**
```typescript
// Source: refactor target from current fork-card/completion-card split in src/core/job-detail-query.ts
type BranchLifecycleBlock = {
  childSessionId: string
  parentSessionId: string
  startedAt: number
  updatedAt: number
  status: 'active' | 'done' | 'failed' | 'unknown'
  latestPreview: string | null
  durationMs: number | null
}

const blocks = new Map<string, BranchLifecycleBlock>()

function upsertBranchLifecycle(child: ChildSessionData) {
  const prev = blocks.get(child.id)
  blocks.set(child.id, {
    childSessionId: child.id,
    parentSessionId: child.parentId,
    startedAt: prev?.startedAt ?? child.timeCreated,
    updatedAt: child.timeUpdated,
    status: child.done ? 'done' : (child.msgCount > 0 ? 'active' : 'unknown'),
    latestPreview: child.lastPreview,
    durationMs: child.timeUpdated > child.timeCreated ? child.timeUpdated - child.timeCreated : null,
  })
}
```

### Pattern 3: Child Drill-In as Primary Route Content

**What:** Use parent layout route + index route; child session route replaces main content area.
**When to use:** Web drill-in flow for `/jobs/:jobId/sessions/:sessionId`.
**Example:**
```tsx
// Source: TanStack Router docs
// https://github.com/tanstack/router/blob/v1.114.3/docs/router/framework/react/routing/routing-concepts.md
// https://github.com/tanstack/router/blob/v1.114.3/docs/router/framework/react/guide/outlets.md

// jobs.$jobId.tsx (layout)
export const Route = createFileRoute('/jobs/$jobId')({ component: JobLayout })
function JobLayout() {
  return <Outlet />
}

// jobs.$jobId.index.tsx (parent detail)
export const Route = createFileRoute('/jobs/$jobId/')({ component: JobDetailPage })

// jobs.$jobId.sessions.$sessionId.tsx (child page)
export const Route = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  component: ChildSessionPage,
})
```

### Pattern 4: TUI Drill-In Uses Explicit Session Path Stack

**What:** Keep a `detailSessionPath: string[]` signal and render the leaf session as main content.
**When to use:** TUI child navigation and back behavior.
**Example:**
```typescript
// Source: OpenTUI useKeyboard pattern
// https://github.com/anomalyco/opentui/blob/main/packages/web/src/content/docs/bindings/solid.mdx

const [detailSessionPath, setDetailSessionPath] = createSignal<string[]>([])

useKeyboard((key) => {
  if (key.name === 'return' && selectedChildSessionId()) {
    setDetailSessionPath((p) => [...p, selectedChildSessionId()!])
  }
  if ((key.name === 'escape' || key.name === 'backspace') && detailSessionPath().length > 0) {
    setDetailSessionPath((p) => p.slice(0, -1))
  }
})
```

### Anti-Patterns to Avoid

- **UI-only regrouping:** Do not compute step grouping only in React/OpenTUI renderers; move grouping to core query composition.
- **Dual branch objects:** Do not keep `fork-card` plus separate completion row for the same child session.
- **Title/index identity:** Do not key branch/session merge logic by title or array index; use stable `sessionId`.
- **Appended child content:** Do not render child detail below parent timeline via `<Outlet/>` under parent body.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Cursor pagination + load more | Manual `pages/cursor/hasMore` arrays in local state | `useInfiniteQuery` with `getNextPageParam` and optional `maxPages` | Handles caching, page params, and refetch semantics consistently in one primitive. |
| Breadcrumb path logic | Custom pathname splitting/parsing | TanStack Router `useMatches` + Coss `Breadcrumb*` components | Route metadata-driven breadcrumbs stay correct under nested route changes. |
| Child lineage inference | Title prefix heuristics | `getChildSessions(parentSessionId)` on `parent_id` | DB-level parent linkage is authoritative and deterministic. |
| Scroll affordances | Custom overflow wrappers | Coss `ScrollArea` (`scrollFade`, `scrollbarGutter`) | Existing component solves accessibility and layout-shift issues. |
| Raw TTY key handling | Custom stdin parser per view | OpenTUI `useKeyboard` | Existing event shape and lifecycle handling already integrated in app state model. |

**Key insight:** Most complexity here is identity and state coherence over time. Use existing query/routing/UI primitives so planning focuses on model correctness, not plumbing.

## Common Pitfalls

### Pitfall 1: Step Attribution Drift

**What goes wrong:** Items appear under wrong step, especially around fast transitions.
**Why it happens:** Mapping by timestamp only and ignoring `job_steps.session_id/session_title`.
**How to avoid:** Attribute by step session identity first, then fallback to time windows.
**Warning signs:** A branch spawned during `execute-phase` appears in `plan-phase` section.

### Pitfall 2: Branch Split-Brain UI

**What goes wrong:** One child branch appears as separate spawn and completion rows.
**Why it happens:** Flat event stream rendered as independent item kinds.
**How to avoid:** One lifecycle block keyed by `childSessionId`, updated in place.
**Warning signs:** Duplicate child title/status rows in one run.

### Pitfall 3: Child Detail Still Feels Appended

**What goes wrong:** Drill-in content appears below parent timeline after scroll.
**Why it happens:** Parent route renders full page and then `<Outlet/>` afterward.
**How to avoid:** Use a layout route and move parent detail into an index child route.
**Warning signs:** URL changes to child route but parent timeline still dominates viewport.

### Pitfall 4: Stale Drill-In State Across Session Changes

**What goes wrong:** Old child activity persists when switching to another child session.
**Why it happens:** Pagination/local state not reset when session param changes.
**How to avoid:** Include `sessionId` in query keys; reset local paging state on param change; keep key-based remount where needed.
**Warning signs:** Child page shows items from previous session until manual refresh.

### Pitfall 5: Identity Collisions in TUI Merge Logic

**What goes wrong:** Incremental updates merge wrong sections when titles collide.
**Why it happens:** TUI merge maps keyed by `section.title` instead of immutable session IDs.
**How to avoid:** Carry `sessionId` through `SessionSection` and use it as merge key.
**Warning signs:** Two similarly named subagents overwrite each other in detail view.

### Pitfall 6: Refetch Resets Loaded Pages

**What goes wrong:** "Load more" pages disappear during active polling.
**Why it happens:** Full query invalidation and local `extraPages` reset on every refresh.
**How to avoid:** Use infinite-query pages and merge by page params, not ad-hoc arrays.
**Warning signs:** User loads older items, then they vanish after next poll tick.

## Code Examples

Verified patterns from official sources:

### Cursor Pagination with `useInfiniteQuery`

```typescript
// Source: https://github.com/tanstack/query/blob/v5_84_1/docs/framework/react/guides/infinite-queries.md
import { useInfiniteQuery } from '@tanstack/react-query'

const timeline = useInfiniteQuery({
  queryKey: ['job-timeline', jobId],
  queryFn: ({ pageParam }) => getJobTimelineFn({ data: { jobId, cursor: pageParam, limit: 100 } }),
  initialPageParam: '0',
  getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  // optional memory cap for long-running jobs
  maxPages: 10,
})
```

### Query Invalidation by Key Prefix

```typescript
// Source: https://github.com/tanstack/query/blob/v5_84_1/docs/framework/react/guides/query-invalidation.md
queryClient.invalidateQueries({
  queryKey: ['job-timeline', jobId],
})
```

### Nested Routing with `Outlet` + Dynamic Params

```tsx
// Source: https://github.com/tanstack/router/blob/v1.114.3/docs/router/framework/react/guide/outlets.md
// Source: https://github.com/tanstack/router/blob/v1.114.3/docs/router/framework/react/routing/routing-concepts.md
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/jobs/$jobId')({ component: Layout })
function Layout() {
  return <Outlet />
}

export const ChildRoute = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  component: ChildSessionPage,
})
```

### Server Function with Input Validation

```typescript
// Source: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
import { createServerFn } from '@tanstack/react-start'

export const getStepTimelineFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { jobId: string; cursor?: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    return getJobStepTimeline(data.jobId, data)
  })
```

### OpenTUI Keyboard Hook for Drill-In/Back

```typescript
// Source: https://github.com/anomalyco/opentui/blob/main/packages/web/src/content/docs/bindings/solid.mdx
import { useKeyboard } from '@opentui/solid'

useKeyboard((key) => {
  if (key.name === 'return') openSelectedChild()
  if (key.name === 'escape') goBackOneLevel()
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Flat merged list + separate steps panel | Step containers are primary, chronology is inside each step | Phase 63 target | Faster operator parsing of execution story and step transitions. |
| `fork-card` + separate `completion-card` for same child | One lifecycle-aware branch block that updates over time | Phase 63 target | Removes branch split-brain and duplicate-object confusion. |
| Parent detail page renders child `<Outlet/>` below main content | Layout + index route; child route is primary content with breadcrumbs | Phase 63 target | Drill-in feels like entering child context, not scrolling into hidden appendix. |
| TUI shows nested boxes without explicit drill-in mode | TUI detail uses same step/lifecycle model + explicit child navigation stack | Phase 63 target | Better web/TUI model parity and clearer deep-session navigation. |

**Deprecated/outdated:**

- `TimelineCompletionCardItem` as a standalone timeline object for child completion should be replaced by lifecycle updates on the branch block.
- TUI title-keyed section merge (`lastSeenMap` keyed by title) is fragile for similarly named sessions and should be replaced by session-ID keying.
- `jobs.$jobId.tsx` rendering parent detail plus `<Outlet/>` is outdated for nested child page UX.

## Open Questions

1. **`.planning/REQUIREMENTS.md` is missing in this repo**
   - What we know: Roadmap + external Phase 63 requirement are available.
   - What's unclear: If any baseline requirement IDs should be mapped for verification.
   - Recommendation: Planner should proceed with external requirement as source of truth and record this missing file in plan assumptions.

2. **Coss Sidebar docs URL currently returns 404**
   - What we know: `llms.txt` lists Sidebar, but `https://coss.com/ui/docs/components/sidebar.md` is not fetchable.
   - What's unclear: Canonical Sidebar API for this version.
   - Recommendation: Do not block on Sidebar; use Breadcrumb + Tabs + Sheet patterns (verified docs) unless Sidebar docs are restored.

3. **Step assignment for events with no direct step session mapping**
   - What we know: `job_steps` includes `session_id` and `session_title`, but not every event may map cleanly.
   - What's unclear: Exact fallback policy for verify/delegation edge cases.
   - Recommendation: Define deterministic fallback order in planning: session identity -> step time window -> explicit "unattributed" bucket.

4. **Depth policy for child drill-in in TUI**
   - What we know: Current TUI `resolveChildSections` caps nested traversal at 2 levels.
   - What's unclear: Whether Phase 63 should keep depth=2 or support full depth parity with web route drill-in.
   - Recommendation: Plan depth as configurable with safe default (2) and explicit behavior for deeper trees.

## Sources

### Primary (HIGH confidence)

- Context7 `/tanstack/query/v5_84_1` - infinite queries (`useInfiniteQuery`, `maxPages`), query keys, invalidation.
- Context7 `/tanstack/router/v1_114_3` - nested routes, `Outlet`, dynamic params, index/layout/pathless route patterns, `useMatches`/router state for breadcrumbs.
- Context7 `/websites/tanstack_start_framework_react` - `createServerFn`, `inputValidator`, server-function request methods.
- Context7 `/anomalyco/opentui` - `useKeyboard` hook patterns for TUI navigation/input handling.
- Official Coss UI docs:
  - `https://coss.com/ui/llms.txt`
  - `https://coss.com/ui/docs/components/breadcrumb.md`
  - `https://coss.com/ui/docs/components/card.md`
  - `https://coss.com/ui/docs/components/badge.md`
  - `https://coss.com/ui/docs/components/separator.md`
  - `https://coss.com/ui/docs/components/scroll-area.md`
  - `https://coss.com/ui/docs/components/tabs.md`
  - `https://coss.com/ui/docs/components/sheet.md`
- In-repo implementation baseline:
  - `src/core/job-detail-query.ts`
  - `src/core/types.ts`
  - `src/core/opencode-db.ts`
  - `web/src/components/timeline-stream.tsx`
  - `web/src/components/timeline-fork-card.tsx`
  - `web/src/routes/jobs.$jobId.tsx`
  - `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx`
  - `src/tui/views/detail.tsx`
  - `src/tui/data/opencode-db.ts`

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` and `.planning/ROADMAP.md` historical decisions and phase boundaries.
- `.planning/phases/62-.../62-0x-SUMMARY.md` for Phase 62 implementation intent and delivered shape.

### Tertiary (LOW confidence)

- `https://coss.com/ui/docs/components/sidebar.md` (listed in llms index but currently 404; cannot verify API).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - direct package versions + official docs + currently running code paths.
- Architecture: MEDIUM - core patterns are clear, but exact step-fallback attribution and TUI depth policy need planning decisions.
- Pitfalls: MEDIUM - grounded in real code and recent quick fixes, but some future regressions are predictive.

**Research date:** 2026-03-14
**Valid until:** 2026-03-28 (fast-moving web stack and active phase evolution)
