---
phase: quick
plan: 260322-uyd
subsystem: runner, web-ui
tags: [gsd-fast, capability-detection, compat-fallback, step-semantics]

requires:
  - phase: 260321-tdm
    provides: fast scope DB schema and runtime support
provides:
  - hasNativeFast() capability detection for gsd-fast command
  - native fast routing vs gsd-quick compat fallback with reason metadata
  - web UI fast step labels and fast scope badge
affects: [runner, step-semantics, job-list]

tech-stack:
  added: []
  patterns: [capability-detection-with-compat-fallback]

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - web/src/lib/step-semantics.ts
    - web/src/components/job-list.tsx

key-decisions:
  - "hasNativeFast checks .opencode/command/gsd-fast.md existence via existsSync — synchronous, runs once per fast job"
  - "Compat fallback records reason in step metadata via existing createPendingStep reason parameter"
  - "Fast scope badge uses 'secondary' variant (same as phase) for visual weight"

patterns-established:
  - "Capability detection: check project command files before routing to upstream GSD commands"

requirements-completed: [FAST-NATIVE-DETECT, FAST-COMPAT-LABEL, FAST-UI]

duration: 3min
completed: 2026-03-22
---

# Quick Task 260322-uyd: Fast Scope Native Detection Summary

**Capability-detected fast routing: native gsd-fast when project has it, gsd-quick compat fallback with reason metadata, plus web UI 'Fast Task' labels and scope badge**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T22:24:40Z
- **Completed:** 2026-03-22T22:28:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fast jobs now use native gsd-fast when `.opencode/command/gsd-fast.md` exists in the project
- Compat fallback to gsd-quick records explicit reason in step metadata for observability
- Web UI shows 'Fast Task' label for native fast steps and 'secondary' badge for fast scope jobs
- Quick scope routing completely untouched — zero diff in quick case block

## Task Commits

Each task was committed atomically:

1. **Task 1: Capability detection + intentToSteps fast routing with compat reason** - `15c2771` (feat)
2. **Task 2: Web UI fast step labels + fast scope badge** - `85b87f8` (feat)

## Files Created/Modified
- `src/core/runner.ts` - hasNativeFast() detection, intentToSteps fast case with compat fallback + reason threading
- `web/src/lib/step-semantics.ts` - 'Fast Task' labels in formatStepLabel, stepSemanticClass, synthesizeHeaderFields
- `web/src/components/job-list.tsx` - scopeVariant fast badge as 'secondary'

## Decisions Made
- hasNativeFast uses synchronous existsSync — acceptable since it runs once per fast job, not in a hot loop
- Compat steps (command='quick' on fast-scope jobs) still show 'Quick Task' — accurate since they actually ran gsd-quick
- Fast scope badge uses 'secondary' variant rather than a unique one — fast is a lightweight scope, secondary fits

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Fast scope routing is complete and observable
- Projects can install gsd-fast.md to get native fast behavior automatically

---
*Quick task: 260322-uyd*
*Completed: 2026-03-22*
