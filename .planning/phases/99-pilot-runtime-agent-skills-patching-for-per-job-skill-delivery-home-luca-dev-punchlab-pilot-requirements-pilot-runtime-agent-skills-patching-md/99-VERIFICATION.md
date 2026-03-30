---
phase: 99-pilot-runtime-agent-skills-patching
verified: 2026-03-26T15:39:29Z
status: human_needed
score: 8/8 must-haves verified
human_verification:
  - test: "Run one real phase job with matching categories and inspect runner stderr plus `pilot info <job>` afterward"
    expected: "Runner logs only concise category/selection/patch/restore lines, `.planning/config.json` regains its prior `agent_skills` state after completion, and `pilot info` shows the persisted runtime snapshot without raw path arrays in human mode"
    why_human: "This phase promises operator-facing inspectability and concise log output during a live job; unit tests prove formatting and lifecycle ordering, but log readability and end-to-end runtime behavior still need a real run"
---

# Phase 99: Pilot Runtime `agent_skills` Patching Verification Report

**Phase Goal:** Keep Pilot's category-based skill system as the source of truth while adding a reversible runtime `agent_skills` transport layer that writes explicit per-agent skill paths into `.planning/config.json` for the current job, restores the original config afterward, and leaves operators with concise, inspectable evidence of what was injected.
**Verified:** 2026-03-26T15:39:29Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pilot derives runtime `agent_skills` from the existing category/manifest pipeline instead of inventing a new source of truth. | ✓ VERIFIED | `src/core/runtime-agent-skills.ts:160` calls `resolveSkillsForJob(categories)` and resolves only project-local `.opencode/skill/<name>` paths at `src/core/runtime-agent-skills.ts:114`; manifest/category logic remains in `src/core/skills.ts:202`. |
| 2 | Existing user `agent_skills` values are merged additively and restored exactly after the run. | ✓ VERIFIED | Merge order is `existing` then generated at `src/core/runtime-agent-skills.ts:84` and `src/core/runtime-agent-skills.ts:188`; exact restore/delete behavior is implemented at `src/core/runtime-agent-skills.ts:225`; restore regression coverage exists in `test/core/runtime-agent-skills.test.ts:74` and `test/core/runtime-agent-skills.test.ts:134`. |
| 3 | Invalid or missing skill directories are filtered out instead of being written into config. | ✓ VERIFIED | Directory existence/type/absolute-path validation happens at `src/core/runtime-agent-skills.ts:106`; skipped skills are persisted in `invalidSkills`; regression coverage exists at `test/core/runtime-agent-skills.test.ts:101`. |
| 4 | Runtime patch metadata is persisted on the job record for later inspection. | ✓ VERIFIED | Snapshot type is defined at `src/core/types.ts:96`; DB parsing/storage is implemented at `src/core/db.ts:299` and `src/core/db.ts:1293`; round-trip tests exist at `test/core/db.test.ts:264`. |
| 5 | Phase launches apply runtime `agent_skills` before delegation and keep one mapping for the whole launch. | ✓ VERIFIED | Runner installs skills, applies the patch, persists the snapshot, then delegates in that order at `src/core/runner.ts:808`; single-launch reuse is covered in `test/core/runner-recovery.test.ts:738`. |
| 6 | Success/failure paths restore config before installed skills are cleaned up. | ✓ VERIFIED | Restore runs in `finally` before `cleanupInstalledSkills(projectDir)` at `src/core/runner.ts:963`; success/failure ordering is asserted in `test/core/runner-recovery.test.ts:673`. |
| 7 | Jobs with no matching or valid runtime skills still run cleanly without a broken config patch. | ✓ VERIFIED | No-op handling returns `applied: false` with `restoreStatus: 'skipped'` at `src/core/runtime-agent-skills.ts:171`; runner still delegates normally after a no-op handle, covered in `test/core/runner-recovery.test.ts:640`. |
| 8 | Operators can inspect the persisted runtime snapshot without reading raw config JSON. | ✓ VERIFIED | JSON output exposes `runtimeSkills` at `src/commands/info.ts:600`; human output adds a compact `Runtime skills` block and suppresses raw path arrays at `src/commands/info.ts:842`; coverage exists in `test/commands/info.test.ts:319`. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/runtime-agent-skills.ts` | Runtime apply/restore helper grounded in installed local skills | ✓ VERIFIED | Exists, is substantive, is called by runner, and traces manifest-selected skills to validated local directories before writing config. |
| `src/core/gsd-config.ts` | Lock-safe shared planning-config mutation primitive | ✓ VERIFIED | `mutatePlanningConfig()` exists at `src/core/gsd-config.ts:115`, ensures config exists, locks, reads invalid JSON as `{}`, writes through `.tmp`, and is used by runtime patching. |
| `src/core/db.ts` | Job snapshot persistence for runtime skill injection | ✓ VERIFIED | Adds `runtime_skill_snapshot` schema support, parses/serializes typed JSON, and is called from runner lifecycle. |
| `src/core/runner.ts` | Job-scoped apply/restore lifecycle with concise diagnostics | ✓ VERIFIED | Applies before delegation, persists snapshots, restores in `finally`, and logs the promised concise prefixes. |
| `src/commands/info.ts` | Human and JSON visibility for runtime skill snapshots | ✓ VERIFIED | Reads `job.runtimeSkillSnapshot`, emits `runtimeSkills` JSON, and renders concise human output. |
| `test/core/runtime-agent-skills.test.ts` | Merge/restore/invalid-path regression coverage | ✓ VERIFIED | Covers deterministic mapping, additive merge, invalid paths, no-op behavior, and exact restore. |
| `test/core/runner-recovery.test.ts` | Runner ordering and restore-before-cleanup coverage | ✓ VERIFIED | Covers apply-before-delegate, no-op handling, restore-before-cleanup, and one-patch-per-launch behavior. |
| `test/commands/info.test.ts` | Runtime skills observability regressions | ✓ VERIFIED | Covers active, invalid, JSON, and inactive info surfaces. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/runtime-agent-skills.ts` | `src/core/skills.ts` | Resolve installed project-local skill directories from manifest-selected skills | ✓ VERIFIED | `applyRuntimeAgentSkillsPatch()` calls `resolveSkillsForJob()` at `src/core/runtime-agent-skills.ts:164`, preserving category-based selection. |
| `src/core/runtime-agent-skills.ts` | `src/core/gsd-config.ts` | Shared lock-safe config mutation | ✓ VERIFIED | Apply and restore both call `mutatePlanningConfig()` at `src/core/runtime-agent-skills.ts:183` and `src/core/runtime-agent-skills.ts:225`. |
| `src/core/db.ts` | `src/core/types.ts` | Runtime skill snapshot JSON round-trip | ✓ VERIFIED | `RuntimeAgentSkillsSnapshot` is typed in `src/core/types.ts:96` and parsed/validated in `src/core/db.ts:299`. |
| `src/core/runner.ts` | `src/core/runtime-agent-skills.ts` | Apply once before delegate, restore once in finally | ✓ VERIFIED | Runner imports both helpers and wires them at `src/core/runner.ts:822` and `src/core/runner.ts:966`. |
| `src/core/runner.ts` | `src/core/db.ts` | Persist runtime skill snapshot and restore status | ✓ VERIFIED | Snapshot persistence happens immediately after apply and after restore at `src/core/runner.ts:823` and `src/core/runner.ts:967`. |
| `src/commands/info.ts` | `src/core/types.ts` | Render persisted runtime skill snapshot | ✓ VERIFIED | `buildRuntimeSkillsSummary()` consumes `RuntimeAgentSkillsSnapshot` at `src/commands/info.ts:165`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `src/core/runtime-agent-skills.ts` | `selectedSkills` / `validPaths` / `writtenAgentSkills` | `resolveSkillsForJob(categories)` plus filesystem checks under `.opencode/skill` | Yes | ✓ FLOWING |
| `src/core/runner.ts` | `runtimeSkillHandle.snapshot` | `applyRuntimeAgentSkillsPatch(projectDir, job.categories ?? null)` | Yes | ✓ FLOWING |
| `src/commands/info.ts` | `job.runtimeSkillSnapshot` / `runtimeSkills` | `getJob()` -> `rowToJob()` -> `parseRuntimeSkillSnapshot()` in DB layer | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Targeted runtime-skill regressions pass | `npx vitest run test/core/db.test.ts test/core/runtime-agent-skills.test.ts test/core/runner-recovery.test.ts test/commands/info.test.ts --reporter=dot` | 164 tests passed | ✓ PASS |
| Project still compiles with runtime patching changes | `npm run build` | TypeScript build passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `ASKILL-01` | `99-01-PLAN.md` | Keep Pilot's category-based skill system as source of truth while deriving runtime transport data from resolved skills. | ✓ SATISFIED | `src/core/runtime-agent-skills.ts:164` derives from `resolveSkillsForJob`; `src/core/skills.ts:202` remains the selector. |
| `ASKILL-02` | `99-01-PLAN.md` | Add reversible runtime `agent_skills` patching using real local skill paths with explicit merge policy and snapshot persistence. | ✓ SATISFIED | Apply/restore/merge/path validation live in `src/core/runtime-agent-skills.ts:106`; snapshot persistence lives in `src/core/db.ts:1293`. |
| `ASKILL-03` | `99-02-PLAN.md` | Apply the runtime patch before delegated work and restore it after launch completion without blocking no-op jobs. | ✓ SATISFIED | Lifecycle wiring is in `src/core/runner.ts:808`; no-op behavior is covered by `test/core/runner-recovery.test.ts:640`. |
| `ASKILL-04` | `99-02-PLAN.md` | Provide concise operator-visible evidence of runtime skills in `pilot info` and runner logging. | ✓ SATISFIED | Concise log prefixes exist at `src/core/runner.ts:824`; `pilot info` output is implemented at `src/commands/info.ts:842`. |
| `ASKILL-05` | `99-01-PLAN.md`, `99-02-PLAN.md` | Make the runtime patch deterministic, inspectable, and safely restorable across execution. | ✓ SATISFIED | Deterministic sorting/deduping is in `src/core/runtime-agent-skills.ts:69` and `src/core/runtime-agent-skills.ts:88`; restore persistence is in `src/core/runner.ts:963`; inspectability is in `src/commands/info.ts:600`. |
| `ASKILL-01`..`ASKILL-05` central mapping | `.planning/REQUIREMENTS.md` | Requirement IDs should be traceable in the central requirements index. | ⚠ ORPHANED | `.planning/REQUIREMENTS.md` currently contains no `ASKILL-*` entries, so central traceability is missing even though implementation exists. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocker stub/placeholder patterns found in phase 99 implementation files | ℹ️ Info | Grep hits were benign null/default handling and empty-object initialization, not hollow behavior. |

### Human Verification Required

### 1. Live Runtime Patch Observability

**Test:** Run a real phase job with categories that resolve at least one installed skill, watch runner stderr, then inspect `.planning/config.json` during and after the job plus `pilot info <job>` after completion.
**Expected:** Runner shows only concise `Runtime skills categories`, `Runtime skills selected`, `Runtime agent_skills patched`, and `Runtime agent_skills restore` lines; `.planning/config.json` temporarily gains the runtime `agent_skills` mapping and regains its exact prior state after completion; `pilot info` shows the compact snapshot block without human-mode path-array dumps.
**Why human:** Unit tests prove formatting and lifecycle ordering, but a live run is still needed to judge operator readability and confirm end-to-end mutation/restore behavior against a real project config.

### Gaps Summary

Implementation-wise, Phase 99 achieves the core goal: category-driven skills remain the source of truth, runtime `agent_skills` are derived from real local installs, runner lifecycle applies/restores the patch in the right place, and `pilot info` exposes a compact persisted snapshot. The only remaining issue is verification scope, not code completeness: the central `.planning/REQUIREMENTS.md` file does not yet map `ASKILL-01` through `ASKILL-05`, and one live human check is still needed to confirm the promised operator experience around real stderr output and transient config mutation.

---

_Verified: 2026-03-26T15:39:29Z_
_Verifier: the agent (gsd-verifier)_
