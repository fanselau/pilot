# Full Milestone Lifecycle — Audit, Gap Closure, Completion

## Problem
Pilot starts milestones and executes phases but never closes the loop: no audit, no gap planning, no archival/tagging. Upstream GSD has `audit-milestone`, `plan-milestone-gaps`, and `complete-milestone` commands.

## Goal
The runner's `audit-milestone` and `complete-milestone` intent handlers close the full loop.

## Requirements

### Must Have

- [ ] `runAuditMilestone()` workflow:
  1. Spawn `gsd-audit-milestone`
  2. Read `.planning/v{N}-MILESTONE-AUDIT.md` from project dir
  3. Parse status: `passed` or `gaps_found`
  4. If `passed` → call `runCompleteMilestone()` internally
  5. If `gaps_found` → spawn `gsd-plan-milestone-gaps --auto` → re-delegate (GSD inserts decimal phases like 4.1, 4.2) → execute new intent
  6. After gap phases complete → re-audit (max 2 gap-closure rounds)
  7. If still gaps after 2 rounds → notify Luca, let him decide

- [ ] `runCompleteMilestone()` workflow:
  1. Spawn `gsd-complete-milestone <version>`
  2. Notify Luca with milestone summary (phases completed, git tag created)

- [ ] Delegation AI includes `audit-milestone` intent when all phases in a milestone are complete
- [ ] Milestone audit/gap/complete steps are recorded via `recordStep()` for observability

### Nice to Have
- [ ] `pilot add --skip-audit` flag to skip audit/completion for quick iterations
- [ ] Surface audit results in `pilot status`

## Technical Notes
- **`new-milestone` has ZERO `--auto` support** — fully interactive. Pilot must work around this. Options: (a) use `new-project --auto @<prd>` for the first milestone, (b) manually orchestrate new-milestone's steps (write REQUIREMENTS.md + ROADMAP.md from the PRD via a Pilot-native prompt, then proceed to phase plan+execute), or (c) accept that milestone creation is a manual step and only automate the post-creation lifecycle (audit, gap, complete).
- Audit file: `.planning/v{N}-MILESTONE-AUDIT.md` with `passed`/`gaps_found` status
- `plan-milestone-gaps` reads audit and inserts fix phases with decimal numbering
- `complete-milestone` archives to `.planning/milestones/`, creates git tag
- `mode: "yolo"` should bypass any confirmation gates in complete-milestone
- Max 2 gap rounds to prevent infinite loops

## Do NOT
- Do NOT skip audit — catches orphaned requirements
- Do NOT run more than 2 gap rounds — escalate to human
- Do NOT auto-archive with deferred gaps — Luca must accept tech debt explicitly

#### Critical Fixes (from critique)

- [ ] `new-milestone` workaround: choose option (c) — milestone creation is manual/semi-manual. If delegation returns `new-milestone` intent, DB-based hung detection (gsd-04b) catches the pending `question` tool call immediately → kill → `resetToPending` with "Milestone creation needs manual intervention" → notify Luca. No timeout needed.
- [ ] Milestone version source: read from `.planning/STATE.md` `current_milestone` field. Document this as the canonical source. Validate format.
- [ ] Gap phases with decimal numbering (4.1, 4.2): verify that `gsd-plan-phase 4.1` works in upstream GSD. Document decimal phase support as a prerequisite.
- [ ] Gap round tracking: add `milestone_gap_round` field to Job. Increment in `runAuditMilestone()` on each gap cycle. Max 2 rounds.
- [ ] Audit session failure: if `gsd-audit-milestone` crashes, retry once then escalate. Check audit file mtime > spawn time to detect stale files.
- [ ] Cleanup order: migrate ALL projects first (pilot setup --refresh), verify, THEN remove fork. Not the other way around.
