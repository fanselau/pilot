---
phase: 45-job-observability-cost-tracking-and-export
verified: 2026-03-08T02:18:33Z
status: passed
score: 7/7 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2814, error_summary: "" }
  tests: { pass: true, summary: "708 passed, 0 failed", duration_ms: 6314 }
  build: { pass: true, duration_ms: 2738, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 45: Job Observability, Cost Tracking, and Export Verification Report

**Phase Goal:** Unify CLI and TUI observability around opencode-grounded model/token/cost data, failure-aware summaries, and a first-class `pilot export <job-id>` markdown artifact so every job is understandable and shareable without raw transcript dumps.
**Verified:** 2026-03-08T02:18:33Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Recursive model/token observability primitives in opencode DB include child sessions | ✓ VERIFIED | `src/core/opencode-db.ts:164`, `src/core/opencode-db.ts:750`, `src/core/opencode-db.ts:762`, `src/core/opencode-db.ts:875`, `test/core/opencode-db.test.ts:590`, `test/core/opencode-db.test.ts:717` |
| 2 | Shared pricing + observability snapshot semantics exist and are reused cross-surface | ✓ VERIFIED | `src/core/pricing.ts:16`, `src/core/pricing.ts:97`, `src/core/job-observability.ts:100`, `src/core/job-observability.ts:234`, `src/commands/info.ts:500`, `src/commands/log.ts:420`, `src/commands/status.ts:186`, `src/commands/export.ts:44`, `src/tui/app.tsx:84` |
| 3 | CLI `info` / `log --summary` / `status` observability contracts are implemented | ✓ VERIFIED | `src/commands/info.ts:713`, `src/commands/log.ts:417`, `src/commands/log.ts:687`, `src/commands/status.ts:150`, `src/commands/status.ts:328`, `test/commands/info.test.ts:211`, `test/commands/log.test.ts:161`, `test/commands/status.test.ts:194` |
| 4 | TUI running/completed/detail observability parity is implemented | ✓ VERIFIED | `src/tui/app.tsx:82`, `src/tui/views/dashboard.tsx:76`, `src/tui/components/running-panel.tsx:56`, `src/tui/components/completed-panel.tsx:172`, `src/tui/views/detail.tsx:296`, `test/tui/running-panel.test.ts:97`, `test/tui/completed-panel.test.ts:22`, `test/tui/detail-header.test.ts:179` |
| 5 | `pilot export <id>` command and markdown artifact generation are implemented | ✓ VERIFIED | `src/core/job-export.ts:72`, `src/commands/export.ts:29`, `src/commands/export.ts:68`, `src/index.ts:99`, `test/commands/export.test.ts:351` |
| 6 | Docs include semantic caveats and export examples (success + failure) | ✓ VERIFIED | `README.md:240`, `README.md:249`, `README.md:275`, `README.md:281`, `docs/GETTING-STARTED.md:416`, `docs/GETTING-STARTED.md:423`, `docs/GETTING-STARTED.md:425`, `docs/GETTING-STARTED.md:434` |
| 7 | Phase verification suites plus full `npm test` were run and passed | ✓ VERIFIED | Focused suites executed by verifier (`158 passed, 0 failed`), full suite executed by verifier via `npm test` (`708 passed, 0 failed`), checklist documented at `docs/GETTING-STARTED.md:440` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/opencode-db.ts` | Recursive session-tree model/token primitives | ✓ VERIFIED | Exists (957 lines); recursive child traversal and visited/depth guards implemented (`src/core/opencode-db.ts:750`, `src/core/opencode-db.ts:875`) |
| `src/core/pricing.ts` | Central pricing catalog + explicit estimate semantics | ✓ VERIFIED | Exists (138 lines); `PRICING_CATALOG` and `estimateCostByModel` provide `estimated`/`partial`/`unavailable` semantics (`src/core/pricing.ts:16`, `src/core/pricing.ts:97`) |
| `src/core/job-observability.ts` | Canonical requested/observed/tokens/cost snapshot builder | ✓ VERIFIED | Exists (264 lines); composes recursive opencode data + pricing into stable snapshot (`src/core/job-observability.ts:100`, `src/core/job-observability.ts:236`) |
| `src/core/runner.ts` | Recursive actual-model persistence before terminalization | ✓ VERIFIED | Exists (1552 lines); `collectActualModels` uses session-tree recursion and writes before completion/failure (`src/core/runner.ts:802`, `src/core/runner.ts:838`, `src/core/runner.ts:715`) |
| `src/commands/info.ts` | Info observability + failure insight contract | ✓ VERIFIED | Exists (777 lines); shared snapshot rendered in human and JSON paths (`src/commands/info.ts:500`, `src/commands/info.ts:713`) |
| `src/commands/log.ts` | Summary-mode observability and failure context | ✓ VERIFIED | Exists (946 lines); deterministic summary includes observability block (`src/commands/log.ts:417`, `src/commands/log.ts:687`) |
| `src/commands/status.ts` | Compact list-level observability signals + JSON map | ✓ VERIFIED | Exists (440 lines); compact `obs` line + additive JSON `observability` map (`src/commands/status.ts:150`, `src/commands/status.ts:332`) |
| `src/tui/app.tsx` | TUI observability snapshot polling/state wiring | ✓ VERIFIED | Exists (385 lines); poller builds and stores shared snapshots (`src/tui/app.tsx:82`, `src/tui/app.tsx:107`) |
| `src/tui/components/running-panel.tsx` | Running-view compact observability cues | ✓ VERIFIED | Exists (270 lines); live/partial token/cost/model labels and anomaly flags (`src/tui/components/running-panel.tsx:56`, `src/tui/components/running-panel.tsx:205`) |
| `src/tui/components/completed-panel.tsx` | Completed-view observability cues | ✓ VERIFIED | Exists (213 lines); row metrics derive from snapshot-driven cues (`src/tui/components/completed-panel.tsx:172`, `src/tui/components/completed-panel.tsx:175`) |
| `src/tui/views/detail.tsx` | Detail header requested/actual/estimated parity | ✓ VERIFIED | Exists (891 lines); header helpers explicitly encode live/partial/unavailable semantics (`src/tui/views/detail.tsx:296`, `src/tui/views/detail.tsx:736`) |
| `src/core/job-export.ts` | Curated markdown export artifact generator | ✓ VERIFIED | Exists (216 lines); generates requested/observed/tokens/cost/failure/commit sections (`src/core/job-export.ts:72`, `src/core/job-export.ts:120`) |
| `src/commands/export.ts` | Export command UX + output controls | ✓ VERIFIED | Exists (100 lines); default path, `--output`, `--stdout`, and write error handling implemented (`src/commands/export.ts:17`, `src/commands/export.ts:54`, `src/commands/export.ts:68`) |
| `src/index.ts` | Top-level `pilot export <id>` wiring | ✓ VERIFIED | Command registration and option forwarding present (`src/index.ts:99`, `src/index.ts:103`) |
| `README.md` | Release-facing observability/export semantics | ✓ VERIFIED | Explicit semantics and caveats plus export examples (`README.md:242`, `README.md:249`, `README.md:275`, `README.md:281`) |
| `docs/GETTING-STARTED.md` | Operator usage + verification checklist | ✓ VERIFIED | Triage semantics, export examples, and suite checklist included (`docs/GETTING-STARTED.md:416`, `docs/GETTING-STARTED.md:425`, `docs/GETTING-STARTED.md:440`) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/opencode-db.ts` | Session tree rows (`parent_id`) | Recursive traversal | ✓ WIRED | `getSessionTokenUsageByModelRecursive` and `getSessionModelsRecursive` recurse through `getChildSessions` (`src/core/opencode-db.ts:762`, `src/core/opencode-db.ts:887`) |
| `src/core/job-observability.ts` | `src/core/opencode-db.ts` | Recursive model/token usage queries | ✓ WIRED | Imports and calls `getSessionModelsRecursive` + `getSessionTokenUsageByModelRecursive` (`src/core/job-observability.ts:6`, `src/core/job-observability.ts:145`) |
| `src/core/job-observability.ts` | `src/core/pricing.ts` | Shared estimate semantics | ✓ WIRED | Snapshot cost comes from `estimateCostByModel` (`src/core/job-observability.ts:8`, `src/core/job-observability.ts:234`) |
| `src/core/runner.ts` | `src/core/opencode-db.ts` | Recursive actual-model persistence | ✓ WIRED | `collectActualModels` uses `getSessionModelsRecursive` before terminal status write (`src/core/runner.ts:838`, `src/core/runner.ts:848`) |
| `src/commands/info.ts` | `src/core/job-observability.ts` | Full observability block for info | ✓ WIRED | Shared snapshot built and rendered in human/JSON output (`src/commands/info.ts:500`, `src/commands/info.ts:524`) |
| `src/commands/log.ts` | `src/core/job-observability.ts` | Summary observability payload | ✓ WIRED | `buildSummaryData` injects shared snapshot (`src/commands/log.ts:417`, `src/commands/log.ts:439`) |
| `src/commands/status.ts` | `src/core/job-observability.ts` | List-view compact observability | ✓ WIRED | Per-job map built from shared snapshot and exposed in JSON (`src/commands/status.ts:183`, `src/commands/status.ts:341`) |
| `src/tui/app.tsx` | TUI running/completed/detail views | Shared snapshot propagation | ✓ WIRED | App poller computes snapshots, dashboard passes to running/completed panels, detail consumes snapshot map (`src/tui/app.tsx:84`, `src/tui/views/dashboard.tsx:80`, `src/tui/views/detail.tsx:659`) |
| `src/index.ts` | `src/commands/export.ts` | CLI registration | ✓ WIRED | `command('export <id>')` registered and calls `exportCommand` (`src/index.ts:99`, `src/index.ts:104`) |
| `src/commands/export.ts` | `src/core/job-export.ts` | Markdown artifact build delegation | ✓ WIRED | Command builds observability + introspection context, then delegates markdown build (`src/commands/export.ts:44`, `src/commands/export.ts:45`) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Recursive child-session model/token observability primitives | ✓ SATISFIED | None |
| Shared pricing and observability semantics reused across surfaces | ✓ SATISFIED | None |
| CLI observability contracts (`info`, `log --summary`, `status`) | ✓ SATISFIED | None |
| TUI observability parity (running/completed/detail) | ✓ SATISFIED | None |
| `pilot export <id>` markdown artifact command | ✓ SATISFIED | None |
| Docs with estimate caveats and export examples | ✓ SATISFIED | None |
| Verification suites + full `npm test` passing | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/tui/app.tsx` | 349 | `coming soon` copy in split-view placeholder | ⚠️ Warning | Non-blocking for Phase 45 goal (must-haves target running/completed/detail, not split view) |

### Human Verification Required

No blocking human verification required for this phase goal. The requested deliverables are code-level contracts with strong regression coverage and all verification suites passed.

### Gaps Summary

No gaps found. All requested must-haves are present, substantive, wired, and test-backed.

---

_Verified: 2026-03-08T02:18:33Z_
_Verifier: Claude (gsd-verifier)_
