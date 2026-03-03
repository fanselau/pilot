---
phase: quick-020
plan: 01
subsystem: cli-commands
tags: [observability, job-config, tokens, cost, pilot-log, pilot-info]
requires: []
provides: [enhanced-log-header, pilot-info-command]
affects: [cli-ux, operator-visibility]
tech-stack:
  added: []
  patterns: [token-aggregation-from-opencode-db, cost-estimation]
key-files:
  created:
    - src/commands/info.ts
  modified:
    - src/commands/log.ts
    - src/index.ts
decisions:
  - "Token formatting uses M/k/raw thresholds (>=1M, >=1k)"
  - "Cost estimate uses Sonnet pricing: $3/M input, $15/M output — local only, no external API"
  - "info command uses getSessionTokens per session title (same pattern as TUI)"
  - "Log header config line uses dim() — metadata subordinate to primary identity line"
  - "JSON log output includes modelProfile, providerMode, attempts, maxAttempts, tokenUsage map"
metrics:
  duration: 2m
  completed: 2026-03-03
---

# Phase quick-020 Plan 01: Observability + Job Config Visibility Summary

**One-liner:** Enhanced `pilot log` header shows model/provider/attempts + per-step token counts; new `pilot info <id>` dumps full job metadata, delegation plan, steps, and cost estimate.

## What Was Built

### Task 1: Enhanced `pilot log` header

- Added second header line: `Model: {profile}/{mode}   Attempts: {attempts}/{maxAttempts}` (dim)
- Added per-step token usage inline with step summary: `· 45.2k tok` appended after duration
- Added `formatTokenCount()` helper: >=1M → `1.2M`, >=1k → `45.2k`, else raw
- Enhanced JSON output: `modelProfile`, `providerMode`, `attempts`, `maxAttempts` in job object; `tokenUsage` map by stepIndex
- Imported `getSessionTokens` from `opencode-db.ts`

### Task 2: New `pilot info <id>` command

New file `src/commands/info.ts` with `infoCommand(id, opts)`:

**Human output sections:**
- Job core fields: project, scope, description, status (colored), error (red if present)
- Config block: model/provider, attempts, created/started/completed timestamps, depends-on
- Delegation Plan: reasoning + numbered step list
- Steps: icon + command + duration + verdict + session title + per-step token breakdown
- Token Usage: total input/output/combined + estimated cost

**JSON output:**
```json
{
  "timestamp": "...",
  "job": { ...all Job fields... },
  "delegationPlan": { "steps": [...], "reasoning": "..." } | null,
  "steps": [...JobStep objects...],
  "sessions": [{ "title": "...", "sessionId": "...", "tokens": {...} }],
  "tokenUsage": { "totalInput": N, "totalOutput": N, "total": N, "estimatedCostUsd": N }
}
```

**Error handling:** exits 1 with `Job not found: <id>` on stderr.

**Registered in `src/index.ts`** after the `log` command, in the core commands section.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — passes (0 errors)
- `npx vitest run` — 320/320 tests pass
- `pilot info --help` — shows usage
- `pilot info nonexistent` — exits 1 with error message

## Commits

| Hash | Description |
|------|-------------|
| 662dc28 | feat(quick-020): enhance pilot log header with job config + per-step tokens |
| 82bcdda | feat(quick-020): add pilot info <id> command |
