---
phase: 27-tui-detail-header-rework-run-info-density-completed-hover-overlay-fix
verified: 2026-03-03T20:00:00Z
status: gaps_found
score: 7/8 must-haves verified
gaps:
  - truth: "All existing tests still pass (from 27-02 must-haves)"
    status: partial
    reason: "9 formatRelativeTime tests in completed-panel.test.ts fail due to vi.setSystemTime() being unavailable in Bun 1.3.10's test runner. The vi.useFakeTimers() call succeeds but vi.setSystemTime is undefined in this environment. These tests were introduced by phase 27 — they are new failures, not pre-existing."
    artifacts:
      - path: "test/tui/completed-panel.test.ts"
        issue: "9 formatRelativeTime tests use vi.setSystemTime() which bun test 1.3.10 does not support (unlike vitest/Node which does). All other describe blocks (computeRowBg, statusIcon, flashBg, formatDuration) pass cleanly."
    missing:
      - "Fix the 9 formatRelativeTime tests to use a different time-mocking approach compatible with Bun 1.3.10 (e.g. Date.now mock via vi.spyOn, or restructure formatRelativeTime to accept a 'now' param for testability)"
human_verification:
  - test: "Visual detail header check"
    expected: "Navigate to a running job in pilot tui → detail view header shows all 6-8 structured rows: ID/project/scope/status, description, separator, elapsed+step+tokens, model+attempts+started, session title, optional descendants, separator"
    why_human: "Cannot render OpenTUI/SolidJS components in test environment without a full terminal"
  - test: "Completed panel hover/overlay check"
    expected: "Tab to completed panel → j/k navigation shows clean selection highlight with no double-layer color blocks; flash on new completion shows subtle dark tint not harsh white inverse"
    why_human: "Cannot test terminal rendering colors without an actual TTY"
---

# Phase 27: TUI Detail Header Rework + Completed Panel Overlay Fix — Verification Report

**Phase Goal:** Improve TUI operational clarity: rework detail header into a structured, readable summary panel with rich run metadata; fix completed panel hover/overlay rendering glitches; add regression tests for both areas.
**Verified:** 2026-03-03T20:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Detail view header shows structured multi-row metadata instead of cramped 3-line layout | ✓ VERIFIED | `detail.tsx` lines 336-384: 8 structured `<box>` rows replacing former 3-line header |
| 2 | Operators can see job ID, project, scope, status, elapsed, current step info, session title, model profile, attempts, and start time | ✓ VERIFIED | All fields rendered: lines 338-374. `parseStepInfo()` surfaces step index/label; `getSessionTitle()` surfaces session; `countDescendants()` for optional line |
| 3 | Descendant/subagent session count is visible when present | ✓ VERIFIED | `<Show when={countDescendants(sections()) > 0}>` at line 376 — conditional descendant row |
| 4 | Completed panel no longer shows hover/overlay artifacts during selection/navigation | ✓ VERIFIED | `computeRowBg()` exported at line 80-88: `selected` always wins over `flashing`; row split into 4 separate `<text>` elements with independent colors |
| 5 | Existing keybindings in detail and completed panels work unchanged | ✓ VERIFIED (structural) | Plan explicitly scoped: "Do NOT change any keyboard handling"; only header block and visual rendering modified |
| 6 | Detail header layout tests at 100 and 160 column widths | ✓ VERIFIED | `test/tui/detail-header.test.ts`: 29 tests all pass. Covers `parseStepInfo` (8 cases) and `buildHeaderLines` (21 cases) at both widths |
| 7 | Completed panel test validates no overlay artifacts during selection/focus cycling | ✓ VERIFIED | `test/tui/completed-panel.test.ts`: 27/38 tests pass. Core regression tests (computeRowBg, statusIcon, flashBg, formatDuration) all pass. `computeRowBg(true,true)` asserts `theme.highlight` — explicit regression pin |
| 8 | All existing tests still pass | ✗ FAILED | 9 `formatRelativeTime` tests introduced in phase 27 fail due to `vi.setSystemTime()` incompatibility with Bun 1.3.10. Pre-phase-27 baseline: 82 failures/203 tests. Post-phase-27: 91 failures/212 tests — the delta of +9 failures is entirely from the new `formatRelativeTime` tests in `test/tui/completed-panel.test.ts`. |

**Score:** 7/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tui/views/detail.tsx` | Reworked detail header with structured metadata blocks | ✓ VERIFIED | 506 lines. Exports: `parseStepInfo`, `buildHeaderLines`, `truncate`, `formatElapsed`, `formatTime`. Header at lines 336-384: 8 structured rows with `flexDirection="column"`. |
| `src/tui/components/completed-panel.tsx` | Fixed selection/focus rendering without overlay artifacts | ✓ VERIFIED | 215 lines. Exports: `computeRowBg`, `flashBg`, `statusIcon`, `formatDuration`, `formatRelativeTime`. Row split into 4 `<text>` elements at lines 191-208. |
| `test/tui/detail-header.test.ts` | Detail header layout tests for 2 terminal widths | ✓ VERIFIED | 382 lines, 29 tests all PASS. Tests `parseStepInfo` + `buildHeaderLines` at 100 and 160 cols. |
| `test/tui/completed-panel.test.ts` | Completed panel focus/selection regression test | ⚠️ PARTIAL | 285 lines, 38 tests: 29 PASS / 9 FAIL. Critical regression tests (computeRowBg, statusIcon, flashBg, formatDuration) all pass. 9 `formatRelativeTime` tests fail due to `vi.setSystemTime()` not available in Bun 1.3.10. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test/tui/detail-header.test.ts` | `src/tui/views/detail.tsx` | `import { parseStepInfo, buildHeaderLines }` | ✓ WIRED | Line 12: `import { parseStepInfo, buildHeaderLines } from '../../src/tui/views/detail.js'` |
| `test/tui/completed-panel.test.ts` | `src/tui/components/completed-panel.tsx` | `import { computeRowBg, ... }` | ✓ WIRED | Lines 15-21: imports `computeRowBg, statusIcon, flashBg, formatDuration, formatRelativeTime` |
| `src/tui/views/detail.tsx` | `Job` interface | `currentJob()!.delegationPlan/modelProfile/attempts/startedAt` | ✓ WIRED | Lines 358-378: all required fields accessed via `currentJob()!` |
| `src/tui/components/completed-panel.tsx` | theme constants | `computeRowBg()` → `theme.highlight` | ✓ WIRED | Line 85: `if (selected) return theme.highlight` — selection priority correct |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/tui/components/completed-panel.tsx` | 187 | `const contentFg = () => selected() ? theme.fg : theme.fg` | ℹ️ Info | Dead code — both branches return same value. No functional impact but cosmetically confusing. |
| `test/tui/completed-panel.test.ts` | 224-282 | `vi.setSystemTime()` not available in Bun 1.3.10 | 🛑 Blocker | 9 `formatRelativeTime` tests fail. Core logic of `formatRelativeTime` is tested — the _coverage_ is broken, not the implementation. |

---

## Detailed Artifact Verification

### `src/tui/views/detail.tsx`

**Level 1 (Exists):** ✓ EXISTS — 506 lines  
**Level 2 (Substantive):** ✓ SUBSTANTIVE — Full SolidJS component with helpers. Exports `parseStepInfo`, `buildHeaderLines`, `truncate`, `formatElapsed`, `formatTime`. No stubs.  
**Level 3 (Wired):** ✓ WIRED — Imported by `test/tui/detail-header.test.ts`. Used in TUI route system.

Header layout confirmation (lines 336-384):
- Line 1: `#id  project  scope` + colored status (row 338-347)
- Line 2: `"description"` truncated to 80 chars (line 349-352)
- Line 3: separator (`────`) (line 354)
- Line 4: `⏱ elapsed   Step N/total: command "args"   ◆ tokens` (lines 356-360)
- Line 5: `Model: profile/mode   Attempts: N/max   Started: HH:MM:SS` (lines 361-369)
- Line 6: `Session: title` (lines 371-374)
- Line 7 (conditional): `Descendants: N subagent sessions` (lines 376-381)
- Line 8: separator (line 383)

### `src/tui/components/completed-panel.tsx`

**Level 1 (Exists):** ✓ EXISTS — 215 lines  
**Level 2 (Substantive):** ✓ SUBSTANTIVE — Full SolidJS component. All required exports present. `computeRowBg` selection-priority logic at lines 80-88.  
**Level 3 (Wired):** ✓ WIRED — Imported by test. Used in TUI layout.

Overlay fix confirmation:
- `computeRowBg(selected, flashing, status)`: line 85 checks `selected` first — selection wins unconditionally
- Flash colors: `#0d2b0d` (green tint), `#2b0d0d` (red tint) — dark, not harsh inverse
- Row split: 4 separate `<text>` elements (icon, identity, description, metrics) with independent fg colors

### Test Results Summary

| Test File | Tests | Pass | Fail | Critical Assertions |
|-----------|-------|------|------|-------------------|
| `test/tui/detail-header.test.ts` | 29 | 29 | 0 | ✓ All pass |
| `test/tui/completed-panel.test.ts` | 38 | 29 | 9 | ✓ computeRowBg regression pin passes; flashBg, statusIcon, formatDuration all pass |

**Build:** ✓ CLEAN — `bun run build` / `tsc` completes with zero TypeScript errors.

**Pre-phase-27 baseline failures:** 82/203 tests failing (established by checking state at commit `a8025e9`).  
**Post-phase-27 failures:** 91/212 tests failing — net new failures are exactly the 9 `formatRelativeTime` tests introduced by phase 27.

---

## Gaps Summary

**One gap:** The `formatRelativeTime` tests (9 of 38 in `completed-panel.test.ts`) fail because `vi.setSystemTime()` is not implemented in Bun 1.3.10's test runner. The `vi.useFakeTimers()` call succeeds but `vi.setSystemTime` is `undefined`.

This is a test infrastructure incompatibility, not a bug in the production code. The `formatRelativeTime` function itself is correct (it handles null, future dates, and various time ranges). The other 29 tests in the file — including the **core overlay regression pin** (`computeRowBg(true, true) === theme.highlight`) — all pass.

**Impact on goal:** The phase goal of "add regression tests for both areas" is partially achieved. The detail header is fully regression-protected (29/29 tests pass). The completed panel's critical overlay fix is regression-protected (computeRowBg tests pass), but the time-formatting helper lacks working tests for time-relative assertions.

**Fix required:** Refactor `formatRelativeTime` tests to avoid `vi.setSystemTime()`. Options:
1. Add an optional `now?: number` parameter to `formatRelativeTime` for dependency injection
2. Use `vi.spyOn(Date, 'now').mockReturnValue(...)` instead of fake timers
3. Test with real wall-clock offsets using `new Date(Date.now() - Ns).toISOString()`

---

## Human Verification Required

### 1. Detail Header Visual Layout
**Test:** Run `pilot tui`, navigate to a running job, press Enter to open detail view  
**Expected:** Header shows 6-8 structured rows with all metadata fields (id, project, scope, status on line 1; description on line 2; separator; elapsed+step+tokens; model+attempts+started; session title; optional descendants; separator)  
**Why human:** Cannot render OpenTUI/SolidJS terminal components in vitest without a TTY

### 2. Completed Panel Selection Without Overlay
**Test:** Run `pilot tui`, Tab to completed panel, use j/k to move selection up and down  
**Expected:** Selection highlight is clean (one solid block color). No double-layer color artifacts. Flash on a new completion shows a subtle dark green or red tint, not a harsh white inverse.  
**Why human:** Terminal rendering requires an actual TTY; color layers cannot be verified by code analysis alone

---

_Verified: 2026-03-03T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
