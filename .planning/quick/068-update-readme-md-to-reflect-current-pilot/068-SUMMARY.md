---
quick: 068
subsystem: docs
tags: [readme, documentation, skills, judge, configuration]
one-liner: "README updated with Skills System, AI Judge, per-job timeouts, and cleaned Configuration table"

dependency-graph:
  requires: []
  provides:
    - README.md accurately reflects current Pilot capabilities
  affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - README.md

decisions:
  - "README accurately documents all 6 skills subcommands (add/list/remove/tag/categories/sync)"
  - "Judge section uses confidence threshold table matching actual evaluateVerdict() logic"
  - "stuckThreshold/defaultTimeout/pollInterval confirmed absent from PilotConfig and removed from README"
  - "Architecture diagram shows skills injection step and judge verdict details"
  - "Notifications section updated to note verdict/confidence/reason included"

metrics:
  duration: "~1m"
  completed: "2026-03-06"
---

# Quick Task 068: Update README.md to Reflect Current Pilot Summary

## Objective

Verify and commit uncommitted README changes that document Skills System, AI Judge, per-job timeouts, updated Configuration, updated CLI Reference, and updated Architecture diagram.

## What Was Done

### Task 1: Verify README accuracy against codebase and finalize

Verified all updated README sections against source code:

1. **Skills System section** — Confirmed 6 subcommands in `src/commands/skills.ts` (`skillsListCommand`, `skillsAddCommand`, `skillsRemoveCommand`, `skillsCategoriesCommand`, `skillsTagCommand`, `skillsSyncCommand`). Confirmed `pilot skills remove <name>` (not `uninstall`) matches actual registration in `src/index.ts`. Confirmed `--categories` flag on `pilot add` in `src/commands/add.ts`. Auto-injection via `injectSkills()`/`cleanupInjectedSkills()` in `runner.ts` confirmed.

2. **AI Judge section** — `JudgeVerdict` interface in `runner.ts` confirmed: `verdict: 'succeeded' | 'failed' | 'doubting'`, `confidence: number`, `reason: string`. Confidence threshold logic confirmed: doubting ≥50 treated as pass, <50 throws as fail. Judge verdict included in `callback.ts` webhook body and message lines.

3. **Configuration section** — `PilotConfig` in `src/core/types.ts` confirmed: `stuckThreshold`, `defaultTimeout`, `pollInterval` absent (comment says "internal constants"). Config table in README matches actual `PilotConfig` fields.

4. **CLI Reference** — Skills commands table matches actual subcommand registrations. `--timeout <minutes>` and `--categories <cats>` confirmed on `pilot add`.

5. **Architecture diagram** — "Inject skills" in Runner box, judge section with "succeeded / failed / doubting + confidence", "Include verdict" in Complete/Fail box, pipeline flow summary all present.

6. **What's New callout** — Present at line 22 mentioning skills, judge, and per-job timeouts.

7. **Brand assets** — `final-readme-header.svg` reference intact at line 3. All badge URLs and demo GIF unchanged.

No inaccuracies found — README was already correct. Committed as-is.

## Verification Results

- `stuckThreshold|defaultTimeout|pollInterval` count in README: **0** ✓
- `skills add|list|remove|tag|categories|sync` count: **11** (≥6) ✓
- `succeeded|doubting|failed` count: **10** (≥3) ✓
- `--timeout|--categories` count: **7** (≥2) ✓
- `Inject skills` count: **1** ✓
- `What's New` count: **1** ✓
- `final-readme-header.svg` present: **yes** ✓

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | ed05845 | docs(quick-068): update README to reflect current Pilot capabilities |

## Deviations from Plan

None — plan executed exactly as written. README was accurate and needed no corrections.
