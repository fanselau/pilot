---
phase: quick-074
plan: 01
subsystem: core
tags: [models, agent-routing, provider-modes, openai-variants]
completed: 2026-03-06

dependency-graph:
  requires: [quick-073]
  provides: ["_top: prefixed scope keys in AGENT_MODELS", "xhigh/high variant differentiation for openai-only", "resolveTopLevelModel scope-to-key mapping"]
  affects: []

tech-stack:
  added: []
  patterns: ["_top: prefix convention for scope entries vs agent entries"]

key-files:
  created: []
  modified: ["src/core/models.ts", "test/core/models.test.ts"]

decisions:
  - id: d1
    decision: "Replace SCOPE_KEYS Set with key.startsWith('_top:') check"
    rationale: "No need for a separate Set when all scope keys share a consistent prefix"
  - id: d2
    decision: "milestone scope mapped to _top:phase in resolveTopLevelModel (no separate key)"
    rationale: "milestone and phase share identical model assignments — one key avoids duplication"

metrics:
  duration: "~5 min"
  tasks: 3/3
  commits: 2
---

# Quick Task 074: Replace Tier System with Explicit Agent Model Tables — Scope Key Alignment

**One-liner:** Rename scope keys to `_top:` prefix convention, add xhigh variant differentiation in openai-only table, update resolveTopLevelModel to map scope strings to `_top:` keys.

## Changes Made

### Task 1: Update AGENT_MODELS table and resolve functions
- Renamed `phase` → `_top:phase`, `quick` → `_top:quick`, `judge` → `_top:judge` in all three provider mode tables
- Removed `milestone` key (now mapped to `_top:phase` in `resolveTopLevelModel`)
- Updated openai-only table with `xhigh`/`high` variant differentiation per spec:
  - `xhigh` for quality profile on: planner, roadmapper, debugger, phase-researcher, project-researcher, verifier, plan-checker, _top:phase, _top:judge
  - `xhigh` for balanced profile on: planner only
  - Everything else stays `high`
- Updated hybrid `_top:judge` quality from `high` to `xhigh`
- Replaced `SCOPE_KEYS` Set with `key.startsWith('_top:')` in `resolveAllAgentModels`
- Updated `resolveTopLevelModel` to map scope strings: `milestone` → `_top:phase`, others → `_top:${scope}`

### Task 2: Update tests for new key pattern
- Replaced `SCOPE_KEYS` Set with `isScopeKey()` helper using `startsWith('_top:')`
- Updated scope exclusion assertions to `_top:` prefixed keys
- Fixed planner balanced variant assertion (`high` → `xhigh`)
- Added 4 tests for openai-only xhigh variant differentiation
- Added 4 tests for `resolveTopLevelModel` with `_top:` key mapping

### Task 3: Full build and test verification
- Build passes with no TypeScript errors
- All 20 model tests pass (129 expect() calls)
- Pre-existing test failures in other files (add.test.ts, completed-panel.test.ts, detail-header.test.ts, delegate.test.ts, runner-lock.test.ts) are unrelated bun-vitest compatibility issues

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 7d8ff50 | feat(quick-074): rename scope keys to _top: prefix and update openai-only variants |
| 427e0df | test(quick-074): update tests for _top: key pattern and add xhigh/resolveTopLevelModel coverage |
