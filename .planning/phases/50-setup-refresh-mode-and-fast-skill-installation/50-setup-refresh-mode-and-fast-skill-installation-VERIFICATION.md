---
phase: 50-setup-refresh-mode-and-fast-skill-installation
verified: 2026-03-09T11:57:17Z
status: passed
score: 12/12 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2663, error_summary: "" }
  tests: { pass: true, summary: "835 passed, 0 failed", duration_ms: 15328 }
  build: { pass: true, duration_ms: 2980, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 50: Setup Refresh Mode and Fast Skill Installation Verification Report

**Phase Goal:** Add `--refresh` flag to `pilot setup` that re-links symlinks, merges opencode.json with latest template, and re-offers skills/AGENTS.md. Parallelize skill installation to complete in under 10 seconds for typical projects.
**Verified:** 2026-03-09T11:57:17Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `setupProject` with refresh deletes and re-creates symlinks pointing to current `gsdDir` | ✓ VERIFIED | Refresh branch unlinks + re-symlinks at `src/core/setup.ts:156` and `src/core/setup.ts:160`; refresh symlink test passes at `test/core/setup.test.ts:189`. |
| 2 | `setupProject` with refresh deep-merges template into existing `opencode.json` without overwriting user values | ✓ VERIFIED | `deepMerge` preserves target keys at `src/core/setup.ts:50` and `src/core/setup.ts:62`; refresh merge path writes merged JSON at `src/core/setup.ts:251`; merge-preserves-custom-value test at `test/core/setup.test.ts:214`. |
| 3 | `setupProject` without refresh keeps previous behavior (backward compatible) | ✓ VERIFIED | Non-refresh symlink/config paths still skip existing items (`src/core/setup.ts:167`, `src/core/setup.ts:259`); explicit non-refresh regression test at `test/core/setup.test.ts:290`. |
| 4 | `bootstrapDefaultSkills` runs installs concurrently with a 4-6 limit | ✓ VERIFIED | Concurrency helper at `src/core/default-skills.ts:248`; invoked with limit `5` at `src/core/default-skills.ts:333`; concurrency test at `test/core/default-skills.test.ts:566`. |
| 5 | `bootstrapDefaultSkills` calls `syncManifest` once after all installs (not per-install) | ✓ VERIFIED | Single post-batch sync at `src/core/default-skills.ts:349`; no per-install sync in install task loop (`src/core/default-skills.ts:322` to `src/core/default-skills.ts:345`); one-call assertions at `test/core/default-skills.test.ts:594` and `test/core/default-skills.test.ts:396`. |
| 6 | Already-installed skills are skipped before `npx install` | ✓ VERIFIED | Pre-filter via `loadManifest` + `installedNames` at `src/core/default-skills.ts:302`; skipped skills excluded from task list at `src/core/default-skills.ts:315`; skip test at `test/core/default-skills.test.ts:604`. |
| 7 | `pilot setup --refresh` re-links symlinks, merges `opencode.json`, re-offers skills/AGENTS.md | ✓ VERIFIED | CLI flags registered in `src/index.ts:188`; refresh options passed through in `src/commands/setup.ts:56`; skill + AGENTS offer sections still run when not `skipSkills` at `src/commands/setup.ts:125` and `src/commands/setup.ts:179`; core refresh behavior in `src/core/setup.ts:156` and `src/core/setup.ts:240`. |
| 8 | `pilot setup --refresh --force` regenerates `opencode.json` from scratch | ✓ VERIFIED | `--force` CLI option in `src/index.ts:189`; forwarded in `src/commands/setup.ts:56`; force-overwrite branch writes template at `src/core/setup.ts:243`. |
| 9 | `pilot setup --refresh --skip-skills` refreshes config without re-offering skills | ✓ VERIFIED | Refresh still executes via `setupProject` call at `src/commands/setup.ts:57`; skill and AGENTS re-offers are gated by `!opts.skipSkills` at `src/commands/setup.ts:125` and `src/commands/setup.ts:179`. |
| 10 | `pilot setup` without `--refresh` works as before | ✓ VERIFIED | Setup command only passes refresh options when `opts.refresh` is true at `src/commands/setup.ts:56`; default setup command regression tests pass (`test/commands/setup.test.ts` with 12/12 passing). |
| 11 | Refresh mode shows a summary of what changed | ✓ VERIFIED | Structured refresh summary (`Refreshed:` + filtered entries) implemented at `src/commands/setup.ts:64`; refreshed/merged/force entries are surfaced from `result.created`. |
| 12 | Parallel bootstrap tests verify concurrency and single `syncManifest` call | ✓ VERIFIED | Dedicated test block exists in `test/core/default-skills.test.ts:565` with concurrency assertion at `test/core/default-skills.test.ts:566` and single-sync assertion at `test/core/default-skills.test.ts:594`; targeted run: `57/57` tests passed. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/setup.ts` | Refresh symlink + merge/force config logic | VERIFIED | Exists (477 lines), substantive implementation (`OPENCODE_JSON_TEMPLATE`, `deepMerge`, refresh branches), exported core API at `src/core/setup.ts:476`. |
| `src/core/default-skills.ts` | Parallel bootstrap with skip + single sync | VERIFIED | Exists (396 lines), includes `runWithConcurrency`, pre-skip manifest logic, post-batch sync/tag flow. |
| `src/commands/setup.ts` | CLI refresh/force/skip-skills wiring + summary output | VERIFIED | Exists (232 lines), wires options to core + human-facing refresh summary + skip gating for offers. |
| `src/index.ts` | Setup command flag registration | VERIFIED | Exists (519 lines), registers `--refresh`, `--force`, `--skip-skills` and forwards typed opts to `setupCommand`. |
| `test/core/setup.test.ts` | Refresh-mode core setup tests | VERIFIED | Exists (311 lines), contains 5 refresh-specific tests including symlink refresh, merge, force overwrite, no-data-loss, and non-refresh compatibility. |
| `test/core/default-skills.test.ts` | Parallel bootstrap tests (concurrency + single sync) | VERIFIED | Exists (684 lines), includes dedicated parallel execution describe block with required assertions. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `src/commands/setup.ts` | Commander options + action call | WIRED | Options added at `src/index.ts:188` and forwarded to `setupCommand` at `src/index.ts:195`. |
| `src/commands/setup.ts` | `src/core/setup.ts` | `setupProject(dir, setupOpts)` | WIRED | Import at `src/commands/setup.ts:13`, refresh/force option assembly at `src/commands/setup.ts:56`, call at `src/commands/setup.ts:57`. |
| `src/core/setup.ts` | `opencode.json` | deep-merge or force-overwrite write path | WIRED | Merge path at `src/core/setup.ts:251`; force path at `src/core/setup.ts:245`; non-refresh skip preserved at `src/core/setup.ts:260`. |
| `src/core/setup.ts` | `.opencode/*` symlinks | `unlink` + `symlink` in refresh mode | WIRED | Refresh relink occurs at `src/core/setup.ts:159` and `src/core/setup.ts:160`; real-dir safety skip at `src/core/setup.ts:171`. |
| `src/core/default-skills.ts` | `execa('npx skills install ...')` | Concurrency-limited task pool | WIRED | Install thunks at `src/core/default-skills.ts:322`; batch execution with limit 5 at `src/core/default-skills.ts:333`. |
| `src/core/default-skills.ts` | `syncManifest` + `tagSkill` | Single post-batch sync then tagging | WIRED | One sync at `src/core/default-skills.ts:349`; tag loop follows at `src/core/default-skills.ts:352`; ordering test at `test/core/default-skills.test.ts:626`. |
| `src/core/default-skills.ts` | `loadManifest` pre-check | Skip already-installed before task creation | WIRED | Manifest load at `src/core/default-skills.ts:302`, skip increment at `src/core/default-skills.ts:312`, excluded from installs by task construction. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Phase 50 must-haves from plan frontmatter + user-provided verification checklist | ✓ SATISFIED | None |
| `.planning/REQUIREMENTS.md` phase mapping | N/A | `.planning/REQUIREMENTS.md` is not present; verification used phase plans + roadmap goal + explicit must-have list. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/core/setup.ts` | - | None detected (`TODO/FIXME/placeholder/empty impl` scan) | INFO | No stub indicators in refresh logic. |
| `src/core/default-skills.ts` | - | None detected (`TODO/FIXME/placeholder/console-only` scan) | INFO | No stub indicators in bootstrap logic. |
| `src/commands/setup.ts` | - | None detected (`TODO/FIXME/placeholder/empty handler` scan) | INFO | No stub indicators in CLI wiring. |
| `src/index.ts` | 457 | Existing help text contains "coming soon" for unrelated `lessons --approve` option | INFO | Not part of phase 50 behavior; no impact on refresh/bootstrap goal. |

### Human Verification Required

No human-only checks are required to confirm the 12 must-haves above.
Optional manual validation: run `pilot setup <dir> --refresh` in a real project and time skill bootstrap over live network to confirm the "<10s typical" performance target under your environment.
Browser verification is not applicable (CLI project, no web routes/UI).

### Gaps Summary

No gaps found against the declared phase 50 must-haves. Refresh mode logic, CLI flag wiring, and parallel bootstrap behavior all exist, are substantive, and are wired end-to-end, with targeted and full test suites passing.

---

_Verified: 2026-03-09T11:57:17Z_
_Verifier: Claude (gsd-verifier)_
