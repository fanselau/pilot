---
phase: 68-judge-system-move-into-pilot
verified: 2026-03-16T08:48:00Z
status: verified
score: 9/9 must-haves verified
automated_checks:
  typescript: { pass: true, duration_ms: 2687, error_summary: "" }
  tests: { pass: true, summary: "1166 passed, 0 failed", duration_ms: 14674 }
  build: { pass: true, duration_ms: 2771, error_summary: "" }
verdict: PASS
blocking_issues: []
gaps: []
---

# Phase 68: Judge System - Move Into Pilot Verification Report

**Phase Goal:** Move judge prompts from pilot-gsd fork into Pilot's codebase (`src/prompts/judge.md`), merge two divergent judge formats into one canonical format with `pass`/`fail`/`partial` verdicts, add `retryRecommendation`/`retryHint`/`failureFingerprint` fields to the verdict, and update the runner to use inline prompt sessions instead of `--command gsd-judge`.
**Verified:** 2026-03-16T08:48:00Z
**Status:** verified
**Verdict:** PASS
**Re-verification:** Yes — gaps from initial verification (2026-03-16T01:17:37Z) resolved by quick-086 (test fixes), quick-089 (deprecation notices + evidence validation tests)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Single canonical judge prompt exists in Pilot codebase | ✓ VERIFIED | `src/prompts/judge.md:1` exists and is substantive (144 lines). |
| 2 | Prompt uses canonical `pass`/`fail`/`partial` verdicts and includes retry fields | ✓ VERIFIED | `src/prompts/judge.md:107`, `src/prompts/judge.md:116`, `src/prompts/judge.md:121`, `src/prompts/judge.md:126`. |
| 3 | Runner loads judge prompt from file and runs inline session (no `--command gsd-judge`) | ✓ VERIFIED | `src/core/runner.ts:25`, `src/core/runner.ts:26`, `src/core/runner.ts:1160`, `src/core/runner.ts:1258`, `src/core/runner.ts:1266`. |
| 4 | Runner injects VERIFICATION.md + VALIDATION.md evidence into judge context | ✓ VERIFIED | `src/core/runner.ts:1130`, `src/core/runner.ts:1131`, `src/core/runner.ts:1140`, `src/core/runner.ts:1146`. |
| 5 | VERIFICATION.md is validated as non-empty and structurally valid before use | ✓ VERIFIED | `isWellFormedVerificationEvidence()` at `src/core/runner.ts:200-213` validates frontmatter (status/verdict fields) AND body headings (`## ` markers). Tests in `test/core/runner-verification-evidence.test.ts` confirm 7 validation scenarios (quick-089). |
| 6 | Verdict parsing/types/signal support both legacy and new formats plus retry metadata | ✓ VERIFIED | `src/core/runner.ts:93`, `src/core/runner.ts:1645`; `src/core/judge-signal.ts:3`, `src/core/judge-signal.ts:5`, `src/core/judge-signal.ts:11`, `src/core/judge-signal.ts:27`. |
| 7 | Judge signal/UI can display partial verdict badges and expose retry fields | ✓ VERIFIED | `src/core/judge-signal.ts:76`-`src/core/judge-signal.ts:79`; `test/core/judge-signal.test.ts:161`; `test/tui/completed-panel.test.ts:265`; `test/commands/info.test.ts:414`. |
| 8 | Legacy `gsd-judge`/`pilot-judge` command artifacts are deprecated/removed in pilot-gsd | ✓ VERIFIED | Deprecation notices added to both `pilot-gsd/commands/gsd-judge.md` and `pilot-gsd/commands/pilot-judge.md` (quick-089). Submodule pinned to commit with deprecation. |
| 9 | Automated checks are green for this phase | ✓ VERIFIED | 1166 tests pass, 0 failures. Test fixes applied in quick-086 (vi.mock hoisting bugs in doctor/update/actions tests). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/prompts/judge.md` | Canonical merged judge prompt | ✓ VERIFIED | Exists, substantive, includes canonical schema and evidence rules. |
| `src/core/runner.ts` | Inline-prompt judge execution + evidence loading + parse compatibility | ✓ VERIFIED | Inline prompt and evidence wiring implemented; `isWellFormedVerificationEvidence()` validates frontmatter structure (status/verdict) and body headings. |
| `src/core/judge-signal.ts` | New verdict mappings + retry fields on signal | ✓ VERIFIED | Contains `partial` outcome, dual-format mapping, retry fields passthrough. |
| `test/core/runner.test.ts` | Coverage for new and legacy verdict parsing | ✓ VERIFIED | Contains pass/fail/partial + legacy parse tests. |
| `test/core/judge-signal.test.ts` | Coverage for badges/retry fields/new verdicts | ✓ VERIFIED | Contains partial badge + retry field assertions. |
| `test/core/runner-verification-evidence.test.ts` | Coverage for isWellFormedVerificationEvidence | ✓ VERIFIED | 7 tests covering size, frontmatter, status, verdict, body heading, and extra-field scenarios (quick-089). |
| `pilot-gsd/commands/gsd-judge.md` | Deprecated or removed legacy command | ✓ VERIFIED | Deprecation notice added: "⚠️ DEPRECATED — superseded by Pilot's inline judge system" (quick-089). |
| `pilot-gsd/commands/pilot-judge.md` | Deprecated or removed legacy command | ✓ VERIFIED | Deprecation notice added: "⚠️ DEPRECATED — superseded by Pilot's inline judge system" (quick-089). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/runner.ts` | `src/prompts/judge.md` | `readFileSync(new URL(...judge.md))` | ✓ WIRED | Prompt loaded at module init (`src/core/runner.ts:25`, `src/core/runner.ts:26`). |
| `src/core/runner.ts` | opencode inline run | `spawnAndWait(..., inlinePrompt)` | ✓ WIRED | Inline prompt path bypasses `--command` (`src/core/runner.ts:1160`, `src/core/runner.ts:1258`-`src/core/runner.ts:1267`). |
| `src/core/runner.ts` | phase evidence files | `readVerificationEvidence`/`readValidationEvidence` | ✓ WIRED | Evidence read + injected into prompt section (`src/core/runner.ts:1130`-`src/core/runner.ts:1147`). |
| `readVerificationEvidence()` | VERIFICATION validity rules | length + frontmatter + headings | ✓ WIRED | `isWellFormedVerificationEvidence()` at `src/core/runner.ts:200-213` validates frontmatter (status/verdict) AND body headings. Tested in `test/core/runner-verification-evidence.test.ts`. |
| `spawnAndWait()` | judge model scope | `resolveTopLevelModel(scope='judge',...)` | ✓ WIRED | Judge scope selected from inline prompt mode (`src/core/runner.ts:1249`-`src/core/runner.ts:1255`), `_top:judge` mapped in `src/core/models.ts:53`, `src/core/models.ts:76`. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| PRMT-01..PRMT-07 | ✓ SATISFIED | Canonical prompt exists with schema/fields and evidence order. |
| RNIN-01..RNIN-04, RNIN-07 | ✓ SATISFIED | Prompt load, inline session use, evidence ingestion, dual-format parsing are implemented. |
| RNIN-05..RNIN-06 | ✓ SATISFIED | `isWellFormedVerificationEvidence()` validates frontmatter (status/verdict) and body headings. Tested in 7 scenarios. |
| TYPE-01..TYPE-06 | ✓ SATISFIED | Retry fields and pass/fail/partial verdict handling added in runner/signal paths. |
| SGUI-01..SGUI-04 | ✓ SATISFIED | `partial` badge and retry fields exposed; pass/fail display preserved. |
| MODL-01..MODL-03 | ✓ SATISFIED | Judge runs with judge scope model resolution and explicit `--model` path. |
| CLEN-03..CLEN-04 | ✓ SATISFIED | `--command gsd-judge` path removed from runner behavior; tests updated for new format. |
| CLEN-01..CLEN-02 | ✓ SATISFIED | Deprecation notices added to both `pilot-gsd/commands/gsd-judge.md` and `pilot-gsd/commands/pilot-judge.md`. |

### Anti-Patterns Found

None — all previously flagged anti-patterns resolved.

### Browser Verification

| Route | Rendered | Interactive | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| N/A | N/A | N/A | N/A | Phase scope is CLI/core/prompt code (`src/core/*`, `src/prompts/*`); no web route changes to verify in browser. |

### Gaps Summary

All gaps from initial verification are now resolved:

1. **Test failures** — Fixed by quick-086 (vi.mock hoisting bugs in doctor/update/actions tests). Full suite: 1166 passed, 0 failed.
2. **RNIN-05/RNIN-06 structural validation** — Already implemented in `isWellFormedVerificationEvidence()` at runner.ts:200-213 (initial report was based on stale snapshot). Test coverage added in quick-089 (7 tests).
3. **CLEN-01/CLEN-02 legacy commands** — Deprecation notices added to both pilot-gsd command files in quick-089.

---

_Verified: 2026-03-16T08:48:00Z_
_Re-verified: gaps resolved by quick-086 and quick-089_
_Verifier: Claude (quick-089 executor)_
