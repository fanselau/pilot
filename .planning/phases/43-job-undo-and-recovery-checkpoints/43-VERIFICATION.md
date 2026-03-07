---
phase: 43-job-undo-and-recovery-checkpoints
verified: 2026-03-07T23:21:50Z
status: passed
score: 16/16 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2455, error_summary: "" }
  tests: { pass: true, summary: "642 passed, 0 failed", duration_ms: 5988 }
  build: { pass: true, duration_ms: 2670, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 43: Job Undo and Recovery Checkpoints Verification Report

**Phase Goal:** Ship a conservative recovery MVP by recording per-job git checkpoints, enforcing clean-worktree execution by default, and adding guarded `pilot undo` with clear CLI/TUI safety visibility.
**Verified:** 2026-03-07T23:21:50Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Jobs persist checkpoint metadata with backward-compatible defaults | ✓ VERIFIED | `src/core/types.ts:112`, `src/core/db.ts:45`, `src/core/db.ts:228`, `test/core/db.test.ts:151` |
| 2 | `pilot add` stores `allowDirtyStart=false` by default and `true` with `--force-dirty` | ✓ VERIFIED | `src/index.ts:53`, `src/commands/add.ts:327`, `test/commands/add.test.ts:279`, `test/commands/add.test.ts:286` |
| 3 | Existing add behavior (`--force`, duplicate prevention, notify rules) remains intact | ✓ VERIFIED | `test/commands/add.test.ts:429`, `test/commands/add.test.ts:580`, `test/commands/add.test.ts:613` |
| 4 | Recovery fields are available in typed `Job` usage across modules | ✓ VERIFIED | `src/core/types.ts:85`, `src/core/runner.ts:54`, `src/commands/status.ts:21`, `src/commands/info.ts:23` |
| 5 | Runner refuses dirty starts by default with actionable commit/stash + `--force-dirty` guidance | ✓ VERIFIED | `src/core/runner.ts:539`, `src/core/runner.ts:541`, `test/core/runner-recovery.test.ts:213` |
| 6 | Dirty starts are allowed when `allowDirtyStart=true` and marked as dirty-start | ✓ VERIFIED | `src/core/runner.ts:537`, `src/core/runner.ts:545`, `test/core/runner-recovery.test.ts:236` |
| 7 | Runner records base before execution and head after success/failure | ✓ VERIFIED | `src/core/runner.ts:535`, `src/core/runner.ts:707`, `src/core/runner.ts:723`, `src/core/runner.ts:1172` |
| 8 | No-commit repos do not crash checkpoint capture (null-safe) | ✓ VERIFIED | `src/core/git-recovery.ts:35`, `src/core/runner.ts:537`, `test/core/runner-recovery.test.ts:280` |
| 9 | `pilot undo <id> --dry-run` previews rollback scope without mutating git | ✓ VERIFIED | `src/commands/undo.ts:147`, `src/commands/undo.ts:174`, `test/commands/undo.test.ts:226` |
| 10 | Undo refuses dangerous defaults (missing/unresolvable checkpoints, newer/diverged work, dirty-start) | ✓ VERIFIED | `src/commands/undo.ts:57`, `src/commands/undo.ts:96`, `src/commands/undo.ts:121`, `src/commands/undo.ts:127`, `src/commands/undo.ts:137` |
| 11 | Undo safe path deterministically resets to stored base commit | ✓ VERIFIED | `src/commands/undo.ts:210`, `src/commands/undo.ts:237`, `test/commands/undo.test.ts:160` |
| 12 | `--force` explicitly overrides guarded-history and dirty-start paths with warnings | ✓ VERIFIED | `src/commands/undo.ts:133`, `src/commands/undo.ts:144`, `test/commands/undo.test.ts:208`, `test/commands/undo.test.ts:270` |
| 13 | Recovery state is visible in CLI status/info surfaces | ✓ VERIFIED | `src/commands/status.ts:188`, `src/commands/status.ts:267`, `src/commands/info.ts:438`, `test/commands/status.test.ts:137`, `test/commands/info.test.ts:134` |
| 14 | TUI detail header shows concise recovery metadata and safety state | ✓ VERIFIED | `src/tui/views/detail.tsx:92`, `src/tui/views/detail.tsx:176`, `src/tui/views/detail.tsx:555`, `test/tui/detail-header.test.ts:288` |
| 15 | States are explicit: safe / guarded / unavailable (including newer-work guard) | ✓ VERIFIED | `src/commands/status.ts:210`, `src/commands/status.ts:228`, `src/commands/status.ts:236`, `src/commands/info.ts:258`, `src/tui/views/detail.tsx:113` |
| 16 | Docs explain clean-default model, `--force-dirty` tradeoff, and guarded undo behavior | ✓ VERIFIED | `README.md:157`, `README.md:165`, `docs/GETTING-STARTED.md:403`, `docs/GETTING-STARTED.md:417` |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/types.ts` | Job recovery metadata type contract | ✓ VERIFIED | Exists; substantive (222 lines); wired via imports in `src/core/db.ts:16`, `src/core/runner.ts:54` |
| `src/core/db.ts` | Schema/migration + row mapping + recovery helpers | ✓ VERIFIED | Exists; substantive (1233 lines); wired by `src/commands/add.ts:14`, `src/core/runner.ts:23`, `src/commands/status.ts:11`, `src/commands/info.ts:11` |
| `src/commands/add.ts` | Queue-time `--force-dirty` intent capture | ✓ VERIFIED | Exists; substantive (379 lines); wired from `src/index.ts:60`; persists via `addJob(..., opts.forceDirty ?? false)` at `src/commands/add.ts:327` |
| `src/index.ts` | CLI wiring for `--force-dirty` and `undo` | ✓ VERIFIED | Exists; substantive (416 lines); wired to add/undo handlers at `src/index.ts:60` and `src/index.ts:138` |
| `src/core/git-recovery.ts` | Central git helper module | ✓ VERIFIED | Exists; substantive (103 lines); wired by `src/core/runner.ts:46`, `src/commands/undo.ts:4`, `src/commands/info.ts:13` |
| `src/core/runner.ts` | Preflight enforcement + checkpoint capture | ✓ VERIFIED | Exists; substantive (1518 lines); wired via CLI run in `src/index.ts:406` and `createRunner` export `src/core/runner.ts:1496` |
| `test/core/git-recovery.test.ts` | Git helper behavior coverage | ✓ VERIFIED | Exists; substantive (94 lines); executed in focused regression run (5 tests pass) |
| `test/core/runner-recovery.test.ts` | Runner preflight/checkpoint behavior coverage | ✓ VERIFIED | Exists; substantive (295 lines); executed in focused regression run (4 tests pass) |
| `src/commands/undo.ts` | Guarded undo with dry-run/force semantics | ✓ VERIFIED | Exists; substantive (244 lines); wired from `src/index.ts:138`; includes `git reset --hard` at `src/commands/undo.ts:210` |
| `test/commands/undo.test.ts` | Undo safety regressions | ✓ VERIFIED | Exists; substantive (334 lines); executed in focused regression run (15 tests pass) |
| `src/commands/status.ts` | Recovery visibility in status output | ✓ VERIFIED | Exists; substantive (359 lines); wired from `src/index.ts:69`; recovery map emitted at `src/commands/status.ts:267` |
| `src/commands/info.ts` | Detailed recovery metadata section | ✓ VERIFIED | Exists; substantive (556 lines); wired from `src/index.ts:91`; recovery analysis at `src/commands/info.ts:356` |
| `src/tui/views/detail.tsx` | TUI header recovery line | ✓ VERIFIED | Exists; substantive (729 lines); wired in TUI app at `src/tui/app.tsx:23` and `src/tui/app.tsx:323` |
| `README.md` | Release-facing recovery command docs | ✓ VERIFIED | Exists; substantive (523 lines); contains `pilot undo` + safety model at `README.md:165` |
| `docs/GETTING-STARTED.md` | Operator recovery workflow and troubleshooting | ✓ VERIFIED | Exists; substantive (754 lines); contains clean-default + refusal matrix at `docs/GETTING-STARTED.md:403` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `src/commands/add.ts` | Commander `--force-dirty` option wiring | ✓ WIRED | Option declared at `src/index.ts:53`, passed to add action at `src/index.ts:61` |
| `src/commands/add.ts` | `src/core/db.ts` | `addJob(..., allowDirtyStart)` | ✓ WIRED | DB call includes `opts.forceDirty ?? false` at `src/commands/add.ts:327` |
| `src/core/db.ts` | `src/core/types.ts` | `rowToJob` boolean mapping | ✓ WIRED | `allow_dirty_start`/`started_dirty` mapped at `src/core/db.ts:201` |
| `src/core/runner.ts` | `src/core/git-recovery.ts` | Preflight dirty check + commit capture | ✓ WIRED | Uses `isGitWorktree`, `isWorktreeDirty`, `resolveCommitOrNull` at `src/core/runner.ts:528` |
| `src/core/runner.ts` | `src/core/db.ts` | `updateJobRecoveryStart` / `updateJobRecoveryHead` | ✓ WIRED | Start persisted at `src/core/runner.ts:537`; head persisted at `src/core/runner.ts:1172` |
| `src/index.ts` | `src/commands/undo.ts` | Commander action handler | ✓ WIRED | Dynamic import + call at `src/index.ts:138` |
| `src/commands/undo.ts` | `src/core/git-recovery.ts` | Relation checks + diff listing | ✓ WIRED | `classifyHeadRelation` and `listChangedFiles` at `src/commands/undo.ts:111` |
| `src/commands/undo.ts` | Git reset | Destructive rollback path | ✓ WIRED | `git reset --hard <base>` at `src/commands/undo.ts:210` |
| `src/commands/status.ts` | `src/core/types.ts` | Recovery tags from job fields | ✓ WIRED | Uses `gitBaseCommit` / `startedDirty` at `src/commands/status.ts:198` and `src/commands/status.ts:226` |
| `src/commands/info.ts` | `src/core/types.ts` | Recovery formatter + readiness guidance | ✓ WIRED | Uses `startedDirty` / `allowDirtyStart` at `src/commands/info.ts:251` and `src/commands/info.ts:290` |
| `src/tui/views/detail.tsx` | `test/tui/detail-header.test.ts` | Header contract assertions | ✓ WIRED | `buildHeaderLines` exported at `src/tui/views/detail.tsx:157`, asserted in tests at `test/tui/detail-header.test.ts:158` |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Baseline recording (base/head per job + delta detectability) | ✓ SATISFIED | None |
| Clean-worktree preflight at execution time | ✓ SATISFIED | None |
| `pilot add --force-dirty` explicit escape hatch + persisted metadata | ✓ SATISFIED | None |
| Guarded `pilot undo` with `--dry-run` and `--force` | ✓ SATISFIED | None |
| Safety rules for newer/diverged/dirty-start paths | ✓ SATISFIED | None |
| CLI + TUI recovery visibility (safe/guarded/unavailable) | ✓ SATISFIED | None |
| Docs and regression verification coverage | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | - | No TODO/FIXME/placeholder stub patterns in touched source/docs | ℹ️ Info | No blockers detected |

### Human Verification Required

No blocking human-only checks remain for structural goal verification.

Notes:
- This is a CLI project (no browser route verification required).
- Optional manual smoke test: run `pilot undo <id> --dry-run` and `pilot undo <id>` on a disposable git repo to observe end-to-end git behavior with real commits.

### Gaps Summary

No goal-blocking gaps found. Phase 43 must-haves are implemented, wired, covered by focused tests, and validated by full-suite/build/typecheck passes.

---

_Verified: 2026-03-07T23:21:50Z_
_Verifier: Claude (gsd-verifier)_
