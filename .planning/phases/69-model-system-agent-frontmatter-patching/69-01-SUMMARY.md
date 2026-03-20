---
phase: 69-model-system-agent-frontmatter-patching
plan: 01
subsystem: infra
tags: [model-routing, yaml, frontmatter, opencode, gsd-agents]

# Dependency graph
requires:
  - phase: 68-judge-system-move-into-pilot
    provides: stable runner/judge model resolution flow that this plan hardens at the frontmatter patch layer
provides:
  - Parser-safe YAML frontmatter mutation helpers for `model` and `variant`
  - File-driven `.opencode/agents/gsd-*.md` patching with deterministic discovery
  - `inherit` fallback + summary reporting (`patched`/`unchanged`/`skipped`/`fallback`) for unmapped agents
affects: [69-02-runner-integration, 69-03-regression-coverage, model-patching-observability]

# Tech tracking
tech-stack:
  added: [yaml]
  patterns:
    - "Patch from discovered agent files, not from model-map keys"
    - "Mutate YAML documents via parseDocument + set/delete for key-scoped edits"

key-files:
  created: []
  modified:
    - package.json
    - bun.lock
    - src/core/models.ts
    - test/core/models.test.ts

key-decisions:
  - "patchAgentFrontmatter now treats installed gsd-*.md files as source-of-truth and applies inherit fallback for missing map entries"
  - "models tests reset to in-memory DB before each test to avoid local model-profile state leaking into assertions"

patterns-established:
  - "Agent patching returns actionable summary arrays for future runner logging"
  - "Invalid/missing frontmatter files are skipped defensively without throwing"

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 69 Plan 01: Parser-Safe Frontmatter Patching Foundation Summary

**YAML document-driven patching now scans installed `gsd-*.md` files, enforces `inherit` fallback on unmapped agents, and returns structured patch diagnostics.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T01:50:22Z
- **Completed:** 2026-03-16T01:56:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added runtime `yaml` dependency and parser helpers in `src/core/models.ts`.
- Replaced regex/line surgery with parser-safe frontmatter mutation using `parseDocument`, `doc.set`, and `doc.delete`.
- Switched patching to discovered `.opencode/agents/gsd-*.md` files with deterministic filename ordering.
- Added explicit fallback behavior: missing model-map agents are reset to `model: inherit` and `variant` is removed.
- Added patch summary return contract (`patched`, `unchanged`, `skipped`, `fallback`) for runner-facing diagnostics.
- Expanded `test/core/models.test.ts` coverage for fallback handling, skip safety, and deterministic DB isolation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add YAML parser dependency and parser helpers in models.ts** - `6ac3204` (feat)
2. **Task 2: Rewrite patchAgentFrontmatter to be file-driven with inherit fallback** - `f656fde` (feat)

## Files Created/Modified

- `package.json` - Added direct `yaml` runtime dependency.
- `bun.lock` - Tool-generated lockfile update from Bun install.
- `src/core/models.ts` - Added file discovery/frontmatter parsing helpers and rewrote `patchAgentFrontmatter` to parser-safe file-driven flow with summary return.
- `test/core/models.test.ts` - Updated frontmatter assertions and added regression tests for fallback/skip behavior and DB isolation.

## Decisions Made

- **File discovery drives patching scope:** The patch loop now iterates real `gsd-*.md` files under `.opencode/agents` instead of iterating only provided model-map keys, preventing silent stale model retention when maps are partial.
- **Fallback policy is explicit and non-fatal:** Unmapped discovered agents are patched to `model: inherit` and have `variant` removed; files with missing/invalid frontmatter are skipped safely and reported.
- **Test determinism over local DB state:** Model-resolution tests now initialize an in-memory DB before each test to avoid local persistent profile overrides affecting expected values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bun binary unavailable on PATH in execution shell**
- **Found during:** Task 1 dependency installation and Task 2 verification
- **Issue:** `bun` command failed with `command not found`, blocking required lockfile generation and test execution
- **Fix:** Used explicit Bun binary path (`$HOME/.bun/bin/bun`) for dependency install and test commands
- **Files modified:** None (execution-environment workaround)
- **Verification:** `bun add yaml` and `bun test test/core/models.test.ts` succeeded via explicit binary path
- **Committed in:** N/A (environment-level unblock)

**2. [Rule 1 - Bug] Model tests were reading persistent local DB state**
- **Found during:** Task 2 verification (`bun test test/core/models.test.ts`)
- **Issue:** Early model-resolution tests could resolve against user-customized persistent DB rows instead of deterministic seeded test state, causing mismatched expected model/variant assertions
- **Fix:** Added global `beforeEach(() => _getTestDb())` in `test/core/models.test.ts`
- **Files modified:** `test/core/models.test.ts`
- **Verification:** `bun test test/core/models.test.ts` passes consistently (34/34)
- **Committed in:** `f656fde`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were required to complete planned verification reliably; no scope creep.

## Issues Encountered

- Bun was installed at `~/.bun/bin/bun` but not on PATH in this shell; resolved by invoking the binary directly.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core patching behavior now satisfies file-driven + parser-safe requirements and exposes summary diagnostics.
- Ready for `69-02-PLAN.md` to wire summary diagnostics into runner logging and enforce single authoritative patch point behavior.

---
*Phase: 69-model-system-agent-frontmatter-patching*
*Completed: 2026-03-16*
