---
phase: quick-020
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/commands/log.ts
  - src/commands/info.ts
  - src/core/opencode-db.ts
  - src/index.ts
autonomous: true
must_haves:
  truths:
    - "`pilot log <id>` header shows model profile, provider mode, and attempt count"
    - "`pilot log <id>` shows per-step token usage when available"
    - "`pilot info <id>` dumps full job metadata, delegation plan, steps, and token usage"
    - "`pilot info <id> --json` outputs structured JSON with timestamp"
  artifacts:
    - path: "src/commands/info.ts"
      provides: "pilot info <id> command implementation"
    - path: "src/commands/log.ts"
      provides: "Enhanced log header with job config + per-step tokens"
    - path: "src/index.ts"
      provides: "Wired info command in CLI entry point"
  key_links:
    - from: "src/commands/info.ts"
      to: "src/core/db.ts"
      via: "getJob, getJobSteps"
    - from: "src/commands/info.ts"
      to: "src/core/opencode-db.ts"
      via: "getSessionTokens, findSessionByTitle"
    - from: "src/index.ts"
      to: "src/commands/info.ts"
      via: "dynamic import in command registration"
---

<objective>
Add job config visibility to `pilot log` and create `pilot info <id>` command per requirements/observability-and-job-config-visibility.md.

Purpose: Make Pilot fully transparent about job configuration (model, provider, attempts) and token costs. Currently `pilot log` only shows project/scope/description — operators need config context. `pilot info` provides a full metadata dump for debugging.

Output: Enhanced log header + new info command, both with --json support.

Note: R1 (patch file fix) is already implemented in opencode-db.ts lines 459-486.
R2 (TUI detail view config) is already implemented in detail.tsx lines 362-367.
R5 (token/cost in TUI tree) is already implemented in running-panel.tsx and completed-panel.tsx.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@requirements/observability-and-job-config-visibility.md
@src/commands/log.ts
@src/core/db.ts
@src/core/opencode-db.ts
@src/core/types.ts
@src/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance `pilot log` header with job config + per-step tokens</name>
  <files>src/commands/log.ts</files>
  <action>
  In `logCommand()` human output section (around line 364-371), enhance the header to show job config:

  1. After the existing header line (`bold(job.project) · scope · desc · id`), add a second line:
     ```
     Model: {job.modelProfile}/{job.providerMode}   Attempts: {job.attempts}/{job.maxAttempts}
     ```
     Use `dim()` for this line (it's metadata, not primary info).

  2. After the step summary section (lines 374-381), add per-step token usage:
     - For each step that has a `sessionTitle`, call `findSessionByTitle(title)` then `getSessionTokens(sessionId)` from `opencode-db.ts`
     - Display inline with each step: append token count after duration, e.g. `(2m 15s · 45.2k tok)`
     - Import `getSessionTokens` and `findSessionByTitle` from `../core/opencode-db.js` (findSessionByTitle already imported, add getSessionTokens)
     - Format tokens: >= 1M → `{n/1M}M`, >= 1k → `{n/1k}k`, else raw number

  3. In JSON output (around line 344-360), add to the `job` object:
     - `modelProfile`, `providerMode`, `attempts`, `maxAttempts`
     - Add a `tokenUsage` object with per-step breakdown

  Do NOT change the existing output format for sections/parts — only enhance the header area.
  </action>
  <verify>
  `npx tsc --noEmit` passes. Manual test: `pilot log <any-job-id>` shows model/provider in header. `pilot log <id> --json | jq .job.modelProfile` returns a string.
  </verify>
  <done>
  `pilot log` header shows model profile, provider mode, and attempts. Per-step token usage shown inline with step summary. JSON output includes config and token data.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create `pilot info <id>` command</name>
  <files>src/commands/info.ts, src/index.ts</files>
  <action>
  Create `src/commands/info.ts` with an `infoCommand(id: string, opts: { json?: boolean })` function:

  1. Look up job via `getJob(id)` from `../core/db.js`. Exit 1 if not found.

  2. Get steps via `getJobSteps(id)` from `../core/db.js`.

  3. Parse delegation plan from `job.delegationPlan` (JSON string → DelegationPlan).

  4. For each session title in `job.sessionTitles` (JSON array), get token usage:
     - `findSessionByTitle(title)` → sessionId
     - `getSessionTokens(sessionId)` → { input, output }
     - Sum total input + output tokens

  5. **Human output format:**
     ```
     Job #<id>
     ────────────────────────────────────────────────────────────────────────────

     Project:     <project>
     Scope:       <scope>
     Description: <description>
     Status:      <status>              (colored by status)
     Error:       <error>               (only if present, red)

     Model:       <modelProfile>/<providerMode>
     Attempts:    <attempts>/<maxAttempts>
     Created:     <createdAt>
     Started:     <startedAt or —>
     Completed:   <completedAt or —>
     Depends On:  <dependsOn or —>

     Delegation Plan
     ────────────────────────────────────────────────────────────────────────────
       1. <command> "<args>"
       2. <command> "<args>"

     Steps
     ────────────────────────────────────────────────────────────────────────────
       ✓ 1. execute-phase "3 --auto" (2m 15s) [semantic-check: 3 new commits]
         Session: <sessionTitle>  Tokens: 45.2k in / 12.1k out
       ⟳ 2. verify-phase "3" (running)
         Session: <sessionTitle>

     Token Usage
     ────────────────────────────────────────────────────────────────────────────
     Total: 123.4k input / 45.6k output (169.0k total)
     Est. cost: $X.XX (based on claude-sonnet-4-20250514 pricing: $3/$15 per 1M)
     ```

  6. **JSON output:**
     ```json
     {
       "timestamp": "...",
       "job": { ...all Job fields... },
       "delegationPlan": { "steps": [...], "reasoning": "..." } | null,
       "steps": [...JobStep objects...],
       "sessions": [
         { "title": "...", "sessionId": "...", "tokens": { "input": N, "output": N } }
       ],
       "tokenUsage": {
         "totalInput": N,
         "totalOutput": N,
         "total": N,
         "estimatedCostUsd": N
       }
     }
     ```

  7. Cost estimate: Use Sonnet pricing as default ($3/M input, $15/M output). This is a rough estimate — just multiply tokens by rate. Do NOT add external API calls.

  8. Wire the command in `src/index.ts`:
     ```typescript
     program
       .command('info <id>')
       .description('Full job metadata, config, tokens, and cost')
       .action(async (id: string) => {
         const { infoCommand } = await import('./commands/info.js');
         await infoCommand(id, program.opts() as { json?: boolean });
       });
     ```
     Place it in the "Core commands" section, after the `log` command registration.

  Use named exports only. Import `outputJson`, `outputHuman`, `isJsonMode` from `../util/output.js`. Import colors from `../util/colors.js`. Follow existing patterns in log.ts and queue.ts.
  </action>
  <verify>
  `npx tsc --noEmit` passes. `npx tsx src/index.ts info --help` shows usage. `npx tsx src/index.ts info nonexistent 2>&1; echo $?` exits with code 1. `npx tsx src/index.ts --json info <existing-id> | jq .timestamp` returns ISO string.
  </verify>
  <done>
  `pilot info <id>` shows full job metadata with delegation plan, steps, per-session token usage, and cost estimate. Works in both human and --json modes.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npx vitest run` — existing tests still pass
3. `pilot log <id>` shows model/provider/attempts in header
4. `pilot info <id>` shows full job dump
5. `pilot --json info <id> | jq .tokenUsage.total` returns a number
6. `pilot info nonexistent` exits 1 with error message
</verification>

<success_criteria>
- `pilot log` header displays model profile, provider mode, and attempts for every job
- `pilot log` step summary includes per-step token counts when available
- `pilot info <id>` exists and dumps full job metadata
- Both commands support `--json` output with timestamp
- No regressions in existing tests
</success_criteria>

<output>
After completion, create `.planning/quick/020-requirements-observability-and-job-config/020-SUMMARY.md`
</output>
