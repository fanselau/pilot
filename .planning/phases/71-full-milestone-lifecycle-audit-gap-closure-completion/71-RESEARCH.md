# Phase 71: Full Milestone Lifecycle - Research

**Researched:** 2026-03-16
**Domain:** Runner-driven milestone closure orchestration (audit -> gap closure -> completion)
**Confidence:** MEDIUM

## Summary

Phase 71 should be implemented as a runner-internal lifecycle extension, not as new delegation intents. The existing intent contract already routes milestone-complete state to `audit-milestone`, and explicitly forbids `complete-milestone` as a delegation intent. That means the right architecture is: runner handles `audit-milestone`, parses milestone audit artifacts from disk, conditionally runs `plan-milestone-gaps`, re-enters milestone re-delegation/phase execution, and then calls `complete-milestone` internally when audit passes.

The current codebase already provides the critical primitives: step observability (`recordStep`/`completeStep` via `runGsdStep`), hung detection (`getSessionState()` -> `hung-on-prompt`), retry/reset primitives (`resetToPending`, `canRetry`, `incrementRetryCount`), and milestone loop re-delegation (`milestoneLoop`). The major gaps are policy and parsing: `handleAuditMilestone()` is still a no-op, audit file parsing/mtime freshness checks do not exist, milestone notifications are currently suppressed in callback transport, and there is no persisted `milestone_gap_round` state.

The most important planning constraint is contract mismatch risk in upstream command artifacts: audit docs reference both `.planning/v{version}-MILESTONE-AUDIT.md` and `.planning/v{version}-v{version}-MILESTONE-AUDIT.md`, and audit can emit `tech_debt` in addition to `passed`/`gaps_found`. Phase 71 must include defensive parsing and explicit policy mapping for these variants.

**Primary recommendation:** Implement a dedicated `runAuditMilestone()` state machine in `runner.ts` with persisted `milestoneGapRound`, mtime-based stale-audit rejection, max-2 gap rounds, and a runner-internal `runCompleteMilestone()` call path.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `better-sqlite3` | `^12.6.2` | Persist lifecycle counters (`milestone_gap_round`) and job state atomically | Existing queue/job source of truth; `db.transaction()` is already used for safe state transitions |
| `execa` | `^9.5.0` | Spawn `opencode run` for `gsd-*` steps from runner | Existing subprocess primitive in `runner.ts`; detached lifecycle already hardened |
| Runner + DB core (`src/core/runner.ts`, `src/core/db.ts`, `src/core/types.ts`) | repo-local | Lifecycle orchestration and persistence | Existing step recording, retry/hung handling, and intent routing are all here |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `yaml` | `^2.8.2` | Parse audit frontmatter safely | Use for `status` extraction from MILESTONE-AUDIT files; avoid brittle regex-only parsing |
| `get-shit-done-cc` command/workflow contracts | `~1.24.0` | Defines `gsd-audit-milestone`, `gsd-plan-milestone-gaps`, `gsd-complete-milestone` behavior | Required to align runner args and expected artifacts with upstream workflow contracts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Parsing intent `version` directly | Resolve milestone version from `.planning/STATE.md` first, intent second | Requirement explicitly calls STATE canonical; intent can be stale or malformed |
| Single hardcoded audit path | Glob + version filter + newest mtime strategy | Needed because command/workflow docs conflict on audit filename pattern |
| Reusing `retry_count` for gap rounds | Separate `milestone_gap_round` field | Keeps verification/hung retry budget independent from milestone loop cap |

**Installation:**
```bash
npm install
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   ├── runner.ts              # runAuditMilestone/runCompleteMilestone orchestration
│   ├── db.ts                  # milestone_gap_round schema + helpers
│   ├── types.ts               # Job field additions
│   └── callback.ts            # milestone notification path update
└── prompts/
    └── delegate.md            # milestone intent contract + decimal-phase guardrails
```

### Pattern 1: Runner-Internal Milestone Lifecycle State Machine

**What:** Keep delegation intent surface unchanged (`audit-milestone` only), and perform completion as internal runner logic.
**When to use:** `handleAuditMilestone()` for milestone-scope jobs once all phases are complete.
**Example:**
```typescript
// Source: src/core/runner.ts + requirements/gsd-08-milestone-lifecycle.md
while (true) {
  const step = getJob(job.id)?.currentStep ?? job.currentStep;
  const auditStartedAt = Date.now();
  await this.runGsdStep(job, projectDir, 'audit-milestone', version, step);

  const audit = readLatestMilestoneAudit(projectDir, version, auditStartedAt);
  if (audit.status === 'passed') {
    await this.runCompleteMilestone(job, projectDir, version);
    return;
  }

  if (audit.status === 'gaps_found' && canRunAnotherGapRound(job.id)) {
    incrementMilestoneGapRound(job.id);
    await this.runGsdStep(job, projectDir, 'plan-milestone-gaps', '--auto', getJob(job.id)?.currentStep ?? step);
    await this.milestoneLoop(job, projectDir, getJob(job.id)?.currentStep ?? step);
    continue;
  }

  throw new Error('Milestone gaps remain after max rounds; manual decision required.');
}
```

### Pattern 2: Fresh-Audit Artifact Validation

**What:** Accept audit results only if file mtime is newer than the audit step start timestamp.
**When to use:** Immediately after `gsd-audit-milestone` step returns.
**Example:**
```typescript
// Source: requirement critical fix (audit stale-file guard)
const candidates = globAuditFiles(projectDir, version); // supports vX-MILESTONE-AUDIT and legacy variants
const latest = pickNewestByMtime(candidates);
if (!latest || latest.mtimeMs <= auditStartedAtMs) {
  throw new Error('Audit file missing or stale relative to audit spawn time');
}
```

### Pattern 3: Persisted Gap-Round Counter (Separate from Retry Budget)

**What:** Add `milestone_gap_round` to `jobs` and mutate it explicitly in DB helpers.
**When to use:** Before each `plan-milestone-gaps` execution and for max-round enforcement.
**Example:**
```typescript
// Source: src/core/db.ts retry-field migration pattern
db.prepare('ALTER TABLE jobs ADD COLUMN milestone_gap_round INTEGER NOT NULL DEFAULT 0').run();
db.prepare('UPDATE jobs SET milestone_gap_round = milestone_gap_round + 1 WHERE id = ?').run(jobId);
```

### Pattern 4: Interactive-Prompt Hung Policy Override for Milestone Creation

**What:** Route `new-milestone` interactive hangs to immediate manual-intervention reset, not silent auto-retry loops.
**When to use:** Hung-session catch path when `HungSessionError.hungReason === 'interactive-prompt'` and current step is `new-milestone`.
**Example:**
```typescript
// Source: src/core/runner.ts HungSessionError branch + requirements critical fix
resetToPending(job.id, 'Milestone creation needs manual intervention');
// notify owner/Luca immediately; do not consume full retry loop
```

### Anti-Patterns to Avoid

- **Blindly trusting `intent.version`:** Resolve and validate milestone from STATE as canonical; intent is advisory.
- **Parsing one fixed audit filename:** Command/workflow docs disagree; single-path lookup will miss valid audit outputs.
- **Treating `tech_debt` as `passed`:** Requirement says do not auto-archive with deferred gaps; escalate to human.
- **Using generic failure path for audit command crash:** Requirement needs one explicit retry before escalation, with stale-file guard.
- **Relying on existing callback for milestone notifications:** `notifyJobCompletion()` currently returns early for `scope === 'milestone'`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| YAML frontmatter parsing | Ad-hoc regex-only extraction for nested audit fields | `yaml` parser + existing frontmatter split pattern (`src/core/models.ts`) | Handles multiline/maps safely and avoids false parses |
| Step observability rows | Direct DB inserts scattered across handlers | `runGsdStep()` (`recordStep` + `completeStep` + `advanceStep`) | Keeps TUI/CLI step timeline consistent |
| Hung interactive detection | Timeout-only heuristics | `getSessionState()` question-tool detection (`hung-on-prompt`) | Immediate and deterministic; no long timeout needed |
| Decimal phase directory math | Manual string slicing on `.planning/phases` | GSD phase tooling contracts (`plan-phase` decimal support; `gsd-tools` decimal-aware sorting) | Avoids phase ordering bugs in gap-closure rounds |

**Key insight:** Phase 71 is primarily orchestration policy over existing primitives. Add minimal new mechanisms (`milestone_gap_round`, audit parser) and reuse hardened runner/db/session contracts.

## Common Pitfalls

### Pitfall 1: Infinite Loop Around `new-milestone`

**What goes wrong:** Runner passes `--auto`, hits `question` tool hang, retries repeatedly.
**Why it happens:** Generic hung retry policy treats all interactive hangs the same.
**How to avoid:** Add milestone-creation-specific manual-intervention reset and notify path.
**Warning signs:** Same `new-milestone` step repeats with `interactive-prompt` hung reason.

### Pitfall 2: Accepting Stale Audit Files

**What goes wrong:** Old `MILESTONE-AUDIT.md` is parsed as current audit result.
**Why it happens:** No mtime gate tied to current audit spawn.
**How to avoid:** Compare file mtime against step start timestamp; retry audit once on stale/missing file.
**Warning signs:** Audit status appears unchanged despite recent work and no file update time movement.

### Pitfall 3: Audit Status Drift (`tech_debt`)

**What goes wrong:** Automation treats `tech_debt` as pass and completes milestone.
**Why it happens:** Parser only expects `passed|gaps_found` and defaults unknown to pass.
**How to avoid:** Treat `tech_debt` as human-decision-required (non-auto-complete).
**Warning signs:** Milestone archived despite explicit deferred debt entries.

### Pitfall 4: Decimal Phase Blindness in Re-Delegation

**What goes wrong:** Gap phases exist but delegation/phase matching ignores them.
**Why it happens:** Integer-only phase assumptions in prompt/parsing logic.
**How to avoid:** Ensure milestone loop and phase matching allow decimal phase identifiers.
**Warning signs:** `plan-milestone-gaps` succeeds, but runner repeatedly claims no remaining incomplete phases.

### Pitfall 5: Missing Milestone Completion Notification

**What goes wrong:** Milestone finishes silently.
**Why it happens:** Callback layer intentionally skips milestone-scope jobs.
**How to avoid:** Add dedicated milestone lifecycle notification path (separate from job-scope callback guard).
**Warning signs:** Job completes in DB but no owner/Luca message after audit/complete lifecycle.

## Code Examples

Verified patterns from official/repo sources:

### Atomic DB Mutation Wrapper

```typescript
// Source: Context7 /wiselibs/better-sqlite3/v12.6.2
const updateRound = db.transaction((jobId: string) => {
  db.prepare('UPDATE jobs SET milestone_gap_round = milestone_gap_round + 1 WHERE id = ?').run(jobId);
  return db.prepare('SELECT milestone_gap_round FROM jobs WHERE id = ?').get(jobId);
});
```

### Detached Spawn with Independent Lifecycle

```typescript
// Source: Context7 /sindresorhus/execa
const proc = execa(opencodeBin, opencodeCmdArgs, {
  detached: true,
  cleanup: false,
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
});
proc.catch(() => {});
proc.unref();
```

### Existing Hung-On-Prompt Detection Contract

```typescript
// Source: src/core/opencode-db.ts
if (toolName === 'question') {
  return { state: 'hung-on-prompt', pendingToolName: toolName, pendingToolContent };
}
```

### Existing Step Recording Contract (Reuse As-Is)

```typescript
// Source: src/core/runner.ts
const rowId = recordStep(job.id, stepIdx, command, args, title);
await this.spawnAndWait(projectDir, command, args, title);
completeStep(rowId, 'completed', null, null, sessionId ?? null);
advanceStep(job.id);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Milestones fan out into child jobs (`spawnChildJobs`) | Intent-based milestone loop + re-delegation (`milestoneLoop`) | Phase 66 + quick-041 decisions | Runner now expects milestone lifecycle decisions from delegate intent, not roadmap parsing |
| Milestone lifecycle ends at phase execution | Delegate can emit `audit-milestone`, but runner handler is still no-op | Current (`handleAuditMilestone` placeholder) | Phase 71 must close lifecycle with real audit/gap/complete orchestration |
| Timeout-heavy stuck handling | DB-grounded hung state (`hung-on-prompt`, `hung-on-tool`, `crashed`) | Phase 67 | Milestone interactive blockers can be caught immediately and handled deterministically |

**Deprecated/outdated:**

- Treating `new-milestone --auto` as reliable fully autonomous path (not safe for unattended runner flow).
- Assuming milestone completion notifications flow through standard job callback path (milestone jobs are currently skipped).

## Open Questions

1. **Does `gsd-plan-milestone-gaps --auto` suppress interactive confirmation in all environments?**
   - What we know: requirement asks to run `--auto`; workflow text still says "Wait for user confirmation".
   - What's unclear: whether mode/yolo or flag handling suppresses `question` tool consistently.
   - Recommendation: implement one guarded trial path; if `hung-on-prompt` occurs, escalate with clear operator guidance instead of looping.

2. **Which audit filename should runner prioritize?**
   - What we know: docs reference both `v{version}-MILESTONE-AUDIT.md` and `v{version}-v{version}-MILESTONE-AUDIT.md`.
   - What's unclear: which naming is actually produced in the target project runtime.
   - Recommendation: support both via glob, then select newest valid frontmatter file matching milestone/version.

3. **Should `tech_debt` trigger auto-completion or manual gate?**
   - What we know: audit workflow emits `tech_debt`; requirement says do not auto-archive with deferred gaps.
   - What's unclear: whether some teams want automatic completion when debt is low.
   - Recommendation: treat `tech_debt` as manual decision required in Phase 71 initial implementation.

## Sources

### Primary (HIGH confidence)

- `requirements/gsd-08-milestone-lifecycle.md` - required milestone lifecycle behavior and critical fixes
- `src/core/runner.ts` - intent routing, step recording, milestone loop, hung/retry handling, spawn lifecycle
- `src/core/db.ts` - job schema/migrations, reset/retry primitives, milestone status helpers
- `src/core/types.ts` - intent/job contracts and scope semantics
- `src/core/opencode-db.ts` - deterministic hung-on-prompt detection contract
- `src/prompts/delegate.md` - delegation rules for milestone scope and intent restrictions
- `.opencode/command/gsd-audit-milestone.md` - audit command contract and expected artifact
- `.opencode/command/gsd-plan-milestone-gaps.md` - gap-plan command contract
- `.opencode/command/gsd-complete-milestone.md` - completion command contract and preflight gating
- `pilot-gsd/get-shit-done/workflows/plan-phase.md` - documented decimal phase argument support
- `pilot-gsd/get-shit-done/bin/gsd-tools.cjs` - decimal-aware phase sorting and lookup behavior
- Context7 `/wiselibs/better-sqlite3/v12.6.2` - transaction semantics
- Context7 `/sindresorhus/execa` - detached process lifecycle options

### Secondary (MEDIUM confidence)

- `pilot-gsd/get-shit-done/workflows/audit-milestone.md` - detailed audit status/format behavior and known naming inconsistency
- `pilot-gsd/get-shit-done/workflows/plan-milestone-gaps.md` - operator confirmation behavior and gap grouping model
- `pilot-gsd/get-shit-done/workflows/complete-milestone.md` - yolo-mode gate bypass behavior for completion

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - versions and APIs verified from `package.json` and Context7 docs
- Architecture: MEDIUM - runner/DB patterns are clear, but upstream command non-interactive behavior has unresolved ambiguity
- Pitfalls: HIGH - directly observable from current code paths and contract mismatches

**Research date:** 2026-03-16
**Valid until:** 2026-03-23 (7 days; this area is actively evolving across adjacent phases)
