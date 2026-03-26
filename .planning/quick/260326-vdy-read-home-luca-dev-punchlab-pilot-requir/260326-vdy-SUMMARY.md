---
phase: quick
plan: 260326-vdy
subsystem: runner
tags: [verification, judge-routing, runner, observability, vitest]

# Dependency graph
requires:
  - phase: 68
    provides: "Judge verdict storage and phase completion routing"
  - phase: 81
    provides: "Human review states and review_hold/completed_pending_review semantics"
provides:
  - "Typed VERIFICATION.md artifact parsing with deterministic availability fallbacks"
  - "Structured runner routing for actionable gaps vs human-only review work"
  - "Operator-visible verification status and routing counts in info/log output"
affects: [judge-pipeline, phase-routing, review-states, operator-observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structured verification first: VERIFICATION.md frontmatter decides gap continuation before judge prose"
    - "Visible safe fallback: missing or unreadable verification artifacts become review_hold with stored routing metadata"

key-files:
  created:
    - src/core/verification-artifact.ts
    - test/core/verification-artifact.test.ts
  modified:
    - src/core/types.ts
    - src/core/runner.ts
    - src/core/judge-signal.ts
    - src/commands/info.ts
    - src/commands/log.ts
    - test/core/runner.test.ts
    - test/core/runner-continuation-budget.test.ts
    - test/core/judge-signal.test.ts
    - test/commands/info.test.ts
    - test/commands/log.test.ts

key-decisions:
  - "Structured `gaps` stay actionable by default; only explicit schema flags can mark a gap human-only"
  - "Gap-style judge verdicts persist verification status, counts, routing decision, and artifact path in stored verdict JSON"
  - "Unavailable structured verification never falls back to prose heuristics and always pauses with review_hold"

patterns-established:
  - "Judge signal consumers read stored structured verification metadata instead of rescanning the filesystem"
  - "Operator output names verification status, actionable gap count, human verification count, and routing decision directly"

requirements-completed: [VERIFY-STRUCT-01, VERIFY-ROUTING-02, VERIFY-FALLBACK-03, VERIFY-OBSERVE-04, VERIFY-TEST-05]

# Metrics
duration: 12min
completed: 2026-03-26
---

# Quick Task 260326-vdy: Structured Verification Routing Summary

**Pilot now routes gap-style judge outcomes from structured `VERIFICATION.md` frontmatter, stores the routing basis in judge verdict metadata, and shows the exact structured counts behind re-delegation or human review decisions.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-26T22:44:00Z
- **Completed:** 2026-03-26T22:56:20Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Added a typed verification artifact parser that selects the newest phase-local `*-VERIFICATION.md`, normalizes `gaps` and `human_verification`, and returns explicit missing/unreadable fallbacks
- Replaced runner keyword heuristics with structured routing so mixed actionable/manual artifacts re-delegate, explicit `human_needed` artifacts pause for human review, and unreadable artifacts enter `review_hold`
- Persisted structured routing metadata in stored judge verdicts and surfaced the status, counts, routing decision, and routing reason in `pilot info` and `pilot log --summary`
- Added focused regression coverage for latest-artifact selection, k87k-style mixed artifacts, prose-insensitive routing, safe fallback handling, and backward-compatible verdict parsing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a typed VERIFICATION artifact parser and routing snapshot** - `9a2635a` (test), `5012b9c` (feat)
2. **Task 2: Replace heuristic judge:gaps routing with structured verification decisions** - `fd3bc7b` (test), `e224fb9` (feat)
3. **Task 3: Surface structured verification routing in judge signals, info, and log output** - `c843c71` (test), `02c20e1` (feat)

_Note: All three tasks followed TDD red/green commits._

## Files Created/Modified
- `src/core/types.ts` - Added reusable verification artifact and routing snapshot types
- `src/core/verification-artifact.ts` - Implemented latest-artifact discovery, YAML frontmatter parsing, normalization, and routing derivation
- `src/core/runner.ts` - Replaced human-only keyword routing with structured verification decisions and stored routing metadata in judge verdicts
- `src/core/judge-signal.ts` - Preserved structured verification fields while keeping older verdict payloads backward compatible
- `src/commands/info.ts` - Added structured verification status/count/routing visibility to phase job details and JSON output
- `src/commands/log.ts` - Added structured verification routing basis to summary output and summary JSON payloads
- `test/core/verification-artifact.test.ts` - Covered latest-file selection, mixed gaps/manual checks, explicit human-needed status, and deterministic fallbacks
- `test/core/runner.test.ts` - Replaced heuristic routing regressions with structured routing tests for mixed artifacts, human-needed artifacts, and safe fallback behavior
- `test/core/runner-continuation-budget.test.ts` - Added structured routing snapshot regressions including the k87k-style actionable gap case
- `test/core/judge-signal.test.ts` - Added structured verification parsing and backward-compat coverage for older verdict payloads
- `test/commands/info.test.ts` - Verified phase review states show structured verification status, counts, and routing reason
- `test/commands/log.test.ts` - Verified summary output explains routing using structured verification terminology

## Decisions Made
- Used `VERIFICATION.md` frontmatter as the authoritative source for post-judge gap routing whenever a structured artifact exists
- Kept actionable gaps and `human_verification` as separate concepts, with actionable gaps always winning mixed artifacts
- Stored structured routing metadata in `judgeVerdict` so operator views do not need to rescan phase directories

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test fixtures to match the current shared `Job` contract**
- **Found during:** Task 3 (observability test expansion)
- **Issue:** Shared `Job` test factories in `test/core/judge-signal.test.ts` and `test/commands/log.test.ts` were missing `runtimeSkillSnapshot` and newer retry fields, which blocked TypeScript verification once the new tests compiled those factories under `tsc --noEmit`
- **Fix:** Added the missing nullable fields to the shared test fixtures before continuing with the structured verification assertions
- **Files modified:** `test/core/judge-signal.test.ts`, `test/commands/log.test.ts`
- **Verification:** `npx vitest run test/core/judge-signal.test.ts test/commands/info.test.ts test/commands/log.test.ts --reporter=verbose && npm run lint`
- **Committed in:** `c843c71`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required to let the planned observability tests compile against the current shared job type. No feature scope changed.

## Issues Encountered
- None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The judge pipeline now has a durable structured verification contract for future review-state and retry work
- Operator tooling can explain why a job re-delegated or paused without re-reading plan artifacts from disk

## Self-Check: PASSED

- Summary file exists at `.planning/quick/260326-vdy-read-home-luca-dev-punchlab-pilot-requir/260326-vdy-SUMMARY.md`
- Task commits verified: `9a2635a`, `5012b9c`, `fd3bc7b`, `e224fb9`, `c843c71`, `02c20e1`
