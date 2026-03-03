---
phase: quick-026
plan: 01
subsystem: observability
tags: [opencode-db, sqlite, actual-models, model-visibility, info, log, tui]
requires: []
provides:
  - getSessionModels() function in opencode-db.ts
  - actual_models column in pilot DB jobs table
  - Job.actualModels field in types.ts
  - Actual model display in info, log, and TUI detail
affects: []
tech-stack:
  added: []
  patterns:
    - Post-completion DB query from opencode for ground-truth model strings
    - Mismatch detection: compare actual vs resolved gsd-executor model
key-files:
  created: []
  modified:
    - src/core/opencode-db.ts
    - src/core/db.ts
    - src/core/types.ts
    - src/core/runner.ts
    - src/commands/info.ts
    - src/commands/log.ts
    - src/tui/views/detail.tsx
decisions:
  - actual_models stored as JSON array string in TEXT column via additive migration
  - collectActualModels() called before both markCompleted and markFailed
  - Mismatch = actual models array doesn't contain the resolved gsd-executor string
  - Yellow color for mismatch, dim for match — consistent across all three surfaces
  - log command shows actual model in dim (no mismatch highlighting — cleaner for a stream view)
metrics:
  duration: 6m
  completed: 2026-03-03
---

# Quick Task 026: Show Actual Model Used from opencode DB — Summary

**One-liner:** Query opencode SQLite DB for actual provider/model used per session, persist to pilot DB, and surface with mismatch highlighting across info/log/TUI.

## What Was Built

### Task 1: getSessionModels() + DB column + runner wiring

**`src/core/opencode-db.ts`** — Added `getSessionModels(sessionTitle: string): string[]`:
- Queries `message` joined with `session` for distinct `providerID/modelID` values on assistant messages
- Uses `json_extract` on the `data` column (consistent with existing query patterns in the file)
- Filters null entries (messages without modelID set)
- Returns empty array on DB unavailable or error (graceful degradation)

**`src/core/db.ts`** — Added `actual_models TEXT` column:
- Additive migration via existing `migrateSchema()` pattern — no breakage to existing DBs
- `JobRow.actual_models: string | null` field
- `rowToJob()` parses JSON string → `string[]`, returns null on parse failure
- `updateActualModels(id, models)` stores JSON array string

**`src/core/types.ts`** — Added `Job.actualModels: string[] | null`

**`src/core/runner.ts`** — Wired collection before completion:
- `collectActualModels(jobId)` private helper: fetches job's sessionTitles, calls `getSessionModels()` for each, deduplicates via Set, calls `updateActualModels()`
- Called before `markCompleted()` (success path) and before `markFailed()` (error path)
- Best-effort: wrapped in try/catch so model collection failure never fails the job

### Task 2: Display in info, log, TUI detail

**`src/commands/info.ts`**:
- `Actual:` line after `Model:` line — yellow with "(differs from intended)" when mismatch, dim when match
- Only shows dash `—` for completed/failed jobs without data (not for running/pending)
- `actualModels` field added to JSON output

**`src/commands/log.ts`**:
- `Actual model: ...` line in header (dim, no mismatch highlighting — cleaner for stream context)
- `actualModels` field added to JSON output's job object

**`src/tui/views/detail.tsx`**:
- New "Line 5b" block: `<Show when={actualModels available}>` renders `Actual: ...` text
- Yellow (#FACC15) for mismatch, `theme.muted` for match — consistent with existing color scheme
- `buildHeaderLines()` updated to include actual model line (for test coverage)

## Mismatch Detection Logic

```typescript
const resolvedExecutor = models['gsd-executor'] ?? '';
const hasMismatch = !job.actualModels.some(m => m === resolvedExecutor);
```

Resolves the intended model string (e.g. `anthropic/claude-sonnet-4-6`) and checks exact inclusion.
If actual models don't contain that string → mismatch → yellow warning.

## Verification

- `npx tsc --noEmit` — ✅ passes (no type errors)
- `npx vitest run` — ✅ 301 tests pass (all existing tests green; new column migration additive)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| d02ac9a | feat(quick-026): add getSessionModels() + actual_models DB column + runner wiring |
| 6a408e2 | feat(quick-026): display actual models in info, log, and TUI detail |
