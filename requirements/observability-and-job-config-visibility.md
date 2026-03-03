# Observability + Job Config Visibility

## Problem
Several observability gaps make it hard to understand what jobs are doing and why:

1. **Patch files always show "unknown"** — code reads `partData.operations[].path` but opencode DB stores `partData.files[]` (array of strings). Every file write/edit shows as `patch unknown` in logs and TUI.

2. **No job config visibility** — can't see model selection, budget, model profile, provider mode for a job. No way to understand token usage or why a job chose a particular model.

3. **No CLI command for job config/cost** — no `pilot info <id>` or similar to inspect a job's full configuration, token usage, and cost breakdown.

## Goal
Make Pilot fully transparent about what jobs are doing, how they're configured, and what they cost.

## Requirements

### Must Have

- [ ] **Fix patch file extraction** (BUG)
  - In `opencode-db.ts`, `type === 'patch'` handler reads `partData.operations[].path`
  - Actual DB schema: `partData.files` is a flat `string[]`
  - Fix: read `partData.files` directly, fall back to `partData.operations[].path` for compat
  - Result: `patch /path/to/file.ts` instead of `patch unknown`

- [ ] **Job config in TUI detail view**
  - When viewing a job in TUI, show:
    - Model profile (balanced/quality/speed)
    - Provider mode (claude-only, etc.)
    - Max attempts / current attempt
    - Budget/token limits (if configured)
  - Show in a compact config block in the detail header

- [ ] **Job config in `pilot log`**
  - `pilot log <id>` should show job config (model, profile, budget) in header
  - Include per-step session token usage if available from opencode DB

- [ ] **`pilot info <id>` command**
  - New CLI command showing full job metadata:
    - All job DB fields (id, status, project, scope, description, created, started, completed, error)
    - Delegation plan (parsed, not raw JSON)
    - Step details with session IDs, titles, verdicts
    - Model profile + provider mode
    - Token usage per session (from opencode DB if available)
    - Cost estimate if token counts available
  - JSON output mode (`--json`)

- [ ] **Token/cost tracking in TUI tree**
  - In the job tree (active/queue/recent), show token usage inline if available
  - Format: compact (e.g. `12k tok` or `$0.04`)

### Nice to Have
- [ ] Aggregate token/cost across all jobs in a time range (`pilot cost --today`)
- [ ] Model selection reasoning in delegation log

## Technical Notes
- Token data lives in opencode's DB (`session` or related tables) — check what's available
- Model profile/provider mode already stored in job DB (via delegation)
- The patch file bug is a one-line fix in `opencode-db.ts` line ~460

## Do NOT
- Do NOT change how models are selected — just make it visible
- Do NOT add external cost APIs — estimate from local token counts
- Do NOT break existing `pilot log` or `pilot status` output formats