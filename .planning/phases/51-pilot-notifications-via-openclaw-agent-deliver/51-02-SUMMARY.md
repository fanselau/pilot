---
phase: 51-pilot-notifications-via-openclaw-agent-deliver
plan: 02
subsystem: api
tags: [openclaw, notifications, execa, routing, vitest]

# Dependency graph
requires:
  - phase: 51-pilot-notifications-via-openclaw-agent-deliver
    provides: structured route model and strict resolver from 51-01
provides:
  - OpenClaw CLI delivery executor for `openclaw agent --deliver`
  - route-first callback transport with strict configuration error handling
  - group/DM notification tests covering runtime failure behavior
affects: [51-03-PLAN, callback runtime notifications, OpenClaw route operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - dedicated execa wrapper for OpenClaw delivery with typed result envelope
    - route-first callback flow (resolve first, deliver second, fail closed on invalid routes)

key-files:
  created:
    - src/core/openclaw-deliver.ts
    - test/core/openclaw-deliver.test.ts
  modified:
    - src/core/callback.ts
    - test/core/callback.test.ts

key-decisions:
  - "OpenClaw deliver execution is isolated in a dedicated module with deterministic arg building and non-throwing runtime result shape."
  - "notifyJobCompletion now fails closed with explicit route errors and never falls back to /hooks/wake for configured OpenClaw delivery targets."

patterns-established:
  - "Prompt contract pattern: deterministic key:value context lines plus a natural-response instruction"
  - "Group and DM routing share one transport path; only resolved `to` differs"

# Metrics
duration: 5 min
completed: 2026-03-10
---

# Phase 51 Plan 02: Runtime delivery rewrite Summary

**Pilot callback notifications now deliver through `openclaw agent --deliver` with strict route resolution, explicit reply routing flags, and deterministic chat-ready prompt context.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T16:16:38Z
- **Completed:** 2026-03-10T16:22:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `src/core/openclaw-deliver.ts` as the single execa-based delivery executor with explicit argument-array construction and runtime failure surfaces.
- Rewrote `notifyJobCompletion()` to resolve canonical routes first, build structured prompts, and invoke `openclaw agent --deliver` instead of `/hooks/wake`.
- Added test coverage for delivery executor behavior and callback contract behavior across group routes, DM routes, invalid routes, and runtime delivery failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OpenClaw deliver executor wrapper** - `4be947b` (feat)
2. **Task 2: Rewrite notifyJobCompletion to route-first OpenClaw delivery** - `e2c7696` (feat)

**Plan metadata:** pending (recorded in final docs commit)

## Files Created/Modified
- `src/core/openclaw-deliver.ts` - New argument builder + execa executor for `openclaw agent --deliver`.
- `test/core/openclaw-deliver.test.ts` - Executor tests for non-zero exit, spawn failure, and optional account flag behavior.
- `src/core/callback.ts` - Route-first callback flow using notify-route resolver and OpenClaw deliver executor with structured prompt contract.
- `test/core/callback.test.ts` - Callback behavior tests for group/DM delivery, invalid-route failures, prompt content contract, and fire-and-forget runtime safety.

## Decisions Made
- Kept callback transport strictly route-first: route resolution failures log actionable errors and return `false` without transport fallback.
- Standardized callback prompt content as deterministic key/value lines plus natural-response guidance for consistent agent-authored chat updates.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Runtime callback delivery now uses the required OpenClaw CLI path and enforces strict route validity behavior.
- Ready for `51-03-PLAN.md` to wire project/add command route management and queue-time route snapshot UX.

---
*Phase: 51-pilot-notifications-via-openclaw-agent-deliver*
*Completed: 2026-03-10*
