---
phase: 60-remove-dirty-guard-blocking-entirely-only-real-failures-should-block-projects
verified: 2026-03-13T13:06:00Z
status: gaps_found
score: 10/11 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2780, error_summary: "" }
  tests: { pass: true, summary: "940 passed, 0 failed", duration_ms: 14198 }
  build: { pass: true, duration_ms: 2814, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "Stale dirty-guard messaging remains in operator flows (`pilot undo --help` and TUI detail recovery header still describe dirty-start as guarded/refusal)."
gaps:
  - truth: "No stale dirty-guard messaging remains in operator flows"
    status: failed
    reason: "Two user-facing surfaces still present dirty-start as a guard condition even though runtime behavior is informational-only."
    artifacts:
      - path: "src/index.ts"
        issue: "`pilot undo --help` still says `--force` overrides dirty-start safety refusals."
      - path: "src/tui/views/detail.tsx"
        issue: "`buildRecoveryHeader()` still renders `Recovery: guarded (dirty-start)` when `job.startedDirty` is true."
    missing:
      - "Update undo CLI option text to remove dirty-start refusal language"
      - "Change dirty-start recovery header state/message to informational (not guarded)"
      - "Add regression tests for dirty-start messaging in help/header surfaces"
---

# Phase 60: Remove Dirty-Guard Blocking Entirely; Only Real Failures Should Block Projects Verification Report

**Phase Goal:** Remove dirty-guard blocking behavior completely - dirty worktrees no longer block job launch or create blocked-project status. Delete the provenance-aware dirty classification system, `--force-dirty` flag, and `ProjectDirtyBaseline` infrastructure. Keep `startedDirty` as informational metadata only. Only real failures (build/execution/verification) block projects.
**Verified:** 2026-03-13T13:06:00Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Runner does not refuse to start a job because the worktree is dirty | VERIFIED | Preflight records dirty state (`src/core/runner.ts:549`, `src/core/runner.ts:550`) and has no dirty-start refusal branch; launch blocking checks are non-git/conflict only. |
| 2 | Runner still refuses to start when project is not a git worktree (real error) | VERIFIED | Explicit hard failure remains at `src/core/runner.ts:542`-`src/core/runner.ts:545`. |
| 3 | Runner still captures gitBaseCommit and startedDirty as informational metadata | VERIFIED | `resolveCommitOrNull` + `isWorktreeDirty` feed `updateJobRecoveryStart` at `src/core/runner.ts:548`-`src/core/runner.ts:550`; persisted via `src/core/db.ts:757`. |
| 4 | The `--force-dirty` flag no longer exists | VERIFIED | `add` command options contain no `--force-dirty` (`src/index.ts:45`-`src/index.ts:59`); `node dist/index.js add --help` output has no `--force-dirty`. |
| 5 | `ProjectDirtyBaseline` type and table are removed | VERIFIED | No `ProjectDirtyBaseline`/`project_dirty_baselines` symbols in `src/`; current schema in `src/core/db.ts:35`-`src/core/db.ts:62` has no baseline table. |
| 6 | `classifyDirtyStart` is deleted from git-recovery.ts | VERIFIED | `src/core/git-recovery.ts` exports only `isGitWorktree`, `isWorktreeDirty`, `detectGitConflictState`, `resolveCommitOrNull`, `classifyHeadRelation`, `listChangedFiles` (`src/core/git-recovery.ts:180`-`src/core/git-recovery.ts:187`). |
| 7 | Undo does not block on startedDirty - warns but proceeds | VERIFIED | Dirty-start is warning-only at `src/commands/undo.ts:137`-`src/commands/undo.ts:139`; blocking checks are current dirty worktree/history guards (`src/commands/undo.ts:115`, `src/commands/undo.ts:121`, `src/commands/undo.ts:127`). |
| 8 | Status no longer shows `undo:guarded-dirty-start` tag | VERIFIED | Recovery tag mapping includes safe/newer-work/diverged/unavailable only in `src/commands/status.ts:205`-`src/commands/status.ts:241`; no dirty-start tag path exists. |
| 9 | Info no longer shows dirty-start as a blocking recovery reason | VERIFIED | Recovery reasons exclude dirty-start in `src/commands/info.ts:82`-`src/commands/info.ts:92`; no startedDirty guard branch in recovery decision logic (`src/commands/info.ts:383`-`src/commands/info.ts:412`). |
| 10 | All tests pass with dirty-guard blocking behavior removed | VERIFIED | `npm test` passes: 48 files, 940 tests, 0 failures. |
| 11 | No stale dirty-guard messaging remains in operator flows | FAILED | Stale guard messaging remains in `src/index.ts:149` (`dirty-start safety refusals`) and `src/tui/views/detail.tsx:132` (`Recovery: guarded (dirty-start)`). |

**Score:** 10/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/runner.ts` | Dirty-guard-free job launch, real-error guards preserved | VERIFIED | Exists (1556 lines), substantive preflight logic, wired to git/db recovery metadata and conflict/non-git checks. |
| `src/core/git-recovery.ts` | Git utilities without dirty-start classification | VERIFIED | Exists (187 lines), no `classifyDirtyStart`; exports only retained functions. |
| `src/core/types.ts` | Job metadata keeps `startedDirty`; no `allowDirtyStart`/`ProjectDirtyBaseline` | VERIFIED | Exists (317 lines), `startedDirty` present (`src/core/types.ts:128`), removed dirty baseline type. |
| `src/core/db.ts` | No dirty baseline persistence; no `allow_dirty_start` plumbing | VERIFIED | Exists (1381 lines), `jobs` schema has `started_dirty` but no `allow_dirty_start`; no baseline table/functions. |
| `src/commands/undo.ts` | Started-dirty is informational only | VERIFIED | Exists (238 lines), warning-only behavior for started-dirty; no refusal branch on started-dirty. |
| `src/core/job-introspection.ts` | No `undo-guarded-dirty-start` codepath | VERIFIED | Exists (304 lines), undo codes are safe/newer/diverged/unavailable/no-op only. |
| `src/commands/status.ts` | No `undo:guarded-dirty-start` presentation path | VERIFIED | Exists (419 lines), recovery tag mapping is aligned to remaining undo codes. |
| `src/commands/info.ts` | Dirty start not treated as blocking reason | VERIFIED | Exists (754 lines), dirty-start retained as metadata display field; not part of guarded reason logic. |
| `src/index.ts` | No `--force-dirty` add flag and no stale dirty-start refusal messaging | PARTIAL | Add flag removed, but undo `--force` help text still claims dirty-start refusal override (`src/index.ts:149`). |
| `src/tui/views/detail.tsx` | Dirty start shown as informational only in recovery header | FAILED | `buildRecoveryHeader` still maps `startedDirty` to guarded state (`src/tui/views/detail.tsx:130`-`src/tui/views/detail.tsx:134`). |
| `test/core/git-recovery.test.ts` | Tests cover retained git-recovery API surface only | VERIFIED | Exists (153 lines), tests pass and match retained functions. |
| `test/core/runner-recovery.test.ts` | Tests encode dirty-start non-blocking launch behavior | VERIFIED | Exists (383 lines), explicit test at `test/core/runner-recovery.test.ts:282` verifies launch on dirty worktree and metadata recording. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/runner.ts` | `src/core/git-recovery.ts` | import + preflight calls | WIRED | Imports retained git helpers (`src/core/runner.ts:46`-`src/core/runner.ts:51`) and uses them in launch preflight (`src/core/runner.ts:541`-`src/core/runner.ts:553`). |
| `src/core/runner.ts` | `src/core/db.ts` | `updateJobRecoveryStart` | WIRED | Metadata write call at `src/core/runner.ts:550` matches DB updater at `src/core/db.ts:757`. |
| `src/commands/undo.ts` | `src/core/git-recovery.ts` | undo guard evaluation + warning path | WIRED | Undo uses git relation/dirty checks for real guards and leaves started-dirty as warning only (`src/commands/undo.ts:111`-`src/commands/undo.ts:139`). |
| `src/commands/status.ts` | `src/core/job-introspection.ts` | `buildUndoWhy()` tag mapping | WIRED | Status maps current undo codes only (`src/commands/status.ts:205`-`src/commands/status.ts:241`). |
| `src/tui/views/detail.tsx` | phase goal (dirty-start informational only) | recovery header mapping | NOT_WIRED | Header still marks dirty-start as guarded (`src/tui/views/detail.tsx:132`), contradicting informational-only goal. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Phase 60 mapped requirements in `.planning/REQUIREMENTS.md` | N/A | `REQUIREMENTS.md` is not present in this repository, so no additional phase-mapped requirement rows could be evaluated. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/index.ts` | 149 | Stale operator messaging (`dirty-start safety refusals`) | WARN | Help text conflicts with implemented behavior; can mislead operators about current undo semantics. |
| `src/tui/views/detail.tsx` | 132 | Stale guarded classification (`Recovery: guarded (dirty-start)`) | BLOCKER | UI still treats dirty-start as guard condition, violating phase goal that dirty-start is informational only. |

### Human Verification Required

No additional human-only checks are required to establish this verdict. The blocking gap is code-level and directly observable from source.

### Gaps Summary

Core behavioral removal is implemented: runner launch no longer blocks on dirty worktrees, legacy dirty-baseline infrastructure is deleted, and automated checks/tests are green. However, the phase goal is not fully achieved because operator-facing messaging still describes dirty-start as guarded/refusal behavior in two surfaces (`undo --help` text and TUI detail recovery header). This leaves user-visible dirty-guard semantics in place despite the underlying runtime policy change.

---

_Verified: 2026-03-13T13:06:00Z_
_Verifier: Claude (gsd-verifier)_
