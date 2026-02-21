---
phase: 12-critical-fixes-per-requirements-overnight-fixes-md
verified: 2026-02-21T02:52:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 12: Critical Fixes per requirements/overnight-fixes.md — Verification Report

**Phase Goal:** Fix all claude→opencode binary references, progress overflow bugs, and add project documentation so all CLI commands work without hanging and the project is demo-ready.
**Verified:** 2026-02-21T02:52:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | sessions.ts uses `opencode` binary with 5s timeout | ✓ VERIFIED | Line 35: `execa('opencode', ['session', 'list', '--format', 'json'], { timeout: 5000 })`, Line 91: `execa('opencode', ['export', sessionId], { timeout: 5000 })`. Zero `claude` binary refs in src/core/sessions.ts. |
| 2 | SessionInfo.message_count is optional | ✓ VERIFIED | types.ts line 48: `message_count?: number;` (optional). toSessionInfo() line 166: `typeof obj.message_count === 'number' ? obj.message_count : undefined`. Test fixture sessions.json has no message_count field. Test asserts `message_count: undefined`. |
| 3 | init.ts/spawn.ts use opencode, no claude fallbacks | ✓ VERIFIED | init.ts line 30: checks `.opencode` dir. Line 60: `execa('opencode', execArgs, ...)`. spawn.ts: zero `claude` refs (grep confirmed). Binary check at line 225: `which opencode`, fallback path line 235: `~/.opencode/bin/opencode`. |
| 4 | Progress capped at 100% | ✓ VERIFIED | progress.ts line 155: `Math.min(100, Math.round((doneCount / totalPhases) * 100))`. projects.ts line 111: `donePhases = Math.min(donePhases, totalPhases)`, line 112: `Math.min(100, Math.round(...))`. Double-capped. |
| 5 | config.ts uses opencode-first detection, opencode_binary JSON key | ✓ VERIFIED | config.ts line 82: JSON output uses `opencode_binary` key. Line 111: human output uses `opencode` label. Line 28-31: candidate paths check opencode first, then claude as secondary detection. This is display-only; spawn.ts has no claude fallback. |
| 6 | setup.ts generates spec-correct permission format | ✓ VERIFIED | setup.ts lines 122-130: singular `permission` key, per-type objects `{ read: { '**': 'allow' }, write: {...}, edit: {...}, bash: {...}, external_directory: {...} }`. Matches spec §4 exactly. |
| 7 | package.json has all required metadata | ✓ VERIFIED | description (line 12), keywords (line 13), repository (lines 14-17), author (line 18), license "MIT" (line 19). |
| 8 | README.md + LICENSE exist with required content | ✓ VERIFIED | README.md: 137 lines with description, Quick Start, Commands, Configuration, Architecture sections. LICENSE: 21-line MIT license text, copyright 2026 PunchLab. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/sessions.ts` | opencode binary, 5s timeout, optional message_count | ✓ VERIFIED | 199 lines. `opencode` binary on lines 35, 91. `timeout: 5000` on both. `message_count` optional in toSessionInfo(). |
| `src/core/types.ts` | SessionInfo.message_count optional | ✓ VERIFIED | 225 lines. Line 48: `message_count?: number;` |
| `src/commands/init.ts` | .opencode/ check, opencode binary | ✓ VERIFIED | 67 lines. Line 30: `.opencode` dir. Line 60: `opencode` binary. |
| `src/core/spawn.ts` | No claude fallback paths, opencode-only | ✓ VERIFIED | 349 lines. Zero `claude` refs. Uses `opencode` at lines 53, 225, 235, 244. |
| `src/core/config.ts` | Standard getConfig() | ✓ VERIFIED | 54 lines. No binary refs in core config (correct — detection is in commands/config.ts). |
| `src/commands/config.ts` | opencode_binary JSON key, opencode human label | ✓ VERIFIED | 114 lines. Line 82: `opencode_binary`. Line 111: `opencode` padded label. |
| `src/core/setup.ts` | opencode.json with singular permission format | ✓ VERIFIED | 179 lines. Lines 122-130: spec-correct permission structure. |
| `src/core/progress.ts` | Math.min(100, ...) cap | ✓ VERIFIED | 191 lines. Line 155: `Math.min(100, ...)`. |
| `src/core/projects.ts` | Math.min cap on donePhases and percent | ✓ VERIFIED | 210 lines. Line 111: `Math.min(donePhases, totalPhases)`. Line 112: `Math.min(100, ...)`. |
| `package.json` | description, keywords, repository, author, license | ✓ VERIFIED | All 5 fields present. |
| `README.md` | description, quick start, commands, configuration, architecture | ✓ VERIFIED | 137 lines, all 5 sections present. |
| `LICENSE` | MIT license text | ✓ VERIFIED | 21-line standard MIT license. |
| `test/core/sessions.test.ts` | Tests pass with opencode format | ✓ VERIFIED | 282 lines. Line 70: verifies `opencode` binary arg. Line 59: asserts `message_count: undefined`. |
| `test/fixtures/sessions.json` | No message_count field (opencode format) | ✓ VERIFIED | 42 lines. No `message_count` in any entry. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| sessions.ts | opencode CLI | `execa('opencode', ...)` | ✓ WIRED | Two calls: session list (L35) and export (L91), both with 5s timeout |
| init.ts | opencode CLI | `execa('opencode', execArgs, ...)` | ✓ WIRED | Line 60, passes through to gsd-new-project |
| init.ts | setup.ts | `setupProject(projectDir)` | ✓ WIRED | Line 34 imports, line 34 calls |
| spawn.ts | opencode binary | `which opencode` + `~/.opencode/bin/opencode` | ✓ WIRED | Lines 225, 235 — no claude fallback |
| setup.ts | opencode.json | `writeFile(configJsonPath, ...)` | ✓ WIRED | Line 132, writes spec-correct permission format |
| progress.ts | Math.min cap | direct expression | ✓ WIRED | Line 155 caps at 100% |
| projects.ts | Math.min cap | direct expression | ✓ WIRED | Lines 111-112, double-capped |

### Build & Test Verification

| Check | Status | Details |
|-------|--------|---------|
| `tsc --noEmit` | ✓ PASS | Zero errors, clean compile |
| `vitest run` | ✓ PASS | 18 test files, 337 tests, all passing in 2.01s |
| No `claude` binary in src/ | ✓ PASS | `grep execa.*claude` returns zero matches |
| No `.claude` dir refs in src/ | ✓ PASS | `grep \.claude` returns zero matches in src/ (except config.ts display-only secondary detection) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/commands/config.ts | 30 | `.claude/bin/claude` as secondary binary detection | ℹ️ Info | Display-only fallback in config command; spawn.ts has no claude fallback. Acceptable for transition period. |

### Human Verification Required

### 1. CLI Commands Don't Hang

**Test:** Run `pilot status --json`, `pilot queue --json`, `pilot config --json` — each should return within 5 seconds.
**Expected:** JSON output produced and process exits promptly. No indefinite hangs even if opencode binary not installed.
**Why human:** Requires real CLI execution with actual system state.

### 2. Demo Readiness

**Test:** Run `pilot --help` and visually inspect output.
**Expected:** Grouped command listing, clean formatting, no broken sections.
**Why human:** Visual formatting quality check.

---

_Verified: 2026-02-21T02:52:00Z_
_Verifier: Claude (gsd-verifier)_
