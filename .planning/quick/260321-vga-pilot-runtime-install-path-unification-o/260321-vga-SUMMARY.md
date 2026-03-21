---
phase: 260321-vga
plan: 01
subsystem: cli
tags: [doctor, systemd, binary-resolution, runtime-docs]

requires:
  - phase: "53"
    provides: "resolvePilotBinary() canonical resolution in service.ts"
provides:
  - "Binary drift detection check in pilot doctor"
  - "Operator runtime/install path documentation (docs/RUNTIME.md)"
affects: [service, doctor, operator-docs]

tech-stack:
  added: []
  patterns:
    - "Hoisted variable pattern for cross-check data sharing in sequential doctor checks"

key-files:
  created:
    - docs/RUNTIME.md
  modified:
    - src/commands/doctor.ts
    - test/commands/doctor.test.ts
    - docs/GETTING-STARTED.md

key-decisions:
  - "realpathSync normalization on both service and build paths before comparison — handles symlinks correctly"
  - "Drift check wraps in try/catch and is skipped silently when resolvePilotBinary throws or no service unit exists"
  - "Hoisted serviceExecBinaryPath variable from service unit check scope to share with drift check"

patterns-established:
  - "Cross-check pattern: doctor checks can share parsed data via hoisted variables for dependent checks"

requirements-completed: [RUNTIME-UNIFY]

duration: 5min
completed: 2026-03-21
---

# Quick Task 260321-vga: Runtime/Install Path Unification Summary

**Binary drift detection in pilot doctor with realpathSync-normalized path comparison, plus comprehensive operator runtime documentation in docs/RUNTIME.md**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T22:44:52Z
- **Completed:** 2026-03-21T22:49:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- pilot doctor now reports a "binary drift" check that warns when the systemd service ExecStart binary differs from the current build output (resolvePilotBinary)
- Tests cover pass, warn, actionable message, and graceful skip paths (4 new tests, 21 total in doctor.test.ts)
- docs/RUNTIME.md comprehensively documents: split-brain problem, canonical path, shadow paths, operator workflows, command clarifications (update vs setup --refresh vs service install vs reload vs doctor), and troubleshooting
- docs/GETTING-STARTED.md cross-references RUNTIME.md from the hot-reload section

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for drift detection** - `e00a742` (test)
2. **Task 1 (GREEN): Implement drift detection in doctor** - `4aa5ccf` (feat)
3. **Task 2: Operator runtime documentation** - `fb7f601` (docs)

## Files Created/Modified
- `src/commands/doctor.ts` - Added binary drift detection check after service unit check, imports resolvePilotBinary from service.ts
- `test/commands/doctor.test.ts` - 4 new tests: pass/warn/actionable-message/graceful-skip for drift detection; mocks for resolvePilotBinary and realpathSync
- `docs/RUNTIME.md` - New comprehensive operator guide for runtime/install path unification
- `docs/GETTING-STARTED.md` - Added cross-reference tip to RUNTIME.md in hot-reload section

## Decisions Made
- Used realpathSync normalization on both paths before comparison — correctly handles symlinked binaries
- Drift check wraps in try/catch — never crashes doctor; silently skips when no service unit or resolvePilotBinary fails
- Hoisted `serviceExecBinaryPath` variable before service unit try block — cleanest way to share parsed data with the subsequent drift check without restructuring existing code

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Binary drift detection is informational (warn, not fail) — safe for all environments
- docs/RUNTIME.md is self-contained and complete for operator use

---
*Quick task: 260321-vga*
*Completed: 2026-03-21*
