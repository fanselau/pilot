---
phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration
verified: 2026-03-23T17:17:49Z
status: human_needed
score: 14/14 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 13/14
  gaps_closed:
    - "Debug jobs spawn gsd-debugger directly with debug-scope model selection (not judge scope)"
    - "All declared phase requirements (DBG-01..DBG-14) are accounted for in REQUIREMENTS.md"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run a real scope=debug job end-to-end with opencode"
    expected: "Debugger runs autonomously, handles checkpoint outcomes correctly, and does not route through judge/phase flow"
    why_human: "Automated checks use mocked opencode process and mocked session DB reads; live external process behavior still needs end-to-end confirmation"
---

# Phase 91: Pilot Debug Lane — Caller-Side Autonomous gsd-debugger Orchestration Verification Report

**Phase Goal:** Make Pilot debug jobs autonomous by directly spawning gsd-debugger with prefilled context from caller/runner logic, handling all debugger outcomes (ROOT CAUSE FOUND, DEBUG COMPLETE, INVESTIGATION INCONCLUSIVE, CHECKPOINT REACHED) autonomously, auto-continuing through human-verify checkpoints, and keeping the entire flow in a dedicated debug lifecycle that never touches phase-style judge logic.
**Verified:** 2026-03-23T17:17:49Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Debug jobs spawn gsd-debugger directly with debug-scope model selection (not judge scope) | ✓ VERIFIED | Debug flow spawns `debugger` with inline prompt (`src/core/runner.ts:1413`, `src/core/runner.ts:1560`); scope now resolves from `jobScope` first (`src/core/runner.ts:1910`, `src/core/runner.ts:1911`, `src/core/runner.ts:1914`); regression test asserts debug scope and not judge (`test/core/runner-debug-lane.test.ts:720`, `test/core/runner-debug-lane.test.ts:736`, `test/core/runner-debug-lane.test.ts:740`). |
| 2 | Debug sessions receive prefilled symptoms in inline prompt | ✓ VERIFIED | Prompt builder includes `<symptoms>` and `symptoms_prefilled: true` (`src/core/debug-lane.ts:37`, `src/core/debug-lane.ts:49`), and debug flow passes inline prompt to spawn (`src/core/runner.ts:1393`, `src/core/runner.ts:1413`). |
| 3 | Successful self-verified debug runs auto-continue through human-verify checkpoint | ✓ VERIFIED | Human-verify branch calls continuation (`src/core/runner.ts:1507`, `src/core/runner.ts:1510`) and integration test validates two spawns + completion (`test/core/runner-debug-lane.test.ts:563`). |
| 4 | Truly interactive checkpoints (human-action, decision) block with explicit reason | ✓ VERIFIED | Checkpoint branch marks review hold with diagnostic (`src/core/runner.ts:1514`, `src/core/runner.ts:1515`); tests cover human-action and decision branches (`test/core/runner-debug-lane.test.ts:587`, `test/core/runner-debug-lane.test.ts:604`). |
| 5 | Debug jobs never enter phase-style judge logic | ✓ VERIFIED | Launch short-circuits debug jobs before step loop (`src/core/runner.ts:840`, `src/core/runner.ts:841`), debug intent returns no steps (`src/core/runner.ts:1008`, `src/core/runner.ts:1012`), and tests assert no judge step/command (`test/core/runner-debug-lane.test.ts:685`, `test/core/runner-debug-lane.test.ts:697`). |
| 6 | Debug runs that self-verify successfully reach terminal success without manual intervention | ✓ VERIFIED | Continuation path marks completed (`src/core/runner.ts:1568`, `src/core/runner.ts:1572`) and integration test validates final completion (`test/core/runner-debug-lane.test.ts:563`). |
| 7 | Interactive question/mcp_question prompts no longer hang debug jobs | ✓ VERIFIED | Hung sessions are caught in debug flow and marked failed with explicit interactive-prompt reason (`src/core/runner.ts:1423`, `src/core/runner.ts:1428`); tested (`test/core/runner-debug-lane.test.ts:639`). |
| 8 | Runner debug flow is tested with mock opencode sessions | ✓ VERIFIED | Dedicated integration suite mocks opencode/session dependencies and runs through `runner.run()` (`test/core/runner-debug-lane.test.ts:183`, `test/core/runner-debug-lane.test.ts:398`, `test/core/runner-debug-lane.test.ts:438`). |
| 9 | All 4 debug outcome types trigger correct runner behavior | ✓ VERIFIED | Outcome switch handles `debug_complete`, `root_cause_found`, `investigation_inconclusive`, `checkpoint` (`src/core/runner.ts:1472`), with test coverage for each branch (`test/core/runner-debug-lane.test.ts:516`, `test/core/runner-debug-lane.test.ts:530`, `test/core/runner-debug-lane.test.ts:547`, `test/core/runner-debug-lane.test.ts:563`). |
| 10 | Autonomous continuation after human-verify checkpoint is tested | ✓ VERIFIED | Continuation behavior asserted in dedicated integration test (`test/core/runner-debug-lane.test.ts:563`). |
| 11 | Truly interactive checkpoint blocking is tested | ✓ VERIFIED | Explicit tests for human-action and decision review-hold behavior (`test/core/runner-debug-lane.test.ts:587`, `test/core/runner-debug-lane.test.ts:604`). |
| 12 | Hung session handling for debug scope is tested | ✓ VERIFIED | Hung-session diagnostic + safety-guard tests present (`test/core/runner-debug-lane.test.ts:639`, `test/core/runner-debug-lane.test.ts:656`). |
| 13 | intentToSteps returns empty array for debug intent | ✓ VERIFIED | Debug case returns `[]` in runner (`src/core/runner.ts:1012`); tested (`test/core/runner-debug-lane.test.ts:436`). |
| 14 | Debug jobs bypass step loop and judge | ✓ VERIFIED | Early debug return in launch (`src/core/runner.ts:841`, `src/core/runner.ts:843`) and no judge command assertions (`test/core/runner-debug-lane.test.ts:697`, `test/core/runner-debug-lane.test.ts:711`). |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/debug-lane.ts` | Prompt builder + parser + continuation prompt | ✓ VERIFIED | Exists (220 lines), exports all required symbols (`src/core/debug-lane.ts:15`, `src/core/debug-lane.ts:28`, `src/core/debug-lane.ts:60`, `src/core/debug-lane.ts:89`). |
| `src/core/runner.ts` | Dedicated debug lifecycle and fixed model-scope routing | ✓ VERIFIED | Debug bypass/lifecycle methods present and wired (`src/core/runner.ts:841`, `src/core/runner.ts:1387`, `src/core/runner.ts:1465`, `src/core/runner.ts:1539`); scope fix present (`src/core/runner.ts:1910`, `src/core/runner.ts:1911`). |
| `test/core/runner-debug-lane.test.ts` | Integration tests for all debug-lane outcomes and no-judge behavior | ✓ VERIFIED | Exists (788 lines) and includes debug-scope regression test (`test/core/runner-debug-lane.test.ts:720`). |
| `.planning/REQUIREMENTS.md` | DBG-01..DBG-14 definitions and Phase 91 traceability rows | ✓ VERIFIED | Definitions and phase-local table present (`.planning/REQUIREMENTS.md:247`, `.planning/REQUIREMENTS.md:277`); global traceability rows present (`.planning/REQUIREMENTS.md:371`, `.planning/REQUIREMENTS.md:384`). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/runner.ts` | `src/core/debug-lane.ts` | import + function usage | ✓ WIRED | Import is present (`src/core/runner.ts:108`) and functions are invoked (`src/core/runner.ts:1393`, `src/core/runner.ts:1452`, `src/core/runner.ts:1545`). |
| `intentToSteps` debug case | `launch()` debug lifecycle | `intent.type === 'debug'` short-circuit | ✓ WIRED | Debug case returns no steps (`src/core/runner.ts:1012`) and launch calls `executeDebugFlow` before loop (`src/core/runner.ts:841`, `src/core/runner.ts:842`). |
| `spawnAndWait` scope resolution | `resolveTopLevelModel` | `scope` passed from `jobScope` | ✓ WIRED | Scope computed from job scope first (`src/core/runner.ts:1910`, `src/core/runner.ts:1911`) then used in model resolver (`src/core/runner.ts:1914`). |
| `test/core/runner-debug-lane.test.ts` | `src/core/runner.ts` | dynamic import + `runner.run()` | ✓ WIRED | Runner imported after mocks (`test/core/runner-debug-lane.test.ts:398`) and exercised across all scenarios (`test/core/runner-debug-lane.test.ts:438`). |
| `.planning/ROADMAP.md` Phase 91 requirements | `.planning/REQUIREMENTS.md` DBG definitions/traceability | shared DBG-01..DBG-14 IDs | ✓ WIRED | ROADMAP declares DBG-01..DBG-14 for Phase 91 (`.planning/ROADMAP.md:1662`); REQUIREMENTS defines and maps same IDs (`.planning/REQUIREMENTS.md:247`, `.planning/REQUIREMENTS.md:371`). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `src/core/runner.ts` | `scope` used for model selection | `jobScope` from `activeJobs` entry (`src/core/runner.ts:1910`) populated by debug flow job record (`src/core/runner.ts:1404`) | Yes | ✓ FLOWING |
| `src/core/runner.ts` | `outcome` | `extractDebugOutcome` → `exportSessionFromDb` (`src/core/runner.ts:1419`, `src/core/runner.ts:1448`) backed by SQL `SELECT` message query (`src/core/opencode-db.ts:107`) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Runner debug-lane integration behavior | `npx vitest run test/core/runner-debug-lane.test.ts` | `18 passed` (suite green) | ✓ PASS |
| Debug prompt/parser behavior | `npx vitest run test/core/debug-lane.test.ts` | `22 passed` | ✓ PASS |
| Debug-scope regression behavior | `npx vitest run test/core/runner-debug-lane.test.ts -t "debug scope model selection"` | `1 passed, 17 skipped` (target test green) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| DBG-01 | 91-01, 91-02, 91-03, 91-04 | Debug scope routes to direct `gsd-debugger` spawn | ✓ SATISFIED | `executeDebugFlow` spawns `debugger` (`src/core/runner.ts:1413`), debug intent no longer creates `debug` command step (`src/core/runner.ts:1012`). |
| DBG-02 | 91-01, 91-02, 91-04 | Prefilled prompt includes issue/symptoms/debug file/mode flags | ✓ SATISFIED | Prompt contains `<issue>`, optional `<symptoms>`, `<debug_file>`, `symptoms_prefilled: true` (`src/core/debug-lane.ts:40`, `src/core/debug-lane.ts:46`, `src/core/debug-lane.ts:49`). |
| DBG-03 | 91-01, 91-02, 91-04 | Dedicated debug lifecycle via `executeDebugFlow` | ✓ SATISFIED | Launch short-circuit + dedicated method (`src/core/runner.ts:841`, `src/core/runner.ts:1387`). |
| DBG-04 | 91-01, 91-02, 91-04 | No phase-style judge logic for debug jobs | ✓ SATISFIED | Debug bypass before step loop (`src/core/runner.ts:841`) and tests confirm no judge command path (`test/core/runner-debug-lane.test.ts:697`). |
| DBG-05 | 91-01, 91-03, 91-04 | Debug scope used for model selection (not judge) | ✓ SATISFIED | Scope resolution uses job scope first (`src/core/runner.ts:1910`, `src/core/runner.ts:1911`), regression test verifies debug/not judge (`test/core/runner-debug-lane.test.ts:720`, `test/core/runner-debug-lane.test.ts:740`). |
| DBG-06 | 91-01, 91-02, 91-04 | Parse all structured debugger outcomes | ✓ SATISFIED | Parser handles all headers (`src/core/debug-lane.ts:95`, `src/core/debug-lane.ts:100`, `src/core/debug-lane.ts:105`, `src/core/debug-lane.ts:110`) and runner handles corresponding outcomes (`src/core/runner.ts:1472`). |
| DBG-07 | 91-01, 91-02, 91-04 | Human-verify checkpoint auto-continues | ✓ SATISFIED | `human-verify` branch calls continuation (`src/core/runner.ts:1507`, `src/core/runner.ts:1510`); integration test validates two-spawn flow (`test/core/runner-debug-lane.test.ts:563`). |
| DBG-08 | 91-01, 91-02, 91-04 | Human-action/decision checkpoint blocks with reason | ✓ SATISFIED | `markReviewHold` used for non-human-verify checkpoints (`src/core/runner.ts:1514`, `src/core/runner.ts:1515`), validated by tests (`test/core/runner-debug-lane.test.ts:587`, `test/core/runner-debug-lane.test.ts:604`). |
| DBG-09 | 91-01, 91-02, 91-04 | Hung interactive prompt is caught/handled | ✓ SATISFIED | `HungSessionError` catch marks failure with diagnostic (`src/core/runner.ts:1423`, `src/core/runner.ts:1428`), tested (`test/core/runner-debug-lane.test.ts:639`). |
| DBG-10 | 91-01, 91-02, 91-04 | Self-verified debug run reaches terminal success autonomously | ✓ SATISFIED | Continuation completion path marks completed (`src/core/runner.ts:1568`, `src/core/runner.ts:1572`), tested (`test/core/runner-debug-lane.test.ts:563`). |
| DBG-11 | 91-01, 91-02, 91-04 | Debug artifacts remain in `.planning/debug/` and continuation stays in debug lane | ✓ SATISFIED | Debug file path derived and reused (`src/core/debug-lane.ts:34`, `src/core/runner.ts:1544`), continuation still spawns `debugger` (`src/core/runner.ts:1560`). |
| DBG-12 | 91-01, 91-02, 91-04 | Safety guard prevents debug hung sessions from re-delegation path | ✓ SATISFIED | Early return in `handleHungContinuation` for debug scope (`src/core/runner.ts:1339`, `src/core/runner.ts:1343`), tested (`test/core/runner-debug-lane.test.ts:656`). |
| DBG-13 | 91-01, 91-02, 91-04 | `intentToSteps` returns empty array for debug | ✓ SATISFIED | Debug case returns `[]` (`src/core/runner.ts:1012`) and test asserts it (`test/core/runner-debug-lane.test.ts:436`). |
| DBG-14 | 91-01, 91-02, 91-04 | Integration tests cover outcomes/continuation/checkpoints/hung/no-judge | ✓ SATISFIED | Integration suite contains dedicated tests for all categories (`test/core/runner-debug-lane.test.ts:516`, `test/core/runner-debug-lane.test.ts:563`, `test/core/runner-debug-lane.test.ts:587`, `test/core/runner-debug-lane.test.ts:639`, `test/core/runner-debug-lane.test.ts:697`). |

Plan-frontmatter cross-reference check result: all requirement IDs declared in 91-01..91-04 (`DBG-01`..`DBG-14`) are defined and traceable in `.planning/REQUIREMENTS.md`; no missing or orphaned Phase 91 IDs found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/core/runner.ts` | - | No TODO/FIXME/placeholder/stub patterns affecting debug flow | ℹ️ Info | Anti-pattern scan found no blocker or warning-level stub behavior in phase-modified implementation files. |

### Human Verification Required

### 1. Real Opencode Debug Run

**Test:** Execute a real unattended debug job (`scope=debug`) against a reproducible issue and allow the run to complete naturally.
**Expected:** Runner stays in debug lifecycle, handles outcome/checkpoint paths correctly, and never enters phase judge flow.
**Why human:** Automated tests mock opencode process/session state and cannot fully validate live interactive-tool behavior, real session persistence, and external process timing.

### Gaps Summary

No code/documentation gaps remain from the prior `gaps_found` report. The previously failed debug-scope routing issue is fixed, and REQUIREMENTS traceability for `DBG-01..DBG-14` is now complete. Remaining validation is end-to-end human verification against a live opencode debug run.

---

_Verified: 2026-03-23T17:17:49Z_
_Verifier: the agent (gsd-verifier)_
