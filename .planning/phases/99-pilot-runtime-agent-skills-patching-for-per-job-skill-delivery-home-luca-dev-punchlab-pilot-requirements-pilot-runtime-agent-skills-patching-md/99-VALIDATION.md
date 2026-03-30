---
phase: 99
slug: pilot-runtime-agent-skills-patching-for-per-job-skill-delivery-home-luca-dev-punchlab-pilot-requirements-pilot-runtime-agent-skills-patching-md
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 99 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `package.json` scripts (`npm test`) |
| **Quick run command** | `npx vitest run test/core/runtime-agent-skills.test.ts --reporter=dot` |
| **Full suite command** | `npx vitest run test/core/db.test.ts test/core/runtime-agent-skills.test.ts test/core/runner-recovery.test.ts test/commands/info.test.ts --reporter=dot && npm run build` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest target
- **After every plan wave:** Run `npx vitest run test/core/db.test.ts test/core/runtime-agent-skills.test.ts test/core/runner-recovery.test.ts test/commands/info.test.ts --reporter=dot`
- **Before `/gsd-verify-work`:** Full targeted suite plus `npm run build` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 99-01-01 | 01 | 1 | ASKILL-01 | unit | `npx vitest run test/core/db.test.ts --reporter=dot -t "runtime skill snapshot"` | ✅ | ⬜ pending |
| 99-01-02 | 01 | 1 | ASKILL-02, ASKILL-05 | unit | `npx vitest run test/core/runtime-agent-skills.test.ts --reporter=dot` | ✅ | ⬜ pending |
| 99-02-01 | 02 | 2 | ASKILL-03, ASKILL-05 | integration | `npx vitest run test/core/runner-recovery.test.ts --reporter=dot -t "runtime agent_skills|agent skills patch"` | ✅ | ⬜ pending |
| 99-02-02 | 02 | 2 | ASKILL-04 | command | `npx vitest run test/commands/info.test.ts --reporter=dot -t "runtime skills"` | ✅ | ⬜ pending |

*Status: ⬜ pending - ✅ green - ❌ red - ⚠ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Runner stderr stays concise while still reporting categories, selected skills, and restore outcome | ASKILL-04 | Log readability is easier to judge in context than through a single grep | Run one phase job with matching categories, then inspect the runner log for the new `Runtime agent_skills` lines and confirm no full config blob is printed |

---

## Validation Sign-Off

- [x] All tasks have focused `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
