---
phase: 59-pilot-tui-shortcuts-and-project-management-actions-must-work-in-real-usage
verified: 2026-03-12T09:50:56Z
status: gaps_found
score: 6/9 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2739, error_summary: "" }
  tests: { pass: true, summary: "943 passed, 0 failed", duration_ms: 14012 }
  build: { pass: true, duration_ms: 3070, error_summary: "" }
verdict: FAIL
blocking_issues:
  - "Footer queue hint advertises `r retry`, but queue selection is pending-only so retry is not actually available in that panel."
  - "r/x/K inapplicable keypresses still no-op silently; there is no runtime feedback state/render path for invalid action attempts."
  - "Shortcut tests do not execute the real keyboard handler branch in app.tsx; they validate static/status metadata only."
gaps:
  - truth: "Action shortcuts (r/x/K) provide visual feedback when pressed on inapplicable targets"
    status: failed
    reason: "Keyboard handlers gate by status/panel and return, but no UI feedback is emitted for invalid attempts."
    artifacts:
      - path: "src/tui/app.tsx"
        issue: "r/x/K handlers short-circuit without setting any feedback signal when action is inapplicable."
      - path: "src/tui/state.ts"
        issue: "State store has no transient action-feedback signal to surface invalid shortcut attempts."
    missing:
      - "A user-visible invalid-action feedback path (status/overlay/footer notice) for r/x/K when target is inapplicable"
      - "Wiring from keyboard guard branches to that feedback UI"
  - truth: "Footer bar hints reflect what's available in the current panel context"
    status: failed
    reason: "Queue panel hint includes `r retry`, but queue panel data is pending-only and retry requires failed/cancelled status."
    artifacts:
      - path: "src/tui/components/footer-bar.tsx"
        issue: "dashboard.queue hint contains `r retry`."
      - path: "src/tui/data/pilot-db.ts"
        issue: "fetchQueueData() populates queue panel with pending jobs only."
      - path: "src/tui/app.tsx"
        issue: "retry branch requires job.status === failed/cancelled."
    missing:
      - "Queue-panel footer hint aligned to actual queue-panel actions"
      - "(Optional) per-selected-item action hinting if status-gated actions should be shown conditionally"
  - truth: "Tests exercise the actual keyboard handler branching logic"
    status: failed
    reason: "shortcuts.test.ts does not import App or drive useKeyboard callback; new branching tests are synthetic status-array assertions."
    artifacts:
      - path: "test/tui/shortcuts.test.ts"
        issue: "No runtime key-event dispatch through app.tsx keyboard handler; no side-effect assertions for remove/cancel/retry/kill branches."
    missing:
      - "Test harness capturing useKeyboard callback from App and dispatching real key events"
      - "Assertions on real branch effects (confirm overlay state, deregister/cancel/retry/force-quit calls, panel gates)"
---

# Phase 59: Pilot TUI Shortcuts and Project-Management Actions Must Work in Real Usage Verification Report

**Phase Goal:** Make TUI keyboard interaction reliable and useful in real usage — fix shortcut reliability by making action feedback context-aware, add project-management actions (remove project with confirmation), and ensure footer/help text accurately reflects available actions per panel.
**Verified:** 2026-03-12T09:50:56Z
**Status:** gaps_found
**Verdict:** FAIL
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Action shortcuts (r/x/K) provide visual feedback when pressed on inapplicable targets | ✗ FAILED | `src/tui/app.tsx:288`, `src/tui/app.tsx:311`, `src/tui/app.tsx:330` gate and return with no feedback signal update/render path. |
| 2 | Project panel has a remove-project action with confirmation overlay | ✓ VERIFIED | `src/tui/app.tsx:257` wires `d` (projects panel), `src/tui/app.tsx:262` sets confirm action, `src/tui/app.tsx:423` renders `ConfirmOverlay`. |
| 3 | Removed project disappears from the projects panel | ✓ VERIFIED | Confirm action calls `deregisterProject` + immediate refresh via `state.setProjects(fetchProjectData())` at `src/tui/app.tsx:263` and `src/tui/app.tsx:264`. |
| 4 | Shortcuts needing selected job (r/x/K) work from panels that have jobs | ✓ VERIFIED | `selectedJob` returns queue/running/completed items in `src/tui/state.ts:68`, `src/tui/state.ts:69`, `src/tui/state.ts:70`; handlers consume it in `src/tui/app.tsx:289`, `src/tui/app.tsx:312`, `src/tui/app.tsx:331`. |
| 5 | Footer bar hints reflect available actions in current panel context | ✗ FAILED | Queue hint includes `r retry` in `src/tui/components/footer-bar.tsx:28`, but queue panel data is pending-only (`src/tui/data/pilot-db.ts:23`) and retry requires failed/cancelled (`src/tui/app.tsx:290`). |
| 6 | Help overlay lists all shortcuts including new `d` | ✓ VERIFIED | `d` remove-project entry is present in `src/tui/components/help-overlay.tsx:30`. |
| 7 | Help text does not list shortcuts that are not wired | ✓ VERIFIED | All listed dashboard/global/detail keys map to handlers in `src/tui/app.tsx` (q/Ctrl-C/?//Esc/Tab/s/1/2/3/u/d/r/x/K/j/k/g/G/Enter). |
| 8 | Tests exercise actual keyboard handler branching logic | ✗ FAILED | `test/tui/shortcuts.test.ts` validates HELP_TEXT/getFooterHint + synthetic status arrays; it does not import/drive `src/tui/app.tsx` keyboard handler. |
| 9 | Tests cover new remove-project shortcut | ✓ VERIFIED | `d` included in implemented key set and dedicated tests exist at `test/tui/shortcuts.test.ts:50`, `test/tui/shortcuts.test.ts:218`, `test/tui/shortcuts.test.ts:226`, `test/tui/shortcuts.test.ts:237`. |

**Score:** 6/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/db.ts` | `deregisterProject` function | ✓ VERIFIED | Exists (1460 lines), substantive SQL delete implementation at `src/core/db.ts:1240`, exported at `src/core/db.ts:1417`, consumed through TUI data layer. |
| `src/tui/app.tsx` | Keyboard handling + remove-project confirmation flow | ⚠ PARTIAL | Exists (443 lines), wired `d` flow and confirm messages; still lacks invalid-action feedback branch for inapplicable r/x/K attempts. |
| `src/tui/state.ts` | Confirmation message state for context-aware overlay | ✓ VERIFIED | Exists (168 lines), `confirmMessage` signal defined at `src/tui/state.ts:50` and exported at `src/tui/state.ts:112`. |
| `src/tui/data/pilot-db.ts` | Re-export of `deregisterProject` for TUI | ✓ VERIFIED | Exists (46 lines), imports and re-exports `deregisterProject` at `src/tui/data/pilot-db.ts:11` and `src/tui/data/pilot-db.ts:46`. |
| `src/tui/components/projects-panel.tsx` | Selected-project `d` remove hint | ✓ VERIFIED | Exists (73 lines), selected-row hint at `src/tui/components/projects-panel.tsx:64`, wired in dashboard layout. |
| `src/tui/components/footer-bar.tsx` | Context-aware per-panel hints | ⚠ PARTIAL | Exists (53 lines), panel-aware function exists, but queue hint/action mapping is inaccurate for retry action. |
| `src/tui/components/help-overlay.tsx` | Updated help text including `d` | ✓ VERIFIED | Exists (60 lines), `HELP_TEXT` includes remove-project shortcut and no obvious phantom entries. |
| `test/tui/shortcuts.test.ts` | Real keyboard branching tests | ⚠ PARTIAL | Exists (300 lines), tests pass, but branching checks are synthetic and not executed through app keyboard callback. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/tui/app.tsx` | `src/tui/data/pilot-db.ts` | `deregisterProject` import/call | ✓ WIRED | Import at `src/tui/app.tsx:15`, call at `src/tui/app.tsx:263`. |
| `src/tui/data/pilot-db.ts` | `src/core/db.ts` | re-exported `deregisterProject` | ✓ WIRED | Import from core DB at `src/tui/data/pilot-db.ts:11`, re-export at `src/tui/data/pilot-db.ts:46`. |
| `src/tui/app.tsx` | `src/tui/state.ts` | `confirmMessage` signal + confirm overlay | ✓ WIRED | `setConfirmMessage` used for remove/kill at `src/tui/app.tsx:261` and `src/tui/app.tsx:333`; rendered at `src/tui/app.tsx:425`. |
| `src/tui/app.tsx` | `src/tui/components/footer-bar.tsx` | `panelFocus` prop wiring | ✓ WIRED | `panelFocus={state.panelFocus()}` passed at `src/tui/app.tsx:440`. |
| `src/tui/components/footer-bar.tsx` | actual panel action model | queue hint mapping | ✗ NOT_WIRED | Queue hint claims retry, but queue panel selection is pending-only so retry branch never applies there. |
| `test/tui/shortcuts.test.ts` | `src/tui/app.tsx` keyboard runtime branch | key event dispatch through `useKeyboard` callback | ✗ NOT_WIRED | No App import or callback driving; tests validate metadata/statics, not runtime handler behavior. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Must Have — Shortcut reliability | ⚠ PARTIAL | Core gates exist, but inapplicable shortcuts still no-op with no explicit feedback path. |
| Must Have — Project-management actions | ✓ SATISFIED | Remove-project (`d`) with confirmation and DB delete+refresh is implemented. |
| Must Have — UX clarity | ✗ BLOCKED | Footer queue hint/action mismatch (`r retry` shown where retry is unavailable). |
| Must Have — Verification (real runtime branch) | ✗ BLOCKED | Shortcut tests do not execute `app.tsx` keyboard handler path. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/tui/app.tsx` | 407 | Placeholder text (`Split view — coming soon`) | ℹ Info | Pre-existing non-phase concern; not blocking this phase goal. |
| `test/tui/shortcuts.test.ts` | 188 | Synthetic branch tests (hardcoded status lists) instead of runtime key dispatch | 🛑 Blocker | Misses regressions in real keyboard handler wiring required by phase goal. |

### Human Verification Required

1. **Interactive TUI shortcut behavior**

**Test:** Launch `pilot tui`, navigate each panel, press r/x/K on both valid and invalid targets.
**Expected:** Valid targets execute action; invalid targets show explicit feedback (not silent no-op).
**Why human:** Requires interactive terminal behavior and UX perception.

2. **Remove-project end-to-end flow**

**Test:** In projects panel, press `d`, confirm `y`, verify project row disappears and remains removed after poll refresh.
**Expected:** Confirmation prompt is context-correct; project is removed from managed list.
**Why human:** Requires runtime interaction and observing post-action UI transitions.

### Gaps Summary

Phase 59 delivered core remove-project plumbing and most shortcut/help/footer wiring, and automated checks are green. However, the phase goal is not fully achieved: invalid shortcut attempts still provide no explicit runtime feedback, queue-panel footer text is not fully truthful to actual available actions, and shortcut tests do not execute the real keyboard handler path. These gaps directly affect the stated goal of reliable real-usage ergonomics and runtime-branch verification.

---

_Verified: 2026-03-12T09:50:56Z_
_Verifier: Claude (gsd-verifier)_
