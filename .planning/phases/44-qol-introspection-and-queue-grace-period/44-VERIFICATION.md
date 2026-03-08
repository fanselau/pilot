---
phase: 44-qol-introspection-and-queue-grace-period
verified: 2026-03-08T00:58:54Z
status: passed
score: 10/10 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2726, error_summary: "" }
  tests: { pass: true, summary: "689 passed, 0 failed", duration_ms: 7245 }
  build: { pass: true, duration_ms: 2763, error_summary: "" }
verdict: PASS
blocking_issues: []
---

# Phase 44: QoL Introspection and Queue Grace Period Verification Report

**Phase Goal:** Improve day-to-day operator legibility by adding concise job introspection surfaces (`status --why`, `info`, `log --summary`, `retry --why`) and enforcing a configurable queue grace period with clear per-job override semantics.
**Verified:** 2026-03-08T00:58:54Z
**Status:** passed
**Verdict:** PASS
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Queue grace has a real default and layered config/env resolution, and can be managed via config surfaces | ✓ VERIFIED | `src/core/config.ts:217`, `src/core/config.ts:285`, `src/commands/config.ts:100`, `src/commands/config.ts:140`, `src/commands/config.ts:246`, `test/core/config.test.ts:409` |
| 2 | Per-job grace bypass intent is persisted and exposed from queue-time UX | ✓ VERIFIED | `src/index.ts:54`, `src/commands/add.ts:319`, `src/core/db.ts:324`, `src/core/db.ts:205`, `test/commands/add.test.ts:304`, `test/core/db.test.ts:148` |
| 3 | Grace period changes real launch eligibility (not just labels) | ✓ VERIFIED | `src/core/db.ts:462`, `src/core/db.ts:478`, `src/core/db.ts:480`, `src/core/runner.ts:423`, `test/core/db.test.ts:583`, `test/core/runner.test.ts:225` |
| 4 | `pilot status --why` gives concise what/why/next explanations and exposes structured reasons in JSON | ✓ VERIFIED | `src/index.ts:66`, `src/index.ts:69`, `src/commands/status.ts:256`, `src/commands/status.ts:343`, `src/commands/status.ts:286`, `test/commands/status.test.ts:164`, `test/commands/status.test.ts:305` |
| 5 | Shared reason model is reused across CLI and TUI surfaces for consistent labeling | ✓ VERIFIED | `src/core/job-introspection.ts:20`, `src/commands/status.ts:18`, `src/commands/retry.ts:9`, `src/commands/info.ts:19`, `src/commands/log.ts:15`, `src/tui/components/queue-panel.tsx:16`, `src/tui/views/detail.tsx:27` |
| 6 | `pilot retry <id> --why` is explain-only and does not mutate queue state | ✓ VERIFIED | `src/index.ts:128`, `src/index.ts:130`, `src/commands/retry.ts:28`, `src/commands/retry.ts:59`, `test/commands/cancel-retry-bump.test.ts:214` |
| 7 | `pilot info <id>` provides compact triage-first metadata and next-action guidance (plus JSON triage) | ✓ VERIFIED | `src/commands/info.ts:148`, `src/commands/info.ts:454`, `src/commands/info.ts:482`, `src/commands/info.ts:499`, `test/commands/info.test.ts:135`, `test/commands/info.test.ts:168` |
| 8 | `pilot log <id> --summary` provides deterministic, high-signal summaries for completed/failed jobs in human and JSON outputs | ✓ VERIFIED | `src/index.ts:76`, `src/index.ts:78`, `src/commands/log.ts:381`, `src/commands/log.ts:581`, `src/commands/log.ts:593`, `test/commands/log.test.ts:120`, `test/commands/log.test.ts:154` |
| 9 | TUI queue/detail surfaces show grace-wait and guarded states, including remaining wait signal | ✓ VERIFIED | `src/tui/views/dashboard.tsx:66`, `src/tui/views/dashboard.tsx:74`, `src/tui/components/queue-panel.tsx:46`, `src/tui/views/detail.tsx:153`, `src/tui/views/detail.tsx:159`, `test/tui/queue-panel.test.ts:43`, `test/tui/detail-header.test.ts:321` |
| 10 | Dirty-launch and undo refusals use explicit what/why/next guidance with force semantics | ✓ VERIFIED | `src/core/runner.ts:541`, `src/commands/undo.ts:117`, `src/commands/undo.ts:123`, `src/commands/undo.ts:129`, `src/commands/undo.ts:139`, `test/core/runner-recovery.test.ts:213`, `test/commands/undo.test.ts:198` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/config.ts` | Grace config resolution and validation | ✓ VERIFIED | Exists (438 lines), default/env/config precedence at `src/core/config.ts:217` and validation at `src/core/config.ts:106` |
| `src/commands/config.ts` | Config show/set/get/init support for grace | ✓ VERIFIED | Exists (522 lines), includes `runner.queueGraceSeconds` spec and mappings (`src/commands/config.ts:100`, `src/commands/config.ts:140`, `src/commands/config.ts:246`) |
| `src/core/db.ts` | Persisted skip-grace field and grace-aware claim gate | ✓ VERIFIED | Exists (1244 lines), schema+mapping+claim SQL wired (`src/core/db.ts:49`, `src/core/db.ts:205`, `src/core/db.ts:478`) |
| `src/commands/add.ts` | Per-job override persistence and queue-time messaging | ✓ VERIFIED | Exists (405 lines), passes skip-grace intent and prints tradeoff copy (`src/commands/add.ts:319`, `src/commands/add.ts:377`) |
| `src/core/runner.ts` | Runner dispatch uses configured grace and hardened dirty-start refusal copy | ✓ VERIFIED | Exists (1519 lines), dispatch passes grace (`src/core/runner.ts:423`), refusal guidance at `src/core/runner.ts:541` |
| `src/core/job-introspection.ts` | Canonical reason model for queued/failed/undo states | ✓ VERIFIED | Exists (316 lines), exports `JobWhy` model and builders (`src/core/job-introspection.ts:20`, `src/core/job-introspection.ts:278`) |
| `src/commands/status.ts` | `status --why` rendering and JSON reason payload | ✓ VERIFIED | Exists (386 lines), why mode and JSON map wired (`src/commands/status.ts:256`, `src/commands/status.ts:286`) |
| `src/commands/retry.ts` | `retry --why` explain-only mode | ✓ VERIFIED | Exists (72 lines), explain-only early return before mutation (`src/commands/retry.ts:28`, `src/commands/retry.ts:59`) |
| `src/commands/info.ts` | Compact triage-first metadata view | ✓ VERIFIED | Exists (673 lines), triage builder and output sections present (`src/commands/info.ts:148`, `src/commands/info.ts:482`) |
| `src/commands/log.ts` | `log --summary` deterministic summary mode | ✓ VERIFIED | Exists (841 lines), summary synthesis and human/JSON outputs (`src/commands/log.ts:381`, `src/commands/log.ts:581`) |
| `src/tui/components/queue-panel.tsx` | Queue badges include grace/guarded states | ✓ VERIFIED | Exists (138 lines), grace countdown badge and shared why-model use (`src/tui/components/queue-panel.tsx:35`, `src/tui/components/queue-panel.tsx:47`) |
| `src/tui/views/detail.tsx` | Detail reason lines for grace/retry/undo guards | ✓ VERIFIED | Exists (802 lines), reason helper includes grace and undo guards (`src/tui/views/detail.tsx:153`, `src/tui/views/detail.tsx:173`) |
| `src/commands/undo.ts` | Hardened undo refusal copy (what/why/next) | ✓ VERIFIED | Exists (245 lines), guarded refusal messages for dirty/newer/diverged (`src/commands/undo.ts:117`, `src/commands/undo.ts:123`, `src/commands/undo.ts:129`) |
| `test/core/db.test.ts` | Grace gate and skip-grace regression coverage | ✓ VERIFIED | Exists (1178 lines), tests fresh vs aged vs bypass vs disabled (`test/core/db.test.ts:583`, `test/core/db.test.ts:625`) |
| `test/commands/status.test.ts` | `status --why` and JSON reason map tests | ✓ VERIFIED | Exists (339 lines), covers grace line and reason payload (`test/commands/status.test.ts:164`, `test/commands/status.test.ts:305`) |
| `test/commands/log.test.ts` | `log --summary` tests for completed/failed branches | ✓ VERIFIED | Exists (230 lines), covers deterministic human+JSON summary paths (`test/commands/log.test.ts:120`, `test/commands/log.test.ts:154`) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `src/commands/add.ts` | `pilot add --start-immediately` option forwarding | ✓ WIRED | Flag defined and merged options passed to `addCommand` (`src/index.ts:54`, `src/index.ts:62`) |
| `src/commands/add.ts` | `src/core/db.ts` | `addJob(..., skipGracePeriod)` | ✓ WIRED | Immediate mode sends final `true` arg for skip-grace (`src/commands/add.ts:319`, `src/commands/add.ts:333`) |
| `src/core/runner.ts` | `src/core/db.ts` | `claimNextLaunchable(config.queueGraceSeconds)` | ✓ WIRED | Runner dispatch passes resolved grace seconds into claim path (`src/core/runner.ts:423`) |
| `src/core/db.ts` | Launch eligibility gate | SQL age/override logic | ✓ WIRED | Gate enforces `skip_grace_period` OR grace disabled OR min age (`src/core/db.ts:478`, `src/core/db.ts:480`) |
| `src/index.ts` | `src/commands/status.ts` | `status --why` flag wiring | ✓ WIRED | CLI option and typed forwarding present (`src/index.ts:69`, `src/index.ts:72`) |
| `src/commands/status.ts` | `src/core/job-introspection.ts` | `buildJobWhy` reason composition | ✓ WIRED | Shared reason model drives both human and JSON status output (`src/commands/status.ts:18`, `src/commands/status.ts:274`) |
| `src/index.ts` | `src/commands/retry.ts` | `retry --why` option forwarding | ✓ WIRED | CLI option and handler wiring present (`src/index.ts:130`, `src/index.ts:133`) |
| `src/commands/retry.ts` | Queue mutation guard | explain-only early return | ✓ WIRED | `--why` returns before calling `retry(id)` (`src/commands/retry.ts:28`, `src/commands/retry.ts:59`) |
| `src/index.ts` | `src/commands/log.ts` | `log --summary` option forwarding | ✓ WIRED | Summary option registered and passed to `logCommand` (`src/index.ts:78`, `src/index.ts:87`) |
| `src/tui/views/dashboard.tsx` | `src/tui/components/queue-panel.tsx` | Context propagation for blocked/running/grace | ✓ WIRED | Dashboard passes project/running/grace context (`src/tui/views/dashboard.tsx:70`, `src/tui/views/dashboard.tsx:74`) |
| `src/tui/components/queue-panel.tsx` | `src/core/job-introspection.ts` | Badge derivation from shared reason model | ✓ WIRED | Uses `buildJobWhy` + `buildUndoWhy` for queue badges (`src/tui/components/queue-panel.tsx:16`, `src/tui/components/queue-panel.tsx:35`) |
| `src/core/runner.ts` | `test/core/runner-recovery.test.ts` | Dirty-start refusal contract coverage | ✓ WIRED | What/why/next copy asserted in tests (`test/core/runner-recovery.test.ts:227`) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| Why/state introspection (`status --why`) | ✓ SATISFIED | None |
| Consistent badges/state labels across surfaces | ✓ SATISFIED | None |
| `pilot info <job-id>` compact triage view | ✓ SATISFIED | None |
| `pilot log <job-id> --summary` | ✓ SATISFIED | None |
| `pilot retry <job-id> --why` explain mode | ✓ SATISFIED | None |
| Refusal/help copy hardening (dirty launch + undo guards) | ✓ SATISFIED | None |
| TUI detail/header polish for guard metadata | ✓ SATISFIED | None |
| Queue grace period config + minimum-age launch gate | ✓ SATISFIED | None |
| Grace override and opt-out semantics (`--start-immediately`) | ✓ SATISFIED | None |
| Grace visibility in CLI + TUI + queue-time confirmation | ✓ SATISFIED | None |
| Verification coverage (targeted tests + suite pass) | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/*` phase files | — | No TODO/FIXME/placeholder stubs detected in implementation artifacts | ℹ️ Info | No blocker anti-patterns found |
| `test/tui/detail-header.test.ts` | 65 | "placeholder" appears in test assertion wording only | ℹ️ Info | Non-runtime text; not an implementation gap |

### Human Verification Required

No blocking human verification required for goal achievement. This is a CLI/TUI phase (not a web UI route), and structural behavior is covered by code-level wiring plus automated tests.

### Gaps Summary

No gaps found. All phase-level must-haves derived from the 44-01..44-06 plan frontmatter are present, substantive, and wired to runtime behavior with regression coverage.

---

_Verified: 2026-03-08T00:58:54Z_
_Verifier: Claude (gsd-verifier)_
