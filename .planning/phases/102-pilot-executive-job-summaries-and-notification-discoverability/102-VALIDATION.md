---
phase: 102
slug: pilot-executive-job-summaries-and-notification-discoverability
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 102 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/core/job-summary.test.ts test/core/opencode-db.test.ts test/commands/summary.test.ts test/commands/log.test.ts test/core/callback.test.ts test/commands/status.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task’s targeted Vitest file(s)
- **After every plan wave:** Run the full phase-targeted Vitest set
- **Before `/gsd-verify-work`:** Full suite must be green via `npm test`
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 102-01-01 | 01 | 1 | JSUM-02 | unit | `npx vitest run test/core/opencode-db.test.ts` | ✅ | ⬜ pending |
| 102-01-02 | 01 | 1 | JSUM-01, JSUM-06, JSUM-07 | unit | `npx vitest run test/core/job-summary.test.ts test/core/opencode-db.test.ts` | ✅ | ⬜ pending |
| 102-02-01 | 02 | 2 | JSUM-04, JSUM-07 | command | `npx vitest run test/commands/summary.test.ts` | ✅ | ⬜ pending |
| 102-02-02 | 02 | 2 | JSUM-04, JSUM-07 | command | `npx vitest run test/commands/log.test.ts test/commands/summary.test.ts` | ✅ | ⬜ pending |
| 102-03-01 | 03 | 2 | JSUM-03, JSUM-07 | unit | `npx vitest run test/core/callback.test.ts` | ✅ | ⬜ pending |
| 102-03-02 | 03 | 2 | JSUM-05, JSUM-07 | command | `npx vitest run test/commands/status.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
