---
phase: 260321-tdm
plan: 01
type: quick
subsystem: persistence, cli, runner
tags: [bugfix, sqlite, scope, migration, skipGracePeriod]
dependency_graph:
  requires: []
  provides: [debug-scope-insertion, fast-scope-insertion, scope-migration]
  affects: [src/core/db.ts, src/commands/add.ts, test/core/db-scope.test.ts]
tech_stack:
  added: []
  patterns: [sqlite-table-recreation-migration, scope-aware-skip-grace]
key_files:
  created:
    - test/core/db-scope.test.ts
  modified:
    - src/core/db.ts
    - src/commands/add.ts
decisions:
  - "Handle fast→skipGracePeriod at both addJob() level (db.ts) and add.ts, for defense-in-depth"
  - "migrateScopeConstraint() follows same pattern as migrateReviewStates() — table recreation with foreign_keys=off"
  - "Display message fix: fast scope shows '⚡ immediate' instead of 'waits for queue grace'"
metrics:
  duration: ~20m
  completed_date: "2026-03-21"
  tasks_completed: 3
  files_changed: 4
---

# Quick Task 260321-tdm: Fix Debug/Fast Scope Support End-to-End

**One-liner:** SQLite 5-scope CHECK constraint migration + migrateScopeConstraint() + fast→skipGracePeriod enforcement, with full test coverage and live runner verification.

## What Was Missing

The type system (`JobScope`), CLI, runner, delegate, and model layers all supported `debug` and `fast` scopes, but the SQLite persistence layer had a hardcoded 3-scope CHECK constraint:

```sql
scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone'))
```

This constraint appeared in **three places**:
1. `CREATE_TABLE_SQL` (line 53) — new database creation
2. `migrateReviewStates` migration table (line ~424) — existing mid-migration databases
3. The live database on disk (`~/.pilot/pilot.db`) — needed runtime migration

Any attempt to `pilot add ... --as fast` or `--as debug` failed at the SQLite insert with:
```
SQLiteError: CHECK constraint failed: scope IN ('quick', 'phase', 'milestone')
```

## What Was Fixed

### 1. `src/core/db.ts` — Schema and Migration

**CREATE_TABLE_SQL updated (5-scope CHECK):**
```sql
scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone', 'debug', 'fast'))
```

**migrateReviewStates migration table updated** to also use 5-scope CHECK, so databases in mid-migration correctly get the new constraint.

**New `migrateScopeConstraint()` function** modeled after `migrateReviewStates`:
- Reads `sqlite_master` for the jobs table SQL
- If already contains `'debug'` → return (already migrated)
- Otherwise: recreates table with 5-scope CHECK via `CREATE TABLE jobs_scope_migration ... INSERT ... DROP ... RENAME`
- Wraps in `foreign_keys = off/on` for safety
- Called from both `openPilotDb()` and `_getTestDb()`

**`addJob()` fast→skipGracePeriod enforcement:**
```typescript
(skipGracePeriod || scope === 'fast') ? 1 : 0,
```
Fast scope always gets `skip_grace_period=1` at the DB level — regardless of caller.

### 2. `src/commands/add.ts` — Scope-Aware Grace Period

Refactored the 4-branch `addJob()` call into 2 branches with unified `skipGrace`:
```typescript
const skipGrace = scope === 'fast' || opts.startImmediately === true;
```

Also fixed the display message so fast scope shows:
```
⚡ Start mode: immediate (fast scope) — skips queue grace, runner picks up immediately.
```

### 3. `test/core/db-scope.test.ts` — Regression Tests (NEW)

7 tests covering:
- `addJob scope='fast'` succeeds (no CHECK constraint error)
- `addJob scope='debug'` succeeds (no CHECK constraint error)
- Fast scope sets `skip_grace_period=1` automatically
- Debug scope does NOT auto-set `skip_grace_period` (stays 0)
- Existing scopes quick/phase/milestone still work after migration

### 4. `test/commands/add.test.ts` — Test Updates

Updated 17+ test expectations to reflect new `skipGrace` argument always being passed (was `undefined`; now `false` for non-fast, non-startImmediately calls).

## Rebuild / Restart

- `npm run build` → clean build, updated `dist/` with 5-scope constraint
- `systemctl --user restart pilot-runner` → runner restarted with new binary (active, PID confirmed)
- `systemctl --user is-active pilot-runner` → `active`

## Case Study Outcome

**Fast job (cuc0) — iOS Safari viewport-height:**
- Inserted: `pilot add /home/luca/dev/punchlab/pilot "use modern iOS Safari viewport-height..." --as fast --categories frontend`
- `pilot info cuc0 --json` shows: `scope=fast`, `skipGracePeriod=true`
- **Runner pickup confirmed:** job transitioned `pending → running` (startedAt: 2026-03-21 21:34:58)
- Visible in `pilot status` and history with `scope=fast`

**Debug job (gzk8):**
- Inserted: `pilot add ... --as debug --categories testing`
- `pilot info gzk8 --json` shows: `scope=debug`, `skipGracePeriod=false` (correct)
- Visible in `pilot status` queue

**Dry-run verification:**
- `pilot add ... --as debug --dry-run --categories testing` → dry-run output, no constraint error
- `pilot add ... --as fast --dry-run --categories testing` → dry-run output, no constraint error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test file had stale `_getTestDb()` call mid-test**
- **Found during:** Task 1 (RED phase)
- **Issue:** Initial test draft called `_getTestDb()` inside the test body which would reset the DB
- **Fix:** Rewrote test to use the `db` reference from `beforeEach`
- **Files modified:** `test/core/db-scope.test.ts`

**2. [Rule 1 - Bug] add.test.ts: 17+ tests expected old 11-arg addJob signature**
- **Found during:** Task 2 (full test suite run after GREEN phase)
- **Issue:** My refactoring now always passes `skipGrace` as 12th argument, breaking test expectations
- **Fix:** Added `false` to all 11-arg addJob expectations; changed `undefined` → `false` in 13-arg notify route expectations
- **Files modified:** `test/commands/add.test.ts`
- **Commit:** e7744d8

**3. [Rule 2 - Missing] Fast scope display message still said "waits for queue grace"**
- **Found during:** Task 2 (running real `pilot add --as fast`)
- **Issue:** Display message checked `opts.startImmediately` only; fast scope showed wrong message
- **Fix:** Added fast scope branch: `⚡ Start mode: immediate (fast scope)`
- **Files modified:** `src/commands/add.ts`
- **Commit:** 94a3683

### Out-of-Scope Pre-existing Issues (Logged, Not Fixed)

| Issue | File | Notes |
|-------|------|-------|
| `--no-categories` flag fails with TypeError when used as boolean | `src/commands/add.ts` | Pre-existing commander parsing issue |
| opencode-db.test.ts stale child test | `test/core/opencode-db.test.ts` | Pre-existing |
| runner-lock.test.ts 2 failures | `test/core/runner-lock.test.ts` | Pre-existing |
| shortcuts.test.ts 1 failure | `test/tui/shortcuts.test.ts` | Pre-existing |

## Self-Check

- [x] `test/core/db-scope.test.ts` — 7/7 tests pass
- [x] `test/commands/add.test.ts` — 55/55 tests pass
- [x] Full suite: 58/61 test files pass (3 pre-existing failures)
- [x] `npm run build` — clean exit
- [x] `systemctl --user is-active pilot-runner` — active
- [x] `pilot add --as fast` real job: inserted, scope=fast, skipGracePeriod=true
- [x] Runner pickup: cuc0 went pending → running (startedAt confirmed)
- [x] `pilot info cuc0` shows scope=fast

## Commits

| Hash | Message |
|------|---------|
| fac3f1e | `test(260321-tdm-01): add failing tests for debug/fast scope constraint` |
| 63e671c | `feat(260321-tdm-01): fix 5-scope CHECK constraint, migration, and fast→skipGracePeriod` |
| e7744d8 | `fix(260321-tdm-01): update add.test.ts expectations for refactored skipGrace arg` |
| 94a3683 | `feat(260321-tdm-02): rebuild, restart runner, verify fast/debug e2e` |
