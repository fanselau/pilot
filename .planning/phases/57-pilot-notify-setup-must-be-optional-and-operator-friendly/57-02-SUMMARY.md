---
phase: 57-pilot-notify-setup-must-be-optional-and-operator-friendly
plan: 02
subsystem: docs
tags: [notifications, documentation, cli-help, skill]

# Dependency graph
requires:
  - phase: 57-01
    provides: optional notify code behavior (--no-notify default, owner-based routing)
provides:
  - Updated GETTING-STARTED.md Section 9 with optional notify framing and setup flow
  - Updated README.md notifications section with optional messaging
  - Updated SKILL.md notification pipeline description
  - Updated CLI --notify help text with (optional) label
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - docs/GETTING-STARTED.md
    - README.md
    - skills/openclaw-pilot/SKILL.md
    - src/index.ts

key-decisions:
  - "Kept 'What You Receive' subsection in SKILL.md unchanged — still accurate"
  - "Reordered README notification list to lead with agent routing (primary use case)"

patterns-established: []

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 57 Plan 02: Documentation & Help Text — Optional Notify Framing Summary

**All user-facing docs, SKILL.md, and CLI help text consistently frame notifications as optional with clear setup flows**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T23:38:48Z
- **Completed:** 2026-03-11T23:41:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GETTING-STARTED.md Section 9 rewritten with "Pilot works perfectly without notifications" lead and step-by-step setup subsections (Quick Setup, Per-Job Override, Default Notify, OpenClaw Webhook, Telegram)
- README.md managed projects section notes owner is optional; notifications section explicitly says "Notifications are optional"
- SKILL.md notification pipeline opens with "Notifications are optional" and shows owner-based setup with structured route commands
- CLI `--notify` help text now reads "(optional, e.g. main)"

## Task Commits

Each task was committed atomically:

1. **Task 1: Update GETTING-STARTED.md and README.md notify sections** - `c74dc6f` (docs)
2. **Task 2: Update SKILL.md and CLI help text for consistency** - `149dc61` (docs)

## Files Created/Modified
- `docs/GETTING-STARTED.md` — Section 9 rewritten with optional framing and setup subsections
- `README.md` — Managed projects and Notifications sections updated for optionality
- `skills/openclaw-pilot/SKILL.md` — Notification Pipeline section rewritten
- `src/index.ts` — --notify option description updated

## Decisions Made
- Kept SKILL.md "What You Receive" subsection unchanged — it accurately describes the callback payload
- Reordered README notification list to lead with agent routing (primary use case) over webhook

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 57 complete — all documentation now consistently frames notify as optional
- No blockers for future phases

---
*Phase: 57-pilot-notify-setup-must-be-optional-and-operator-friendly*
*Completed: 2026-03-11*
