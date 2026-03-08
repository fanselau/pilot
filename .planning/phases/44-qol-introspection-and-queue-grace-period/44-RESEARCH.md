# Phase 44: QoL Introspection and Queue Grace Period - Research

**Researched:** 2026-03-07
**Domain:** CLI/TUI job introspection polish + queue launch eligibility grace window
**Confidence:** HIGH

## Summary

Phase 44 should be implemented as an additive polish layer on top of existing Pilot v2 primitives, not a queue/runner redesign. The repository already has most of the foundation needed: atomic launch claiming in SQLite (`claimNextLaunchable`), rich per-job metadata (including Phase 43 recovery fields), command surfaces (`status`, `info`, `log`, `retry`), and a metadata-dense TUI detail header.

The biggest gap is consistency and legibility, not raw capability. Right now, reasoning is split across duplicated logic (`status.ts`, `info.ts`, `detail.tsx`), pending jobs appear as generic `pending`, and retry/log flows require digging. The right MVP is: introduce one shared introspection reason model, wire concise "what/why/next" copy into CLI/TUI, and add a configurable queue grace window to real claim eligibility (not just display).

For grace period behavior, implement a global default (`runner.queueGraceSeconds`, recommended default `120`) plus per-job opt-out (`pilot add --start-immediately`) persisted on job rows. Eligibility checks should happen where claims already happen (DB claim path + runner), and status/TUI should visibly differentiate grace-waiting from blocked/dependency waits.

- Existing architecture is already compatible with this phase
- Most work is unification and surfacing, not new infrastructure
- Keep defaults conservative and override explicit
- Reuse Phase 43 recovery labels/copy patterns to avoid churn

**Primary recommendation:** Build a shared `JobWhy` model and wire it through `status --why`, `info`, `log --summary`, `retry --why`, TUI detail/queue badges, plus an eligibility-enforced grace gate (`runner.queueGraceSeconds` + per-job `--start-immediately`).

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `better-sqlite3` | `^12.6.2` | Queue/job storage + atomic claim transaction | Already owns launch eligibility (`claimNextLaunchable`) and job metadata |
| `commander` | `^13.0.0` | CLI flags and command wiring (`status`, `log`, `retry`, `add`) | Existing command registration pattern in `src/index.ts` |
| `execa` | `^9.5.0` | Runner subprocess + git helpers | Existing process orchestration in `runner.ts`/`undo.ts` |
| `@opentui/solid` + `solid-js` | `^0.1.79` / `^1.9.0` | TUI detail/queue rendering and keyboard flows | Existing TUI architecture already in place |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `date-fns` | `^4.1.0` | Relative time formatting | Human-friendly remaining-wait and status text |
| `vitest` | `^2.1.0` | Command/core/TUI regression coverage | All Phase 44 verification work |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Existing SQLite claim model | New scheduler service/event bus | Major redesign; violates MVP scope discipline |
| Deterministic summary from job metadata/steps | LLM-generated transcript summaries | Extra cost/latency and non-deterministic output for a QoL MVP |
| Shared reason model module | Per-surface ad hoc string logic | Fast to ship, but keeps current inconsistency bug class |

**Installation:**
```bash
npm install
```

## Architecture Patterns

### Concise Existing Architecture (Phase-Relevant)

- CLI command wiring is centralized in `src/index.ts` and already supports flag-based command extension.
- Queue state is persisted in `src/core/db.ts`; launch eligibility is currently enforced in `claimNextLaunchable()` with project-block and dependency checks.
- Runner dispatch loop in `src/core/runner.ts` repeatedly calls `claimNextLaunchable()` and launches immediately when slots are free.
- Phase 43 recovery visibility already exists with tags like `undo:safe`, `undo:guarded-*`, `undo:unavailable` in `status`, `info`, and TUI detail header.
- Introspection logic is currently duplicated across `src/commands/status.ts`, `src/commands/info.ts`, and `src/tui/views/detail.tsx`.

### Required Files Likely to Change (Grouped by Concern)

| Concern | Likely Files |
| ------- | ------------ |
| Shared introspection reason model | `src/core/job-introspection.ts` (new), `src/commands/status.ts`, `src/commands/info.ts`, `src/commands/retry.ts`, `src/tui/views/detail.tsx` |
| Queue grace config + defaults | `src/core/types.ts`, `src/core/config.ts`, `src/commands/config.ts`, `test/core/config.test.ts` |
| Per-job grace opt-out persistence | `src/core/types.ts`, `src/core/db.ts`, `src/commands/add.ts`, `src/index.ts`, `test/core/db.test.ts`, `test/commands/add.test.ts` |
| Launch eligibility mechanics | `src/core/db.ts`, `src/core/runner.ts`, `test/core/db.test.ts`, `test/core/runner-lock.test.ts`, `test/core/runner-recovery.test.ts` |
| CLI status/info/log/retry QoL surfaces | `src/index.ts`, `src/commands/status.ts`, `src/commands/info.ts`, `src/commands/log.ts`, `src/commands/retry.ts`, `test/commands/status.test.ts`, `test/commands/info.test.ts`, `test/commands/cancel-retry-bump.test.ts`, `test/commands/log.test.ts` (new) |
| TUI detail + queue grace visibility | `src/tui/views/detail.tsx`, `src/tui/components/queue-panel.tsx`, `src/tui/views/dashboard.tsx`, `test/tui/detail-header.test.ts`, `test/tui/queue-panel.test.ts` (new) |

### Pattern 1: Shared Reason Model (CLI + TUI)

**What:** Create one canonical reason model that emits machine codes, short badges, concise human explanation, and next action.

**When to use:** Any place that explains guarded/pending/unsafe state: `status --why`, `info`, `retry --why`, TUI detail and queue rows.

**Recommendation:** Add a core helper module that returns a `JobWhy` object from job + queue context so all surfaces render consistent wording.

### Pattern 2: Grace as Eligibility Gate (Not Just Label)

**What:** Integrate grace check into launch claim logic where eligibility is already atomically enforced.

**When to use:** Pending job claim selection in `claimNextLaunchable` and corresponding status introspection.

**Recommendation:** Add SQL condition for minimum queue age with per-job bypass flag and global `queueGraceSeconds` setting.

### Pattern 3: Summary-First Introspection Commands

**What:** Provide compact high-signal views before raw transcript detail.

**When to use:** `pilot info <id>`, `pilot log --summary`, `pilot retry --why`.

**Recommendation:** Use existing fields (`job_steps`, `judgeVerdict`, recovery metadata, error/resumeHint) for deterministic summaries; avoid new telemetry systems.

### Anti-Patterns to Avoid

- **Duplicated reason builders per surface:** keeps wording drift and subtle behavior mismatches.
- **Grace wait as UI-only status:** violates requirement that grace affects real launch eligibility.
- **Verbose debug-dump `status --why`:** requirement explicitly asks for concise output.
- **Adding many new labels at once:** clutters status surfaces and hurts scanability.

## Recommended Implementation Slices (2-3 Plans)

### Slice 1: Grace Eligibility Foundation (DB + Config + Add)

**Scope:** Add global grace config and per-job immediate-start override, enforce at claim time.

**Changes:**
- Config: `runner.queueGraceSeconds` with default `120` and env override `PILOT_QUEUE_GRACE_SECONDS`.
- Job metadata: add `skipGracePeriod` boolean column + type field.
- Add flag: `pilot add --start-immediately` persists `skipGracePeriod=1`.
- Claim logic: `claimNextLaunchable(graceSeconds)` excludes too-new jobs unless bypassed.

**Acceptance:** Newly queued jobs do not launch until age threshold unless explicitly bypassed.

### Slice 2: Shared Introspection + CLI QoL (`status`, `info`, `log`, `retry`)

**Scope:** Introduce canonical reason/badge/copy model and wire command-level UX.

**Changes:**
- New shared reason helper module (codes + badge + why + next-action).
- `pilot status --why` mode with concise per-job/project reasons.
- `pilot info <id>` top section optimized for "what happened / what next".
- `pilot log <id> --summary` deterministic summary mode from metadata/steps.
- `pilot retry <id> --why` explanatory mode (recommended dry explanatory mode).

**Acceptance:** Users can decide action (wait/retry/undo/requeue) without transcript spelunking.

### Slice 3: TUI Visibility + Regression Net

**Scope:** Surface grace + reason/badges in queue/detail view and lock in tests.

**Changes:**
- Queue row shows grace wait state and remaining time when applicable.
- Detail header includes compact launch/retry/undo readiness reasons.
- Keep Phase 43 recovery labels visible and consistent with CLI.

**Acceptance:** TUI mirrors CLI reasoning for grace/guard states with concise labels.

## Naming and Copy Consistency Recommendations

Use a two-layer model: stable machine code + compact human badge.

| Reason Code (machine) | Badge (human) | Suggested Why Copy | Suggested Next Action |
| --------------------- | ------------- | ------------------ | --------------------- |
| `grace-wait` | `grace-wait` | `Waiting for queue grace window.` | `Wait {remaining} or queue with --start-immediately.` |
| `project-blocked` | `blocked-project` | `Project is blocked due to prior failure.` | `pilot unblock <project> after reviewing failure.` |
| `depends-on` | `depends-on` | `Waiting for dependency job to complete.` | `Check dependency status; retry/fix dependency first.` |
| `project-serial` | `project-serial` | `Another job for this project is running.` | `Wait for current project job to finish.` |
| `undo-safe` | `undoable` | `Recovery checkpoints are compatible.` | `pilot undo <id> --dry-run` |
| `undo-guarded-newer` | `blocked-newer-work` | `Newer commits exist after this job.` | `Undo newer work first or use --force intentionally.` |
| `undo-guarded-dirty` | `dirty-start` | `Job started dirty; rollback is guarded.` | `Use --force only when intentional.` |
| `undo-unavailable` | `undo-unavailable` | `Missing or incompatible checkpoints.` | `Use logs/info; create a new corrective job.` |
| `no-commit-delta` | `no-op` | `Job produced no commit delta.` | `Retry only if requirement still needs changes.` |

Copy pattern to standardize across CLI/TUI:
- `What happened:` one line state
- `Why:` one line causal reason
- `Next:` one actionable command-level suggestion

## Grace-Period Design Recommendation

### Config default

- **Key:** `runner.queueGraceSeconds`
- **Env override:** `PILOT_QUEUE_GRACE_SECONDS`
- **Default:** `120` seconds
- **Disable behavior:** `0` seconds (no grace wait)

### Per-job override

- **CLI flag:** `pilot add --start-immediately`
- **Persisted field:** `skipGracePeriod` boolean (DB column)
- **Confirmation copy:** explicitly warn tradeoff: faster start, reduced review/cancel window.

### Launch eligibility check

- Keep eligibility in `claimNextLaunchable` transaction.
- Add age gate: launchable if `skipGracePeriod=1` OR `queueGraceSeconds<=0` OR `job age >= queueGraceSeconds`.
- Preserve existing blocked/dependency/project-serialization guards unchanged.

### Status visibility

- `status` queue rows: show `grace-wait` with remaining time.
- `status --why`: include grace as a first-class reason distinct from blocked/stuck.
- TUI queue/detail: show grace wait state and remaining time (coarse human format is sufficient).
- JSON outputs: expose reason codes and remaining seconds for automation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Launch scheduler redesign | New custom scheduler/event bus | Existing `claimNextLaunchable` + runner drain loop | Current flow is already atomic and production-used |
| Free-form transcript summarizer | AI-generated summaries | Existing `job_steps`, `judgeVerdict`, `error`, recovery metadata | Deterministic, fast, testable |
| Per-surface reason strings | Ad hoc inline logic | Shared introspection helper module | Prevents wording and behavior drift |
| High-frequency countdown engine | 1Hz+ updates everywhere | Coarse 5-10s formatted remaining time | Reduces UI noise and complexity |

**Key insight:** This phase is about consistency and visibility over existing metadata, not collecting new telemetry or changing orchestration architecture.

## Common Pitfalls

### Pitfall 1: Grace check and status reasoning diverge

**What goes wrong:** Status says "launchable" but runner still does not claim (or inverse).
**Why it happens:** Claim SQL and display logic use different condition precedence.
**How to avoid:** Keep one canonical reason helper and mirror claim condition exactly.
**Warning signs:** Repeated operator confusion around "pending" jobs that seem stuck.

### Pitfall 2: Timestamp parsing drift (SQLite vs JS)

**What goes wrong:** Remaining grace time is wrong or negative around timezone/local parsing.
**Why it happens:** `created_at` from SQLite (`datetime('now')`) is not strict ISO with `Z`.
**How to avoid:** Compute age/remaining in SQL epoch (`strftime('%s', ...)`) or normalize parsing consistently.
**Warning signs:** Different remaining times between CLI and TUI for same job.

### Pitfall 3: `status --why` becomes verbose debug output

**What goes wrong:** Too much internal data; output loses scannability.
**Why it happens:** Dumping whole job structs or all conditions.
**How to avoid:** One primary reason + one next action per item.
**Warning signs:** >3 lines per queue item in normal terminals.

### Pitfall 4: Badge explosion

**What goes wrong:** Status rows become unreadable with many labels.
**Why it happens:** Adding every possible edge-case as a badge.
**How to avoid:** Limit to requirement-critical states; move details to `--why`/`info`.
**Warning signs:** Users can no longer scan queue at a glance.

### Pitfall 5: Type fixture churn from new Job fields

**What goes wrong:** Many tests fail due strict `Job` fixtures missing new required fields.
**Why it happens:** New non-optional fields added to `Job` interface.
**How to avoid:** Prefer additive optional typing during migration or update fixture factories first.
**Warning signs:** Widespread compile failures in `test/commands/*` and `test/tui/*`.

### Pitfall 6: Scope creep into observability phase

**What goes wrong:** Work expands into analytics/timeline redesign and delays delivery.
**Why it happens:** Trying to solve all introspection problems at once.
**How to avoid:** Restrict to required commands/flags/surfaces and grace eligibility mechanics.
**Warning signs:** Introducing new DB tables or background collectors not required by Phase 44.

## Code Examples

Verified/repo-aligned patterns:

### Grace-aware claim condition (recommended adaptation)

```typescript
// Source pattern: src/core/db.ts claimNextLaunchable transaction query
// Add grace checks to existing WHERE conditions.
const row = db.prepare(`
  SELECT * FROM jobs
  WHERE status = 'pending'
    AND project NOT IN (SELECT DISTINCT project FROM jobs WHERE status = 'running')
    AND project NOT IN (SELECT path FROM projects WHERE status = 'blocked')
    AND (depends_on IS NULL OR depends_on IN (SELECT id FROM jobs WHERE status = 'completed'))
    AND (
      skip_grace_period = 1
      OR ? <= 0
      OR (strftime('%s','now') - strftime('%s', created_at)) >= ?
    )
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
`).get(queueGraceSeconds, queueGraceSeconds);
```

### Shared reason object for CLI/TUI consistency

```typescript
// Source motivation: duplicated recovery reasoning in status.ts/info.ts/detail.tsx
export interface JobWhy {
  code: 'grace-wait' | 'project-blocked' | 'depends-on' | 'project-serial' | 'launchable';
  badge: string;
  why: string;
  next: string;
  remainingSeconds?: number;
}

// status --why, info, retry --why, and TUI detail all render from this object.
```

### Summary-first log mode from existing metadata

```typescript
// Source data already available in log.ts + db.ts
// Build concise summary without transcript traversal.
const summary = {
  job: { id: job.id, status: job.status, scope: job.scope },
  step: steps.at(-1)?.command ?? 'none',
  verdict: job.judgeVerdict ? JSON.parse(job.judgeVerdict) : null,
  commitDelta: job.gitBaseCommit && job.gitHeadCommit
    ? job.gitBaseCommit !== job.gitHeadCommit
    : null,
  failure: job.error ?? steps.findLast(s => s.status === 'failed')?.verdictReason ?? null,
};
```

## Verification Strategy

### Command-level

| Test File | Add/Adjust |
| --------- | ---------- |
| `test/commands/status.test.ts` | `--why` mode output, grace-wait badge/reason, JSON reason payload |
| `test/commands/info.test.ts` | compact high-signal section, retry/undo readiness fields, no-op badge visibility |
| `test/commands/cancel-retry-bump.test.ts` | retry `--why` mode (explanatory/no mutation) |
| `test/commands/add.test.ts` | `--start-immediately` persistence and queue confirmation copy |
| `test/commands/log.test.ts` (new) | `--summary` output for completed/failed and known outcomes |

### Core-level

| Test File | Add/Adjust |
| --------- | ---------- |
| `test/core/db.test.ts` | grace-gated claim behavior, bypass override, blocked/dependency precedence unaffected |
| `test/core/config.test.ts` | new `queueGraceSeconds` env/config/default/source resolution |
| `test/core/runner-lock.test.ts` | mock signature updates if `claimNextLaunchable` gains parameter |
| `test/core/runner-recovery.test.ts` | fixture compatibility if `Job` adds grace override field |

### TUI-level

| Test File | Add/Adjust |
| --------- | ---------- |
| `test/tui/detail-header.test.ts` | grace wait line and compact why/recovery badge consistency |
| `test/tui/queue-panel.test.ts` (new) | grace badge/rendering and selected-row behavior |

### Execution order recommendation

1. Run focused suites per slice (`db`, `config`, `add`, `status`, `info`, `retry`, `log`, `detail-header`).
2. Run full suite: `npm test`.
3. Manual smoke: queue one job with default grace and one with `--start-immediately`; confirm runner claim timing + status/TUI visibility.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Pending jobs launch immediately once slot available | Grace-gated eligibility by default with explicit per-job bypass | Phase 44 | Safer cancellation/edit window after queueing |
| Recovery guards shown but reasoning duplicated by surface | Shared introspection reason model across CLI/TUI | Phase 44 | Consistent language and fewer UX contradictions |
| `pilot log` defaults to transcript stream only | `pilot log --summary` gives deterministic high-signal outcome digest | Phase 44 | Faster operator triage |
| `pilot retry` retries without context | `pilot retry --why` explains failure context before retry decision | Phase 44 | Fewer blind retries |

**Deprecated/outdated (post-Phase 44):**

- Generic `pending` display for grace-waiting jobs.
- Surface-specific hand-written reason strings for the same guarded states.

## Open Questions

1. **Default grace duration: 90s vs 120s?**
   - What we know: requirements call out "first minute or two" cancellation window.
   - Recommendation: default `120s`; can be tuned to `90s` with no architecture change.

2. **Retry `--why` behavior: explain-only or explain+retry?**
   - What we know: requirement allows dry explanatory mode.
   - Recommendation: make `--why` explain-only for MVP (no state mutation); keep retry action explicit.

3. **Human flag naming for grace opt-out**
   - What we know: naming must make tradeoff explicit.
   - Recommendation: `--start-immediately` over `--no-grace` for clarity.

## Sources

### Primary (HIGH confidence)

- `requirements/qol-introspection-and-queue-grace-period.md` - full Phase 44 scope and MVP constraints
- `.planning/ROADMAP.md` - Phase 44 placement and dependency on Phase 43
- `.planning/STATE.md` - current completion context and recent Phase 43 decisions
- `src/core/db.ts` - jobs schema, `claimNextLaunchable`, queue primitives
- `src/core/runner.ts` - launch loop and claim usage
- `src/core/config.ts` - layered config/default/env resolution
- `src/commands/add.ts` - queue-time flags and job creation path
- `src/commands/status.ts` - current recovery tag rendering and JSON shape
- `src/commands/info.ts` - recovery block and metadata rendering
- `src/commands/log.ts` - step summary + transcript flow
- `src/commands/retry.ts` - current retry behavior
- `src/index.ts` - command/flag wiring
- `src/tui/views/detail.tsx` - current detail header metadata and recovery line
- `src/tui/components/queue-panel.tsx` - queue row rendering
- `.planning/phases/43-job-undo-and-recovery-checkpoints/43-04-SUMMARY.md` - Phase 43 visibility contract and label intent

### Secondary (MEDIUM confidence)

- `test/commands/status.test.ts`, `test/commands/info.test.ts`, `test/commands/add.test.ts`, `test/core/db.test.ts`, `test/tui/detail-header.test.ts` - existing regression contract and fixture patterns

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** - directly from `package.json` and current repo usage
- Architecture patterns: **HIGH** - derived from concrete current code paths
- Pitfalls: **HIGH** - based on current duplication, eligibility flow, and test contracts

**Research date:** 2026-03-07
**Valid until:** 2026-03-14 (active pre-release codebase)
