---
phase: quick-075
plan: 01
subsystem: model-resolution
tags: [models, hybrid, role-based-routing, agent-models]

dependency-graph:
  requires: [quick-074]
  provides: [hybrid-role-based-routing]
  affects: []

tech-stack:
  added: []
  patterns: [role-based-model-routing, hybrid-provider-separation]

key-files:
  created: []
  modified:
    - src/core/models.ts
    - test/core/models.test.ts

decisions:
  - "Researcher budget profiles use sonnet (not haiku) in hybrid — haiku has no role in hybrid mode"
  - "Build agents mirror claude-only for quality/balanced; budget researchers get sonnet instead of haiku"
  - "Check agents mirror openai-only exactly across all profiles"
  - "Test excludes researcher budget profiles from the 'mirrors claude-only' assertion, tested separately"

metrics:
  duration: "3 minutes"
  completed: "2026-03-06"
---

# Quick Task 075: Hybrid Role-Based Model Routing Summary

**One-liner:** Hybrid AGENT_MODELS rewritten with clean role separation — Claude builds, Codex checks, no haiku anywhere.

## What Was Done

Updated the `hybrid` section of `AGENT_MODELS` in `src/core/models.ts` to implement clean role-based routing:

- **Build agents** (planner, roadmapper, executor, debugger, phase-researcher, project-researcher, research-synthesizer) → Claude models, mirroring `claude-only` exactly except budget researchers use sonnet instead of haiku
- **Check agents** (codebase-mapper, verifier, plan-checker, integration-checker) → Codex models, mirroring `openai-only` exactly
- **Scopes** unchanged: `_top:phase` and `_top:quick` stay Claude, `_top:judge` stays Codex

Added comprehensive tests in `test/core/models.test.ts` proving the role mirroring:

1. Build-role agents match claude-only (except researcher budget, tested separately)
2. research-synthesizer budget uses sonnet (not haiku)
3. Researcher budget uses sonnet (not haiku)
4. Check-role agents match openai-only exactly
5. No haiku anywhere in the hybrid table

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update hybrid AGENT_MODELS with role-based routing | f07a51f | src/core/models.ts |
| 2 | Add hybrid role-based routing tests | 898222b | test/core/models.test.ts |

## Verification

- `npx vitest run test/core/models.test.ts` — 25 tests passed (0 failures)
- `npx tsc --noEmit` — no type errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion excluded researcher budget profiles from mirror check**

- **Found during:** Task 2 test execution
- **Issue:** The plan's "build-role agents mirror claude-only" test would fail for `gsd-phase-researcher` and `gsd-project-researcher` budget profiles, because hybrid uses sonnet while claude-only uses haiku — an intentional design difference the plan itself documented
- **Fix:** Added `researcherAgents` Set to skip budget profile assertions for those two agents, with a comment pointing to the separate test
- **Files modified:** test/core/models.test.ts

## Next Phase Readiness

No blockers. The hybrid table is now cleanly separated by role, matching the intent documented in the plan and enforced by tests.
