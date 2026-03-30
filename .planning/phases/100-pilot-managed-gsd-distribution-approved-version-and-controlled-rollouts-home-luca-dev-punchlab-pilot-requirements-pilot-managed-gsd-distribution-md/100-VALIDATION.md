---
phase: 100
slug: managed-gsd-distribution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 100 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `package.json` |
| **Quick run command** | `npx vitest run test/core/managed-gsd.test.ts --reporter=dot` |
| **Full suite command** | `npx vitest run test/core/managed-gsd.test.ts test/core/db.test.ts test/core/setup.test.ts test/commands/setup.test.ts test/commands/update.test.ts test/commands/gsd-version.test.ts test/commands/project.test.ts --reporter=dot && npm run build` |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run that task's focused Vitest command.
- **After every plan wave:** Run `npx vitest run test/core/managed-gsd.test.ts test/core/db.test.ts test/core/setup.test.ts test/commands/setup.test.ts test/commands/update.test.ts test/commands/gsd-version.test.ts test/commands/project.test.ts --reporter=dot`.
- **Before `/gsd-verify-work`:** Full targeted suite plus `npm run build` must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 100-01-01 | 01 | 1 | MGSD-01 | unit | `npx vitest run test/core/managed-gsd.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 100-01-02 | 01 | 1 | MGSD-02 | unit | `npx vitest run test/core/db.test.ts --reporter=dot -t "project gsd state"` | ✅ | ⬜ pending |
| 100-02-01 | 02 | 2 | MGSD-03 | integration | `npx vitest run test/core/setup.test.ts test/commands/setup.test.ts --reporter=dot -t "approved GSD|refresh"` | ✅ | ⬜ pending |
| 100-02-02 | 02 | 2 | MGSD-04 | integration | `npx vitest run test/commands/update.test.ts --reporter=dot -t "approved version|rollout|ahead|blocked"` | ✅ | ⬜ pending |
| 100-03-01 | 03 | 2 | MGSD-01 | command | `npx vitest run test/commands/gsd-version.test.ts --reporter=dot` | ❌ W0 | ⬜ pending |
| 100-03-02 | 03 | 2 | MGSD-05 | command | `npx vitest run test/commands/project.test.ts --reporter=dot -t "GSD version|drift"` | ✅ | ⬜ pending |

*Status: ⬜ pending - ✅ green - ❌ red - ⚠ flaky*

---

## Wave 0 Requirements

- [ ] `test/commands/gsd-version.test.ts` - new command test scaffold for the approved-version control surface

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
