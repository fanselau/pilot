---
phase: 85-pilot-cli-disable-milestones-for-now-realign-top-level-gsd-commands-debug-fast
verified: 2026-03-21T18:29:05Z
status: passed
score: 9/9 must-haves verified
---

# Phase 85: Pilot CLI Disable Milestones + Debug/Fast Scope Verification Report

**Phase Goal:** Make Pilot safer and more expressive at the CLI level by disabling milestone queuing, adding first-class debug and fast job scopes, and updating the delegation prompt with explicit autonomy guidance for workflow selection.
**Verified:** 2026-03-21T18:29:05Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `pilot add <proj> <desc> --as milestone` is rejected with a clear error message | ✓ VERIFIED | Guard and explicit message in `src/commands/add.ts:190`, `src/commands/add.ts:192`, `src/commands/add.ts:195`, `src/commands/add.ts:197`. |
| 2 | `pilot add <proj> <desc> --as debug` is accepted and queues a debug-scoped job | ✓ VERIFIED | `--as` includes debug in `src/index.ts:47`; add flow only blocks milestone in `src/commands/add.ts:190`; scoped enqueue path passes `scope` into DB insert in `src/commands/add.ts:381`. |
| 3 | `pilot add <proj> <desc> --as fast` is accepted and queues a fast-scoped job | ✓ VERIFIED | `--as` includes fast in `src/index.ts:47`; milestone-only block in `src/commands/add.ts:190`; enqueue uses resolved `scope` in `src/commands/add.ts:381`. |
| 4 | Directory input no longer auto-detects as milestone scope | ✓ VERIFIED | Directory detection now returns phase in `src/commands/add.ts:141`. |
| 5 | Delegation prompt explicitly guides agents on when to use debug vs fast vs quick vs phase | ✓ VERIFIED | Prompt sections and constraints exist in `src/prompts/delegate.md:56`, `src/prompts/delegate.md:64`, `src/prompts/delegate.md:176`, `src/prompts/delegate.md:374`. |
| 6 | Debug jobs spawn `gsd-debug` sessions via the runner | ✓ VERIFIED | Intent route emits `command: 'debug'` in `src/core/runner.ts:948` and `src/core/runner.ts:954`; spawn layer prefixes to `gsd-<command>` in `src/core/runner.ts:1608`. |
| 7 | Fast jobs spawn `gsd-quick` sessions (no flags) via the runner | ✓ VERIFIED | Fast route returns `command: 'quick'` with bare args in `src/core/runner.ts:956` and `src/core/runner.ts:959`; no fast-flag augmentation path exists (contrast quick flags at `src/core/runner.ts:900`). |
| 8 | Delegation AI can output debug and fast intents that parse successfully | ✓ VERIFIED | `validTypes` includes debug/fast in `src/core/delegate.ts:611`; type-specific validation in `src/core/delegate.ts:625` and `src/core/delegate.ts:630`. |
| 9 | Milestone command still works for existing milestone jobs (not ripped out) | ✓ VERIFIED | Milestone status/resume/skip handlers remain implemented in `src/commands/milestone.ts:49`, `src/commands/milestone.ts:109`, `src/commands/milestone.ts:151` with milestone-scope checks. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/types.ts` | Extended `JobScope` + `DelegationIntent` for debug/fast | ✓ VERIFIED | Exists, substantive type additions at `src/core/types.ts:75`, `src/core/types.ts:202`, `src/core/types.ts:203`; widely imported/used across core/commands. |
| `src/core/models.ts` | Routing for debug/fast to `_top:quick` | ✓ VERIFIED | Exists, substantive switch mapping at `src/core/models.ts:177` and `src/core/models.ts:180`; used by runner model resolution in `src/core/runner.ts:1594`. |
| `src/commands/add.ts` | Milestone blocking + debug/fast acceptance + updated detection | ✓ VERIFIED | Exists, substantive detection/blocking in `src/commands/add.ts:141` and `src/commands/add.ts:190`; command wired from CLI in `src/index.ts:61`. |
| `src/prompts/delegate.md` | Delegation guidance and debug/fast intent rules | ✓ VERIFIED | Exists and substantive sections at `src/prompts/delegate.md:56`, `src/prompts/delegate.md:64`, `src/prompts/delegate.md:176`; loaded by delegate core at `src/core/delegate.ts:28`. |
| `src/core/runner.ts` | `intentToSteps` routing for debug/fast | ✓ VERIFIED | Exists and substantive routes at `src/core/runner.ts:948` and `src/core/runner.ts:956`; execution wiring through `spawnAndWait` in `src/core/runner.ts:1548`. |
| `src/core/delegate.ts` | Intent validation for debug/fast | ✓ VERIFIED | Exists and substantive validation at `src/core/delegate.ts:611`, `src/core/delegate.ts:625`, `src/core/delegate.ts:630`; used by runner delegation pipeline via `src/core/runner.ts:72`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/commands/add.ts` | `src/core/types.ts` | `JobScope` type | ✓ WIRED | `JobScope` import in `src/commands/add.ts:21`; scope lifecycle uses typed variable in `src/commands/add.ts:178`. |
| `src/core/models.ts` | `src/core/types.ts` | `resolveTopLevelModel` scope mapping | ✓ WIRED | Scope union includes debug/fast at `src/core/models.ts:172`; debug/fast mapped to `_top:quick` in `src/core/models.ts:179` and `src/core/models.ts:180`. |
| `src/core/runner.ts` | `src/core/delegate.ts` | `intentToSteps -> spawnAndWait -> gsd-debug/gsd-quick` | ✓ WIRED | Runner emits debug/fast commands in `src/core/runner.ts:954` and `src/core/runner.ts:959`; spawn command normalization in `src/core/runner.ts:1608` ensures `gsd-debug`/`gsd-quick`. |
| `src/core/delegate.ts` | `src/core/types.ts` | `parseIntentOutput` intent-type validation | ✓ WIRED | Delegate imports `DelegationIntent` in `src/core/delegate.ts:25`, validates allowed types at `src/core/delegate.ts:611`, and returns typed intent at `src/core/delegate.ts:668`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| _None declared_ | `85-01-PLAN.md`, `85-02-PLAN.md` | Both plans set `requirements: []` | ✓ SATISFIED (no-op) | `85-01-PLAN.md:15`, `85-02-PLAN.md:12` |
| _Orphaned requirements_ | `.planning/REQUIREMENTS.md` | No Phase 85 requirement mapping found | ✓ SATISFIED (none) | No matches for Phase 85 in `.planning/REQUIREMENTS.md` (grep check) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/add.ts` | 6 | Comment drift: header still says directory -> milestone | ⚠️ Warning | Behavior is correct in code (`phase`), but stale comment can mislead maintenance. |
| `src/index.ts` | 448 | "coming soon" marker in CLI option description | ℹ️ Info | Not related to Phase 85 goal; no blocking impact on scope/delegation wiring. |

### Human Verification Required

None.

### Gaps Summary

No blocking gaps found. Phase 85 must-haves are implemented, substantive, and wired end-to-end across CLI scope selection, delegation parsing/prompting, and runner command execution routing.

Additional automated evidence collected during verification:
- `npx tsc --noEmit` passed.
- `npx vitest run test/core/models.test.ts test/commands/add.test.ts` passed (96 tests).

---

_Verified: 2026-03-21T18:29:05Z_
_Verifier: Claude (gsd-verifier)_
