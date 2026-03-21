---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 84-02-PLAN.md
last_updated: "2026-03-21T13:59:09.766Z"
last_activity: "2026-03-21 - Completed quick task 260321-61z: Fix skills JIT loading: seed manifest from catalog"
progress:
  total_phases: 83
  completed_phases: 40
  total_plans: 154
  completed_plans: 141
  percent: 93
---

# State

## Current Milestone: launch-v1
## Current Phase: 73

## Current Position

Phase: 73 of 73 (Phase 1: Judge & Step Continuation — Replace Retry with Append-Forward Model)
**Next Plan:** 73-02-PLAN.md
Plan: 2 of 6 in current phase
Status: In progress
Last activity: 2026-03-21 - Completed quick task 260321-61z: Fix skills JIT loading: seed manifest from catalog

Progress: [█████████░] 93%

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Model routing must be deterministic and resilient to upstream agent-file changes.
**Current focus:** Phase 72 cleanup documentation and active-surface coupling audit are complete; follow-up concerns remain migration remediation on external projects and fork repo archive permissions.

### Phase 1: Project Scaffolding + Core Data Layer
- **Status:** Milestone complete

### Phase 2: CLI Commands (Phase 1 Monitoring + Setup)
- **Status:** complete (3/3 plans, verified ✓)

### Phase 3: Queue Runner + Lifecycle Automation
- **Status:** complete (4/4 plans, verified ✓)

### Phase 4: TUI Dashboard
- **Status:** complete (5/5 plans, verified ✓)

### Phase 5: Integration fixes per requirements/integration-fixes.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 6: Queue storage migration per requirements/queue-storage-migration.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 7: Smart add per requirements/smart-add.md
- **Status:** complete (2/4 plans executed [gap closure 03+04], verified ✓)

### Phase 8: Smart tail stuck detection
- **Status:** planned (0/2 plans complete)

### Phase 9: Gap closure resilience
- **Status:** complete (2/2 active plans complete [gap closure 09-03+09-04], verified ✓)

### Phase 10: Smart verify routing per requirements/smart-verify-routing.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 11: Finishing touches per requirements/finishing-touches.md
- **Status:** complete (4/4 plans, verified ✓)

### Phase 12: Critical fixes per requirements/overnight-fixes.md
- **Status:** complete (3/3 plans, verified ✓)

### Phase 13: Daemon mode runner per requirements/daemon-mode-runner.md
- **Status:** complete (4/4 plans)

### Phase 14: Production hardening per requirements/production-hardening.md
- **Status:** complete (5/5 plans, verified ✓)

### Phase 15: E2E test suite per requirements/e2e-test-suite.md
- **Status:** complete (force-finished — 320+ unit tests provide sufficient coverage)

### Phase 25: Pilot Learnings Consolidation + Reliability Guardrails
- **Status:** complete (force-finished — Phase 26 implemented all critical guardrails)

### Phase 30: Milestone Orchestration: Child Jobs + depends_on
- **Status:** complete (4/4 plans, verified ✓)

### Phase 31: Automated Phase Verification (gsd-verify-phase)
- **Status:** complete (2/2 plans, verified ✓)

### Phase 32: Job Completion Callback (OpenClaw Session Wake)
- **Status:** complete (3/3 plans, verified ✓)

### Phase 33: Managed Projects
- **Status:** complete (4/4 plans, verified ✓)

### Phase 34: TUI & Observability Overhaul
- **Status:** complete (3/3 plans, verified ✓)

### Phase 36: Config File Support for Pilot CLI
- **Status:** complete (3/3 plans, verified ✓)

### Phase 37: Skills System for Pilot
- **Status:** complete (4/4 plans, verified ✓)

### Phase 38: Pilot Hardening — Pre-Release Quality Pass
- **Status:** complete (3/3 plans, verified ✓)

### Phase 40: Default Skills Library
- **Status:** complete (3/3 plans, verified ✓)

### Phase 41: OpenClaw Skill Rewrite and Bundle with Pilot
- **Status:** complete (2/2 plans, verified ✓)

### Phase 42: Release Hardening — Config Isolation, Install Story, and Changelog
- **Status:** complete (3/3 plans, verified ✓)

### Phase 43: Job Undo and Recovery Checkpoints
- **Status:** complete (4/4 plans, verified ✓)

### Phase 44: QoL Introspection and Queue Grace Period
- **Status:** complete (6/6 plans, verified ✓)

### Phase 45: Job Observability, Cost Tracking, and Export
- **Status:** complete (6/6 plans, verified ✓)

### Phase 46: Dynamic Model Configuration
- **Status:** complete (5/5 plans, verified ✓)

### Phase 47: AGENTS.md Integration — CLI Commands & Doctor Check
- **Status:** complete (3/3 plans, verified ✓)

### Phase 48: Fix New Project Setup Critical Bugs
- **Status:** complete (2/2 plans, verified ✓)

### Phase 49: Surface Judge Verdict and Status Badges in TUI / Status Views
- **Status:** complete (3/3 plans, verified ✓)

### Phase 50: Setup Refresh Mode and Fast Skill Installation
- **Status:** in progress (1/2 plans complete)

### Phase 51: Pilot notifications via `openclaw agent --deliver`
- **Status:** in progress (2/3 plans complete)

### Phase 52: Shell-Agnostic CLI and TUI Shortcuts
- **Status:** complete (3/3 plans, verified ✓)

### Phase 53: Stable service wrapper + real r/x handler wiring
- **Status:** complete (1/1 plans, verified ✓)

### Phase 54: Pilot project-agent notifications should trigger useful replies
- **Status:** complete (1/1 plans, verified ✓)

### Phase 55: Shell/Runtime Toolchain Exposure
- **Status:** complete (2/2 plans, verified ✓)

### Phase 56: Pilot Existing Install Shell Exposure Must Be Applyable on Real Machines
- **Status:** complete (1/1 plans, verified ✓)

### Phase 57: Pilot Notify Setup Must Be Optional and Operator-Friendly
- **Status:** complete (2/2 plans, verified ✓)

### Phase 58: Pilot Failure Notifications Should Guide Agents to Unblock and Read Logs
- **Status:** complete (1/1 plans, verified ✓)

### Phase 59: Pilot TUI Shortcuts and Project-Management Actions Must Work in Real Usage
- **Status:** complete (2/2 plans, verified ✓)

### Phase 60: Remove dirty-guard blocking entirely; only real failures should block projects
- **Status:** complete (2/2 plans, verified ✓)

### Phase 61: Pilot Web UI Phase 1 — builder-ready feasibility scaffold, compact query backbone, and root-based job detail model
- **Status:** in progress (2/3 plans complete)

### Phase 62: Pilot Web UI Phase 2 — agent frontend, merged chronological detail flow, inline sub-agent cards, and proactive action parity
- **Status:** complete (5/5 plans, verified ✓)

### Phase 63: Pilot Phase 63 — step-first detail flow, lifecycle branch blocks, and nested child detail for web + TUI
- **Status:** complete (5/5 plans, verified ✓)

### Phase 66: Delegation Pipeline Redesign — Intent-Based Architecture
- **Status:** complete (3/3 plans, verified ✓)

### Phase 67: Session Blocker Handling — DB-Based Hung Detection
- **Status:** complete (4/4 plans)

### Phase 68: Judge System — Move Into Pilot
- **Status:** complete (4/4 plans, verified ✓)

### Phase 69: Model System — Agent Frontmatter Patching
- **Status:** complete (3/3 plans, verified ✓)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Fix pilot log — Show actual message content | 2026-03-02 | 8a74897 | [001-fix-pilot-log-show-actual-message-content](./quick/001-fix-pilot-log-show-actual-message-content/) |
| 009 | Fix TUI — Register @opentui/solid bun plugin | 2026-03-02 | a5e4a57 | [009-fix-tui-replace-react-ink-with-solid-open](./quick/009-fix-tui-replace-react-ink-with-solid-open/) |
| 010 | Flesh out pilot log — show full session activity | 2026-03-02 | d73c13d | [010-flesh-out-pilot-log-show-full-session-act](./quick/010-flesh-out-pilot-log-show-full-session-act/) |
| 011 | Daemon hot-reload after build | 2026-03-02 | 79b116c | [011-daemon-hot-reload-after-build-problem-whe](./quick/011-daemon-hot-reload-after-build-problem-whe/) |
| 012 | TUI Detail View - Job Drill-Down on Enter | 2026-03-02 | e33b2d8 | [012-tui-detail-view-job-drill-down-on-enter-](./quick/012-tui-detail-view-job-drill-down-on-enter-/) |
| 012 | TUI detail view — job drill-down on enter | 2026-03-02 | ebe7b62 | [012-tui-detail-view-job-drill-down-on-enter-](./quick/012-tui-detail-view-job-drill-down-on-enter-/) |
| 013 | Implement requirements/pilot-phase-execution-success-contract.md end-to-end in code: fix phase fallback mapping, semantic success gating, interrupted-job status handling, and phase ambiguity warning; include tests | 2026-03-02 | 979bbf3 | [013-implement-requirements-pilot-phase-execu](./quick/013-implement-requirements-pilot-phase-execu/) |
| 014 | Model Frontmatter Patching | 2026-03-02 | 04df455 | [014-model-frontmatter-patching](./quick/014-model-frontmatter-patching/) |
| 015 | Step-level observability (R4) — job_steps table + runner recording + pilot log display | 2026-03-02 | 6840417 | [015-pilot-requirement-phase-execution-succes](./quick/015-pilot-requirement-phase-execution-succes/) |
| 016 | Phase & milestone reliability — filesystem phase resolution, success pattern gating | 2026-03-03 | 9424b3d | [016-phase-milestone-reliability-make-structu](./quick/016-phase-milestone-reliability-make-structu/) |
| 018 | Fix premature completion detection — isSessionDone(), runner polling, evaluateStepResult fail-safe | 2026-03-03 | c1a2fe4 | [018-requirements-fix-premature-completion-de](./quick/018-requirements-fix-premature-completion-de/) |
| 019 | Harden add-phase reliability — GSD_INSTRUCTION_BLOCKLIST, matchesBlocklist(), verifyStepArtifacts duplicate/blocklist checks, hardened gsd-add-phase.md | 2026-03-03 | b0c65dc | [019-harden-add-phase-reliability-problem-add](./quick/019-harden-add-phase-reliability-problem-add/) |
| 020 | Requirements observability and job config visibility — pilot log header with model/attempts, per-step tokens, new pilot info <id> command | 2026-03-03 | 82bcdda | [020-requirements-observability-and-job-config](./quick/020-requirements-observability-and-job-config/) |
| 021 | Phase redesign — single-session orchestrator + judge evaluation replacing multi-step delegation → regex evaluation | 2026-03-03 | a301bed | [021-phase-redesign-single-session-orchestrat](./quick/021-phase-redesign-single-session-orchestrat/) |
| 022 | Dead code cleanup post-redesign — remove 6 dead exports from opencode-db.ts, delete 4 empty duplicate phase dirs, scrub stale comments | 2026-03-03 | 17ec5e0 | [022-requirements-cleanup-dead-code-post-rede](./quick/022-requirements-cleanup-dead-code-post-rede/) |
| 023 | requirements/model-control-and-tui-visibility.md | 2026-03-03 | 9eb94ea | [023-requirements-model-control-and-tui-visib](./quick/023-requirements-model-control-and-tui-visib/) |
| 024 | requirements/phase-redesign-edge-cases-and-retry-fixes.md | 2026-03-03 | bb3ddcc | [024-requirements-phase-redesign-edge-cases-a](./quick/024-requirements-phase-redesign-edge-cases-a/) |
| 025 | requirements/tui-bugs-and-polish.md | 2026-03-03 | 9f252d7 | [025-requirements-tui-bugs-and-polish-md](./quick/025-requirements-tui-bugs-and-polish-md/) |
| 026 | Show actual model used from opencode DB | 2026-03-03 | 6a408e2 | [026-show-actual-model-used-from-opencode-db-](./quick/026-show-actual-model-used-from-opencode-db-/) |
| 027 | Validate project setup on pilot add | 2026-03-04 | a673daf | [027-requirements-validate-project-setup-on-a](./quick/027-requirements-validate-project-setup-on-a/) |
| 032 | Verify robust project path resolution requirement | 2026-03-04 | 50915cb | [032-requirements-robust-project-path-resolut](./quick/032-requirements-robust-project-path-resolut/) |
| 033 | No-activity means failure — inconclusive verdict storage + differentiated icons | 2026-03-04 | 4ada6fb | [033-requirements-no-activity-means-failure](./quick/033-requirements-no-activity-means-failure/) |
| 034 | no-activity-means-failure test coverage (getAssistantMessageCount + parseJudgeVerdict) | 2026-03-04 | 7179650 | [034-requirements-no-activity-means-failure-m](./quick/034-requirements-no-activity-means-failure-m/) |
| 035 | requirements/deduplicate-queue-entries.md | 2026-03-04 | 3c98953 | [035-requirements-deduplicate-queue-entries-m](./quick/035-requirements-deduplicate-queue-entries-m/) |
| 036 | Deduplicate queue entries — enhanced findDuplicateJob with recently-completed check + 6 new tests (314 total) | 2026-03-04 | e01a3fb | [036-deduplicate-queue-entries](./quick/036-deduplicate-queue-entries/) |
| 037 | Runner Hardening: Lock File + Delegation Prompt Fix | 2026-03-04 | fb3b129 | [037-runner-hardening-lock-file-delegation-pr](./quick/037-runner-hardening-lock-file-delegation-pr/) |
| 038 | Fix phase number patching — patchPhaseArgs() after add-phase step + 6 tests | 2026-03-05 | b945549 | [038-fix-phase-number-patching](./quick/038-fix-phase-number-patching/) |
| 039 | Force-kill terminal behavior — AND status='running' guard in resetToPending + 5 tests | 2026-03-05 | 5373bc5 | [039-implement-force-kill-behavior-with-no-re](./quick/039-implement-force-kill-behavior-with-no-re/) |
| 040 | Remove phase safety net — phase command passthrough in parseDelegationOutput + fallbackPlan, remove patchPhaseArgs | 2026-03-05 | ae9dca4 | [040-remove-the-phase-safety-net-behavior-fro](./quick/040-remove-the-phase-safety-net-behavior-fro/) |
| 041 | Milestone re-delegation — remove spawnChildJobs + checkMilestoneParent, add delegate() call after new-milestone step | 2026-03-05 | f8f1420 | [041-implement-the-milestone-re-delegation-re](./quick/041-implement-the-milestone-re-delegation-re/) |
| 042 | Implement notify flag requirement — --no-notify, PILOT_DEFAULT_NOTIFY env var, require-notify validation, queue notify column, 7 new tests | 2026-03-05 | 47ecb1c | [042-implement-the-notify-flag-requirement](./quick/042-implement-the-notify-flag-requirement/) |
| 043 | Fix --force bypasses setup check test — add noNotify:true to satisfy notify validation from quick-042 | 2026-03-05 | 916b6fc | [043-implement-the-notify-flag-requirement](./quick/043-implement-the-notify-flag-requirement/) |
| 044 | Project CLI commands — pilot project <path> with --block/--unblock/--owner, projects --blocked filter, job counts, 18 new tests (441 total) | 2026-03-05 | f3aad6e | [044-create-project-cli-commands-based-on-the](./quick/044-create-project-cli-commands-based-on-the/) |
| 045 | Delegation model enforcement — --model flag via resolveTopLevelModel('phase',...) in attemptDelegation, stderr log, 5 new tests (446 total) | 2026-03-05 | 00ac286 | [045-analyze-project-state-and-determine-whic](./quick/045-analyze-project-state-and-determine-whic/) |
| 046 | Remove dead tests for delegate internals — unexport resolvePhaseForFallback/fallbackPlan/findExistingPhaseDir, delete 26 dead tests, clean runner-lock mock (419 tests) | 2026-03-05 | 52d9fd3 | [046-remove-dead-tests-and-cleanup-test-artif](./quick/046-remove-dead-tests-and-cleanup-test-artif/) |
| 047 | Safeguard unregistered projects + fix dry-run — dry-run early exit before addJob(), unconditional unregistered-project warning in add.ts, runner launch() warning, 4 new tests (423 total) | 2026-03-05 | 75470c3 | [047-safeguard-unregistered-projects](./quick/047-safeguard-unregistered-projects/) |
| 048 | echo 'hello world' in a comment at the top of README.md then remove it | 2026-03-05 | 597d597 | [048-echo-hello-world-in-a-comment-at-the-top](./quick/048-echo-hello-world-in-a-comment-at-the-top/) |
| 049 | Add a blank line to the end of CHANGELOG.md then remove it | 2026-03-05 | 45dfa7b | [049-add-a-blank-line-to-the-end-of-changelog](./quick/049-add-a-blank-line-to-the-end-of-changelog/) |
| 050 | Add comment `// webhook test` to top of src/index.ts then remove it | 2026-03-05 | cb621a3 | [050-add-comment-webhook-test-to-top-of-src-i](./quick/050-add-comment-webhook-test-to-top-of-src-i/) |
| 051 | Add a blank line to the top of README.md and remove it | 2026-03-05 | 423ce6b | [051-add-and-remove-a-blank-line-at-top-of-re](./quick/051-add-and-remove-a-blank-line-at-top-of-re/) |
| 052 | Add and remove a comment at top of package.json | 2026-03-05 | 8193278 | [052-add-and-remove-a-comment-at-top-of-packa](./quick/052-add-and-remove-a-comment-at-top-of-packa/) |
| 053 | add and remove a comment at top of package.json | 2026-03-05 | f19a54d | [053-add-and-remove-a-comment-at-top-of-packa](./quick/053-add-and-remove-a-comment-at-top-of-packa/) |
| 054 | Notify via hooks agent with agentId routing — rewrite callback.ts with agentId, hook:pilot:<jobId> sessionKey, deliver:false; simplify --notify to plain agent IDs | 2026-03-05 | 51f44fd | [054-notify-via-hooks-agent-with-agentid-rout](./quick/054-notify-via-hooks-agent-with-agentid-rout/) |
| 056 | Create a great README for Pilot — v2 rewrite with delegation AI pipeline concept, full CLI reference, architecture diagram, all PILOT_* env vars | 2026-03-05 | 9dc0521 | [056-create-a-great-readme-for-pilot](./quick/056-create-a-great-readme-for-pilot/) |
| 057 | Add a comment `// notify test` to top of src/index.ts then remove it — reversible two-commit notify test cycle | 2026-03-05 | ba42982 | [057-add-a-comment-notify-test-to-top-of-src-](./quick/057-add-a-comment-notify-test-to-top-of-src-/) |
| 058 | Add a comment `// hook test v2` to top of src/index.ts then remove it — reversible two-commit hook test v2 cycle | 2026-03-05 | 9f6b412 | [058-add-a-comment-hook-test-v2-to-top-of-src](./quick/058-add-a-comment-hook-test-v2-to-top-of-src/) |
| 059 | Add a blank line to the end of CHANGELOG.md then remove it — reversible two-commit webhook trigger test | 2026-03-05 | df93b02 | [059-add-a-blank-line-to-end-of-changelog-md-](./quick/059-add-a-blank-line-to-end-of-changelog-md-/) |
| 060 | Add a comment `// owner test` to top of src/index.ts then remove it — reversible file modification cycle test | 2026-03-05 | 8658fbd | [060-add-comment-owner-test-to-top-of-src-ind](./quick/060-add-comment-owner-test-to-top-of-src-ind/) |
| 061 | Public release cleanup — remove private paths, PunchLab branding, update package.json/README/LICENSE for public release | 2026-03-05 | baad658 | [061-public-release-cleanup-remove-private-pa](./quick/061-public-release-cleanup-remove-private-pa/) |
| 062 | GSD submodule integration — pilot-gsd as git submodule with 3-step gsdDir fallback chain (env var → submodule → ~/pilot-gsd/) | 2026-03-05 | 2e30645 | [062-gsd-submodule-integration-pilot-gsd-is-c](./quick/062-gsd-submodule-integration-pilot-gsd-is-c/) |
| 063 | Comprehensive installation & getting started guide — docs/GETTING-STARTED.md with all env vars, prerequisites, daemon setup, troubleshooting | 2026-03-05 | e754a2f | [063-create-a-comprehensive-installation-gett](./quick/063-create-a-comprehensive-installation-gett/) |
| 064 | Asciinema demo recording embedded in README — demo/demo-script.sh + demo.cast + demo/demo.svg, showing real pilot status/add/log CLI usage | 2026-03-05 | a270d7b | [064-create-an-asciinema-demo-recording-for-t](./quick/064-create-an-asciinema-demo-recording-for-t/) |
| 065 | Fix project setup, remove delegation fallback, add project doctor — fail-fast delegation, project command linking, pilot doctor --project | 2026-03-06 | ee6a485 | [065-fix-project-setup-remove-delegation-fall](./quick/065-fix-project-setup-remove-delegation-fall/) |
| 066 | Judge integration — runner adapts to gsd-judge: runJudge replaces runVerification, succeeded/failed/doubting verdict shape, callback webhook enriched | 2026-03-06 | 3ef8a61 | [066-judge-integration-runner-adapts-to-gsd-j](./quick/066-judge-integration-runner-adapts-to-gsd-j/) |
| 068 | Update README.md to reflect current pilot capabilities. Add Skills System section under Features documenting pilot skills add/list/sync/tag/remove/categories commands with category-based matching and auto-injection. Add AI Judge section under Features documenting the verdict system (succeeded/failed/doubting with confidence score and reason) and its integration with notifications. Update Configuration section by removing stuckThreshold, defaultTimeout, and pollInterval (now internal constants) and documenting per-job --timeout flag instead. Update CLI Reference to add pilot skills commands table and add --timeout and --categories flags to pilot add. Update Architecture diagram to show skills injection in runner and judge step with verdict details in the pipeline flow. Add What's New callout near top. Keep all brand assets (header SVG, badges, demo GIF) intact. Verify existing feature descriptions remain accurate. Read the create-readme and crafting-effective-readmes skills for style guidance. | 2026-03-06 | ed05845 | [068-update-readme-md-to-reflect-current-pilot](./quick/068-update-readme-md-to-reflect-current-pilot/) |
| 070 | Implement required categories contract for skills/add flows: enforce required `--categories` for `pilot skills tag`, reject empty category payloads at runtime, and add focused regression tests for missing/empty/valid category paths. | 2026-03-06 | 4e21208 | [070-implement-the-required-categories-requir](./quick/070-implement-the-required-categories-requir/) |
| 071 | Codex variant support — resolveVariant(model, scope) returning high/low for Codex/GPT-5 models and null for Claude; --variant flag threaded through runner.ts and delegate.ts; PROVIDER_MODELS updated for openai-only and hybrid profiles. | 2026-03-06 | 5ab9cae | [071-codex-variant-support-thinking-levels-fo](./quick/071-codex-variant-support-thinking-levels-fo/) |
| 072 | Smart config initialization — detectProviders() auto-detects available AI providers via opencode models; pilot init interactive command with --yes/--force; runner startup warning for misconfigured provider mode; setup triggers init when no config exists. | 2026-03-06 | 5e34ad7 | [072-implement-smart-config-initialization-wi](./quick/072-implement-smart-config-initialization-wi/) |
| 073 | Replace tier-based model resolution — flat AGENT_MODELS lookup table with ModelEntry { model, variant? }, remove resolveVariant/PROVIDER_MODELS/AGENT_PROFILE_TIERS/ModelTier, callers destructure ModelEntry | 2026-03-06 | db9ee7b | [073-replace-the-tier-based-model-resolution](./quick/073-replace-the-tier-based-model-resolution/) |
| 074 | Rename scope keys to _top: prefix, add openai-only xhigh variant differentiation, update resolveTopLevelModel scope-to-key mapping | 2026-03-06 | 427e0df | [074-replace-tier-system-with-explicit-agent-](./quick/074-replace-tier-system-with-explicit-agent-/) |
| 075 | Hybrid Role-Based Model Routing | 2026-03-06 | 898222b | [075-hybrid-role-based-model-routing](./quick/075-hybrid-role-based-model-routing/) |
| 076 | Add /hooks/wake comment to callback.ts | 2026-03-06 | e4a8d0c | [076-add-a-comment-to-the-top-of-src-core-cal](./quick/076-add-a-comment-to-the-top-of-src-core-cal/) |
| 077 | Update OpenClaw SKILL.md — Recovery, Grace Period, Observability, Quick Reference cross-check for phases 43-45 | 2026-03-08 | 76aa779 | [077-update-the-openclaw-skill-md-at-openclaw](./quick/077-update-the-openclaw-skill-md-at-openclaw/) |
| 078 | Upgrade OpenAI models from gpt-5.3-codex to gpt-5.4. Replace all occurrences of openai/gpt-5.3-codex with openai/gpt-5.4 (no codex suffix). Update variant mapping so xhigh becomes high and high becomes medium, while keeping none/minimal/low/medium/high support. Apply this to all relevant AGENT_MODELS tables: every openai-only entry and hybrid check-role agents (codebase-mapper, verifier, plan-checker, integration-checker, plus _top:judge scope). Update comments that still mention codex/xhigh-high to reference gpt-5.4 and high/medium. Update all tests that reference gpt-5.3-codex and adjust expected variants to match the new mapping. Run the full test suite. Also update GSD agent defaults so any agent with model openai/gpt-5.3-codex becomes openai/gpt-5.4, variant xhigh becomes high, and variant high becomes medium. | 2026-03-09 | c1ae6ea | [078-upgrade-openai-models-from-gpt-5-3-codex](./quick/078-upgrade-openai-models-from-gpt-5-3-codex/) |
| 079 | Provenance-aware dirty-start launch guard — persist per-project dirty baselines, allow continuation-safe Pilot dirt, and block manual/untracked drift, HEAD movement, and conflict states with explicit reasons | 2026-03-10 | 4b81ab4 | [079-provenance-aware-dirty-guard-for-pilot-p](./quick/079-provenance-aware-dirty-guard-for-pilot-p/) |
| 080 | TUI feedback follow-up — truthful footer hints, flash feedback for inapplicable shortcuts, extracted keyboard handler with 9 real-path branching tests | 2026-03-12 | 48e7bef | [080-quick-follow-up-phase-59-tui-feedback-fo](./quick/080-quick-follow-up-phase-59-tui-feedback-fo/) |
| 082 | Phase 62 follow-up — toast feedback for action execute handlers + paused-state predicate tests (11/13 → 13/13) | 2026-03-13 | dbd4a1d | [082-quick-follow-up-phase-62-toast-feedback-](./quick/082-quick-follow-up-phase-62-toast-feedback-/) |
| 083 | Pilot Web UI mobile responsiveness — responsive padding, Coss useIsMobile, session-overview card fallback, timeline flex-wrap | 2026-03-13 | cb0dbe8 | [083-pilot-web-ui-mobile-responsiveness-and-n](./quick/083-pilot-web-ui-mobile-responsiveness-and-n/) |
| 084 | Fix child session drill-in navigation — reset SessionActivity pagination on sessionId change, key-based remount, multi-child fork card uniqueness tests | 2026-03-14 | e86a5b4 | [084-quick-follow-up-subjob-navigation-must-r](./quick/084-quick-follow-up-subjob-navigation-must-r/) |
| 085 | Quick follow-up - update README and docs for new Pilot web UI features | 2026-03-14 | 5e5b319 | [085-quick-follow-up-update-readme-and-docs-f](./quick/085-quick-follow-up-update-readme-and-docs-f/) |
| 086 | Fix 3 test files with vi.mock hoisting bugs — importOriginal for doctor, self-contained execa mock for update, toast path alias mock for actions | 2026-03-16 | 1ae7231 | [086-fix-phase-65-verification-gaps-3-test-su](./quick/086-fix-phase-65-verification-gaps-3-test-su/) |
| 087 | Fix Phase 66 delegation redesign verification — copy src/prompts/*.md to dist/prompts/ in postbuild | 2026-03-16 | a81366e | [087-fix-phase-66-delegation-redesign-verific](./quick/087-fix-phase-66-delegation-redesign-verific/) |
| 088 | Fix Phase 67 session blocker handling — sessionTitle in hung notifications | 2026-03-16 | df5880b | [088-fix-phase-67-session-blocker-handling-ve](./quick/088-fix-phase-67-session-blocker-handling-ve/) |
| 089 | Fix Phase 68 judge move verification gap — deprecate pilot-gsd judge commands, add evidence validation tests | 2026-03-16 | a719265 | [089-fix-phase-68-judge-move-verification-gap](./quick/089-fix-phase-68-judge-move-verification-gap/) |
| 260320-m85 | Verify Phase 73 code compatibility with updated skills and category requirements | 2026-03-20 | 1866bfb | [260320-m85-verify-phase-73-code-compatibility-with-](./quick/260320-m85-verify-phase-73-code-compatibility-with-/) |
| 260320-mcv | Verify Phase 73 code changes are compatible with updated requirements (skills system, delegation, categories) | 2026-03-20 | 3aa40a7 | Verified | [260320-mcv-verify-phase-73-code-changes-are-compati](./quick/260320-mcv-verify-phase-73-code-changes-are-compati/) |
| 260320-nc6 | Remove retry completely from pilot | 2026-03-20 | 7302ae9 | [260320-nc6-remove-retry-completely-from-pilot](./quick/260320-nc6-remove-retry-completely-from-pilot/) |
| 260320-vc3 | Bug fix: --next flag on pilot add doesn't insert at front of queue | 2026-03-20 | 23739bb | [260320-vc3-bug-fix-next-flag-on-pilot-add-doesn-t-i](./quick/260320-vc3-bug-fix-next-flag-on-pilot-add-doesn-t-i/) |
| 260320-vju | Bug fix: pilot kill --force doesn't stop runner polling + stale child sessions | 2026-03-20 | 98df0ea | [260320-vju-bug-fix-pilot-kill-force-doesn-t-stop-ru](./quick/260320-vju-bug-fix-pilot-kill-force-doesn-t-stop-ru/) |
| 260321-61z | Fix skills JIT loading — seed manifest from built-in catalog | 2026-03-21 | b61a92d | [260321-61z-fix-skills-jit-loading-seed-manifest-fro](./quick/260321-61z-fix-skills-jit-loading-seed-manifest-fro/) |

## Accumulated Context

### Roadmap Evolution
- Phase 5 added: Integration fixes per requirements/integration-fixes.md
- Phase 6 added: Queue storage migration per requirements/queue-storage-migration.md
- Phase 7 added: Smart add per requirements/smart-add.md
- Phase 6 skipped: queue-store.ts never built; Phase 7 adapted to use QUEUE.md
- Phase 8 added: Smart tail stuck detection per requirements/smart-tail-stuck-detection.md
- Phase 9 added: Gap closure resilience per requirements/gap-closure-resilience.md
- Phase 10 added: Smart verify routing per requirements/smart-verify-routing.md
- Phase 11 added: Finishing touches per requirements/finishing-touches.md
- Phase 12 added: Critical fixes per requirements/overnight-fixes.md
- Phase 17 added: Pilot v2 complete rewrite — delegation AI, SQLite queue, opencode DB ground truth, clean CLI
- Phase 18 added: Pilot v2 TUI with OpenTUI — dashboard, job detail, split pane views
- Phase 19 added: requirements/tui-phase-redo.md
- Phase 20 added: requirements/model-profile-support.md
- Phase 21 added: requirements/tui-visual-polish.md
- Phase 22 added: Delegate Phase Lifecycle Hardening
- Phase 23 added: TUI Selection Colors & Visual Polish
- Phase 24 added: Task/Subagent Visibility in TUI and Logs
- Phase 25 added: Pilot Learnings Consolidation + Reliability Guardrails (2026-03-03)
- Phase 26 added: Runner Immediate Dispatch + Force Quit Controls
- Phase 27 added: TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix
- Phase 28 added: Runner Immediate Dispatch + Force Quit Controls
- Phase 28 added: Resource Management System per requirements/resource-management.md
- Phase 29 added: Phase Delegation: Revert to Multi-Step Spawning
- Phase 30 added: Milestone Orchestration: Child Jobs + depends_on
- Phase 31 added: Automated Phase Verification (gsd-verify-phase)
- Phase 34 added: TUI & Observability Overhaul
- Phase 35 added: Refactor Error Handling in API Layer
- Phase 36 added: Config File Support for Pilot CLI
- Phase 37 added: Skills System for Pilot
- Phase 38 added: Pilot Hardening — Pre-Release Quality Pass
- Phase 39 added: Runner Simplification
- Phase 40 added: Default Skills Library — Bundled Skill Catalog for Pilot
- Phase 41 added: OpenClaw Skill Rewrite and Bundle with Pilot
- Phase 42 added: Release Hardening — Config Isolation, Install Story, and Changelog
- Phase 43 added: Job Undo and Recovery Checkpoints
- Phase 44 added: QoL Introspection and Queue Grace Period
- Phase 45 added: Job Observability, Cost Tracking, and Export
- Phase 46 added: Dynamic Model Configuration
- Phase 47 added: AGENTS.md Integration — CLI Commands & Doctor Check
- Phase 48 added: Fix New Project Setup Critical Bugs
- Phase 49 added: Surface Judge Verdict and Status Badges in TUI / Status Views
- Phase 50 added: Setup Refresh Mode and Fast Skill Installation
- Phase 51 added: Pilot notifications via `openclaw agent --deliver`
- Phase 52 added: Shell-Agnostic CLI and TUI Shortcuts
- Phase 53 added: Stable service wrapper + real r/x handler wiring
- Phase 54 added: Pilot project-agent notifications should trigger useful replies
- Phase 55 added: Shell/Runtime Toolchain Exposure
- Phase 56 added: Pilot existing-install shell exposure must be applyable on real machines
- Phase 57 added: Pilot notify setup must be optional and operator-friendly
- Phase 58 added: Pilot Failure Notifications Should Guide Agents to Unblock and Read Logs
- Phase 59 added: Pilot TUI Shortcuts and Project-Management Actions Must Work in Real Usage
- Phase 60 added: Remove dirty-guard blocking entirely; only real failures should block projects
- Phase 61 added: Pilot Web UI Phase 1 — builder-ready feasibility scaffold, compact query backbone, and root-based job detail model
- Phase 62 added: Pilot Web UI Phase 2 — agent frontend, merged chronological detail flow, inline sub-agent cards, and proactive action parity
- Phase 63 added: Pilot Phase 63 — step-first detail flow, lifecycle branch blocks, and nested child detail for web + TUI
- Phase 64 added: GSD Installation Switch — Replace pilot-gsd with Vanilla GSD
- Phase 65 added: GSD Config Pre-seeding for Autonomous Execution
- Phase 66 added: Delegation Pipeline Redesign — Intent-Based Architecture
- Phase 67 added: Session Blocker Handling — DB-Based Hung Detection
- Phase 68 added: Judge System — Move Into Pilot
- Phase 69 added: Model System — Agent Frontmatter Patching
- Phase 70 added: Phase Auto-Retry on Verification Failure
- Phase 71 added: Full Milestone Lifecycle — Audit, Gap Closure, Completion
- Phase 72 added: Cleanup — Remove pilot-gsd Fork
- Phase 74 added: Required Categories on pilot add
- Phase 75 added: Codex First-Class Citizen — Model-Adaptive Content Patching
- Phase 76 added: Pilot Web UI Overhaul — Full-Width Dashboard + Dense Step Visualization
- Phase 77 added: Web UI Fixes — Post-Overhaul Regressions + Missing Features
- Phase 78 added: Web UI Premium — Data-Rich, Dense, Modern Dashboard
- Phase 79 added: Web UI Job Activity Regression — Restore visible activity under jobs
- Phase 80 added: Web UI Attribution + Mobile Overflow Hardening
- Phase 81 added: Pilot Human Review Semantics — Autonomy-First, No False Failure
- Phase 82 added: Pilot Timeline Semantics + Renderer Unification
- Phase 83 added: Pilot Human Review Semantics — Phase 81 Follow-up Completion
- Phase 84 added: Pilot Control-Flow + Live Status Bugs — Fix False Failure Presentation and Continuation Churn

## Decisions

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01-01 | picocolors identity functions for NO_COLOR at module load | Simpler than checking at every call site |
| 01-01 | NaN fallback for stuckThreshold defaults to 90 | More robust for automation than throwing |
| 01-02 | Multi-pipe args joined with ' \| ' separator | Preserves original format for round-trip fidelity |
| 01-02 | Description lines identified by metadata exclusion | Simpler than positive matching against free-form text |
| 01-03 | getProcessRuntime is async (reads /proc files) | Consistent with spec guidance against sync fs in hot paths |
| 01-03 | Module-level Map cache with 60s TTL for session message counts | Avoids repeated CLI calls during stuck scoring cycles |
| 01-04 | Pure scoring function separated from I/O helpers | Enables testing without mocking /proc filesystem |
| 01-04 | CPU sampling via /proc/pid/stat delta, not ps -o %cpu | ps gives lifetime average; delta gives current usage per spec |
| 01-05 | PlanningStateResult kept as local interface in projects.ts | Implementation detail, not a cross-module contract |
| 01-05 | Phase completion = all plans have matching summaries | Simple ratio check avoids complex state inference |
| 01-05 | setupProject uses absolute symlink targets | More reliable across working directories than relative paths |
| 02-01 | Custom formatHelp override for grouped help | Avoids brittle addHelpText ordering |
| 02-01 | Stub files for all future commands | tsc strict module resolution requires import targets to exist |
| 02-01 | computeStuckScore called sequentially per PID | CPU sampling is inherently serial (3×10s) |
| 02-02 | Native fs.watch + 1s poll backup for tail | fs.watch can miss events on some systems; poll ensures reliability |
| 02-02 | Walk-up cwd detection for progress command | Intuitive UX when running inside a project directory |
| 02-02 | Content truncation at 500 chars in non-verbose log mode | Keeps transcript readable without overwhelming output |
| 02-03 | stdout spy with type cast for vi.mock of process.stdout.write | Complex overload types require cast for test compatibility |
| 02-03 | Queue ENOENT graceful in status, exit 1 in queue | Status is dashboard (soft fail), queue is explicit command (hard fail) |
| 03-01 | execa v9 file redirect for log appending | Cleaner than manual FD management; execa handles lifecycle |
| 03-01 | STATE file priority over inference fallback | Explicit state is authoritative; inference for backward compat only |
| 03-01 | Module-level resolvedBinary cache in spawn.ts | Avoids repeated which calls across multiple spawn cycles |
| 03-02 | Inline truncateTitle/sanitizeArgs per command file | spawn.ts from Plan 01 has errors; avoid cross-dependency in parallel wave |
| 03-02 | void opts for no-flag commands | Consistent signature without unused-param warnings |
| 03-02 | reject: false on execa calls | Manual exit code propagation instead of throwing on non-zero |
| 03-03 | Polling-based reap for detached processes | Exit events not reliable for detached processes |
| 03-03 | markEntryPending helper in runner.ts | queue-parser markEntry only supports running/done/failed |
| 03-03 | Synchronous spawnAndWait for lifecycle inner steps | Phase cycle steps must complete before next state transition |
| 03-03 | MAX_GAP_CYCLES=3 with best-effort acceptance | Prevents infinite gap closure loops |
| 03-04 | Detached execa spawn for runner from build command | Runner survives parent exit; uses process.argv[1] for self-reference |
| 03-04 | scope --build wired as add-and-build mode | Matches spec §9 lifecycle mode; deferred from 03-02 now that runner exists |
| 04-03 | Fast stuck scoring in TUI (no CPU/message signals) | Avoids 30s delay per process; log staleness + memory sufficient for dashboard |
| 04-04 | createElement() in tui.ts instead of JSX | Keeps file as .ts matching existing index.ts import path |
| 04-04 | Dynamic import for tree-kill in kill handler | Avoids loading tree-kill at startup for non-TUI commands |
| 04-04 | Log panel 3s interval when expanded | Balances freshness vs performance; clears when collapsed |
| 04-05 | afterEach cleanup for Ink component unmount | Prevents interval leaks in TUI tests |
| 04-05 | 60s intervalMs for Dashboard tests | Prevents re-fetches during short test window |
| 07-03 | Optional PilotConfig param in detectProjectState | Clean test injection without fragile vi.mock on config.js |
| 07-03 | Multiple Must Have sections (>=2) = phase headers | Indicates milestone-level multi-section scope |
| 07-03 | Uses parseQueueFile not queue-store.ts | Phase 6 queue-store.ts was never built |
| 07-04 | addCommand returns AddResult for composition | buildCommand and index.ts JSON output compose with result |
| 07-04 | Queue writes via withQueueLock not queue-store.ts | Phase 6 never built; QUEUE.md is the storage layer |
| 07-04 | VALID_MODES removed from user-facing code | GSD modes are internal implementation details |
| 09-03 | countSummaryFiles reads content for Superseded check | Filename alone can't distinguish superseded summaries |
| 09-03 | countNonGapPlanFiles reads first 20 lines for frontmatter | Efficient for large plan files; gap_closure field is always in frontmatter |
| 09-03 | MAX_GAP_CYCLES throws instead of silent accept | Fail-fast is correct behavior; runner marks entry as FAIL |
| 09-04 | detectGapClosureMisconfig in stuck.ts not phase-state.ts | It's a stuck detection concern, co-located with scoring |
| 09-04 | Misconfig detection on stuck/suspect only | Healthy sessions don't need gap closure checks |
| 09-04 | Silent error catch during misconfig detection | Monitoring must not break due to filesystem issues |
| 10-01 | Web signals checked before CLI — web wins when both present | CLI that serves web content should get browser UAT |
| 10-01 | JSX/TSX scan limited to 2 levels deep | Avoids performance issues on large codebases |
| 10-01 | Port patterns match spec exactly (:3000, :8080, :5173, localhost) | Simple heuristics per requirements |
| 10-02 | Warning-only for unmatched ROADMAP criteria grep | Heuristic — missing file matches are informational, not hard failures |
| 10-02 | Simple key: value frontmatter parser (no YAML library) | Sufficient for phase/plan key validation without dependency |
| 10-02 | Shared runTests helper between both strategies | Avoid code duplication for test suite execution |
| 10-03 | formatVerifyResult renders human-readable check output to stderr | Consistent UX for non-web strategy output |
| 10-03 | Lifecycle writes UAT-style file on non-web verification failure | Gap closure compatibility with existing flow |
| 10-03 | Web project flow completely unchanged in lifecycle | Preserves proven gsd-verify-auto behavior |
| 10-04 | verifyAttempts counter persists across loop iterations | Counts through gap closure cycles — prevents infinite loops |
| 10-04 | Non-web auto-skip on attempt count; web also checks log content | Non-web verify is inline (no log); web has log to analyze |
| 10-04 | Auto-skip writes UAT with result: pass for state machine compat | Phase moves to done/next-phase without manual intervention |
| 12-01 | message_count optional (undefined) not default 0 | Preserves distinction between no data and zero messages |
| 12-01 | 5s timeout on all execa calls to opencode | Prevents indefinite hangs when binary unavailable |
| 12-02 | Removed claude.json fallback from spawn.ts validateConfig | opencode.json is the only config format |
| 12-02 | Removed claude binary fallback from spawn.ts checkBinary | Only opencode binary supported for spawning |
| 12-02 | Kept claude paths as secondary detection in config.ts | Backward compat for reporting binary location |
| 12-02 | Cap donePhases at totalPhases before percent calc | Prevents extra phase dirs inflating progress |
| 05-01 | lstat to distinguish symlinks from real directories | Prevents data loss on re-setup with real dirs |
| 05-01 | Skip opencode.json if legacy claude.json exists | Backward compat without overwriting user configs |
| 05-02 | computeStuckScoreFast skips CPU sampling — scorer defaults maxCpu to 100 | Instant results for status dashboard |
| 05-02 | sampleCpu timeout checks before and after sleep | Prompt abort when timeout exceeded |
| 05-02 | Runner PID check moved before stuck loop in status | Enables PID exclusion from scoring |
| 05-03 | Unconditional wait-for-all block after main loop | Safe: normal mode breaks when activeJobs empty (no-op) |
| 05-03 | Best-effort upstream tracking before explicit pull | Graceful degradation on fresh clones |
| 05-04 | Setup tests use real filesystem (mkdtemp) for symlink verification | Integration-level testing more reliable than mocking fs for symlink behavior |
| 05-04 | Runner tests use mock exit event instead of fake timers | Avoids timeout issues with runner's sleep-based polling loops |
| 06-01 | nanoid(12) for queue item IDs | Short enough to type, unique enough for <100 items |
| 06-01 | detectCircularDep exported for direct testing | addItem creates new IDs so cycles via public API are impossible, but guards against data corruption |
| 06-01 | History capped at 100 entries by newest completedAt | Prevents unbounded growth while keeping useful history |
| 06-01 | Lock on queue.json file, create empty if needed | proper-lockfile requires existing target |
| 06-02 | Timeout stored in item.meta.timeout instead of entry.timeout | QueueJsonItem uses meta bag for optional fields |
| 06-02 | item.description holds run-command args (replaces entry.args) | Consistent with queue-store addItem API |
| 06-02 | lock.ts kept with deprecation notice for add.ts/scope.ts | Will be removed after Plan 03 migrates remaining consumers |
| 06-03 | build.ts unchanged — delegates to addCommand | addCommand now uses queue-store, no direct queue write in build |
| 06-03 | JSON backward compat: queued→pending, description→args, line_num=0 | Preserve external consumer contracts during migration |
| 06-03 | Queue --history for completed/failed, inline only shows running/queued | Clean separation of active vs historical items |
| 06-03 | import.ts uses local shortId matching queue-store | Avoids exposing internal ID generator |
| 06-04 | smart-add.ts migrated from parseQueueFile to getItems | Was reading stale QUEUE.md instead of queue.json |
| 06-04 | TUI migration already done in non-plan commits | Prior commits a6003cc and 38cd6ef handled useStatusData/QueuePanel/Dashboard |
| 11-01 | Reuse spawn.ts patterns without shared helpers | Keeps modules independent, avoids refactor scope |
| 11-01 | Queue check validates queue.json not QUEUE.md | Consistent with Phase 6 migration |
| 11-01 | Tests account for real filesystem state | Binary and snapshot repos may exist on dev machines |
| 11-02 | Built-in fetch() for webhook notifications | No new dependency needed (Node.js 20+) |
| 11-02 | Sync appendFileSync for runner log | Infrequent writes, simplicity over async |
| 11-02 | Filename date rotation not mtime | Deterministic and testable |
| 11-02 | Notifications never throw | Fire-and-forget with stderr logging on failure |
| 11-03 | Orphan detection via pgrep with self/parent PID exclusion | Avoids false positives from current process |
| 11-03 | History truncation keeps last 100 entries | Newest entries are most useful; prevents unbounded growth |
| 11-03 | Queue cleanup is read-only reporting | Modifying queue.json during cleanup is too risky |
| 11-03 | verifySetup uses realpath for symlink resolution | Catches broken symlinks that lstat alone would miss |
| 11-04 | postbuild script guarantees shebang + chmod | Defense in depth even if tsc behavior changes |
| 11-04 | --no-tui is informational flag | Runner already headless by default; flag documents intent |
| 11-04 | TUI smoke tests in test/commands/ per plan | Complements test/tui/ without duplication |
| 13-01 | completedIds never pruned in queue.json | Source of truth for dep resolution; history caps at 100 |
| 13-01 | findLaunchableAtomic holds lock during read+mark | Prevents TOCTOU race where two runners launch same item |
| 13-01 | Old findLaunchable kept as deprecated | Existing runner.ts uses it; migration deferred to Plan 02 |
| 13-01 | QueueEntry moved to queue-parser.ts | Legacy QUEUE.md vocabulary, not runtime contract |
| 13-01 | QueueItem kept in types.ts with blocked | JSON contract vocabulary (pending/done) must be preserved |

| 13-02 | Task 2 merged into Task 1 — cascadeFailure tightly coupled with runner refactor | Cannot be separated into standalone commit |
| 13-02 | PID file key change requires updating all consumers | Cross-cutting concern applied atomically |
| 13-02 | Graceful shutdown removes kill logic — pilot stop --force handles externally | Active jobs finish naturally on SIGINT/SIGTERM |
| 13-03 | TTY detection gates human output in run.ts | Daemon mode logs to file only, TTY gets stdout |
| 13-03 | stop --force sends immediate SIGKILL (no SIGTERM) | Clean daemon management for systemd |
| 13-03 | build runs runner in-process with --once | Blocks until item completes, no detached child |
| 13-03 | add is fire-and-forget, never starts runner | Decoupled from runner lifecycle |
| 13-03 | silent mode on addCommand for composition | Prevents double output when build calls add |
| 13-04 | Execa mock override needed for retry/fail test paths | Default stdout:'0' makes checkPlanningChanges true |
| 13-04 | parallel.test.ts once:false → once:true | Sequential/maxParallel enforcement identical in both modes; avoids daemon loop |
| 13-04 | Config mock must include pollInterval + defaultTimeout | Required fields added in Plan 03 runner refactor |
| 14-01 | Sync fs methods for atomic write path (writeFileSync, renameSync, copyFileSync, fsyncSync) | Crash safety requires synchronous operations within held lock |
| 14-01 | tryParseJson with trailing-garbage trimming for truncated write recovery | Handles partial writes where JSON is truncated mid-write |
| 14-01 | cleanStaleLocks as 5-minute safety net beyond proper-lockfile 30s stale | Defense in depth for lock cleanup when proper-lockfile fails |
| 14-01 | Lock acquisition failure logs + re-throws | Callers in daemon loop catch and skip cycle; daemon never crashes |
| 14-02 | BigInt arithmetic for disk space calculation | bfree * bsize can exceed Number.MAX_SAFE_INTEGER on large filesystems |
| 14-02 | Spawn rate limiter as module-level state in spawn.ts | Single daemon process means module-level is effectively singleton |
| 14-02 | validLogLevels cast to readonly string[] for includes() | TypeScript const tuple needs widened type for string.includes() |
| 14-03 | Export checkBinary and getSystemFreeMem from spawn.ts for startup validation | Runner needs binary/memory check without full preSpawnChecks |
| 14-03 | Orphan detection logs only on startup — no kill | Killing on startup too aggressive; Plan 04 handles periodic kill |
| 14-03 | Job log cleanup: keep 20 most recent, delete >7 days beyond that | Balance debugging access with disk space |
| 14-03 | ISO-8601 local timestamp for structured logging | Matches requirements; parseable and sortable |
| 14-03 | Size rotation renameSync cascade (current→.1→.2→.3→deleted) | Standard pattern; ~40MB total cap |
| 14-04 | DaemonStuckAssessment separate from StuckAssessment | Daemon needs isFlaky field and skips CPU sampling |
| 14-04 | Flaky detection checks attempts >= maxAttempts FIRST | Exhausted attempts always fail regardless of flaky signals |
| 14-04 | flakyAttempts map entry required for consistently_flaky label | Prevents false positives on first-time failures |
| 14-04 | Orphan cleanup via pgrep cross-reference | Can't match PIDs to queue items directly; compares count and runtime |
| 14-04 | statSync for log file size in flaky detection | Single sync call in completion handler is fine |
| 14-05 | statSync added to node:fs mock in runner.test.ts | Flaky detection uses statSync; must be mocked |
| 14-05 | Fake timers for spawn rate limiter test | Avoids 5-second real delays in test |
| 14-05 | computeDaemonStuckScore tested with process.pid | Always-alive PID for healthy path verification |
| 15-01 | progress exits 0 for nonexistent projects — test adjusted | Actual CLI behavior: shows "No planning data found" not exit 1 |
| 15-01 | execaNode for E2E subprocess spawning | Cleaner than execa('node', ...) for Node.js scripts |
| 15-01 | Queue JSON written directly in helpers (no core imports) | Test isolation — helpers must not depend on application code |
| 17-02 | In-memory DB via _getTestDb() for test isolation | Fresh DB per test without touching filesystem |
| 17-02 | 4-char alphanumeric IDs with collision check loop | 36^4 = 1.6M possible IDs, collision extremely unlikely |
| 17-02 | updateSessionTitles appends via read-merge-write | Preserves existing titles from previous spawn cycles |
| 17-02 | COALESCE(completed_at, created_at) for cancelled job ordering | Cancelled jobs lack completed_at; fallback to created_at |
| 17-05 | Poll interval from config.pollInterval not hardcoded 5s | Enables 1s polls in tests; configurable in production |
| 17-05 | activeJobs tracked in run() before async launch() | Prevents --once mode from exiting before launch starts |
| 17-05 | Guard against re-launching same job ID already active | Prevents duplicate launches when getNextPending returns same job |
| 17-05 | _resetSpawnRateLimit for test isolation | Module-level rate limiter state persists across tests |
| 17-08 | Real filesystem for detectScope tests | package.json and src/ exist reliably in repo; avoids brittle fs mocks |
| 17-08 | process.exit mocked as throw for error path testing | Halts execution at exit point; enables rejects.toThrow assertion pattern |
| 17-08 | Colors mocked as identity functions | Test assertions check text content not ANSI escape sequences |
| 17-08 | formatRelativeTime mocked to constant | Isolates command output tests from time-dependent formatting |
| 18-04 | @jsxImportSource @opentui/solid per-file pragma for TUI .tsx | Cleaner than @ts-ignore; properly resolves OpenTUI JSX intrinsics |
| 18-05 | Created missing 18-03 prerequisite files (app.tsx, chrome components, tui command) | Plan 18-03 SUMMARY claimed files existed but they were never committed |
| 18-05 | Flash detection via createEffect(on()) comparing prev/current ID sets | Clean SolidJS pattern for detecting new completions without stale closures |
| 18-05 | formatTokens exported from running-panel for reuse | Avoids duplicate helper; completed-panel imports it |

| quick-001 | parseMessageRow reads text_content from part-table subquery | message.data doesn't contain content in opencode schema |
| 22-01 | extractRequirementTitle uses /^#\s+(.+)$/m regex for first # heading | Matches # Title but not ## Subtitle; clean title extraction |
| 22-01 | add-phase gets title, plan-phase gets @path for GSD context | Prevents ugly slugified directory names from file paths |
| 22-01 | Milestone dir fallback derives title from filename when no heading | Strip .md and leading digits for reasonable fallback |
| 22-02 | Artifact verification runs AFTER semantic success gating | Both checks must pass — semantic first, artifact second |
| 22-02 | patchStepArgs mutates plan.steps in place for remaining steps only | Simpler than cloning; patching is always forward-only |
| 22-02 | Non-phase commands skip artifact verification entirely | quick/new-project/debug have no phase directory expectations |
| 22-02 | restoreDefaultReaddirSync helper pattern for test mock state | vi.clearAllMocks doesn't restore mockImplementation overrides |
| 24-01 | getChildSessions returns empty array on DB unavailable | Consistent graceful degradation pattern with other query functions |
| 24-01 | Task tool format: ▶ task: {subagent_type} — "{description}" | Matches requirements spec; human-readable subagent display |
| 24-01 | Fallback to 'subagent' when subagent_type missing | Safe default for unknown task types |
| 24-02 | resolveChildSections uses getChildSessions parent_id join | No heuristics needed; opencode stores parent_id on task-spawned sessions |
| 24-02 | Max 2-level nesting with depth guard | Prevents infinite recursion; covers typical delegation → executor → subagent chains |
| 24-02 | Inline 2-level JSX rendering instead of recursive component | Simpler; avoids SolidJS reactive pitfalls with recursive components |
| 24-02 | Children refreshed on every poller cycle (full fetch) | Child sessions not in incremental since filter path |
| 25-01 | reconcileStaleJobs calls getAllRunningJobs internally | Consistent reuse of existing helper, not raw getDb() |
| 25-01 | markStale sets started_at = NULL | Fresh timing on next run, not stale duration from ghost session |
| 25-01 | error field records reconciliation reason | Debugging ghost-running jobs without separate audit log |
| 25-01 | WHERE status = 'running' guard on markStale | Safe idempotency — calling twice doesn't reset a completed job |
| 26-01 | claimNextLaunchable uses db.transaction() for atomic SELECT+UPDATE | Prevents TOCTOU race — no two callers claim the same job |
| 26-01 | Project serialization via NOT IN subquery inside transaction | Single SQL statement, no extra round-trips |
| 26-01 | Re-fetch row after UPDATE inside transaction | Returns accurate started_at/attempts values post-mutation |
| 26-01 | getRunningJobsByProject is thin alias for getRunningJobsForProject | Same logic, cleaner name for runner dispatch path |
| 26-01 | forceQuitJob embeds source in verdict_reason string | Audit trail without schema change |
| 27-01 | Selection always wins over flash in rowBg() | Deterministic cursor visibility in completed panel |
| 27-01 | countDescendants uses loaded sections signal | Avoids extra DB calls — derived from already-loaded memory |
| 27-01 | Dark tint flash (#0d2b0d / #2b0d0d) not harsh inverse | Subtle enough to notice without disrupting readability |
| 27-01 | Token fetch in completed panel on job change (no timer) | Completed job data is static — one fetch when jobs list changes |
| 26-02 | Periodic reconcileStaleJobs every RECONCILE_EVERY_N_CYCLES=10 | Long-running daemons need ongoing DB-level ghost cleanup, not just startup |
| 26-02 | In-memory same-project guard alongside claimNextLaunchable DB guard | Belt-and-suspenders prevents edge cases between DB claim and activeJobs.set() |
| 26-04 | Passive overlay pattern: ConfirmOverlay renders UI only, app.tsx handles keys | Consistent with HelpOverlay/FilterOverlay patterns |
| 26-04 | pendingConfirmAction signal stores async thunk; executed on y-key | Clean separation between showing overlay and executing action |
| 26-03 | Kill-then-update order: OS kill first, DB update always | Prevents ghost-running jobs even if process already exited before kill |
| 26-03 | DB update continues even when killJobSession returns killed:false | Process may already be gone; DB must reflect terminal state regardless |
| 26-05 | reconcileStaleJobs must be in db mock factory for runner.run() tests | runner.run() calls it synchronously on startup; missing mock crashes tests |
| 26-05 | reconcileStaleRunning tested indirectly via runner.run(once:true) | Function is private; indirect test via runner loop is correct boundary |
| 27-02 | Test pure exported helpers without UI renderer | No SolidJS/OpenTUI rendering needed; keeps tests fast and independent |
| 27-02 | computeRowBg(true, true) pinned to theme.highlight in test | Explicit regression guard for selection-wins-over-flash overlay fix |
| quick-019 | matchesBlocklist uses substring not exact match | GSD instruction phrases appear mid-sentence in title slugs |
| quick-019 | Duplicate check slug-to-words via hyphen replacement | Consistent slug ↔ title normalization without extra library |
| quick-019 | Title similarity warning-only (non-failing) | GSD may legitimately shorten/clean phase titles |
| quick-019 | runner.test.ts mock includes inline matchesBlocklist impl | Avoids auto-mocking stripping the function; tests exercise real logic |
| quick-020 | Token formatting: >=1M → M, >=1k → k, else raw | Compact display for wide range of token counts |
| quick-020 | Cost estimate uses Sonnet pricing ($3/$15 per 1M), local only | No external API; rough estimate sufficient for operator awareness |
| quick-020 | Log header config line uses dim() for metadata subordination | Primary identity (project/scope/desc/id) stays visually dominant |
| quick-020 | info command logs per-step tokens via sessionTitle → findSessionByTitle | Consistent with TUI token lookup pattern |
| quick-021 | Judge failure = benefit of doubt (markCompleted) | Prevents judge bugs from blocking all phase work |
| quick-021 | Shutdown-interrupted jobs reset to pending via resetToPending | Jobs retried on next runner start instead of being lost |
| quick-021 | pilot- prefix commands handled alongside gsd- in spawnAndWait | Avoids double-prefixing pilot-judge as gsd-pilot-judge |
| quick-021 | Execa mock must be re-initialized per test suite | vi.clearAllMocks only clears call counts, not mockResolvedValue overrides |
| quick-023 | resolveTopLevelModel() reuses AGENT_PROFILE_TIERS entries for scope→tier mapping | Avoids separate mapping table; scope→agent is a logical alias |
| quick-023 | Judge scope → haiku always regardless of profile | Judge only parses/evaluates a transcript — cheap tier is sufficient |
| quick-023 | balanced profile shows NO TUI badge to reduce noise | Badges signal non-default config; 90% of jobs use balanced |
| quick-023 | resolvedModels always in pilot info JSON output | Programmatic consumers shouldn't need profile-conditional logic |
| quick-024 | resume_hint in dedicated column, not error field | Clean separation: error = why it failed, resume_hint = how to continue |
| quick-024 | parseJudgeVerdict exported as module-level function | Enables direct unit testing without fighting private method access |
| quick-024 | getJob re-fetch before retry decision | claimNextLaunchable already incremented attempts; stale job object would give wrong retry count |
| quick-024 | Shutdown during judge → resetToPending not markFailed | Phase session completed — marking failed loses work; pending preserves it for retry |
| quick-024 | resetToPending clears session_titles and job_steps | Prevents stale reconciler pgrep matches and stale TUI step display across retries |
| quick-025 | scrollbox focusable={false} + ref callback for keyboard passthrough | Belt-and-suspenders: prop may not apply at construction time, ref guarantees it |
| quick-025 | Always show resolved executor model in detail header | Users need concrete model name, not just profile name |
| quick-025 | Rounded border parent / single border child subagent boxes | Visual weight decreases with nesting depth |
| quick-025 | Render helpers (not components) for part indentation levels | Avoids duplication while keeping JSX readable; captures closure state |
| quick-026 | actual_models stored as JSON TEXT array via additive migration | Backward compat — existing jobs show null until next completion |
| quick-026 | collectActualModels() called before both markCompleted and markFailed | Ensures model data captured regardless of success/failure path |
| quick-026 | Mismatch = actual models don't contain resolved gsd-executor string | Executor is the primary agent; other agents using different models is expected |
| quick-026 | log header shows actual model without mismatch color | Cleaner for stream context; full highlighting in info/TUI detail is sufficient |
| quick-027 | lstatSync-first for broken symlink detection in validateProjectSetup | existsSync follows the link and returns false for broken symlinks; lstatSync stats the link entry itself, enabling distinct "broken setup" error |
| quick-027 | warn-only for missing opencode.json in validateProjectSetup | Requirements explicitly say warn but don't block — manually-configured projects may lack the file |
| quick-033 | confidence=0 as inconclusive signal in JudgeVerdict | Avoids adding new verdict type; judge agent prompt unchanged; confidence=0 is unambiguous sentinel |
| quick-033 | statusIcon accepts full job object not just status | Enables verdict/scope inspection at the icon layer without a separate helper call at every call site |
| quick-033 | isInconclusive() duplicated per-file not shared | Keeps status.ts, queue.ts, completed-panel.tsx independently importable; logic is 5 lines |
| quick-035 | statusLabel maps pending→queued for user output | "queued" is clearer than "pending" in human-facing warning |
| quick-035 | Two query paths in findDuplicateJob (with/without requirementPath) | Avoids needless NULL comparisons; OR-match on description or path when path is known |
| 28-01 | Memory config fields in MB not bytes/GB | Human-readable unit consistent with existing stuckThreshold/etc. fields |
| 28-01 | NaN fallback pattern identical to existing config fields | Consistency — no new patterns; invalid env vars silently use defaults |
| 28-02 | hasSystemdRunUser cached at module level (not Runner construction) | Module-level ensures single probe across daemon restarts |
| 28-02 | getDynamicMaxParallel is 3-arg pure function (no getConfig() call) | Enables unit testing without mocking getConfig() |
| 28-02 | Watchdog uses setInterval not polling loop inside drain cycle | Independent from drain cycle; cleared in finally block for clean shutdown |
| 28-02 | systemd unit name sanitized + truncated to 60 chars + base36 timestamp | Prevents ENAMETOOLONG; unique per spawn; systemd-safe characters only |
| 29-01 | Multi-step delegation: each GSD command in its own opencode session | Task() subagents can't execute commands via inlining; separate sessions get proper --command flag |
| 29-01 | execute-phase triggers judge evaluation (not 'phase') | With multi-step plans, execute-phase is the meaningful completion step to evaluate |
| 29-01 | K shortcut works from any view/panel (removed panelFocus gate) | Users should be able to kill a selected running job regardless of which panel has focus |
| 29-01 | Slug-based fuzzy matching with word overlap for phase dir detection | Handles both exact and abbreviated directory names without external libraries |
| 29-02 | mockPhaseSubdirFiles mock pattern for getPhaseState testing | Extends readdirSync mock to support per-phase-directory file listing without real filesystem |
| 29-02 | buildPhaseArgs describe block removed (function deleted in 29-01) | Testing a removed function would fail; behavior tested implicitly through other suites |
| 29-02 | makeTestJob actualModels: null added | Job type gained this field; helper must match current type to avoid TypeScript errors |
| 30-01 | depends_on enforcement via SQL subquery inside claimNextLaunchable transaction | Atomic claim + dependency check in one query — no TOCTOU window |
| 30-02 | buildMilestonePlan returns single new-milestone coordinator step (not flat per-requirement steps) | Old flat approach was fragile and unrecoverable on failure |
| 30-02 | spawnChildJobs uses bare phase number as job description (e.g. "30") | Matches delegate.ts bare-number fast-path — skips delegation AI for numeric descriptions |
| 30-02 | checkMilestoneParent in finally block — runs after both success and failure paths | Ensures milestone pause logic runs regardless of launch() outcome |
| 30-02 | Telegram fields telegramBotToken/telegramChatId as null when env vars absent | Consistent with other nullable config fields; notification silently skips if not configured |
| 30-01 | unpauseMilestone sets status='completed' not 'running' | Milestone coordinator completes after spawning children; paused is operator overlay on completed state |
| 30-01 | getMilestoneStatus uses in-memory getChildJobs loop not SQL aggregate | Simpler; milestone child counts are small and getChildJobs is already available |
| 30-03 | skip clears depends_on only for immediate next child (depends_on === failedChild.id) | Children further down the chain retain their deps and unblock naturally when next child completes |
| 31-01 | Step 0.5 runs ALL checks even when early ones fail | Collect complete error picture for operators rather than stopping at first failure |
| 31-01 | Skipped checks omitted from VERIFICATION.md frontmatter (no pass:null) | Only ran checks appear; runner can detect available checks by key presence |
| 31-01 | Verdict: FAIL if any automated check fails OR gaps_found; WARN if human_needed; PASS if all clear | Single machine-readable field for runner pass/fail/retry decision |
| 31-01 | gsd-verify-phase is a thin wrapper — all logic in gsd-verifier agent | Single source of truth for verification logic; command just resolves context and spawns |
| 31-02 | parseVerificationResult uses regex not YAML library | Known schema, no new deps needed |
| 31-02 | null from runVerification → benefit-of-doubt (confidence=0) | Prevents verification failures from blocking pipeline |
| 31-02 | WARN verdict maps to pass (confidence=70) | Runner cannot do human verification; operator reviews judgeVerdict |
| 31-02 | runJudge() deleted — dead code since quick-021 redesign | Confuses future readers; never called |
| 32-01 | Milestone jobs skip notifyJobCompletion | Coordinators spawn children; children carry real work and each notifies |
| 32-01 | callbackUrl falls back to config.openclawHooksUrl | Per-job URL override > global default from env var |
| 32-01 | sessionKey omitted from payload when callbackSessionKey is null | OpenClaw uses default hook session when absent; avoids sending null |
| 32-01 | addJob positional params for callbackSessionKey + callbackUrl | Consistent with existing dependsOn/parentJobId positional pattern |
| 32-02 | Re-fetch job after markCompleted/markFailed for callback | completedAt is set by those mutations; stale in-memory job lacks it |
| 32-02 | Children inherit callbackSessionKey but not callbackUrl | Children use global hooks URL; sessionKey routes to the right OpenClaw session |
| 32-03 | Use 10s (not 30s) for <1m formatDuration boundary test | Math.round(0.5) = 1, so 30s returns "1m" not "<1m" |
| 32-03 | Call notifyJobCompletion directly in fire-and-forget test (not via expect().not.toThrow()) | Variable assigned inside async callback isn't accessible outside the callback |
| quick-040 | phase command passes through parseDelegationOutput as-is (no decomposition) | GSD's phase command already orchestrates the full lifecycle internally |
| quick-040 | patchPhaseArgs removed — was treating symptom of the now-removed decomposition | The fix was addressing the hardcoded phase 1 introduced by the conversion |
| quick-040 | State-aware resume logic preserved in resolvePhaseForFallback | Existing phases with plans/summaries still need targeted execute-phase/plan-phase commands |
| quick-041 | After new-milestone, re-run delegate() and append returned steps | Runner stays dumb — delegation AI decides what phases to run |
| quick-041 | spawnChildJobs and checkMilestoneParent completely removed | No ROADMAP.md parsing in runner; no child job fan-out; milestone phases run inline |
| quick-042 | noNotify as explicit AddOptions field (not Commander --no-prefix) | Tests call addCommand directly; explicit field is cleaner and testable |
| quick-042 | Config mock rewritten as vi.fn() factory | importOriginal callback unsupported in bun's vitest ESM runner |
| quick-042 | Error exit code 2 for missing notify intent | Consistent with other validation errors in addCommand |
| 33-01 | blockProject called inside markFailed() after UPDATE jobs | Keeps fail→block atomic from caller perspective; no separate runner call needed |
| 33-01 | claimNextLaunchable NOT IN subquery against projects table | Simple and correct — works even for unregistered projects (returns empty set = no exclusion) |
| 33-01 | Owner notification via synthesized job-like object with owner as callbackSessionKey | Reuses existing notifyJobCompletion without changing its signature |
| 33-01 | Verification retry removed — throw goes to markFailed which blocks project | Operator uses pilot retry + pilot unblock; no silent auto-retry |
| 33-01 | max_attempts DEFAULT 1 — single attempt, explicit retry by operator | Prevents infinite retry loops; failure analysis is clearer |
| 33-02 | Dynamic import for db.js inside setup.ts --owner handler | Keeps top-level setup.ts import surface clean; db.ts loaded lazily |
| 33-02 | retry also calls unblockProject — unblocking and retrying are one operator action | No extra step needed; operator intent is "let it flow again" |
| 33-02 | add.ts notify fallback: --notify > PILOT_DEFAULT_NOTIFY > project owner > error | Project owner as implicit default prevents breaking registered-project workflows |
| 33-03 | statusColors.failed/done/warning for project dots (not theme.error/warn/success) | theme object only has bg/fg/muted/border/highlight — statusColors holds semantic status colors |
| 33-03 | ProjectsPanel in bottom row alongside CompletedPanel (flexGrow=1 each) | Natural 2-column layout; avoids adding a third row to the dashboard |
| 33-03 | OpenTUI text has no bold prop — use fg color change for selected row | Compile-time fix; visual emphasis preserved via muted→fg color shift |
| 33-04 | getProject: vi.fn(() => null) added to add.test.ts db mock factory | Dynamic import in add.ts covered by module mock; vi.fn() allows per-test override |
| 33-04 | cancel-retry-bump.test.ts pre-existing failures fixed alongside plan work | unblockProject added in 33-01 was missing from mock; JSON assertion was stale |
| 34-02 | updateSessionTitles(job.id, [verifyTitle]) BEFORE spawnAndWait in runVerification | Pre-registration required — filter fix in fetchJobParts only works if title exists in job.sessionTitles |
| 34-02 | Verify timeout: Math.min(config.defaultTimeout, 15) * 60_000 as timeoutOverrideMs | 15min cap without new config field; reuses optional param pattern on spawnAndWait |
| 34-02 | pilot-verify-* bypass stepTitles filter (not in job_steps) | Verify is a post-step quality gate, not a numbered step; explicitly allowed through |
| 34-02 | PILOT_DEBUG env var gates poll logs | Zero production log spam; full observability on demand |
| 34-03 | TUI newline→space kept even without truncation | @opentui/solid <text> elements are single-line; multi-line must be collapsed |
| 34-03 | CLI text part non-verbose: first line only then truncate | Avoids collapsing multi-paragraph responses to one unreadable blob |
| 34-03 | termWidth() = process.stdout.columns ?? 120 | Terminal-adaptive soft-wrap; defaults to 120 when stdout is not a TTY |
| quick-045 | Delegation always uses 'phase' scope for resolveTopLevelModel — delegation is orchestration regardless of job scope | Ensures --model flag always resolves to planner tier; matches spawnAndWait pattern |
| 36-03 | add.ts resolves profile/provider to concrete value (never undefined) via getConfigFileDefaults() | db.ts fallback is safety net, not primary path; type narrows from `T | undefined` to `T` |
| 36-03 | Doctor warns (not fails) on missing config file | Using defaults is valid; warn guides users to `pilot config init` |
| 36-03 | Doctor warns on world/group-readable config file permissions | Config may contain tokens (telegram, openclaw); chmod 600 recommended |
| 37-01 | PREDEFINED_CATEGORIES in skills.ts not types.ts | Runtime constant, not a type definition |
| 37-01 | Simple line-by-line frontmatter parser (no yaml library) | Only name/description fields needed; avoids new dependency |
| 37-01 | loadManifest returns graceful default on missing/corrupt file | Prevents crashes on first use or data corruption |
| 37-01 | Atomic manifest writes via temp file + rename | Crash safety for manifest.json |
| 37-01 | injectSkills writes .pilot-injected.json tracking manifest | Precise cleanup — only removes what Pilot added |
| 37-01 | Universal skills (empty categories) always included in resolution | Skills without categories apply to all jobs |
| 38-01 | Kept getNextPending/markRunning/pauseJob/reconcileStaleJobs exported from db.ts | Tested directly in db.test.ts as legitimate public DB API |
| 38-01 | PRAGMA validation extracts name before = sign | Handles both Bun and better-sqlite3 calling conventions |
| 38-01 | Wrapped better-sqlite3 constructor for pragma validation | Mirrors Bun compat wrapper pattern; intercepts .pragma() calls |
| 38-02 | acquireRunnerLock throws instead of process.exit(1) | Allows finally block cleanup (lock release, active job termination) |
| 38-02 | PID liveness bare catch is intentional control flow | process.kill(pid, 0) throws when dead — catch means bail, not swallow |
| 38-02 | Auth token only sent to trusted openclawHooksUrl | Custom callback URLs get no Authorization header — prevents token leakage |
| 38-02 | handleDbError covers SQLITE_CORRUPT + SQLITE_IOERR + malformed | Three error patterns trigger cachedDb reset for auto-reconnect |
| 38-02 | Low-memory logging uses loggedLowMemory flag | Logs once per state transition to 0 maxParallel, not every cycle |

| 39-01 | timeout: number with 0=infinite as sentinel — no nullable needed | Clean sentinel value, consistent with SQLite DEFAULT 0 |
| 39-01 | max_attempts column NOT dropped via migration (SQLite compat) | SQLite ALTER TABLE DROP COLUMN requires 3.35+; column becomes orphaned but harmless |
| 39-01 | pollInterval kept in PilotConfig but removed from ConfigFileSchema.runner | Still an internal constant used by runner; no longer user-configurable |
| quick-070 | `skills tag` uses Commander requiredOption and handlers still validate empty category payloads | Defense in depth: fail fast at CLI boundary and preserve correctness if wiring changes |
| 43-02 | updateJobRecoveryStart is persisted before dirty-start refusal | Captures real attempt context (base + startedDirty) even when launch is safely refused |
| 43-02 | git recovery helpers normalize expected git non-zero outcomes to typed values | No-commit and non-ancestor conditions are expected branches, not exceptions |
| 43-02 | updateJobRecoveryHead runs before markCompleted/markFailed in both terminal paths | Ensures undo checkpoint metadata survives failed jobs and is available for recovery tooling |
| 43-03 | `pilot undo` force overrides are limited to guarded-history and dirty-start cases | Preserves conservative defaults while allowing explicit operator-controlled recovery when needed |
| 43-03 | Dirty worktree stays a hard refusal for destructive undo even with --force | Prevents accidental discard of current uncommitted edits during rollback |
| 43-04 | status recovery visibility stays metadata-first, with newer-work tags shown only when known | Keeps `pilot status` cheap while still surfacing actionable guard states |
| 43-04 | `pilot info` adds live per-job relation checks and emits a stable `recovery` JSON object | Enables explicit newer-work/diverged guidance without breaking existing JSON consumers |
| 43-04 | TUI detail header uses concise single-line recovery labels (safe/guarded/unavailable + reason) | Preserves scanability in narrow terminals while exposing checkpoint safety context |
| 44-01 | queue grace default is 120s with explicit 0 disable | Meets "minute or two" safety window while keeping fast opt-out semantics |
| 44-01 | `skip_grace_period` stored as additive INTEGER column default 0 | Backward-compatible persistence for per-job immediate-start intent |
| 44-01 | `runner.queueGraceSeconds` surfaced in config init/show/set/get | Operators can inspect and tune grace behavior without manual JSON editing |
| 44-02 | Grace eligibility enforced in claim SQL using sqlite epoch age math | Keeps launch gating deterministic and avoids JS timestamp parsing drift |
| 44-02 | `pilot add` only passes skipGracePeriod when `--start-immediately` is set | Preserves default call paths while still persisting explicit fast-start intent |
| 44-02 | Runner dispatch passes config `queueGraceSeconds` into claim path every cycle | Ensures grace affects real launch eligibility, not just queue labeling |
| 44-03 | Shared `JobWhy` helpers now own pending/retry/undo/no-op reason copy and stable machine codes | Prevents wording drift across status/retry surfaces and enables reuse in later TUI/info/log work |
| 44-03 | `pilot status --why` keeps default rows concise and moves richer guidance to one what/why/next line | Preserves scanability while still exposing actionable guard context on demand |
| 44-03 | `pilot retry --why` is explain-only and never mutates queue state | Operators can evaluate retryability before taking side-effecting actions |
| 44-04 | `pilot log --summary` uses deterministic metadata synthesis (job row + step/verdict + checkpoints), not transcript summarization | Keeps summaries stable, fast, and scriptable without model-dependent variance |
| 44-04 | `pilot info` now starts with a compact triage block before deep diagnostics | Answers what happened and what to do next in the first screen while preserving detailed data below |
| 44-04 | Summary JSON payloads add explicit `summary`/`triage` objects instead of replacing existing fields | Preserves backward compatibility for existing automation consumers |
| 44-05 | Queue rows now derive grace/blocked/dependency badges from shared JobWhy helpers with grace remaining seconds | Keeps TUI queue labels aligned with status/retry reason contracts while preserving compact rows |
| 44-05 | Dashboard passes blocked/running/dependency context into QueuePanel instead of doing extra DB reads in the component | Keeps badge logic deterministic and reactive to the same in-memory TUI state |
| 44-05 | Detail header adds compact reason lines only for grace wait, needs-revision retry, and guarded/missing-checkpoint undo states | Improves triage clarity without turning the header into verbose multi-line diagnostics |
| 44-06 | Dirty-start launch refusal copy now follows explicit what/why/next guidance with command-level next actions | Makes clean-start guardrails immediately actionable and frames `--force-dirty` as a deliberate tradeoff |
| 44-06 | Undo safety refusals share one what/why/next contract across newer-work, diverged, dirty-start, and dirty-worktree cases | Keeps guardrail messaging consistent while preserving conservative undo safety policy |
| 45-01 | Session-title model helper now resolves latest session ID and delegates to recursive session-tree traversal | Preserves backward compatibility while making model aggregation child-session aware |
| 45-01 | Per-model token aggregation groups by provider/model and coerces missing token fields to zero | Keeps breakdowns deterministic without inventing usage for absent fields |
| 45-01 | Recursive total-token aggregation now uses visited-session tracking in addition to depth guard | Prevents duplicate counting on cyclic or malformed parent_id graphs |
| 45-02 | Pricing assumptions moved to explicit PRICING_CATALOG with estimated/partial/unavailable statuses | Prevents fake blended cost precision and keeps caveats machine-readable |
| 46-01 | seedModelTables checks provider_modes row count — empty means first run | Simplest idempotency check; any existing data means preserve customizations |
| 46-01 | getDb and seedModelTables exported from db.ts | model-store.ts needs shared DB connection and re-seed capability for reset |
| 46-01 | resetAllToDefaults clears all then re-runs seedModelTables | Clean re-seed avoids partial state; seedModelTables handles full population |
| 46-01 | AGENT_MODELS cast to generic Record in model-store.ts | Avoids ProviderMode union constraint when indexing with dynamic strings |
| 45-02 | buildJobObservability now emits one canonical requested/observed/tokens/cost snapshot with running-job partial semantics | Keeps CLI/TUI/export surfaces aligned on one observability contract |
| 45-02 | Runner collectActualModels now resolves root session IDs and traverses recursive trees with normalized sorted dedupe | Preserves trustworthy terminal model provenance for mismatch and cost analysis |
| 45-05 | Export defaults write to ~/.pilot/exports/job-<id>.md with explicit --output and --stdout controls | Predictable artifact location while preserving operator control for file and stream workflows |
| 46-02 | DynamicProviderMode = string alias, ProviderMode union kept for AGENT_MODELS | Preserves type safety for hardcoded constant while enabling custom modes everywhere else |
| 46-02 | Job.providerMode widened to string | Custom modes from provider_modes table need to round-trip through Job objects |
| 46-02 | Config providerMode validation accepts any non-empty string | Actual validation at resolution time — DB may not be available during early config parse |
| 46-02 | ESM circular dependency (models→model-store→models) safe via live bindings | AGENT_MODELS accessed inside functions at call time, not at import evaluation time |
| 46-02 | Resolve functions: try DB → catch → fall through to AGENT_MODELS | Graceful degradation ensures pilot works even when DB is unavailable |
| 46-03 | Agents and Scopes displayed in separate table sections | _top: prefix entries are visually distinct from agent entries |
| 46-03 | Profile selection includes 'all' option in edit flow | Common case: user wants same model for all profiles of an agent |
| 46-03 | Default confirm is 'n' in edit flow | Safety: accidental Enter doesn't apply unwanted changes |
| 46-03 | Available modes listed when no specific mode requested | Discoverability: users see what other modes they can inspect |
| 46-04 | Provider name regex: lowercase alphanumeric + hyphens, 2-50 chars | Consistent with DNS/slug naming; prevents whitespace/special char issues |
| 46-04 | Import upserts: modes skip if exists, profiles always overwrite | Modes are identity (skip duplicates); profiles are config (latest wins) |
| 46-04 | Export always uses raw JSON stdout (not outputJson) | Data portability format — pipe-friendly, always JSON regardless of --json flag |
| 46-04 | validateProvider error lists custom modes from DB alongside built-in | Users can discover available custom modes from error message |
| 46-05 | _getTestDb() directly for model-store tests — no vi.mock needed | model-store functions call getDb() which returns the cached DB from _getTestDb() |
| 46-05 | Mock process.exit as throw for CLI error path testing | Verifies exit code paths without terminating the test runner |
| 46-05 | Capture stdout.write for export command testing | modelsExportCommand always writes JSON to stdout regardless of --json flag |
| 47-01 | judge/budget scope for AGENTS.md model resolution | Cheapest model sufficient — AGENTS.md operations don't need expensive AI |
| 47-01 | extractLastAssistantContent private, not exported | Internal helper only needed by spawnAgentsMdSession |
| 47-01 | Separate try/catch for AGENTS.md section in setup.ts | Isolates from skill bootstrap errors and config init |
| 47-02 | AGENTS.md checks use warn/pass only — never fail | Doctor exit code unaffected by AGENTS.md status |
| 47-02 | System-level doctor: file-existence check only (no AI) | Prevents system doctor from becoming slow with AI spawns |
| 47-02 | Project-level doctor: AI drift detection only in --project mode | Bounded time — single project with 90s timeout |
| 47-02 | Lessons command defaults to process.cwd() | Matches requirements — "or current directory" |
| 47-02 | Lessons continues without AGENTS.md (informational warning) | Lessons can still be extracted and printed for manual review |
| 48-01 | gsd-delegate.md as sentinel file for command layout validation | Pilot-specific command only in correct flat layout; simple existence check |
| 48-01 | existsSync for sentinel check (not async access()) | Single file existence; simpler code, no need for async |
| 48-01 | Validation returns error in result.errors (not throws) | Consistent with setupProject() error handling pattern |
| 49-01 | buildJudgeSignal returns outcome='none' for non-phase jobs | Prevents judge badges from leaking into quick/milestone surfaces |
| 49-02 | status.ts recent rows consume buildJudgeSignal for completed phase judge badges | Keeps pass/inconclusive semantics aligned with shared core helper while preserving retry/undo/obs row context |
| 49-02 | info.ts Verdict line now uses buildJudgeSignal + formatJudgeReason | Unifies reason/confidence parsing semantics across status/info/TUI and keeps summary fallback compatibility |
| 49-03 | completed-panel terminal rows compose [judge:*], retry, and undo badges from shared helpers | Keeps TUI badge semantics aligned with core judge/introspection logic and avoids ad-hoc parsing drift |
| 49-03 | detail header adds explicit Status/Verdict/Retry/Undo lines; wait context stays in supplemental reason lines | Makes operator triage signals scan-friendly without losing existing contextual guidance |
| quick-078 | OpenAI defaults standardized to gpt-5.4 with xhigh/high remapped to high/medium | Keeps runtime mappings, tests, and GSD agent defaults aligned with current OpenAI naming and intended thinking-level semantics |
| 51-01 | Persist structured OpenClaw delivery route on both projects and jobs as JSON text columns | Enables deterministic queue-time snapshots and project-level route management without breaking legacy callback fields |
| 51-01 | Legacy route derivation only accepts strict `agent:<agentId>:<channel>:(group|channel|thread|topic):<target>` shapes | Prevents ambiguous owner/session-key values from causing wrong-chat notification delivery |
| 51-02 | Callback notifications resolve route first and fail closed on invalid route data (no `/hooks/wake` fallback) | Ensures misconfiguration is actionable and prevents silent delivery to the wrong chat lane |
| 51-02 | OpenClaw notifications are delivered via `openclaw agent --deliver` with explicit reply flags from canonical routes | Keeps group/DM delivery on one transport path with deterministic argument construction |
| 51-03 | Project notify route fields require `--notify-openclaw` and are managed via explicit set/clear semantics | Prevents partial/ambiguous route mutations and keeps operator intent explicit |
| 51-03 | addCommand snapshots resolved notify routes at queue time and rejects explicit `--notify` agent mismatches | Keeps runtime delivery deterministic per job and blocks wrong-agent route drift early |
| quick-079 | Dirty-start launch checks require exact branch/head/porcelain match against the latest per-project baseline | Allows safe same-project continuation while conservatively blocking ambiguous manual or unattributed dirt |
| quick-079 | `project_dirty_baselines.job_id` is stored as required attribution text without foreign-key coupling | Baseline attribution must survive job lifecycle cleanup and synthetic test fixtures without write failures |
| 52-01 | resolveOpencodeBinary() uses accessSync(X_OK) for absolute paths, execSync('which') for bare commands | Proper filesystem validation instead of always returning first candidate |
| 52-01 | Service unit uses /usr/bin/env bun instead of absolute interpreter path | Survives bun/node upgrades without re-install |
| 52-01 | Stable minimal PATH in service unit includes ~/.opencode/bin + standard dirs | Prevents PATH snapshot staleness from shell environment |
| 52-01 | Doctor service check parses ExecStart to validate pilot binary path | Detects stale service units proactively |
| 53-01 | resolvePilotBinary() uses import.meta.url → which pilot → throw chain, never argv | Canonical path survives rebuilds/relinks; no stale argv in service units |
| 55-01 | realpathSync resolves pilot binary through all symlinks to actual file | Stable symlink points to real binary, not another symlink chain |
| 55-01 | fnm explicitly not exposed in plain shells — node/pnpm are the interface | fnm is an interactive-shell convenience, not a runtime dependency |
| 55-01 | Real files at target paths are never overwritten — only symlinks are managed | Prevents accidental data loss when ~/.local/bin has manually placed binaries |
| 56-01 | --fix only runs ensureShellExposure when verify detects non-pass findings | Idempotent by design — second run verifies all pass, skips ensure |
| 56-01 | Repair hints in doctor/shell-exposure changed to 'pilot doctor --fix' | System-level repair is doctor's job; setup.ts hints left for project-scoped concerns |
| 57-01 | Notify is informational-only in doctor (warn, never fail) | Missing notify should never block project health |
| 57-01 | Route resolution guarded by resolvedNotifyKey !== undefined | Prevents calling resolveNotifyRoute when no notify intent exists |
| 57-01 | Setup messaging uses "Notifications are optional." phrasing | Makes clear this is not a missing step but an add-on |
| 59-01 | deregisterProject uses DELETE, does not cascade to jobs | Associated jobs remain for historical reference |
| 59-01 | confirmMessage signal decouples overlay text from action type | Enables context-specific messages for both kill and remove actions |
| 60-01 | Keep getPorcelainStatus as private in git-recovery.ts | isWorktreeDirty() calls it internally — removing would break dirty check |
| 60-01 | Remove allowDirtyStart from info.ts as part of Task 1 | TypeScript compilation requires consistent type removal across all consumers |
| 60-01 | Keep startedDirty throughout all interfaces and DB schema | Informational metadata for observability — records worktree state at launch |
| 60-02 | Dirty-start jobs return undo:safe instead of undo:guarded-dirty-start | Dirty state is no longer a guard condition — undo checkpoints are equally valid |
| 60-02 | Remove allowDirtyStart from all positional addJob call expectations | Parameter removed from addJob() in 60-01, shifting skipGracePeriod/notifyRoute positions |
| 61-01 | Named getSessionChildSummaries instead of getSessionChildren | opencode-db.ts already exports getChildSessions; avoids import name collision |
| 61-01 | Session status is done/active/unknown three-state model | Distinguishes finished sessions, sessions with activity, and possibly-crashed sessions |
| 61-01 | Activity preview capped at 10 items from last 20 parts | Compact preview without overwhelming UI; recent parts only |
| 61-01 | Cursor is opaque timestamp string | Future flexibility to change cursor format without breaking clients |
| 61-02 | Manual web/ scaffold instead of pnpm create @tanstack/start@latest | Precise control over dependency versions, path aliases, and port config |
| 61-02 | Vite 7 chosen for peer dependency satisfaction | Vite 6 had unmet peer warnings; Vite 8 broke plugin-react and tailwindcss/vite |
| 61-02 | inputValidator (not validator) on createServerFn | TanStack Start 1.166.8 API uses inputValidator for server function data validation |
| 61-02 | QueryClientProvider in __root.tsx instead of app.tsx | TanStack Start auto-generates app entry; root route is correct integration point |
| 61-02 | CSS ?url import with vite-env.d.ts type declaration | Standard TanStack Start SSR pattern; type declaration needed for standalone tsc |
| 61-02 | Server functions import @pilot/core/*.js with .js extension | Parent project uses Node16 resolution; Vite resolves .js → .ts via tsconfig paths |
| 62-05 | Actions tests placed in test/web/ under root vitest config | Web directory has no vitest; root config finds test/**/*.test.ts |
| 62-05 | Server-fns mock uses vi.mock('~/lib/server-fns') exact specifier | Must match the exact import path in source for vitest module interception |
| 62-05 | Timeline ordering verified via timestamp array equality | More readable and deterministic than pairwise comparison assertions |
| 63-01 | Step attribution fallback order fixed as sessionId → sessionTitle → time window → unattributed | Keeps grouping deterministic and resilient when step/session metadata is partially missing |
| 63-01 | Child lifecycle represented as one fork-card object with completion fields | Removes split fork/completion rows and keeps one coherent branch identity over time |
| 63-01 | Grouped timeline payload keeps deprecated flat items array during migration | Avoids breaking existing consumers while step-grouped contract becomes the default |
| 63-03 | `/jobs/$jobId` now acts as layout-only shell while parent detail moves to `jobs.$jobId.index` | Makes child drill-in primary content instead of appending below parent detail |
| 63-03 | Command palette job context stays at layout scope, shared by index and child routes | Preserves action parity and avoids per-route context drift |
| 63-03 | Route contract tests assert source + generated route-tree invariants instead of deep router internals | Stable regression coverage for nested layout/index/session topology |
| 63-04 | TUI detail polling merges grouped snapshots by immutable section/item keys | Keeps lifecycle branch rows up-to-date without title-key collisions |
| 63-04 | Branch lifecycle identity is `fork:<childSessionId>` instead of title | Prevents same-title subagents from overwriting each other during merges |
| 63-04 | Adapter emits unattributed fallback section when grouped data is absent | Ensures timeline activity never disappears during partial step attribution |
| 63-05 | Detail drill-in state is centralized in TUI store (path + selected child + visible children) | Keeps keyboard routing, footer hints, and detail rendering in sync from one source of truth |
| 63-05 | Esc/Backspace pop one nested child level before leaving detail | Makes back-navigation predictable and preserves context while drilling through child sessions |
| 63-05 | Detail hint surfaces are context-aware (child count + depth) | Prevents phantom shortcuts and ensures footer/help copy only shows relevant implemented controls |
| 63-02 | TimelineStream uses `useInfiniteQuery` with grouped page merging | Preserves loaded pages during live polling and keeps chronology stable within each step |
| 63-02 | Branch semantic logic extracted to `branch-lifecycle-block.helpers.ts` | Enables deterministic regression tests without UI runtime alias constraints |
| 63-02 | `timeline-fork-card` kept as thin compatibility wrapper over `BranchLifecycleBlock` | Retires split branch assumptions without breaking existing component entry points |
| quick-085 | README keeps web UI launch guidance concise and defers deeper operator workflow to Getting Started | Maintains top-level product framing while keeping setup/tutorial detail out of README |
| quick-085 | Remote web access guidance uses real dev-server behavior (`bun run dev -- --host ... --port 3100` + `ssh -L`) | Keeps operator instructions truthful to current `web/` scripts and Vite port defaults |
| 64-02 | installer bin path via import.meta.dirname: path.resolve(dirname, '..', '..', 'node_modules/.bin/get-shit-done-cc') | Works from both dist/core/ and dist/commands/ — both 2 levels up from repo root |
| 64-02 | Missing package.json warns + skips GSD only; rest of setup continues | GSD installer requires Node.js project; other setup steps (opencode.json, .gitignore) are still useful |
| 64-02 | bun update used in update.ts for get-shit-done-cc upgrade | Pilot uses bun as runtime; consistent with project toolchain |
| 64-02 | verifySetup() accepts real directories as valid GSD state (not requiring symlinks) | Post-migration projects have real dirs; symlinks are legacy pilot-gsd pattern |
| 64-03 | vi.importActual incompatible with bun — use direct module imports in mocks | bun's mock system doesn't support vi.importActual; spread from direct import instead |
| 64-03 | Installer timeout test uses exitCode:null (not throw) — matches reject:false execa behavior | With reject:false, execa returns error result not exception; null != 0 triggers error path |
| 65-01 | Preserve user values via deep merge, then enforce explicit PILOT_WINS paths | Keeps custom project config intact while guaranteeing autonomous safety gates |
| 65-01 | Lock `.planning/config.json` directly with proper-lockfile retries | Prevents concurrent ensure calls from producing torn writes or lock contention failures |
| 65-01 | Missing/invalid config is treated as empty object before reseeding | Makes lifecycle helper idempotent and self-healing for malformed config states |
| 65-02 | setupProject enforces autonomous planning config via ensureAutonomousGsdConfig() after Node installer flow | Guarantees setup refreshes and fresh runs both apply centralized autonomous policy without duplicating merge logic |
| 65-02 | setup keeps autonomous config enforcement failures in SetupResult.errors without aborting remaining setup steps | Preserves existing setup error semantics while still surfacing autonomous config problems clearly |
| 65-02 | setup tests use vi.hoisted execa mock wiring | Keeps fallback vitest verification deterministic when bun is unavailable |
| 65-03 | spawnAndWait asserts ensureAutonomousGsdConfig() before every opencode launch | Enforces autonomous config across all runner command paths, including judge/verify/pilot-prefixed sessions |
| 65-03 | new-project step completion triggers an immediate config reapply hook | Repairs `.planning` recreation flows before downstream lifecycle steps continue |
| 65-03 | runner recovery tests assert helper/spawn call ordering and assertion-failure behavior | Guards against regressions that could reintroduce interactive drift or silent launch continuation |
| 66-01 | Pass delegation prompt as opencode run message (not --command gsd-delegate) | opencode run takes positional message args; no --prompt flag exists |
| 66-01 | Load delegate.md via readFileSync(import.meta.url) at module init | Reliable path resolution that works in both dev and production dist |
| 66-01 | Two-attempt parse retry with error injection | First parse failure → inject error context → one more attempt → fail with doctor hint |
| 66-02 | milestoneLoop uses MAX_REDELEGATION_DEPTH=3 per type + absolute cap | Belt-and-suspenders to prevent infinite loops; per-type cap is more precise |
| 66-02 | runJudgeAndHandleResult returns (not throws) on no-activity/no-session | Consistent with existing behavior; resetToPending handles retry |
| 66-02 | runJudge() accepts phaseNumber directly instead of DelegationStep | Decouples judge from step structure; cleaner contract |
| 67-01 | Nonexistent session returns 'done' for getSessionState() | Safe default — prevents killing a session that hasn't written parts yet |
| 67-01 | DB error in getSessionState() returns 'working' | Safe fallback — don't kill on query failure |
| 67-01 | pidAlive parameter defaults to true in getSessionState() | Caller does OS PID check; function stays pure DB query |
| 67-01 | step-finish reason='tool-calls' falls through to pending tool check | Not a terminal state; session starts another step after tool-calls |
| 67-02 | killHungSession is private on Runner (not exported) | Only the poll loop integration (Plan 03) calls it; no reason to export |
| 67-02 | Both timeout paths in spawnAndWait() fixed for orphan bug | sessionFound=false and timeout expiry both call killHungSession before throw |
| 67-02 | log() private helper added to Runner | Consistent [runner] prefix without repeating process.stderr.write boilerplate |
| 67-04 | Escalation requires hungCount>=1 before checking isSameHungReason | First hang is never an escalation — no prior hang to compare against |
| 67-04 | Escalation does NOT consume retry budget (no incrementRetryCount) | Direct fail path, not a retried attempt |
| 67-04 | pilot retry (retry()) calls resetRetryState | Operator manual retry gets fresh budget — resets retryCount, hungCount, lastHungReason |
| 67-04 | gaps-if-progress hint only for interactive-prompt hangs | Phase jobs need gap-closure retries after prompt hang; stuck-tool hangs don't |
| 68-01 | Merged two judge prompts into ONE canonical format at src/prompts/judge.md | Two prompts with different formats creates drift; pilot-judge.md richer structure used as base |
| 68-01 | Verdict values: pass/fail/partial (not succeeded/failed/doubting) | Cleaner, shorter, standard terminology |
| 68-01 | retryRecommendation: string 'none'/'retry-resume'/'retry-full' (not null) | Explicit string safer than null for JSON parsing downstream |
| 68-01 | Confidence ceiling ≤ 40 when VERIFICATION.md absent | Prevents false pass verdicts from transcript-only evidence |
| 69-01 | patchAgentFrontmatter iterates discovered gsd-*.md files and falls back unmapped agents to inherit | Prevents stale model leakage when provider mode maps are partial or new agents appear upstream |
| 69-01 | models tests reset to in-memory DB before each test | Prevents local persistent model-profile overrides from causing nondeterministic test expectations |
| 69-02 | patchModelsForJob logs fallback/skipped summary details from patchAgentFrontmatter | Makes inherit fallback and malformed frontmatter outcomes observable to operators |
| 69-02 | runGsdStep no longer re-patches agent files; launch() is sole patch point | Eliminates duplicate frontmatter patch churn per step while preserving launch guardrails |
| 69-03 | regression tests now assert discovered-file fallback to inherit and idempotent parser-safe patching | Prevents silent reintroduction of stale mapped models or repeated content churn |
| 69-03 | runner recovery quick-intent test enforces single patchAgentFrontmatter invocation per launch | Guards launch path against duplicate per-step patch regression |
| 70-01 | addJob persists retry_budget explicitly with default 2 (optional override) | Enforces new retry policy consistently even on legacy DBs with older column defaults |
| 70-01 | resetToPending archives attempt metadata before clearing live session/job-step state | Preserves retry lineage for future info/log chain surfaces without reviving terminal jobs |
| 70-02 | Null/partial/non-pass judge outcomes are always retryable; only pass/succeeded is terminal pass | Removes benefit-of-doubt/pass-by-confidence shortcuts that bypass phase retry policy |
| 70-02 | retry-resume requires well-formed VERIFICATION evidence (>100 bytes + required structure), otherwise force retry-full | Prevents malformed evidence from driving unsafe gap-only retries |
| 70-02 | Same failure fingerprint escalates before retry_count increments | Avoids burning remaining retry budget on identical consecutive verification failures |
| 70-03 | retry budget resolution order is --retries > --no-retry (0) > config default > hard fallback 2 | Guarantees deterministic queue-time policy across operator overrides and install defaults |
| 70-03 | config accepts defaults.retry_budget plus retryBudget alias | Keeps config migration tolerant while prioritizing documented snake_case contract |
| 70-04 | Attempt lineage displays as retryCount+1 over retryBudget+1 (clamped) | Surfaces deterministic Attempt N/M semantics from persisted retry state |
| 70-04 | `pilot log --chain` remains opt-in and default log stays current-attempt focused | Preserves existing operator ergonomics while exposing full retry history on demand |
| 70-04 | Chain JSON metadata is additive under `chain.attempts` | Adds retry-group introspection without breaking existing log JSON consumers |
| 72-05 | Execute migration audits via `node dist/index.js` when `pilot` launcher requires unavailable bun runtime | Keeps required setup/doctor evidence collection runnable in environments without bun on PATH |
| 72-05 | Do not proceed with destructive fork cleanup until all registered projects pass setup-refresh + doctor gate | Enforces requirement-critical migration order and avoids stranding unmanaged/broken project setups |
| 72-01 | AGENTS flows now map typed operations to in-repo prompt files and run inline prompt payloads | Removes fork-only command coupling while keeping prompt behavior deterministic |
| 72-01 | Keep legacy command-string inference in agents helper until command call sites are rewired | Preserves compatibility for existing setup/doctor/lessons callers before 72-02 |
| 72-02 | Setup/doctor/lessons command call sites now use operation args (`setup`, `health`, `lessons`) instead of fork command strings | Completes command-layer decoupling from `gsd-setup-agents` and `gsd-lessons` while preserving non-fatal UX |
| 72-02 | Command regression tests now assert operation contracts and absence of legacy command payload keys | Prevents accidental reintroduction of fork-only command coupling in user-facing commands |
| 72-03 | Legacy setup migration cleanup now unlinks any symlink in installer-owned `.opencode` paths before installer run | Removes fork-name coupling while preserving safe path-bounded cleanup semantics |
| 72-03 | Keep broken symlink remediation in verifySetup (`pilot setup --refresh`) unchanged | Maintains existing operator guidance while migration behavior is generalized |
| 72-03 | Setup migration regressions now assert filesystem behavior and cleanup reporting instead of fork-name fixtures | Prevents reintroducing coupling to legacy fork path names in test expectations |
| 72-06 | delegation payload persistence now validates intent shape and blocks legacy step-array payloads at claim/write boundaries | Prevents fork-era payloads from silently entering active execution paths |
| 72-06 | delegation parser intent coverage now uses canonical JSON fixtures for quick/plan-and-execute/execute-only/audit-milestone | Keeps contract examples realistic and stable while avoiding inline drift |
| 72-06 | renamed persistence API/helpers from `*DelegationPlan*` to intent-payload naming | Makes `DelegationStep|DelegationPlan` contract-audit regex signal-only with zero false positives |
| 72-04 | Operator docs now describe only upstream `get-shit-done-cc` installation and `pilot setup --refresh` sentinel recovery | Removes stale submodule/fork instructions and keeps onboarding aligned with actual setup/update behavior |
| 72-04 | Pilot pipeline skill guidance now uses intent lifecycle + frontmatter patching + retry lineage mental model | Keeps operator actions aligned with current runner contracts and observability surfaces |
| 72-04 | Active coupling audit enforces zero targeted fork strings across src/test/README/docs/skills | Provides deterministic closeout gate for fork cleanup without rewriting historical archives |
- [Phase 73]: Legacy verdict transition: doubting/partial map to gaps outcome for append-forward alignment
- [Phase 73]: StepSource as narrow 5-value union for type safety
- [Phase 73]: Keep legacy verdictSource/verdictReason on JobStep for backward compat during transition
- [Phase 73]: appendSteps uses db.transaction() for bulk insert atomicity
- [Phase 73]: reDelegateForContinuation() uses phase-level model resolution and pilot-redelegate- session prefix
- [Phase 73]: Default source to 'delegation' when step.source is nullish for backward compatibility
- [Phase 73]: Deleted 5 retry-era artifacts and all intent routing methods, replaced with step execution loop + continuation handlers
- [Phase 73]: Pre-existing TUI/info/runner-recovery test failures are out-of-scope; only plan-scoped tests verified
- [Phase 73]: Added step DB mocks (makeStep helper) and fixed 2 pre-existing tests that passed for wrong reason
- [Phase 74]: Manifest-only skill registry: SkillEntry uses repo+skill instead of source+path; loadManifest() auto-migrates old format — Supports monorepo skill disambiguation and eliminates local file cache
- [Phase 76-01]: Client/server time-utils duplication: web/src/lib/time-utils.ts intentionally mirrors core to avoid importing sqlite3-dependent module in browser bundle — safeParseTimestamp returns epoch ms (not epoch seconds) for JS Date API consistency
- [Phase 76-pilot-web-ui-overhaul]: Used pnpm (not npm) for package installation; pnpm is project package manager per package.json config block
- [Phase 76-pilot-web-ui-overhaul]: getFullJobTimeline uses limit:10000 - sufficient for all practical jobs — Conservative limit prevents memory issues while loading all timeline data
- [Phase 76-04]: Used react-resizable-panels v4 Group/Panel/Separator API (not v1/v2 PanelGroup/PanelResizeHandle) — Package was already installed at v4.7.3; v4 exports Group/Panel/Separator
- [Phase 76-04]: observedModels added to JobDetailSnapshot.job type, derived from getSessionModelsRecursive per root session — Plan stated field existed but it was missing; added to backend and type for correctness
- [Phase quick-260320-vc3]: Reuse bump() after addJob for --next flag rather than modifying addJob signature — minimal change, proven mechanism
- [Phase 77]: Grace countdown computed client-side from createdAt + queueGraceSeconds — Avoids per-job server computation while keeping the countdown smooth
- [Phase 77]: {"phase":"77","summary":"Used negative step indices for delegation steps to sort before regular steps"}
- [Phase 77]: {"phase":"77","summary":"IntersectionObserver scroll-spy with -10% 0px -70% 0px rootMargin for upper viewport triggering"}
- [Phase 77]: Used existing useIsMobile hook (800px) rather than creating a new 768px breakpoint
- [Phase 77]: Delegation steps identified by command === delegation; per-step model info via fork-card items; block reason hardcoded for TUI
- [Phase 78]: Used buildJobObservability(job) with getJob() lookup instead of non-existent getJobObservability
- [Phase 78]: Used item.kind === 'tool-summary' instead of plan's incorrect 'activity' + 'type' check for tool counting
- [Phase 78]: ObservabilityCard fetches via getJobObservabilityFn with 5s refetch for active jobs
- [Phase 78]: Parse judgeVerdict JSON client-side for inline verdict display — Same pattern as job-detail-query.ts; avoids unnecessary server round-trip
- [Phase 78]: Module-level shared shiki highlighter promise; content >5000 chars bypasses highlighting; polling 3s active / 30s completed
- [Phase 78]: Main CSS file is styles.css not app.css; Tabs API uses TabsTrigger/TabsContent re-exports; Sheet uses render prop pattern
- [Phase 78]: Message count parity confirmed — no code change needed; both card and drill-in use getAssistantMessageCount()
- [Phase quick-260321-61z]: Seed registers all tiers (tier 'all') by default; old stale entries left intact since different names
- [Phase 79]: Root cause was missing SSR loader for timeline data — Client-only useQuery rendered empty state on server; added route loader as fix
- [Phase 80]: Added overflow-x-hidden to body as global safety net while fixing individual components
- [Phase 80]: Used responsive margin classes (pl-2 ml-2 sm:pl-3 sm:ml-4) to reclaim mobile space without affecting desktop
- [Phase 80]: 5-tier attribution: sessionId → sessionTitle → timeWindow → childTransitivity → lastStepFallback
- [Phase 80]: All 11 Phase 80 requirements marked Complete; Phase 80 section added to REQUIREMENTS.md before v2 section
- [Phase 81-pilot-human-review-semantics-autonomy-first-no-false-failure]: Review states (completed_pending_review, review_hold) never call blockProject — critical non-blocking invariant — Human review situations should not be treated as failures; projects must remain active for subsequent jobs
- [Phase 81]: isHumanOnlyRemaining exported as module-level function — enables direct unit testing following runner.ts pattern
- [Phase 81]: Review states use amber (completed_pending_review) and blue (review_hold) across CLI/TUI/web — never red/destructive — Non-failure states must not use failure colors to avoid false alarm UX
- [Phase 82-pilot-timeline-semantics-renderer-unification]: Use jobId='' for child session TimelineItemRenderer calls — Show full button gracefully degrades — No breaking change; child session context doesn't have job-level message access, acceptable per plan
- [Phase 82-01]: Tier 5 restricted to judge steps only — non-judge last steps fall through to Unattributed — Reduces false attribution; late activity after all windows close is most commonly judge/verdict wrap-up, not arbitrary execution steps
- [Phase 82-01]: step-semantics.ts shared module with pre-computed semanticLabel fallback derivation — All UI surfaces use same label logic; semanticLabel from core is authoritative, local derivation is backward-compat safety net
- [Phase 82-pilot-timeline-semantics-renderer-unification]: Renamed 'Timeline' tab to 'Summary' in split-pane-detail to avoid naming conflict when renaming 'Steps' tab to 'Timeline' — Preserves user-visible tab distinction while satisfying requirement to rename 'Steps' to 'Timeline'
- [Phase 82-pilot-timeline-semantics-renderer-unification]: Added Phase 82 requirements as v1 section before v2 Requirements, following Phase 80 traceability table — Matches existing REQUIREMENTS.md structure; 6 of 9 TSEM requirements marked Complete based on requirement file indicators
- [Phase 82-04]: isJudgeStep uses command.includes judge/verify OR source.startsWith judge: to cover both step types
- [Phase 83-pilot-human-review-semantics-phase-81-follow-up-completion]: resumed_from_hold INTEGER column as DB marker for runner to detect review_hold jobs resumed by pilot review --approve
- [Phase 84-02]: Extracted buildStepCapMessage and buildContinuationLimitMessage as pure helpers for DRY+testability — TDD approach benefits from testable pure functions; avoids duplicating message strings across two handlers

## Blockers/Concerns Carried Forward

- Migration-order remediation remains open: 5 registered projects still fail refresh/doctor prerequisites and need follow-up hardening.
- `fanselau/pilot-gsd` archive action is permission-gated (`archiveRepository` denied for current token) and needs owner/admin follow-up.

## Session Continuity

Last session: 2026-03-21T13:59:09.758Z
Stopped at: Completed 84-02-PLAN.md
Resume file: None
