# Phase 70: Phase Auto-Retry on Verification Failure - Research

**Researched:** 2026-03-16
**Domain:** Runner-level phase retry orchestration after judge verification failure
**Confidence:** HIGH

## Summary

Phase 70 should extend the existing runner retry system, not create a second retry mechanism. The codebase already has persisted retry budget state (`retry_budget`, `retry_count`) and silent requeue behavior for hung sessions (`resetToPending` + `canRetry`). The missing piece is wiring judge failures (`fail`/`partial`) into the same retry path with strategy-aware behavior (`retry-resume` => gap closure, `retry-full` => full rerun).

Current behavior is intentionally manual: any non-pass judge outcome throws, the generic error path calls `markFailed()`, and `markFailed()` blocks the project immediately. That policy came from Phase 33 and now conflicts with `requirements/gsd-07-auto-retry.md`. Phase 70 must explicitly replace that policy for retryable verification outcomes while preserving project blocking when retry budget is exhausted.

The highest-leverage implementation is to add a typed retryable-verification error path in `runner.ts`, reuse existing DB retry counters, and persist retry strategy/hints so retries survive runner restarts. Also fix contract mismatches: `runJudge()` null currently gives benefit-of-doubt success, and `partial` with confidence >= 50 currently passes; both contradict gsd-07 requirements.

**Primary recommendation:** Implement judge-failure auto-retry as a first-class runner path (parallel to hung retry), with persisted strategy state, fingerprint-based same-failure escalation, and explicit `--gaps`/`--gaps-only` retry execution semantics.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `better-sqlite3` | `^12.6.2` | Persist retry state across attempts/restarts | Already the queue/job source of truth; supports atomic transactions for retry mutations |
| `execa` | `^9.5.0` | Spawn detached `opencode run` sessions for steps/judge | Existing runner lifecycle primitive; detached + cleanup=false already standardized |
| `get-shit-done-cc` | `~1.24.0` | Provides `gsd-plan-phase`/`gsd-execute-phase` gap-closure command contracts | Retry behavior depends on GSD flags (`--gaps`, `--gaps-only`) and VERIFICATION.md semantics |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `commander` | `^13.0.0` | Add CLI knobs (`pilot add --retries`, optional `--no-retry`) | Required for per-job retry budget policy |
| `vitest` | `^2.1.0` | Regression tests for retry decision logic and DB persistence | Mandatory for retry-loop safety and no-infinite-loop guarantees |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Requeue-based retries (`resetToPending`) | In-process recursive retry calls inside `handlePlanAndExecute()` | Recursive calls are simpler locally but weaker on crash recovery and restart continuity |
| Shared persisted retry counters | Ephemeral in-memory retry counters | In-memory counters are lost on restart and violate gsd-07 persistence requirements |
| Fingerprint comparison (`failureFingerprint`) | String diff of VERIFICATION.md content | Free-text diffs are noisy and unstable; fingerprint contract is explicitly required |

**Installation:**
```bash
npm install
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   ├── runner.ts          # judge decision + retry orchestration
│   ├── db.ts              # retry state persistence helpers and schema migration
│   ├── types.ts           # Job retry metadata types
│   └── judge-signal.ts    # verdict normalization for fail/partial/pass semantics
├── commands/
│   ├── add.ts             # --retries / --no-retry wiring
│   ├── info.ts            # attempt lineage display (Attempt N/M)
│   └── log.ts             # --chain retry attempt aggregation
└── index.ts               # CLI option registration
test/
├── core/
│   ├── runner.test.ts
│   └── db.test.ts
└── commands/
    ├── add.test.ts
    ├── info.test.ts
    └── log.test.ts
```

### Pattern 1: Typed Retryable Verification Error Path

**What:** Convert retryable judge outcomes into a dedicated error/branch, handled alongside hung-session retry logic (not generic `markFailed`).
**When to use:** `runJudgeAndHandleResult()` for `fail`/`partial` verdicts and null judge outcomes (per gsd-07 critical fix).
**Example:**
```typescript
// Source: repository pattern from src/core/runner.ts (HungSessionError branch)
if (isRetryableVerificationFailure(judgeVerdict)) {
  throw new RetryableVerificationError({
    phaseNumber,
    strategy: resolveRetryStrategy(judgeVerdict), // retry-resume | retry-full
    hint: judgeVerdict.retryHint ?? null,
    fingerprint: judgeVerdict.failureFingerprint ?? [],
  });
}
```

### Pattern 2: Persist-Then-Requeue Retry State

**What:** Increment retry counters and persist retry context before `resetToPending()` so restart resumes correctly.
**When to use:** Every automatic retry trigger (judge fail/partial/null and hung session).
**Example:**
```typescript
// Source: Context7 /wiselibs/better-sqlite3/v12.6.2 transaction pattern
const scheduleRetry = db.transaction((jobId: string, hint: string | null) => {
  incrementRetryCount(jobId);
  setRetryHint(jobId, hint);
  resetToPending(jobId, hint ?? undefined);
});
```

### Pattern 3: Strategy-Aware Retry Routing

**What:** Route retries based on judge recommendation and evidence validity.
**When to use:** Before launching the next attempt.
**Rules:**
- `retry-resume` + valid VERIFICATION.md -> `plan-phase --gaps` then `execute-phase --gaps-only`
- `retry-resume` + invalid/missing VERIFICATION.md -> force `retry-full`
- `retry-full` -> normal full `plan-and-execute`

### Pattern 4: Same-Failure Escalation via Fingerprint

**What:** Compare consecutive `failureFingerprint` arrays; exact match escalates immediately.
**When to use:** On every retryable verification failure before consuming remaining budget.
**Example:**
```typescript
// Source: requirement contract in requirements/gsd-07-auto-retry.md
if (sameFingerprint(prevFingerprint, currentFingerprint)) {
  // Do not burn retries on identical failure set
  throw new Error('Escalated: repeated verification fingerprint across consecutive attempts');
}
```

### Anti-Patterns to Avoid

- **Generic exception path for judge failures:** This immediately calls `markFailed()` and blocks projects, bypassing retry policy.
- **Confidence-threshold pass for `partial`:** Current `partial >= 50` pass behavior conflicts with gsd-07 fail/partial retry trigger.
- **Benefit-of-doubt on null judge verdict:** Current null => success behavior violates critical fix requiring retry-full semantics.
- **Non-persisted retry strategy:** If retry mode/hint only lives in memory, runner restart loses retry intent.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Atomic retry state changes | Ad-hoc multi-query mutation order | `better-sqlite3` transaction wrapper | Prevents partial state updates when process crashes between updates |
| Retry budget math | New custom counters per failure type | Existing `retry_budget` + `retry_count` + `canRetry()` | Already shared by hung-session retries; keep one budget contract |
| Gap-source parsing | Free-text markdown scraping | Existing VERIFICATION frontmatter gaps + judge `failureFingerprint` | Structured, deterministic, and already part of GSD verifier contract |
| Process relaunch mechanics | New subprocess orchestration layer | Existing `spawnAndWait()` + `resetToPending()` relaunch loop | Keeps lifecycle behavior consistent with hung retry flow |

**Key insight:** This phase is mostly policy wiring, not infrastructure invention. Reuse runner/db primitives and add explicit retry semantics at judge decision boundaries.

## Common Pitfalls

### Pitfall 1: Immediate Project Blocking on First Verification Failure

**What goes wrong:** Retryable judge failures fall into generic catch and call `markFailed()`.
**Why it happens:** No typed distinction between retryable verification failures and terminal errors.
**How to avoid:** Add a dedicated catch branch for retryable verification outcomes before generic error handling.
**Warning signs:** Failed jobs with `retry_count = 0` and blocked project on first fail/partial verdict.

### Pitfall 2: Retry Strategy Drift (`retry-resume` Not Actually Gap Closure)

**What goes wrong:** Retry recommendation says resume, but execution path does full rerun.
**Why it happens:** Runner relies on delegation alone; delegate prompt explicitly forbids emitting gap intents.
**How to avoid:** Runner must enforce strategy itself (`isGapClosure` and `--gaps-only` execution path).
**Warning signs:** Logs show `retry-resume` verdict but next attempt runs plain `execute-phase <N>` without gap flags.

### Pitfall 3: Infinite/Low-Value Retry Loops on Same Failure

**What goes wrong:** Same failing checks repeat across attempts until budget drains.
**Why it happens:** No fingerprint comparison before consuming retry budget.
**How to avoid:** Compare previous vs current `failureFingerprint`; escalate on exact repeat.
**Warning signs:** Repeated identical judge reasons and VERIFICATION gaps across consecutive attempts.

### Pitfall 4: Retry State Lost Across Runner Restart

**What goes wrong:** After restart, runner forgets pending retry context and takes wrong path.
**Why it happens:** Strategy/hint stored only in transient variables.
**How to avoid:** Persist retry strategy/hint/fingerprint lineage in job storage before requeue.
**Warning signs:** Pending retried jobs relaunch as first-attempt behavior after daemon restart.

### Pitfall 5: Attempt History Erased, Breaking `pilot log --chain`

**What goes wrong:** Reset-to-pending deletes `job_steps` and clears `session_titles`, removing prior attempts.
**Why it happens:** `resetToPending()` is optimized for clean current-state display, not lineage retention.
**How to avoid:** Add explicit attempt-history storage (archive table/columns) while preserving current live-step cleanliness.
**Warning signs:** `pilot info` shows higher attempts but `pilot log` only displays latest run sessions.

## Code Examples

Verified patterns from official sources:

### Atomic Transaction Wrapper for Retry Mutations

```typescript
// Source: Context7 /wiselibs/better-sqlite3/v12.6.2
const scheduleRetry = db.transaction((jobId: string, hint: string | null) => {
  incrementRetryCount(jobId);
  setRetryHint(jobId, hint);
  resetToPending(jobId, hint ?? undefined);
});
```

### Detached Spawn Behavior for Long-Running Sessions

```typescript
// Source: Context7 /sindresorhus/execa (detached + cleanup behavior)
const proc = execa(opencodeBin, opencodeArgs, {
  detached: true,
  cleanup: false,
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
});
proc.catch(() => {});
proc.unref();
```

### Current Failure Path That Must Be Split for Auto-Retry

```typescript
// Source: src/core/runner.ts
if (judgeVerdict === null) {
  // current behavior: benefit-of-doubt pass (must change for gsd-07)
  updateJudgeVerdict(job.id, JSON.stringify({ verdict: 'succeeded', confidence: 0, reason: 'judge unavailable' }));
} else if (judgeVerdict.verdict === 'succeeded' || judgeVerdict.verdict === 'pass') {
  updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
} else {
  updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
  throw new Error(judgeVerdict.reason); // currently routes to generic markFailed
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Manual-only phase failure recovery (`pilot retry` by operator) | Automatic retries for hung sessions only; verification failures still manual | Phase 33 + Phase 67 | Infrastructure exists for auto-retry, but verification path is not integrated |
| Judge output without retry metadata | Judge outputs `retryRecommendation`, `retryHint`, `failureFingerprint` | Phase 68 | Retry decision signals now exist and can drive policy |
| Multi-step delegation loop with command-specific hacks | Intent-based runner dispatch (`executeIntent`, `handlePlanAndExecute`) | Phase 66 | Cleaner insertion point for retryable verification branches |

**Deprecated/outdated:**

- Treating `partial` as pass by confidence threshold in runner logic for this phase's policy target.
- Benefit-of-doubt success on null judge verdict for this phase's policy target.

## Open Questions

1. **Should `partial` ever pass in Phase 70?**
   - What we know: current runner treats `partial`/`doubting` with confidence >= 50 as pass.
   - What's unclear: whether product wants to preserve this legacy behavior for backward compatibility.
   - Recommendation: for phase-scope jobs under auto-retry, treat all `partial` as retryable unless explicit override is introduced.

2. **Should retry-resume execute with `--gaps-only` after planning gaps?**
   - What we know: GSD docs describe gap cycle as `plan-phase --gaps` then `execute-phase --gaps-only`; current runner only appends `--gaps` to planning.
   - What's unclear: whether current upstream behavior safely avoids re-running non-gap plans without `--gaps-only`.
   - Recommendation: adopt `--gaps-only` in retry-resume path and test with mixed original/gap plans.

3. **How should attempt lineage be stored for `pilot log --chain`?**
   - What we know: `resetToPending()` clears `job_steps` and `session_titles` by design.
   - What's unclear: whether to archive attempts in new tables or preserve in-place with attempt indexing.
   - Recommendation: add a dedicated attempt-history layer; keep live tables focused on current attempt for existing UI behavior.

## Sources

### Primary (HIGH confidence)

- Repository code: `src/core/runner.ts` - judge decision logic, retry handling, spawn flow, gap flag wiring
- Repository code: `src/core/db.ts` - retry schema/state helpers, project blocking behavior, reset semantics
- Repository code: `src/core/types.ts` - Job retry fields and intent contracts
- Repository code: `src/prompts/judge.md` - retry recommendation/fingerprint contract
- Repository docs: `requirements/gsd-07-auto-retry.md` - Phase 70 requirement contract and critical fixes
- Repository docs: `requirements/managed-projects.md` - no-blind-retry baseline policy that this phase must supersede intentionally
- Repository docs: `pilot-gsd/get-shit-done/workflows/execute-phase.md` - gap closure execution contract (`--gaps` + `--gaps-only`)
- Context7: `/wiselibs/better-sqlite3/v12.6.2` - transaction semantics for atomic retry state updates
- Context7: `/sindresorhus/execa` - detached process lifecycle and non-throwing subprocess handling

### Secondary (MEDIUM confidence)

- Repository docs: `requirements/gsd-upstream-reference.md` - autonomous verification routing notes (`gaps_found` => retry with `--gaps`)
- Repository docs: `.planning/STATE.md` decision history (Phase 33/67/68 retry policy evolution)

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - directly verified from `package.json`, runtime imports, and Context7 API docs
- Architecture: MEDIUM - core runner structure is verified, but Phase 70 policy choices must resolve explicit legacy-policy conflicts
- Pitfalls: HIGH - directly observed in current code paths (`markFailed` block path, null-judge pass, history reset semantics)

**Research date:** 2026-03-16
**Valid until:** 2026-04-15 (30 days; this area is actively changing across adjacent phases)
