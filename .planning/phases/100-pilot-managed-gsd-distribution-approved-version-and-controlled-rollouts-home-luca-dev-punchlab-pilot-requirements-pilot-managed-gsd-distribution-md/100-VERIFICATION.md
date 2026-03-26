---
phase: 100-managed-gsd-distribution
verified: 2026-03-26T16:22:37Z
status: passed
score: 9/9 must-haves verified
---

# Phase 100: Managed GSD Distribution Verification Report

**Phase Goal:** Make Pilot manage GSD as an approved-version product surface with explicit version authority, safe setup/refresh/update semantics, visible project drift, and controlled fleet rollout reporting.
**Verified:** 2026-03-26T16:22:37Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pilot has one explicit approved GSD version that does not depend on incidental local package resolution | ✓ VERIFIED | `src/core/config.ts:205`, `src/commands/gsd-version.ts:14`, `src/core/managed-gsd.ts:146` |
| 2 | Pilot can read a project's installed GSD version and classify drift as matches, behind, ahead, or unknown | ✓ VERIFIED | `src/core/managed-gsd.ts:60`, `src/core/managed-gsd.ts:80`, `test/core/managed-gsd.test.ts:57` |
| 3 | Managed-project GSD state persists as first-class project metadata | ✓ VERIFIED | `src/core/types.ts:335`, `src/core/db.ts:139`, `src/core/db.ts:1943`, `test/core/db.test.ts:1413` |
| 4 | New project setup installs the approved GSD version instead of whatever version happens to be locally cached | ✓ VERIFIED | `src/core/setup.ts:120`, `src/core/setup.ts:153`, `src/core/setup.ts:272`, `test/core/setup.test.ts:281` |
| 5 | Refresh never silently downgrades ahead-of-approved projects during routine repair | ✓ VERIFIED | `src/core/setup.ts:216`, `src/core/setup.ts:218`, `test/core/setup.test.ts:316` |
| 6 | Update performs a controlled rollout and reports project-by-project results instead of a single opaque success/failure | ✓ VERIFIED | `src/commands/update.ts:33`, `src/commands/update.ts:60`, `src/commands/update.ts:153`, `test/commands/update.test.ts:330` |
| 7 | Operators can inspect and intentionally change the approved GSD version without accidentally rolling projects at the same time | ✓ VERIFIED | `src/commands/gsd-version.ts:13`, `src/commands/gsd-version.ts:33`, `src/index.ts:243`, `test/commands/gsd-version.test.ts:75` |
| 8 | Managed-project views show approved version, installed version, and drift state without requiring raw file inspection | ✓ VERIFIED | `src/commands/project.ts:178`, `src/commands/projects.ts:20`, `test/commands/project.test.ts:386` |
| 9 | Machine-readable command output exposes the same approved/install/drift data as human output | ✓ VERIFIED | `src/commands/setup.ts:66`, `src/commands/update.ts:153`, `src/commands/project.ts:181`, `src/commands/projects.ts:33`, `src/commands/gsd-version.ts:17` |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/config.ts` | explicit approved-version config resolution | ✓ VERIFIED | `approvedGsdVersion` resolves from `fileConfig?.gsd?.approvedVersion ?? '1.24.0'` at `src/core/config.ts:205` |
| `src/core/managed-gsd.ts` | authority, inspection, drift classification, runtime convergence, config persistence | ✓ VERIFIED | exports and substantive logic present at `src/core/managed-gsd.ts:20`, `src/core/managed-gsd.ts:60`, `src/core/managed-gsd.ts:80`, `src/core/managed-gsd.ts:142`, `src/core/managed-gsd.ts:158` |
| `src/core/db.ts` | project-level managed GSD metadata persistence | ✓ VERIFIED | schema columns at `src/core/db.ts:139` and writer at `src/core/db.ts:1943` |
| `test/core/managed-gsd.test.ts` | regression coverage for version validation, drift classification, VERSION reading, installer sync | ✓ VERIFIED | focused tests at `test/core/managed-gsd.test.ts:41`, `test/core/managed-gsd.test.ts:57`, `test/core/managed-gsd.test.ts:66`, `test/core/managed-gsd.test.ts:90` |
| `src/core/setup.ts` | approved-version-aware setup/refresh behavior with ahead safety | ✓ VERIFIED | runtime prep, pre-refresh inspect, ahead skip, and state persistence at `src/core/setup.ts:153`, `src/core/setup.ts:216`, `src/core/setup.ts:219`, `src/core/setup.ts:273` |
| `src/commands/setup.ts` | human and JSON setup reporting for approved/install/drift state | ✓ VERIFIED | output lines at `src/commands/setup.ts:66` and `src/commands/setup.ts:101` |
| `src/commands/update.ts` | controlled rollout behavior and per-project result reporting | ✓ VERIFIED | rollout classification and JSON contract at `src/commands/update.ts:19`, `src/commands/update.ts:61`, `src/commands/update.ts:153` |
| `test/core/setup.test.ts` | regression tests for fresh install, behind refresh, ahead skip, unknown handling | ✓ VERIFIED | managed-GSD setup tests at `test/core/setup.test.ts:265` |
| `test/commands/update.test.ts` | regression tests for blocked, ahead, behind, unknown, and failure rollout cases | ✓ VERIFIED | rollout tests at `test/commands/update.test.ts:302` |
| `src/commands/gsd-version.ts` | first-class approved-version show/set command surface | ✓ VERIFIED | show/set handlers at `src/commands/gsd-version.ts:13` and `src/commands/gsd-version.ts:33` |
| `src/commands/project.ts` | single-project approved/install/drift visibility | ✓ VERIFIED | live inspection and human/JSON fields at `src/commands/project.ts:178` and `src/commands/project.ts:191` |
| `src/commands/projects.ts` | fleet drift visibility in managed-project listings | ✓ VERIFIED | fleet inspection and JSON/human output at `src/commands/projects.ts:20` and `src/commands/projects.ts:33` |
| `test/commands/gsd-version.test.ts` | regression tests for approved-version show/set behavior | ✓ VERIFIED | command tests at `test/commands/gsd-version.test.ts:49` and `test/commands/gsd-version.test.ts:75` |
| `test/commands/project.test.ts` | regression tests for project/projects drift rendering and JSON payloads | ✓ VERIFIED | drift tests at `test/commands/project.test.ts:386` and `test/commands/project.test.ts:439` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/config.ts` | `src/core/managed-gsd.ts` | approved version passed as the source of truth | ✓ WIRED | `inspectProjectGsdState()` falls back to `getConfig().approvedGsdVersion` at `src/core/managed-gsd.ts:81` |
| `src/core/managed-gsd.ts` | `.opencode/get-shit-done/VERSION` | installed project version inspection | ✓ WIRED | VERSION path assembled and read at `src/core/managed-gsd.ts:83` and `src/core/managed-gsd.ts:86` |
| `src/core/db.ts` | `src/core/types.ts` | project managed-version fields round-trip through Project type | ✓ WIRED | row mapper writes `approvedGsdVersion` and related fields at `src/core/db.ts:294`; types declared at `src/core/types.ts:335` |
| `src/core/setup.ts` | `src/core/managed-gsd.ts` | approved-version resolution, installer convergence, project state inspection | ✓ WIRED | imported at `src/core/setup.ts:19`; called at `src/core/setup.ts:153`, `src/core/setup.ts:216`, `src/core/setup.ts:272` |
| `src/core/setup.ts` | `src/core/db.ts` | persist per-project managed GSD state after setup/refresh | ✓ WIRED | `updateProjectGsdState()` invoked at `src/core/setup.ts:220`, `src/core/setup.ts:273`, `src/core/setup.ts:282` |
| `src/commands/update.ts` | `src/core/managed-gsd.ts` | rollout classification before deciding update/skip/fail | ✓ WIRED | imported at `src/commands/update.ts:17`; used at `src/commands/update.ts:38`, `src/commands/update.ts:61`, `src/commands/update.ts:112` |
| `src/commands/gsd-version.ts` | `src/core/managed-gsd.ts` | approved-version inspection and intentional persistence | ✓ WIRED | used at `src/commands/gsd-version.ts:15` and `src/commands/gsd-version.ts:35` |
| `src/commands/project.ts` | `src/core/managed-gsd.ts` | live project version inspection feeding human and JSON output | ✓ WIRED | `inspectProjectGsdState()` called at `src/commands/project.ts:178` |
| `src/index.ts` | `src/commands/gsd-version.ts` | new CLI control surface registration | ✓ WIRED | command group and handlers registered at `src/index.ts:243` through `src/index.ts:257` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `src/core/managed-gsd.ts` | `installedVersion` | `.opencode/get-shit-done/VERSION` read at `src/core/managed-gsd.ts:83` | Yes — file content is parsed and classified, invalid/missing values become explicit `unknown` states | ✓ FLOWING |
| `src/core/setup.ts` | `result.gsd` / `currentGsdState` | `inspectProjectGsdState()` plus persisted DB update at `src/core/setup.ts:216` and `src/core/setup.ts:273` | Yes — live project VERSION re-read after installer and persisted via `updateProjectGsdState()` | ✓ FLOWING |
| `src/commands/update.ts` | `projectResults` | `inspectProjectGsdState()` + installer rerun + persisted post-install state | Yes — each project is inspected live and either skipped, updated, repaired, or failed with recorded state | ✓ FLOWING |
| `src/commands/project.ts` | `gsdState` | live `inspectProjectGsdState(resolvedPath)` at `src/commands/project.ts:178` | Yes — human and JSON output render live approved/install/drift/error fields | ✓ FLOWING |
| `src/commands/projects.ts` | `projectStates[*].gsd*` | `Promise.all(... inspectProjectGsdState(project.path))` at `src/commands/projects.ts:20` | Yes — fleet list renders live approved/install/drift/error values per project | ✓ FLOWING |
| `src/commands/gsd-version.ts` | `approvedVersion` / `runtimeVersion` | config plus runtime package inspection at `src/commands/gsd-version.ts:14` and `src/commands/gsd-version.ts:15` | Yes — command reports live policy/runtime state and persists explicit changes through `setApprovedGsdVersion()` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Approved-version surface returns machine-readable policy/runtime state | `node dist/index.js gsd-version --json` | Returned `approvedVersion`, `runtimeVersion`, `discoverySupported: false` | ✓ PASS |
| Fleet view exposes live approved/install/drift fields in JSON | `node dist/index.js projects --json` | Returned multiple projects including `ahead`, `matches`, and `unknown` drift states with timestamps/errors | ✓ PASS |
| Single-project view exposes live approved/install/drift fields in JSON | `node dist/index.js project "/home/luca/dev/punchlab/pilot" --json` | Returned `approvedGsdVersion: 1.24.0`, `installedGsdVersion: 1.28.0`, `gsdDriftStatus: ahead` | ✓ PASS |
| Managed-GSD regression suite remains green | `npx vitest run test/core/managed-gsd.test.ts test/core/db.test.ts test/core/setup.test.ts test/commands/setup.test.ts test/commands/update.test.ts test/commands/gsd-version.test.ts test/commands/project.test.ts --reporter=dot` | 7 files passed, 231 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| MGSD-01 | `100-01`, `100-03` | Pilot stores one explicit approved GSD version as an operator-controlled source of truth, independent of incidental `node_modules` state | ✓ SATISFIED | `src/core/config.ts:205`, `src/commands/gsd-version.ts:13`, `test/commands/gsd-version.test.ts:50` |
| MGSD-02 | `100-01` | Pilot detects each managed project's installed GSD version and classifies drift as `matches`, `behind`, `ahead`, or `unknown` | ✓ SATISFIED | `src/core/managed-gsd.ts:60`, `src/core/managed-gsd.ts:80`, `test/core/managed-gsd.test.ts:57` |
| MGSD-03 | `100-02` | `pilot setup` and `pilot setup --refresh` install or repair only against the approved-version contract and never silently downgrade ahead-of-approved projects | ✓ SATISFIED | `src/core/setup.ts:153`, `src/core/setup.ts:216`, `src/core/setup.ts:218`, `test/core/setup.test.ts:296` |
| MGSD-04 | `100-02` | `pilot update` converges Pilot's managed installer to the approved version and performs a controlled rollout across managed projects with per-project outcome reporting | ✓ SATISFIED | `src/commands/update.ts:38`, `src/commands/update.ts:61`, `src/commands/update.ts:153`, `test/commands/update.test.ts:314` |
| MGSD-05 | `100-03` | Pilot exposes approved version, installed version, and drift status in first-class operator surfaces and JSON output | ✓ SATISFIED | `src/commands/gsd-version.ts:17`, `src/commands/project.ts:191`, `src/commands/projects.ts:24`, spot-check JSON output |
| MGSD-06 | `100-01` | The supported GSD distribution model is explicit and approved-version-governed even if Pilot still uses `get-shit-done-cc` internally | ✓ SATISFIED | policy source in `src/core/config.ts:205`; controlled runtime convergence in `src/core/managed-gsd.ts:154`; tests in `test/core/managed-gsd.test.ts:104` |
| MGSD-07 | `100-01`, `100-02`, `100-03` | Regression tests cover approved-version install, refresh safety, rollout behavior, ahead/behind/unknown detection, and partial rollout failure | ✓ SATISFIED | targeted tests exist in `test/core/managed-gsd.test.ts`, `test/core/setup.test.ts`, `test/commands/update.test.ts`, `test/commands/gsd-version.test.ts`, `test/commands/project.test.ts`; 231/231 passed |

No orphaned Phase 100 requirements found in `.planning/REQUIREMENTS.md`; all seven IDs are claimed by plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| - | - | No blockers found in phase-touched files scanned for placeholders, stub returns, or hollow data paths | ℹ️ Info | No phase-specific anti-patterns detected |

### Human Verification Required

None. The phase goal is verifiable from code, tests, build, and read-only CLI spot-checks.

### Gaps Summary

No blocking gaps found. The codebase contains an explicit approved-version authority, real drift inspection and persistence, safe setup/refresh/update semantics that preserve ahead-of-approved projects, operator control/reporting surfaces, and regression coverage for the managed-GSD workflow.

---

_Verified: 2026-03-26T16:22:37Z_
_Verifier: the agent (gsd-verifier)_
