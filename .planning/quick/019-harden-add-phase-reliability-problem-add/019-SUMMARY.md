---
phase: quick-019
plan: 01
subsystem: runner/delegate
tags: [add-phase, blocklist, reliability, validation, gsd-prompt]
requires: []
provides:
  - GSD_INSTRUCTION_BLOCKLIST exported from delegate.ts
  - matchesBlocklist() helper exported from delegate.ts
  - verifyStepArtifacts add-phase blocklist check
  - verifyStepArtifacts add-phase duplicate detection via ROADMAP.md
  - Hardened gsd-add-phase.md prompt (gitignored, written to disk)
affects:
  - runner.ts (enhanced add-phase artifact verification)
  - delegate.ts (blocklist constant and helper)
tech-stack:
  added: []
  patterns:
    - Blocklist pattern for GSD instruction phrase detection
    - ROADMAP.md duplicate phase title detection
    - Warning-only title similarity check (non-failing)
key-files:
  created: []
  modified:
    - src/core/delegate.ts
    - src/core/runner.ts
    - test/core/delegate.test.ts
    - test/core/runner.test.ts
    - .opencode/command/gsd-add-phase.md (gitignored)
decisions:
  - matchesBlocklist uses substring matching not exact — GSD instruction phrases appear mid-sentence
  - Duplicate check normalizes slug-to-words via hyphen-to-space replacement
  - Title similarity check is warning-only (non-failing) — GSD may legitimately clean up titles
  - .opencode is gitignored so gsd-add-phase.md change not committed to git
metrics:
  duration: 3m
  completed: "2026-03-03"
---

# Quick Task 019: Harden add-phase Reliability Summary

**One-liner:** GSD_INSTRUCTION_BLOCKLIST + matchesBlocklist() in delegate.ts, enhanced verifyStepArtifacts with blocklist/duplicate checks, hardened gsd-add-phase.md prompt

## What Was Built

Three failure modes of `add-phase` hardened:

### 1. GSD Prompt Hardened (`gsd-add-phase.md`)

- Added CRITICAL verbatim-args instruction in `parse_arguments` step: explicitly instructs AI not to use prompt template text as the phase title
- Added self-validation step in `generate_slug`: check description against instruction phrases before slugifying
- Added DUPLICATE CHECK in `update_roadmap`: scan existing `### Phase N:` headings before inserting

### 2. Blocklist Guard (`delegate.ts`)

Added two exported symbols:
- `GSD_INSTRUCTION_BLOCKLIST`: readonly array of 10 known GSD instruction phrases that should never appear in phase titles
- `matchesBlocklist(title: string): string | null`: returns matched phrase (case-insensitive substring) or null if clean

### 3. Enhanced `verifyStepArtifacts` for add-phase (`runner.ts`)

Three additional checks after the basic "new directory created" check:

**a) Blocklist check (hard failure):** Converts new directory slug back to words (hyphens → spaces), runs `matchesBlocklist()`. If matched, returns `{ ok: false, error: 'add-phase created directory with GSD instruction text as title...' }`.

**b) Title similarity check (warning only):** Compares expected title (step.args) with actual directory slug. If normalized word overlap < 50% and directory has ≥3 words, logs warning to stderr. Non-failing — GSD may legitimately clean up titles.

**c) Duplicate detection (hard failure):** Reads `ROADMAP.md`, extracts all `### Phase N: <title>` headings, compares (case-insensitive) against new directory slug-as-words. If match found, returns `{ ok: false, error: 'add-phase created duplicate phase...' }`.

Added optional `warning?: string` field to `ArtifactVerification` interface.

## Tests Added

**`test/core/delegate.test.ts`** — 11 new `matchesBlocklist` tests:
- Detects "add a new integer phase" (full phrase)
- Detects "execute all plans"
- Returns null for legitimate titles (Fix premature completion detection, TUI Visual Polish, Harden add-phase reliability)
- Case-insensitive matching
- Detects "current milestone in the roadmap", "spawn subagents"
- Returns null for partial matches ("Fix phase detection logic")
- Verifies GSD_INSTRUCTION_BLOCKLIST is exported and non-empty

**`test/core/runner.test.ts`** — 4 new `verifyStepArtifacts` tests:
- Blocklist failure: `02-add-a-new-integer-phase-to-the-end` fails with "GSD instruction text"
- Legitimate success: `02-fix-premature-completion` passes
- Duplicate failure: new dir matching existing ROADMAP phase title fails
- ROADMAP not found: skips duplicate check gracefully (still passes)

## Verification

```
✓ test/core/delegate.test.ts (63 tests)
✓ test/core/runner.test.ts  (47 tests)
110 tests total — all passed
npx tsc --noEmit — clean
```

## Deviations from Plan

### Auto-fixed Issues

**[Rule 1 - Bug] `.opencode` is gitignored — gsd-add-phase.md not committed**

- **Found during:** Commit step
- **Issue:** `.opencode/` is in `.gitignore` so `gsd-add-phase.md` cannot be committed to git
- **Fix:** Changes written to disk (file is modified for the running system), committed remaining files without it. File is hardened on disk as intended — just not tracked in git.
- **Files modified:** `.opencode/command/gsd-add-phase.md` (on disk only)

**[Rule 3 - Blocking] runner.test.ts mock for delegate.js missing matchesBlocklist**

- **Found during:** Implementation — runner.ts now imports matchesBlocklist from delegate.ts
- **Issue:** The existing `vi.mock('../../src/core/delegate.js')` only mocked `delegate` and `resolveOpencodeBinary`, causing the imported `matchesBlocklist` to be undefined in tests
- **Fix:** Added inline implementation of `matchesBlocklist` to the mock factory (mirrors the real implementation) so verifyStepArtifacts tests exercise the actual logic without importing delegate's real code
- **Files modified:** `test/core/runner.test.ts`

## Next Phase Readiness

- All success criteria met
- `matchesBlocklist("Add a new integer phase to the end of the current milestone")` returns matched phrase ✓
- `matchesBlocklist("Fix premature completion detection")` returns null ✓
- `verifyStepArtifacts` rejects blocklist-matching directories ✓
- `verifyStepArtifacts` rejects duplicate phase titles ✓
- `gsd-add-phase.md` has explicit CRITICAL instruction to use args verbatim ✓
- All tests pass, TypeScript compiles clean ✓
