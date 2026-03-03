---
phase: quick-026
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - src/core/db.ts
  - src/core/types.ts
  - src/commands/info.ts
  - src/commands/log.ts
  - src/core/runner.ts
  - src/tui/views/detail.tsx
autonomous: true

must_haves:
  truths:
    - "After job completion, actual models used are stored in pilot DB"
    - "pilot info shows actual models alongside intended model profile"
    - "pilot log header shows actual model when available"
    - "TUI detail view shows actual model and highlights mismatches with intended"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "getSessionModels() function"
      contains: "getSessionModels"
    - path: "src/core/db.ts"
      provides: "actual_models column + updateActualModels()"
      contains: "actual_models"
    - path: "src/core/types.ts"
      provides: "actualModels field on Job interface"
      contains: "actualModels"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/opencode-db.ts"
      via: "getSessionModels() call after session completion"
      pattern: "getSessionModels"
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "updateActualModels() call before markCompleted/markFailed"
      pattern: "updateActualModels"
---

<objective>
Query the actual model used by opencode from its SQLite DB after job completion, store it on the job in pilot's DB, and display it alongside the intended model in info, log, and TUI detail view. Highlight mismatches between intended and actual.

Purpose: The intended model (from profile resolution) doesn't always match what opencode actually used. Operators need visibility into the real model to catch drift and verify cost attribution.

Output: New `getSessionModels()` in opencode-db.ts, `actual_models` column in pilot DB, display updates in info/log/TUI.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/core/opencode-db.ts
@src/core/db.ts
@src/core/types.ts
@src/core/runner.ts
@src/commands/info.ts
@src/commands/log.ts
@src/tui/views/detail.tsx
@src/core/models.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getSessionModels() + DB column + runner wiring</name>
  <files>
    src/core/opencode-db.ts
    src/core/db.ts
    src/core/types.ts
    src/core/runner.ts
  </files>
  <action>
**1. Add `getSessionModels()` to `opencode-db.ts`:**

```typescript
function getSessionModels(sessionTitle: string): string[] {
  const db = openDb();
  if (db === null) return [];
  try {
    const rows = db.prepare(`
      SELECT DISTINCT json_extract(m.data, '$.providerID') || '/' || json_extract(m.data, '$.modelID') as model
      FROM message m JOIN session s ON m.session_id = s.id
      WHERE s.title = ? AND json_extract(m.data, '$.role') = 'assistant'
        AND json_extract(m.data, '$.modelID') IS NOT NULL
    `).all(sessionTitle) as Array<{ model: string }>;
    return rows.map(r => r.model).filter(m => m && !m.startsWith('null'));
  } catch {
    return [];
  }
}
```

Export it from the module's exports block.

**2. Add `actual_models` column to pilot DB (`db.ts`):**

- Add migration in `migrateSchema()`: `"ALTER TABLE jobs ADD COLUMN actual_models TEXT"`
- Add `actual_models: string | null` to `JobRow` interface
- Map in `rowToJob()`: `actualModels: row.actual_models ?? null`
- Add `updateActualModels(id: string, models: string[]): void` function:
  ```typescript
  function updateActualModels(id: string, models: string[]): void {
    const db = getDb();
    db.prepare('UPDATE jobs SET actual_models = ? WHERE id = ?').run(JSON.stringify(models), id);
  }
  ```
- Export `updateActualModels`

**3. Add `actualModels` to Job type (`types.ts`):**

Add to `Job` interface:
```typescript
actualModels: string[] | null;  // actual provider/model strings from opencode DB
```

**4. Wire into runner.ts:**

In the `launch()` method, right BEFORE the `markCompleted(job.id)` call (around line 447), and also before `markFailed` in the catch block (around line 454), collect actual models from all session titles and store them:

```typescript
// Collect actual models from all sessions for this job
const allActualModels = new Set<string>();
let jobSessionTitles: string[] = [];
try {
  const freshJob = getJob(job.id);
  if (freshJob?.sessionTitles) {
    jobSessionTitles = JSON.parse(freshJob.sessionTitles) as string[];
  }
} catch { /* ignore */ }

for (const sessionTitle of jobSessionTitles) {
  const models = getSessionModels(sessionTitle);
  for (const m of models) allActualModels.add(m);
}
if (allActualModels.size > 0) {
  updateActualModels(job.id, [...allActualModels]);
}
```

Add the imports for `getSessionModels` from `opencode-db.js` and `updateActualModels` from `db.js`.

Place this actual-model collection in a helper method `private collectActualModels(jobId: string): void` to keep launch() clean, and call it before both `markCompleted` and `markFailed`.

**Important:** Also handle the `rowToJob` mapping — the `actualModels` field should parse the JSON string:
```typescript
actualModels: row.actual_models ? JSON.parse(row.actual_models) as string[] : null,
```
Wrap in try/catch returning null on parse failure.
  </action>
  <verify>
    `npx tsc --noEmit` passes. `npx vitest run` passes (existing tests still green — the new column migration is additive with no breakage).
  </verify>
  <done>
    - `getSessionModels('some-title')` queries opencode DB for distinct provider/model pairs on assistant messages
    - `actual_models TEXT` column exists in pilot DB jobs table via migration
    - `Job.actualModels` is typed as `string[] | null`
    - Runner stores actual models on jobs before marking completed or failed
  </done>
</task>

<task type="auto">
  <name>Task 2: Display actual models in info, log, and TUI detail</name>
  <files>
    src/commands/info.ts
    src/commands/log.ts
    src/tui/views/detail.tsx
  </files>
  <action>
**1. Update `pilot info` (`info.ts`):**

After the existing `Model:` line (line 147), add an `Actual:` line:

```typescript
// After: outputHuman(`  ${dim(pad('Model:'))}    ${job.modelProfile}/${job.providerMode}`);
if (job.actualModels && job.actualModels.length > 0) {
  const actualStr = job.actualModels.join(', ');
  // Check for mismatch: resolve intended executor model, compare with actual
  const resolvedExecutor = resolvedModels['gsd-executor'] ?? '';
  const hasMismatch = job.actualModels.length > 0 && !job.actualModels.some(m => m === resolvedExecutor);
  const colorFn = hasMismatch ? yellow : dim;
  outputHuman(`  ${colorFn(pad('Actual:'))}   ${colorFn(actualStr)}${hasMismatch ? yellow(' (differs from intended)') : ''}`);
} else if (job.status === 'completed' || job.status === 'failed') {
  outputHuman(`  ${dim(pad('Actual:'))}   ${dim('—')}`);
}
```

Also add `actualModels` to JSON output:
```typescript
// In the outputJson block, add:
actualModels: job.actualModels,
```

**2. Update `pilot log` header (`log.ts`):**

After the existing Model line (around line 417), add actual model display:

```typescript
// After the Model: line
if (job.actualModels && job.actualModels.length > 0) {
  const actualStr = job.actualModels.join(', ');
  outputHuman(`  ${dim(`Actual model: ${actualStr}`)}`);
}
```

Also add `actualModels: job.actualModels` to the JSON output's `job` object.

**3. Update TUI detail view (`detail.tsx`):**

In `buildHeaderLines()`, after the existing Model line (line 104), add actual model info:

```typescript
// After the Model: ... line
if (job.actualModels && job.actualModels.length > 0) {
  const actualStr = job.actualModels.join(', ');
  const resolvedExecutor = models['gsd-executor'] ?? '';
  const hasMismatch = !job.actualModels.some(m => m === resolvedExecutor);
  if (hasMismatch) {
    lines.push(`Actual: ${actualStr} (MISMATCH)`);
  } else {
    lines.push(`Actual: ${actualStr}`);
  }
}
```

In the JSX rendering section where Model line is rendered (search for the `<text>` elements rendering model info), add a corresponding actual model display line. Use yellow color for mismatch.

For the hover tooltip in completed-panel (line ~457-460 area), also include actual model if available.

**Mismatch detection logic (shared across all 3 files):**
- Resolve the intended executor model from `resolveAllAgentModels(job.modelProfile, job.providerMode)['gsd-executor']`
- If `job.actualModels` doesn't include that exact string → mismatch
- Display in yellow/warning color with "(differs from intended)" label
- If multiple models in actual (subagents used different models), show comma-separated list
  </action>
  <verify>
    `npx tsc --noEmit` passes. `npx vitest run` passes. Manual: `npx tsx src/index.ts info <completed-job-id>` shows Actual: line. TUI detail shows Actual line for completed jobs.
  </verify>
  <done>
    - `pilot info <id>` shows "Actual: provider/model" below "Model:" line, yellow on mismatch
    - `pilot log <id>` header shows actual model when available
    - TUI detail header shows actual model with mismatch highlighting
    - JSON outputs include `actualModels` field
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npx vitest run` — all existing tests pass (migration is additive)
3. `npx tsx src/index.ts info <completed-job-id>` — shows Actual model line
4. `npx tsx src/index.ts log <completed-job-id>` — shows actual model in header
5. `npx tsx src/index.ts info <completed-job-id> --json` — includes actualModels array
</verification>

<success_criteria>
- getSessionModels() queries opencode DB for actual model IDs used in a session
- actual_models column persisted on jobs table via migration
- Runner stores actual models before marking job completed or failed
- All three display surfaces (info, log, TUI detail) show actual model
- Mismatches between intended and actual highlighted in yellow
- No regressions in existing tests
</success_criteria>

<output>
After completion, create `.planning/quick/026-show-actual-model-used-from-opencode-db-/026-SUMMARY.md`
</output>
