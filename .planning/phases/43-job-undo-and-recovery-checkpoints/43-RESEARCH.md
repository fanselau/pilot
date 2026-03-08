# Phase 43: Job Undo and Recovery Checkpoints - Research

**Researched:** 2026-03-07
**Domain:** Git-backed recovery checkpoints and safe job undo for Pilot
**Confidence:** MEDIUM

## Summary

Phase 43 should be implemented as a checkpoint-first recovery system on top of existing Pilot primitives (SQLite job metadata, serialized per-project runner, execa-based process execution). The safest and simplest MVP is to persist a per-job Git baseline commit before execution plus resulting HEAD commit after execution, then expose a guarded `pilot undo <job-id>` flow that only performs destructive reset when repository state is compatible.

The standard approach in Git tooling is: use porcelain status for script-safe dirty checks, use `rev-parse --verify` for commit validation, use `merge-base --is-ancestor` for ancestry safety gates, and use `reset --hard <base>` for deterministic rollback of tracked state. This matches the requirement to avoid auto-stash/auto-commit/worktree-isolation redesign and keeps behavior explicit.

Within this repo, implementation should be additive and migration-safe in `src/core/db.ts`, integrated into `src/core/runner.ts` preflight/finalization, wired through `src/commands/add.ts` and a new `src/commands/undo.ts`, and surfaced in `src/commands/status.ts`, `src/commands/info.ts`, and TUI detail rendering. Test coverage should emphasize safety gates and operator-facing messages, not just happy paths.

- Researched Git command semantics from official docs + Context7
- Mapped current Pilot modules that already own queueing, execution, and display
- Identified additive schema path consistent with existing migration pattern
- Defined safety model for dirty-start, newer-work refusal, and forced override
- Produced 3-chunk decomposition for planning

**Primary recommendation:** Implement `git_base_commit`/`git_head_commit` + dirty-start metadata in jobs, enforce clean-start preflight in runner, and make `pilot undo` a guarded `git reset --hard` flow with explicit `--dry-run` and `--force` behavior.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Git CLI | Docs current at 2.53.0 | Dirty-state checks, commit resolution, ancestry checks, rollback | Canonical source of truth for repo state and undo semantics |
| `execa` | `^9.5.0` | Execute git commands from Node/Bun | Already used heavily in runner/setup/update; consistent process handling |
| `better-sqlite3` | `^12.6.2` | Persist per-job checkpoint metadata in `pilot.db` | Existing queue/job storage layer; sync, deterministic API |
| `commander` | `^13.0.0` | CLI flags/command wiring (`--force-dirty`, `undo --dry-run/--force`) | Existing CLI framework in `src/index.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `@opentui/solid` | `^0.1.79` | Surface checkpoint/recovery state in TUI detail view | When showing per-job metadata in TUI |
| `vitest` | `^2.1.0` | Safety-path tests (dirty, no-commit, newer-work refusal, visibility) | All new command/core behavior tests |
| Node `fs/path` | Built-in | Existing file/path handling around project dirs | Keep parity with current code style |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| `execa` + native git CLI | `simple-git` npm wrapper | Extra dependency and abstraction; existing codebase already standardized on execa |
| `git reset --hard <base>` | Revert/cherry-pick sequence | Higher complexity/conflict surface; not minimal MVP |
| Additive `ALTER TABLE` list in `db.ts` | Full migration framework | Overkill for 3-5 nullable columns and current project conventions |

**Installation:**
```bash
npm install
```

## Architecture Patterns

### Recommended Project Structure

```text
src/
├── core/
│   ├── types.ts          # Job interface fields for recovery metadata
│   ├── db.ts             # schema + migrations + CRUD helpers
│   ├── runner.ts         # preflight dirty check + checkpoint capture
│   └── git-recovery.ts   # (new) shared git guard/check helpers
├── commands/
│   ├── add.ts            # --force-dirty flag and metadata persistence
│   ├── undo.ts           # (new) guarded undo command
│   ├── status.ts         # recovery state visibility
│   └── info.ts           # detailed checkpoint/undoability visibility
└── tui/
    └── views/detail.tsx  # recovery state in detail header
```

### Existing Modules To Modify

| Area | Files | Change |
| ---- | ----- | ------ |
| Schema + types | `src/core/types.ts`, `src/core/db.ts` | Add checkpoint fields + additive migrations + row mapping |
| Queue add path | `src/index.ts`, `src/commands/add.ts` | Add `--force-dirty` option and pass through to DB |
| Execution safety | `src/core/runner.ts` (plus optional `src/core/git-recovery.ts`) | Enforce clean-worktree preflight and capture base/head metadata |
| Undo command | `src/index.ts`, `src/commands/undo.ts` (new), `src/core/db.ts` helpers | Implement `pilot undo <job-id> [--dry-run] [--force]` |
| CLI visibility | `src/commands/status.ts`, `src/commands/info.ts` | Show checkpoint + dirty-start state |
| TUI visibility | `src/tui/views/detail.tsx` (optionally queue/completed panels) | Show checkpoint + dirty-start state |
| Docs/help | `README.md`, `src/tui/components/footer-bar.tsx`, `src/tui/components/help-overlay.tsx` | Add undo command and warning language consistency |
| Tests | `test/core/db.test.ts`, `test/commands/add.test.ts`, `test/commands/status.test.ts`, `test/tui/detail-header.test.ts`, new `test/commands/undo.test.ts`, new `test/commands/info.test.ts`, new `test/core/git-recovery.test.ts` | Cover all required paths and UI visibility |

### Pattern 1: Additive Recovery Metadata

**What:** Add small nullable fields to `jobs` for recovery checkpoints and dirty-start state.
**When to use:** Always for this phase; this is the minimum persistent contract needed for undo.
**Schema recommendation:**

| Field | Type | Default | Set When | Purpose |
| ----- | ---- | ------- | -------- | ------- |
| `git_base_commit` | `TEXT` | `NULL` | Runner preflight before delegate | Baseline commit to restore to |
| `git_head_commit` | `TEXT` | `NULL` | Runner finalization after execution | Resulting commit to compare against |
| `allow_dirty_start` | `INTEGER` (`0/1`) | `0` | `pilot add` | Records explicit `--force-dirty` intent |
| `started_dirty` | `INTEGER` (`0/1`) | `0` | Runner preflight | Records actual dirty-at-start state |

**Migration approach:**
- Update `CREATE TABLE` SQL for fresh DBs
- Append `ALTER TABLE ... ADD COLUMN ...` entries in `migrateSchema()` (same pattern as current columns)
- Keep new columns nullable/defaulted for backward compatibility with existing rows
- Map booleans in `rowToJob` using `row.field === 1`

**Example:**
```typescript
// Source: repo pattern in src/core/db.ts (additive ALTER with try/catch)
const migrations = [
  'ALTER TABLE jobs ADD COLUMN git_base_commit TEXT',
  'ALTER TABLE jobs ADD COLUMN git_head_commit TEXT',
  'ALTER TABLE jobs ADD COLUMN allow_dirty_start INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN started_dirty INTEGER NOT NULL DEFAULT 0',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch { /* already exists */ }
}
```

### Pattern 2: Runner Preflight + Checkpoint Capture

**What:** Before any job execution, check worktree cleanliness and capture baseline commit; after run, capture resulting HEAD.
**When to use:** In `Runner.launch(job)` before `delegate()` and again in completion/failure paths.
**Safety model decisions (recommended):**
- Default: dirty worktree at execution time is a hard refusal (actionable failure)
- Escape hatch: only jobs queued with `--force-dirty` may start dirty
- Dirty-start jobs are marked as weakened-recovery jobs (`started_dirty=1`)
- Repos with no commits are allowed to run, but checkpoint commit fields remain `NULL`

**Example:**
```typescript
// Source: https://git-scm.com/docs/git-status and https://git-scm.com/docs/git-rev-parse
const base = await resolveCommitOrNull(cwd, 'HEAD');
const dirty = await isWorktreeDirty(cwd); // porcelain check
if (dirty && !job.allowDirtyStart) {
  throw new Error(
    'Refusing to start job: worktree is dirty. Commit/stash/discard changes, or re-queue with --force-dirty.'
  );
}
updateRecoveryStart(job.id, { gitBaseCommit: base, startedDirty: dirty });

// ... execute job ...

const head = await resolveCommitOrNull(cwd, 'HEAD');
updateRecoveryHead(job.id, head);
```

### Pattern 3: Guarded Undo Pipeline

**What:** Undo is a deterministic rollback to `git_base_commit`, but only after explicit safety gates.
**When to use:** `pilot undo <job-id>` command path.
**Gate order (recommended):**
1. Load job and ensure terminal status with checkpoint metadata present
2. Resolve stored commits via `rev-parse --verify --quiet <sha>^{commit}`
3. Refuse destructive undo if current worktree dirty
4. Classify current HEAD relative to `git_head_commit` using `merge-base --is-ancestor`
5. Default-refuse when newer/diverged work exists; allow `--force` override
6. Default-refuse dirty-start jobs; allow `--force` override with explicit warning
7. `--dry-run`: show commit/file delta only; no reset
8. Execute undo via `git reset --hard <git_base_commit>`

**Example:**
```typescript
// Source: https://git-scm.com/docs/git-merge-base and https://git-scm.com/docs/git-reset
if (await isWorktreeDirty(cwd) && !opts.dryRun) {
  fail('Refusing undo: working tree is dirty. Commit/stash/discard changes first.');
}
if (currentHead !== job.gitHeadCommit && !opts.force) {
  fail('Refusing undo: newer or diverged work exists after this job. Re-run with --force to override.');
}
if (!opts.dryRun) {
  await execa('git', ['reset', '--hard', job.gitBaseCommit!], { cwd });
}
```

### Pattern 4: Metadata-First Visibility

**What:** Surface checkpoint state from DB fields in CLI/TUI without expensive per-row git calls.
**When to use:** `status`, `info`, and TUI detail rendering.
**Recommended display contract:**
- `status`: compact tag per job (`checkpoint`, `dirty-start`, `no-checkpoint`)
- `info`: explicit Recovery block (`base`, `head`, `started_dirty`, `undo readiness`)
- TUI detail header: one dedicated recovery line with short SHAs + warning state

### CLI UX / Copy Recommendations

- Dirty-start refusal (runner): `Refusing to start job <id>: repository has uncommitted changes. Commit/stash/discard changes, then 'pilot retry <id>', or re-queue with '--force-dirty'.`
- Dirty-start allowed warning: `Starting with dirty worktree (--force-dirty). Recovery guarantees are weakened for this job.`
- Undo dry-run header: `Would reset <project> from <head> to <base>.` + `Files affected:`
- Newer-work refusal: `Refusing undo: current HEAD is ahead of this job checkpoint. This would discard newer commits.`
- Dirty worktree refusal on undo: `Refusing undo: worktree is dirty. Commit/stash/discard local changes first.`
- Unresolvable commit failure: `Cannot resolve stored checkpoint commit <sha>. Undo is unavailable for this job.`

### Suggested Plan Decomposition (3 chunks)

1. **Data + preflight foundations**
   - DB/type schema fields and migrations
   - `pilot add --force-dirty` persistence
   - Runner clean-worktree preflight and base/head capture
2. **Undo command + safety engine**
   - New `pilot undo <job-id>` command with `--dry-run` and `--force`
   - Compatibility checks (dirty, newer work, commit resolution, dirty-start policy)
   - Error/warning copy and JSON output shape
3. **Visibility + docs + regression tests**
   - `status` / `info` / TUI checkpoint display
   - README/help updates
   - End-to-end coverage for clean/dirty/no-commit/dry-run/newer-work/refusal/visibility

### Anti-Patterns to Avoid

- **Parsing human `git status` output:** use porcelain format only for script stability.
- **Auto-stash/auto-commit to "help" undo:** explicitly out of scope and weakens operator trust.
- **Skipping ancestry checks:** comparing SHAs only misses diverged-history hazards.
- **Force behavior as default:** `--force` must be explicit for dangerous states.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Dirty-worktree detection | Regex parsing of long `git status` text | `git status --porcelain=v1` | Stable machine format across versions/config |
| Commit existence/type checks | SHA regex + assumptions | `git rev-parse --verify --quiet <rev>^{commit}` | Confirms object exists and is commit-ish |
| "Newer work" detection | Manual commit graph parsing | `git merge-base --is-ancestor` | Correct exit-code semantics for ancestry |
| Rollback implementation | Patch inversion or file-by-file restore | `git reset --hard <base>` | Deterministic tracked-state restoration |
| Migration framework for this phase | New migration subsystem | Existing additive `ALTER TABLE` list | Consistent with current codebase and minimal scope |

**Key insight:** This phase is mostly an orchestration/safety problem, not an algorithm problem; rely on Git plumbing commands and existing DB patterns rather than custom logic.

## Common Pitfalls

### Pitfall 1: Dirty check misses untracked files

**What goes wrong:** Runner starts job although repo has untracked changes.
**Why it happens:** Using tracked-only checks (`diff-index`) or human-form status parsing.
**How to avoid:** Use `git status --porcelain=v1 --untracked-files=normal` and treat non-empty output as dirty.
**Warning signs:** Users report "safe" jobs still lost local files or had mixed baseline.

### Pitfall 2: Missing HEAD commit treated as generic failure

**What goes wrong:** Jobs in new repos fail before execution.
**Why it happens:** Assuming `HEAD` always resolves.
**How to avoid:** Resolve baseline with `rev-parse --verify --quiet`; store `NULL` on no-commit repos and continue.
**Warning signs:** Preflight errors on freshly initialized repositories.

### Pitfall 3: Undo allowed while newer commits exist

**What goes wrong:** Undo destroys work that landed after the target job.
**Why it happens:** Checking only `job.id` recency or timestamp ordering.
**How to avoid:** Compare current HEAD vs job checkpoint head with ancestry checks; default-refuse when not exact-compatible.
**Warning signs:** Undo from older jobs unexpectedly rewinds unrelated commits.

### Pitfall 4: Dirty-start jobs shown as fully undo-safe

**What goes wrong:** UI suggests reliable rollback when job began from dirty state.
**Why it happens:** Storing only "force requested" or only commits, not actual dirty-at-start fact.
**How to avoid:** Persist both allow-intent and actual started-dirty booleans; gate undo accordingly.
**Warning signs:** Undo in dirty-start jobs discards pre-existing local edits.

### Pitfall 5: Commit references rot after history rewrite

**What goes wrong:** Undo crashes or silently does wrong thing when stored SHAs are gone.
**Why it happens:** No commit re-validation before reset.
**How to avoid:** Re-verify `git_base_commit` and `git_head_commit` at undo time with `rev-parse --verify --quiet`.
**Warning signs:** `fatal: bad object` during undo operations.

### Pitfall 6: Test fixtures drift after Job type expansion

**What goes wrong:** Many command/TUI tests fail due missing required `Job` fields.
**Why it happens:** Job fixtures in tests are hand-built and strict.
**How to avoid:** Update shared fixture factories first, then feature tests.
**Warning signs:** Type errors around `makeJob()` defaults and mock return shapes.

## Code Examples

Verified patterns from official sources:

### Clean-worktree preflight

```typescript
// Source: https://git-scm.com/docs/git-status (--porcelain for script parsing)
import { execa } from 'execa';

export async function isWorktreeDirty(cwd: string): Promise<boolean> {
  const { stdout } = await execa(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd },
  );
  return stdout.trim().length > 0;
}
```

### Resolve commit safely (or null)

```typescript
// Source: https://git-scm.com/docs/git-rev-parse (--verify, --quiet, ^{commit})
import { execa } from 'execa';

export async function resolveCommitOrNull(cwd: string, rev: string): Promise<string | null> {
  const result = await execa(
    'git',
    ['rev-parse', '--quiet', '--verify', '--end-of-options', `${rev}^{commit}`],
    { cwd, reject: false },
  );
  return result.exitCode === 0 ? result.stdout.trim() : null;
}
```

### Classify current HEAD vs checkpoint head

```typescript
// Source: https://git-scm.com/docs/git-merge-base (--is-ancestor exit codes)
import { execa } from 'execa';

async function isAncestor(cwd: string, a: string, b: string): Promise<boolean> {
  const result = await execa('git', ['merge-base', '--is-ancestor', a, b], {
    cwd,
    reject: false,
  });
  return result.exitCode === 0;
}

export async function classifyHeadRelation(cwd: string, checkpointHead: string, currentHead: string) {
  if (checkpointHead === currentHead) return 'exact';
  if (await isAncestor(cwd, checkpointHead, currentHead)) return 'newer-work-exists';
  if (await isAncestor(cwd, currentHead, checkpointHead)) return 'already-behind-checkpoint';
  return 'diverged';
}
```

### Show dry-run delta and perform undo

```typescript
// Source: https://git-scm.com/docs/git-diff and https://git-scm.com/docs/git-reset
import { execa } from 'execa';

export async function previewUndo(cwd: string, base: string, head: string): Promise<string> {
  const { stdout } = await execa('git', ['diff', '--name-status', `${base}..${head}`], { cwd });
  return stdout;
}

export async function applyUndo(cwd: string, base: string): Promise<void> {
  await execa('git', ['reset', '--hard', base], { cwd });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| No per-job Git checkpoint data | Persist base/head + dirty-start metadata per job | Phase 43 | Enables deterministic, inspectable recovery |
| Manual ad-hoc rollback by operator | First-class `pilot undo <job-id>` with dry-run and safety gates | Phase 43 | Reduces fear of autonomous jobs on real repos |
| Implicit start behavior on any worktree state | Clean-worktree default + explicit `--force-dirty` escape hatch | Phase 43 | Makes weakened guarantees explicit |

**Deprecated/outdated:**

- "Just run `git reset` manually" as the only recovery story: replaced by metadata-backed undo command.
- Parsing non-porcelain status for automation: replaced by script-safe porcelain checks.

## Open Questions

1. **Should dirty preflight refusal mark job failed+blocked or return to pending?**
   - What we know: current runner failure path (`markFailed`) blocks project by design.
   - What's unclear: desired operator UX for "refused start" vs "execution failure".
   - Recommendation: Use failed+blocked for MVP (strong safety signal), revisit if operators want softer retry semantics.

2. **Should failed jobs with valid checkpoints be undoable?**
   - What we know: requirements ask per-job undo and commit checkpoints; failed jobs may still create commits.
   - What's unclear: product intent for failed-but-mutating jobs.
   - Recommendation: Allow undo for any terminal job with valid checkpoints; message status clearly.

3. **How much dynamic undoability should `pilot status` compute?**
   - What we know: requirement asks checkpoint state visibility in status/detail and TUI.
   - What's unclear: whether status must compute live ancestry/dirty checks for each row.
   - Recommendation: Keep status lightweight (metadata tags only); do live compatibility checks in `pilot undo` and `pilot info <id>`.

## Sources

### Primary (HIGH confidence)

- `/git/git` (Context7) - `git-status`, `git-rev-parse`, `git-merge-base`, `git-reset` semantics for script-safe checks and undo behavior
- https://git-scm.com/docs/git-status - porcelain format stability and dirty-state parsing
- https://git-scm.com/docs/git-rev-parse - `--verify`, `--quiet`, `^{commit}`, `--end-of-options`
- https://git-scm.com/docs/git-merge-base - `--is-ancestor` exit code contract
- https://git-scm.com/docs/git-reset - `--hard` behavior and destructive implications
- https://git-scm.com/docs/git-diff - `--name-status` and endpoint diff semantics
- `src/core/db.ts` - additive migration and job row mapping pattern
- `src/core/runner.ts` - execution lifecycle insertion points for preflight/checkpoint capture
- `src/commands/add.ts`, `src/commands/status.ts`, `src/commands/info.ts`, `src/tui/views/detail.tsx` - current UX and module boundaries

### Secondary (MEDIUM confidence)

- None needed; primary sources covered all critical claims.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** - direct from `package.json` + official Git docs/Context7
- Architecture: **MEDIUM** - grounded in current codebase, with some product-behavior choices still open
- Pitfalls: **HIGH** - based on official Git command semantics and current repo patterns

**Research date:** 2026-03-07
**Valid until:** 2026-03-14 (fast-moving phase and active codebase)
