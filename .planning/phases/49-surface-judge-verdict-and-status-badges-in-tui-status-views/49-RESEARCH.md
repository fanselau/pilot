# Phase 49: Surface Judge Verdict and Status Badges in TUI / Status Views - Research

**Researched:** 2026-03-08
**Domain:** Pilot terminal observability (judge verdict + retry/undo status badges)
**Confidence:** HIGH

## Summary

This phase is primarily a presentation/consistency phase, not a new backend capability phase. The required data already exists on `Job` rows (`judgeVerdict`, status, checkpoint metadata), and retry/undo semantics are already centralized in `src/core/job-introspection.ts`. The main gap is that CLI/TUI surfaces currently render only partial signals and duplicate verdict parsing logic.

The codebase currently parses judge verdicts in multiple places (`status.ts`, `queue.ts`, `completed-panel.tsx`, `info.ts`) with inconsistent behavior. Most notably, TUI completed rows only show icon-level signal (`✓`, `⚠`, `✗`) and do not show explicit judge badges; detail view lacks a dedicated verdict line; status rows do not show a compact judge badge for completed phase jobs.

The standard approach for this phase is to extract a shared verdict normalizer/formatter in `src/core/` and consume it from status + TUI surfaces, while reusing existing `buildRetryWhy`/`buildUndoWhy` outputs for operational badges. This avoids re-implementing business rules and keeps pass/fail/doubt/inconclusive meaning identical across views.

**Primary recommendation:** Add a single shared `judge signal` formatter module in `src/core/`, then wire it into `src/commands/status.ts`, `src/tui/components/completed-panel.tsx`, `src/tui/views/detail.tsx`, and `src/commands/info.ts` so all views render the same verdict + badge semantics.

## Existing Touchpoints

Current files that already contain the behavior to extend/refactor:

- `src/commands/status.ts`: `recent` row rendering, local `isInconclusive()` helper, retry/undo badges already present.
- `src/tui/components/completed-panel.tsx`: local `isInconclusive()`, `statusIcon()`, completed/failed/cancelled list rendering.
- `src/tui/views/detail.tsx`: header composition (`buildHeaderLines`, `buildReasonHeaderLines`) and real header rendering.
- `src/commands/info.ts`: existing `Verdict:` line (currently ad hoc parsing; uses `summary` key, while runner stores `reason`).
- `src/core/job-introspection.ts`: authoritative retry + undo badge logic (`buildRetryWhy`, `buildUndoWhy`, `buildJobWhy`).
- `src/core/runner.ts`: authoritative stored verdict shape (`verdict`, `confidence`, `reason`), including confidence `0` benefit-of-doubt path.
- `src/commands/queue.ts`: third duplicate `isInconclusive()` implementation (not required by this phase, but relevant duplication risk).

High-value existing tests to extend:

- `test/commands/status.test.ts`
- `test/tui/completed-panel.test.ts`
- `test/tui/detail-header.test.ts`
- `test/commands/info.test.ts`

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `@opentui/solid` | `^0.1.79` | TUI component primitives (`box`, `text`) + terminal hooks | Existing TUI is already implemented on this stack; no migration needed |
| `solid-js` | `^1.9.0` | Reactive state/effects (`createSignal`, `createEffect`, `on`) | Existing TUI architecture and pollers depend on Solid reactivity |
| `picocolors` (via `src/util/colors.ts`) | `^1.1.0` | Consistent CLI badge coloring | Already used by status/info output paths; NO_COLOR-safe wrapper exists |
| `src/core/job-introspection.ts` | repo-local | Retry/undo/no-op status semantics | Existing single source of truth for operational badges |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `vitest` | `^2.1.0` | Unit-level regression tests for formatting helpers and command output | Required for deterministic badge/verdict behavior coverage |
| `better-sqlite3` (via `src/core/db.ts`) | `^12.6.2` | Existing data source for job state (`getQueue`, `getRecent`) | Reuse only; no schema changes needed for this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Shared verdict formatter in `src/core/` | Keep per-view `JSON.parse` logic | Faster short-term edits, but guaranteed semantic drift and repeated bugs |
| Reuse `buildRetryWhy`/`buildUndoWhy` | New ad hoc badge logic in TUI/status | Duplicates business rules and breaks parity with `pilot retry --why` / `pilot info` |
| Explicit judge text badge | Icon-only (`✓`, `⚠`, `✗`) | Loses required signal density; fails requirement to distinguish pass vs inconclusive |

**Installation:**
```bash
# No new dependencies are required for Phase 49
npm install
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   ├── job-introspection.ts      # existing retry/undo semantics (reuse)
│   └── judge-signal.ts           # new shared verdict parse/format helpers
├── commands/
│   ├── status.ts                 # add compact judge badge in recent rows
│   └── info.ts                   # consume shared verdict formatter
└── tui/
    ├── components/completed-panel.tsx  # explicit judge/retry/undo badges per row
    └── views/detail.tsx                 # dedicated Verdict line + separated status/verdict/retry/undo

test/
├── core/judge-signal.test.ts
├── commands/status.test.ts
├── commands/info.test.ts
└── tui/
    ├── completed-panel.test.ts
    └── detail-header.test.ts
```

### Pattern 1: Shared Verdict Normalization

**What:** Parse and classify `job.judgeVerdict` once in `src/core/` and expose a typed signal consumed by all views.
**When to use:** Any CLI/TUI surface that needs pass/fail/doubt/inconclusive output.
**Example:**
```typescript
// Source: requirements/surface-judge-verdict-and-badges-in-tui.md
// Source: src/core/runner.ts (stored verdict shape)
type JudgeOutcome = 'pass' | 'fail' | 'doubt' | 'inconclusive' | 'none';

interface JudgeSignal {
  outcome: JudgeOutcome;
  badge: string;          // e.g. "judge:pass 92%"
  confidence: number | null;
  reason: string | null;  // prefer `reason`, fallback `summary` for legacy rows
}

function buildJudgeSignal(job: Pick<Job, 'scope' | 'judgeVerdict'>): JudgeSignal {
  if (job.scope !== 'phase') return { outcome: 'none', badge: '', confidence: null, reason: null };
  // parse JSON safely, map succeeded->pass, failed->fail, doubting->doubt,
  // confidence 0/missing/unparseable => inconclusive
}
```

### Pattern 2: Compose Operational Badges from Introspection

**What:** Use existing introspection outputs for retry/undo badges, not local condition trees.
**When to use:** Completed/failed rows in TUI and status-like views.
**Example:**
```typescript
// Source: src/core/job-introspection.ts
const retry = buildRetryWhy(job); // retryable / needs-revision / retry-unavailable
const undo = buildUndoWhy(job);   // undo:safe / undo:guarded-* / undo:unavailable

const badges: string[] = [];
if (job.scope === 'phase') badges.push(`[${judge.badge}]`);
if (job.status === 'failed' || job.status === 'cancelled') badges.push(`[${retry.badge}]`);
if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') badges.push(`[${undo.badge}]`);
```

### Pattern 3: Dedicated Detail Meta Lines

**What:** Render explicit, labeled lines in detail header for status/verdict/retry/undo.
**When to use:** Detail view for terminal jobs (especially phase jobs).
**Example:**
```typescript
// Source: src/tui/views/detail.tsx + requirements/surface-judge-verdict-and-badges-in-tui.md
lines.push(`Status: ${job.status} (${buildJobWhy(job, ctx).badge})`);
if (job.scope === 'phase') lines.push(`Verdict: ${judge.badge} - ${truncate(judge.reason ?? 'n/a', 80)}`);
lines.push(`Retry: ${buildRetryWhy(job).badge} - ${buildRetryWhy(job).what}`);
lines.push(`Undo: ${buildUndoWhy(job).badge} - ${buildUndoWhy(job).what}`);
```

### Anti-Patterns to Avoid

- **Per-view verdict parsing:** Duplicating `JSON.parse(job.judgeVerdict)` in each component/command leads to drift.
- **Icon-only semantics:** `✓`/`⚠`/`✗` without text badge fails required operator clarity.
- **Bypassing introspection helpers:** Re-implementing retry/undo conditionals causes mismatch with existing CLI commands.
- **Header helper drift:** Updating UI header lines but not `buildHeaderLines` (or vice versa) causes test/UX mismatch.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Retryability logic | Local `if (job.error.includes(...))` checks | `buildRetryWhy(job)` | Existing logic already handles no-op and verdict-driven revision paths |
| Undo safety logic | Local checkpoint string checks in UI | `buildUndoWhy(job)` | Guarded states are already codified and tested in one place |
| Verdict semantics mapping | Separate `isInconclusive` implementations per view | Shared `buildJudgeSignal()` helper | Prevents inconsistent pass/fail/doubt/inconclusive mapping |
| Status badge text generation | Manual string assembly in each row renderer | Shared formatter helpers (`badge` + optional reason preview) | Keeps status, info, and TUI detail consistent |

**Key insight:** This phase is mostly a semantic consistency problem, not a rendering problem. Reuse existing semantic modules and centralize only the missing verdict formatter.

## Common Pitfalls

### Pitfall 1: Verdict Schema Drift (`reason` vs `summary`)

**What goes wrong:** UI reads `summary`, but runner writes `reason`; badges or detail reason become blank.
**Why it happens:** Legacy field assumptions survived in `info.ts` while runner standardized on `reason`.
**How to avoid:** Shared parser should prefer `reason`, then fallback to `summary` for backward compatibility.
**Warning signs:** `judge:*` badge renders but detail reason is empty on known judged jobs.

### Pitfall 2: Treating Quick Jobs as Judged Jobs

**What goes wrong:** Quick job rows incorrectly show `judge:*` badges.
**Why it happens:** Logic ignores `scope !== 'phase'` guard.
**How to avoid:** Verdict helper should return `outcome: none` for non-phase scope.
**Warning signs:** Quick completed rows display `judge:inconclusive`.

### Pitfall 3: Inconclusive Handling Too Narrow

**What goes wrong:** Only `confidence===0` is treated inconclusive; null/unparseable verdicts display as pass/fail.
**Why it happens:** Ad hoc parsing focuses on one happy-path shape.
**How to avoid:** Classify null, malformed JSON, missing verdict key, and confidence `0` as inconclusive for phase jobs.
**Warning signs:** Damaged/missing verdict rows show green pass badge.

### Pitfall 4: Header/Test Divergence in Detail View

**What goes wrong:** `buildHeaderLines()` tests pass but rendered header omits new lines (or opposite).
**Why it happens:** Header logic is duplicated between helper and JSX render block.
**How to avoid:** Keep line construction in shared helper(s) consumed by both code paths, or update both in same commit.
**Warning signs:** Snapshot/line-order tests and manual `pilot tui` output disagree.

### Pitfall 5: Badge Clutter Hiding Observability Signals

**What goes wrong:** Added badges push token/cost/model signal off-screen in completed rows.
**Why it happens:** Single-line row budget is already tight.
**How to avoid:** Move badges to a dedicated secondary line or truncate observability text predictably.
**Warning signs:** Long rows drop `tok/cost/model` cues entirely at common terminal widths.

## Code Examples

Verified patterns from official/internal sources:

### Shared Judge Badge Formatter

```typescript
// Source: src/core/runner.ts (verdict values), requirements/surface-judge-verdict-and-badges-in-tui.md
const VERDICT_LABEL: Record<'succeeded' | 'failed' | 'doubting', 'pass' | 'fail' | 'doubt'> = {
  succeeded: 'pass',
  failed: 'fail',
  doubting: 'doubt',
};

export function formatJudgeBadge(outcome: ReturnType<typeof buildJudgeSignal>): string {
  if (outcome.outcome === 'none') return '';
  if (outcome.outcome === 'inconclusive' || outcome.confidence === null || outcome.confidence === 0) {
    return 'judge:inconclusive';
  }
  return `judge:${outcome.outcome} ${outcome.confidence}%`;
}
```

### Status Row Integration (Recent Section)

```typescript
// Source: src/commands/status.ts
const judge = buildJudgeSignal(job);
const judgeBadge = judge.outcome === 'none' ? '' : `[${judge.badge}]`;

outputHuman(
  `  ${icon} ${dim(job.id)}  ${job.project} ... ${judgeBadge ? `${judgeBadge} ` : ''}${dim(`[${formatRecoveryTag(job)}]`)}`,
);
```

### TUI Completed Row Badge Composition

```typescript
// Source: src/tui/components/completed-panel.tsx + src/core/job-introspection.ts
const judge = buildJudgeSignal(job);
const retry = buildRetryWhy(job);
const undo = buildUndoWhy(job);

const badges = [
  judge.outcome !== 'none' ? `[${judge.badge}]` : null,
  job.status === 'failed' || job.status === 'cancelled' ? `[${retry.badge}]` : null,
  TERMINAL_STATUSES.has(job.status) ? `[${undo.badge}]` : null,
].filter(Boolean).join(' ');
```

## Verification Approach

1. Add pure unit tests for shared verdict helper (`phase` vs `quick`, succeeded/failed/doubting/confidence 0/null/malformed JSON).
2. Extend `test/commands/status.test.ts` to assert compact judge badge presence for completed phase jobs while preserving existing retry/undo behavior.
3. Extend `test/tui/completed-panel.test.ts` with pure helper assertions for badge composition (judge + retry + undo).
4. Extend `test/tui/detail-header.test.ts` to assert explicit `Status:`, `Verdict:`, `Retry:`, and `Undo:` lines.
5. Add/adjust `test/commands/info.test.ts` for reason fallback (`reason` first, `summary` fallback).
6. Manual smoke: run `pilot status` and `pilot tui`; verify quick success vs judged phase pass vs inconclusive are visually distinct.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Icon-only completion semantics (`✓`/`⚠`) | Explicit judge outcome badges (`judge:pass/fail/doubt/inconclusive`) | Phase 49 | Operator can distinguish true pass vs benefit-of-doubt quickly |
| Per-file `isInconclusive()` duplication | Shared core verdict formatter consumed by status/TUI/info | Phase 49 | Removes semantic drift and repeated parsing bugs |
| Detail header mixes status cues without explicit verdict line | Dedicated status/verdict/retry/undo lines | Phase 49 | Faster triage in detail pane; less mental parsing |

**Deprecated/outdated:**

- Local `isInconclusive()` helpers in `src/commands/status.ts`, `src/commands/queue.ts`, and `src/tui/components/completed-panel.tsx`.
- `summary`-only verdict text assumption in `src/commands/info.ts` (runner stores `reason`).

## Open Questions

1. **Should `pilot status --json` also expose derived judge badge fields?**
   - What we know: Must-have only requires compact judge signal in status output; current JSON already returns raw `job.judgeVerdict`.
   - What's unclear: Whether downstream consumers rely on preformatted badge text.
   - Recommendation: Keep JSON schema stable for Phase 49; add derived JSON only if planner explicitly scopes API change.

2. **Should `pilot queue --history` adopt the same judge badge in this phase?**
   - What we know: Queue history has duplicate inconclusive logic and similar UX surface.
   - What's unclear: Requirement scope explicitly names TUI + status, not queue history.
   - Recommendation: Treat as follow-up unless planner wants duplication cleanup folded into this phase.

3. **How much reason text should appear in TUI detail verdict line?**
   - What we know: Nice-to-have asks truncation preserving the start of reason.
   - What's unclear: Exact max width policy by terminal size.
   - Recommendation: Start with fixed conservative truncation (e.g. 80 chars) and verify readability on 100/120-column terminals.

## Sources

### Primary (HIGH confidence)

- `requirements/surface-judge-verdict-and-badges-in-tui.md` - phase requirements and acceptance criteria.
- `src/core/runner.ts` - stored judge verdict shape and confidence-based semantics.
- `src/core/job-introspection.ts` - canonical retry/undo badge logic.
- `src/commands/status.ts` - current status rendering and badge behavior.
- `src/tui/components/completed-panel.tsx` - current completed row/icon behavior.
- `src/tui/views/detail.tsx` - current detail header composition.
- `test/commands/status.test.ts`, `test/tui/completed-panel.test.ts`, `test/tui/detail-header.test.ts`, `test/commands/info.test.ts` - current regression surface.
- Context7 `/anomalyco/opentui` - Solid/OpenTUI component and hook usage (`box`, `text`, `useKeyboard`, layout props).
- Context7 `/solidjs/solid` - `createEffect`, `on`, and cleanup patterns used by existing TUI state/effects.

### Secondary (MEDIUM confidence)

- `README.md` (AI judge section) - documented verdict payload shape and action semantics.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** - versions and usage confirmed in `package.json` and active source files.
- Architecture: **HIGH** - required touchpoints and duplication hotspots are directly visible in current code.
- Pitfalls: **HIGH** - reproduced from current implementation patterns and existing tests.

**Research date:** 2026-03-08
**Valid until:** 2026-04-07 (30 days)
