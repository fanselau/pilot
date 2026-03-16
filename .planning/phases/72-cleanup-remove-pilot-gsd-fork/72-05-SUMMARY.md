---
phase: 72-cleanup-remove-pilot-gsd-fork
plan: 05
subsystem: infra
tags: [cleanup, migration, audit, pilot-setup, pilot-doctor, github]

# Dependency graph
requires:
  - phase: 64-gsd-installation-switch
    provides: upstream get-shit-done installation baseline used by setup --refresh
  - phase: 65-gsd-config-preseeding
    provides: autonomous planning config defaults enforced during refresh checks
provides:
  - Migration-order audit evidence for all registered projects before fork removal
  - Root/user/project config fork-key audit with user-config remediation
  - External archive attempt evidence with explicit owner follow-up actions
affects: [72-06, cleanup-finalization, operator-runbooks]

# Tech tracking
tech-stack:
  added: []
  patterns: [pre-removal migration gate, evidence-first cleanup audits, permission-gated external follow-up]

key-files:
  created: [.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-MIGRATION-AUDIT.md, .planning/phases/72-cleanup-remove-pilot-gsd-fork/72-05-SUMMARY.md]
  modified: [.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-MIGRATION-AUDIT.md, .planning/STATE.md]

key-decisions:
  - "Use node dist/index.js command path when pilot launcher requires unavailable bun runtime"
  - "Treat pilot-gsd path-string hits in pilot-gsd project opencode config as non-key false positives"
  - "Block destructive cleanup progression until per-project migration gate passes"

patterns-established:
  - "Migration Gate: run setup --refresh + doctor --project --skip-agents on every registered project before removal"
  - "External Deprecation Evidence: attempt via gh CLI, then record precise owner action when permissions block"

# Metrics
duration: 6 min
completed: 2026-03-16
---

# Phase 72 Plan 05: Migration Audit Summary

**Pre-removal migration gate execution with per-project refresh/doctor evidence, fork-key config audit, and permission-gated GitHub archive follow-up documentation.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T09:31:34Z
- **Completed:** 2026-03-16T09:38:09Z
- **Tasks:** 3
- **Files modified:** 1 tracked file (`72-MIGRATION-AUDIT.md`) plus local user config remediation (`~/.pilot/config.json`)

## Accomplishments
- Executed migration-order gate across all 7 registered projects with `setup --refresh` and `doctor --project --skip-agents` evidence.
- Audited root manifests and managed project configs for fork-era keys; removed legacy `gsdDir` from `~/.pilot/config.json`.
- Attempted `fanselau/pilot-gsd` archive via GitHub CLI, captured permission failure, and documented exact owner follow-up steps.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce migration-order gate across registered projects** - `6d1dd40` (docs)
2. **Task 2: Audit root and user configs/manifests for fork-era keys** - `bd66fe7` (docs)
3. **Task 3: Close external/document residue requirements with evidence** - `42ae700` (docs)

Supplemental verification evidence update:

- `d116b37` (docs)

**Plan metadata:** recorded in final docs commit for this plan.

## Files Created/Modified
- `.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-MIGRATION-AUDIT.md` - Full migration gate, config audit, and external deprecation evidence.
- `~/.pilot/config.json` - Removed legacy `gsdDir` key (local user config remediation, not committed in repo).

## Decisions Made
- Use `node dist/index.js` commands as operational fallback because `pilot` shebang requires bun in this shell.
- Keep project-config audit strict to key-level fork coupling; do not treat project-path substrings as fork-key evidence.
- Mark phase progression blocked until migration gate failures are remediated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pilot CLI launcher unavailable due missing bun runtime**
- **Found during:** Task 1 (migration-order gate execution)
- **Issue:** `pilot` command failed with `/usr/bin/env: 'bun': No such file or directory`
- **Fix:** Built the CLI (`npm run build`) and executed equivalent commands via `node dist/index.js ...`
- **Files modified:** none in repository from the fix itself
- **Verification:** `node dist/index.js projects --json` and subsequent setup/doctor commands succeeded
- **Committed in:** `6d1dd40` (task audit evidence includes fallback and outputs)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to execute the mandated audits in this environment; no scope creep.

## Authentication Gates

None.

## Issues Encountered
- Five registered projects failed migration gate checks (missing Node package/.opencode/.planning or missing git init), so destructive cleanup remains blocked.
- GitHub archive action failed with `Resource not accessible by personal access token (archiveRepository)` and requires owner/admin action.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Migration audit artifact is complete and evidence-backed at `.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-MIGRATION-AUDIT.md`.
- **Not ready for destructive fork removal yet**: project migration blockers and repo archive owner action remain open.

---
*Phase: 72-cleanup-remove-pilot-gsd-fork*
*Completed: 2026-03-16*
