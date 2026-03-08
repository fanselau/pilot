---
phase: 48-fix-new-project-setup-critical-bugs
plan: 02
subsystem: testing
tags: [vitest, setup, gsd-delegate, path-normalization]

# Dependency graph
requires:
  - phase: 48-01
    provides: setupProject() command layout validation with gsd-delegate.md check
provides:
  - Test coverage for gsd-delegate.md validation (missing + present paths)
  - Path normalization regression tests (trailing slash stripping)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real temp dirs with mock getConfig for core/setup.ts integration testing"

key-files:
  created:
    - test/core/setup.test.ts
  modified: []

key-decisions:
  - "resolveProjectDir returns absolute paths as-is (including trailing slash) — normalization happens in setupProject via path.resolve()"
  - "Tests use real temp directories (mkdtemp) rather than mocking fs"

patterns-established:
  - "Partial config mock with importOriginal to preserve resolveProjectDir while overriding getConfig"

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 48 Plan 02: Test Coverage for Command Layout Validation Summary

**6 new tests covering gsd-delegate.md validation, early return on missing delegate, and path normalization via path.resolve in setupProject()**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T14:07:35Z
- **Completed:** 2026-03-08T14:10:31Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 3 tests for command layout validation: missing gsd-delegate.md error, present gsd-delegate.md success, and early return behavior
- Added 3 path normalization regression tests: resolveProjectDir absolute path behavior, Node path.resolve built-in, and setupProject trailing slash handling
- Full test suite passes: 805 tests (799 existing + 6 new), 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add command layout validation tests** - `d59e01d` (test)
2. **Task 2: Verify path normalization and run full regression** - verified within Task 1 commit (no additional file changes needed)

## Files Created/Modified
- `test/core/setup.test.ts` - New test file: 6 tests for setupProject() command layout validation and path normalization

## Decisions Made
- `resolveProjectDir` returns absolute paths as-is (including trailing slashes) — it does NOT normalize. Normalization happens in `setupProject()` via `path.resolve(dir)` at line 62. Tests reflect this actual behavior.
- Used `importOriginal` pattern for config mock to partially mock `getConfig` while preserving `resolveProjectDir` for direct testing.
- Tests use real temp directories (`mkdtemp`) with controlled gsdDir mock rather than mocking filesystem operations, consistent with existing test patterns.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 48 complete — all 2 plans executed
- 805 tests passing with 0 failures
- setupProject() now has both implementation (Plan 01) and test coverage (Plan 02) for command layout validation

---
*Phase: 48-fix-new-project-setup-critical-bugs*
*Completed: 2026-03-08*
