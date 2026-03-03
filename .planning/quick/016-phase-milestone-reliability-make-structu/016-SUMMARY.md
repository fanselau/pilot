---
phase: quick-016
plan: 1
started: 2026-03-03T10:05:34Z
completed: 2026-03-03T10:14:08Z
duration: 9m
subsystem: core/delegation
tags: [delegate, phase-resolution, filesystem-scan, stuck-detection, test]

dependency-graph:
  requires: [quick-013, quick-015]
  provides: [filesystem-phase-resolution, success-pattern-gating, milestone-iteration, improved-detectScope]
  affects: [runner, add-command, phase-lifecycle]

tech-stack:
  added: []
  patterns: [filesystem-scan-for-phase-resolution, success-failure-uncertain-verdict-triad]

key-files:
  created: []
  modified:
    - src/core/delegate.ts
    - src/core/runner.ts
    - src/commands/add.ts
    - test/core/delegate.test.ts
    - test/core/runner.test.ts

decisions:
  - id: q016-01
    decision: "Filesystem scan of .planning/phases/ dirs replaces ROADMAP heading counting"
    rationale: "ROADMAP headings diverge from actual phase dirs (headings added lazily, dirs created by GSD)"
  - id: q016-02
    decision: "evaluateStepResult returns three-valued certainty: definite/uncertain"
    rationale: "Benefit of the doubt for ambiguous messages, but logs warning for observability"
  - id: q016-03
    decision: "detectScope uses requirements-like verb patterns for phase scope detection"
    rationale: "Strings with 'implement', 'build', 'create' etc are likely requirements, not quick fixes"

metrics:
  duration: 9m
  completed: 2026-03-03
  tests-added: 30
  tests-total: 199
---

# Quick Task 016: Phase & Milestone Reliability Summary

**One-liner:** Filesystem-based phase resolution replacing ROADMAP heading counting, plus success pattern gating and milestone directory iteration

## What Changed

### 1. delegate.ts — Filesystem-based phase resolution
- `resolvePhaseForFallback` now scans `.planning/phases/` directories via `readdirSync` instead of counting `### Phase N` headings in ROADMAP.md
- New `getNextPhaseNumber(phasesDir)` extracts max NN prefix from `NN-*` dir names (same logic as GSD's gsd-tools.cjs)
- New `buildMilestonePlan(job, projectDir)` iterates `.md` files in a requirement directory, creating add→plan→execute steps per file
- All helper functions (`fallbackPlan`, `buildNewProjectArgs`, `buildQuickArgs`, `getNextPhaseNumber`, `buildMilestonePlan`) exported for testing

### 2. runner.ts — evaluateStepResult with success patterns + certainty
- `StepVerdict` gains `certainty: 'definite' | 'uncertain'` field
- Added `successPatterns` array (phase complete, planning complete, verification passed, etc.)
- Three-valued result: failure patterns → definite failure, success patterns → definite success, neither → uncertain success with stderr warning
- Ambiguous results still succeed (benefit of the doubt) but are logged for observability

### 3. add.ts — detectScope improvements + quick deprecation warning
- `detectScope` now returns `'phase'` for strings >100 chars or containing requirements-like verbs (implement, build, create, add, integrate, migrate, refactor, redesign, overhaul, set up, introduce)
- Quick scope shows deprecation warning encouraging phase mode

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 805d3de | Replace ROADMAP heading counting with filesystem scan in delegate fallback |
| 2 | b859e57 | Add success patterns + certainty to evaluateStepResult, improve detectScope |
| 3 | 9424b3d | Comprehensive tests for delegate helpers and evaluateStepResult updates |

## Test Coverage

- **delegate.test.ts:** 44 tests (was 21) — added getNextPhaseNumber (6), fallbackPlan (5), buildNewProjectArgs (3), buildQuickArgs (2), buildMilestonePlan (5), updated resolvePhaseForFallback (3 updated + 1 new filesystem-wins-over-roadmap test)
- **runner.test.ts:** 37 tests (was 29) — reorganized evaluateStepResult into failure/success/uncertain subsections, added 8 new tests for success patterns and uncertain verdicts
- **Full suite:** 199 tests, all passing

## Deviations from Plan

None — plan executed exactly as written.
