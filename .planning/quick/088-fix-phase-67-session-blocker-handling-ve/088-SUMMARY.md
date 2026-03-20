---
phase: quick-088
plan: 01
subsystem: notifications
tags: [hung-session, notification, callback, session-title]
completed: 2026-03-16
duration: ~3m
dependency-graph:
  requires: [phase-67]
  provides: [session-title-in-hung-notifications]
  affects: []
tech-stack:
  added: []
  patterns: [notification-enrichment]
key-files:
  created: []
  modified:
    - src/core/runner.ts
    - src/core/callback.ts
    - test/core/callback.test.ts
decisions: []
---

# Quick Task 088: Fix Phase 67 Session Blocker Handling — Notification Session Title

**One-liner:** Budget-exhaustion and escalation error messages now include sessionTitle; hung failure notifications emit `session_title` from job.sessionTitles.

## What Changed

### runner.ts — Error messages include session title
- `budgetMsg` string now appends `, session: ${err.sessionTitle}` so the error stored in `job.error` carries the session title for downstream consumers
- `escalateMsg` string now appends `, session: ${err.sessionTitle}` for same-reason escalation failures

### callback.ts — Notification enrichment emits session_title
- In `buildDeliveryPrompt`, the hung failure enrichment block now parses `job.sessionTitles` (JSON array) and emits `session_title: <lastTitle>` after `hung_count`
- Gracefully handles null/invalid sessionTitles with try/catch

### callback.test.ts — Two new tests + makeJob defaults
- Test: `hung failure prompt includes session title from sessionTitles` — verifies session_title appears in hung notification prompt
- Test: `hung failure prompt handles null sessionTitles gracefully` — verifies no session_title emitted when sessionTitles is null
- Added missing required fields to `makeJob` helper: `retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`, `hungCount`, `lastHungReason`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing required Job fields to makeJob test helper**
- **Found during:** Task 2
- **Issue:** The Job type requires `retryBudget`, `retryCount`, `retryHint`, `lastFailureFingerprint`, `hungCount`, and `lastHungReason` as non-optional fields, but makeJob didn't have defaults for them
- **Fix:** Added default values to the makeJob base object
- **Files modified:** test/core/callback.test.ts
- **Commit:** df5880b

## Verification

- `npx tsc --noEmit` — passes ✓
- `npx vitest run test/core/callback.test.ts` — 17/17 tests pass ✓
- `npx vitest run` — 1166/1166 tests pass across 55 files ✓
- `grep -n 'session_title' src/core/callback.ts` — shows line 109 in hung enrichment ✓
- `grep -n 'sessionTitle' src/core/runner.ts | grep -E 'budgetMsg|escalateMsg'` — shows both messages ✓

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 99b6dfe | feat(quick-088): include sessionTitle in hung budget-exhaustion error and notification |
| 2 | df5880b | test(quick-088): add test coverage for hung notification session title |
