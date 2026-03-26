---
phase: 98
slug: pilot-add-ui-review-step-to-phase-lifecycle-home-luca-dev-punchlab-pilot-requirements-pilot-add-ui-review-step-md
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-26
---

# Phase 98 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/core/ui-review.test.ts test/core/runner.test.ts --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's focused `vitest` command
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds for focused suites

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | UIREV-02, UIREV-03, UIREV-05 | unit | `npx vitest run test/core/ui-review.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 98-01-02 | 01 | 1 | UIREV-01, UIREV-04, UIREV-06 | unit/integration | `npx vitest run test/core/runner.test.ts --reporter=dot -t "ui-review|ui review|resolveUiArtifactOutcome"` | ✅ | ⬜ pending |
| 98-02-01 | 02 | 2 | UIREV-08 | command | `npx vitest run test/commands/status.test.ts test/commands/info.test.ts test/commands/log.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 98-02-02 | 02 | 2 | UIREV-08 | command | `npx vitest run test/commands/status.test.ts test/commands/info.test.ts test/commands/log.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 98-03-01 | 03 | 2 | UIREV-09 | unit | `npx vitest run test/core/job-detail-query.test.ts test/web/step-semantics.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 98-03-02 | 03 | 2 | UIREV-09 | unit | `npx vitest run test/core/job-detail-query.test.ts test/web/step-semantics.test.ts --reporter=dot` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
