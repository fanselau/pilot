---
phase: quick
plan: 260325-ebl
type: execute
wave: 1
depends_on: []
files_modified:
  - src/commands/add.ts
  - src/core/db.ts
  - test/commands/add.test.ts
autonomous: true
requirements: [ABF-01, ABF-02, ABF-03, ABF-04, ABF-NH-01]
must_haves:
  truths:
    - "Adding a job to a blocked project prints a yellow warning with blocked reason before the Queued success line"
    - "The job is still queued successfully — not rejected"
    - "Warning includes unblock hint with project path"
    - "JSON mode includes blocked warning in JSON output"
    - "Unregistered or active projects show no blocked warning"
  artifacts:
    - path: "src/commands/add.ts"
      provides: "Blocked project warning logic in addCommand"
      contains: "blockedReason"
    - path: "src/core/db.ts"
      provides: "getLatestFailedJob helper for nice-to-have"
      exports: ["getLatestFailedJob"]
    - path: "test/commands/add.test.ts"
      provides: "Tests for blocked project warning"
      contains: "blocked"
  key_links:
    - from: "src/commands/add.ts"
      to: "projectRecord.status"
      via: "blocked check after addJob, before output"
      pattern: "status.*===.*blocked"
---

<objective>
Add a visible warning to `pilot add` when the target project is blocked, showing the blocked reason and unblock hint. The job still queues — this is informational only.

Purpose: Prevent confusion when jobs are silently queued to blocked projects that won't run until unblocked.
Output: Modified add.ts with blocked warning, new getLatestFailedJob DB helper, tests.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/add-blocked-feedback.md
@src/commands/add.ts
@src/core/db.ts
@test/commands/add.test.ts
</context>

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/core/types.ts:
```typescript
export interface Project {
  path: string;
  owner: string | null;
  notifyOpenClawRoute: OpenClawDeliverRoute | null;
  status: ProjectStatus;    // 'active' | 'blocked'
  blockedReason: string | null;
  blockedAt: string | null;
  defaultCategories: string[] | null;
}
```

From src/commands/add.ts (line 165):
```typescript
const projectRecord = getProject(resolvedProject);
// projectRecord is already fetched — reuse it for blocked check
```

From src/core/db.ts:
```typescript
export function getProject(path: string): Project | null;
export function blockProject(path: string, reason: string): void;
// markFailed() calls blockProject() — so blocked_reason = the job failure error
```

From src/util/colors.ts:
```typescript
export const yellow: (str: string) => string;
export const dim: (str: string) => string;
```

From src/util/output.ts:
```typescript
export function outputHuman(msg: string): void;
export function outputJson(data: unknown): void;
export function isJsonMode(): boolean;
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add getLatestFailedJob DB helper + blocked warning in add command</name>
  <files>src/core/db.ts, src/commands/add.ts, test/commands/add.test.ts</files>
  <behavior>
    - Test: When getProject returns a project with status='blocked' and blockedReason set, addCommand writes a yellow warning to stderr containing the blocked reason and unblock hint, BEFORE the "Queued" success output
    - Test: When project is blocked, the job is still queued (addJob is called, outputHuman shows "Queued")
    - Test: When project is active (status='active'), no blocked warning appears
    - Test: When project is not registered (getProject returns null), no blocked warning appears
    - Test: In JSON mode with blocked project, outputJson includes a `blockedWarning` field with reason and hint
    - Test: When getLatestFailedJob returns a job, the warning includes its job ID (nice-to-have)
    - Test: When getLatestFailedJob returns null, warning still works without job ID
  </behavior>
  <action>
    **Step 1 — DB helper (src/core/db.ts):**

    Add a `getLatestFailedJob(project: string)` function near the other project query helpers (around line 1830). This returns the most recently failed job for a project, or null:

    ```typescript
    function getLatestFailedJob(project: string): Job | null {
      const db = getDb();
      const row = db.prepare(
        "SELECT * FROM jobs WHERE project = ? AND status = 'failed' ORDER BY completed_at DESC LIMIT 1"
      ).get(project) as JobRow | undefined;
      return row ? rowToJob(row) : null;
    }
    ```

    Add `getLatestFailedJob` to the exports list.

    **Step 2 — Blocked warning in add.ts:**

    Import `getLatestFailedJob` from `../core/db.js` (add to existing import on line 14).

    After the job is queued (after line 419, the `updateJobCategories` block) but BEFORE the JSON/human output section (line 421), insert a blocked project warning block:

    ```typescript
    // Warn if project is currently blocked — job is queued but won't run until unblocked
    const isBlocked = projectRecord?.status === 'blocked';
    let blockedWarningMsg: string | undefined;
    let failedJobId: string | undefined;

    if (isBlocked) {
      failedJobId = getLatestFailedJob(resolvedProject)?.id;
      const reason = projectRecord!.blockedReason ?? 'unknown';
      const lines = [
        `${yellow('⚠')}  Project is currently ${yellow('blocked')}`,
        `   Reason: ${reason}`,
      ];
      if (failedJobId) {
        lines.push(`   Failed job: ${dim(failedJobId)}`);
      }
      lines.push(`   ${dim('Unblock:')} pilot project ${project} --unblock`);
      blockedWarningMsg = lines.join('\n  ');
    }
    ```

    Then modify the JSON output block (around line 421-424): if `isBlocked`, include the warning in the JSON:
    ```typescript
    if (isJsonMode()) {
      outputJson({
        job,
        ...(isBlocked ? { blockedWarning: { reason: projectRecord!.blockedReason, failedJobId } } : {}),
      });
      return;
    }
    ```

    For human output, print the blocked warning BEFORE the "Queued" line:
    ```typescript
    if (blockedWarningMsg) {
      outputHuman('');  // blank line for visual separation
      outputHuman(blockedWarningMsg);
      outputHuman('');
    }
    ```

    Place this immediately before the existing `outputHuman(... green('✓') Queued ...)` line (line 433).

    **Step 3 — Tests (test/commands/add.test.ts):**

    Add `getLatestFailedJob` to the db mock (line 16-60 area), defaulting to `vi.fn(() => null)`.

    Add a new `describe('blocked project warning', ...)` block with these tests:
    1. "prints warning when project is blocked" — mock `getProject` to return a project with `status: 'blocked', blockedReason: 'Job xyz failed: some error'`. Call `addCommand`. Assert `process.stderr.write` was called with string containing "blocked" and the reason. Assert `addJob` was still called. Assert `outputHuman` was called with "Queued".
    2. "includes failed job ID in warning when available" — mock `getLatestFailedJob` to return `{ id: 'fail123', ... }`. Assert stderr output contains "fail123".
    3. "no warning when project is active" — mock `getProject` to return `status: 'active'`. Assert no blocked warning in stderr.
    4. "no warning when project is unregistered" — mock `getProject` to return null. Assert no blocked warning.
    5. "JSON mode includes blockedWarning" — set `mockJsonMode = true`, mock blocked project. Assert `outputJson` called with object containing `blockedWarning`.
    6. "warning appears before Queued output" — verify the order of outputHuman calls: blocked warning comes before the "Queued" line.

    Follow existing test patterns in the file: use `mockedProjectDir`, `syncProjectDirEnv()`, the real filesystem temp dir for project setup validation, and `--no-notify --no-categories` flags equivalent patterns. The simplest way is to use `--force` to bypass setup validation (existing pattern in the test file), mock getProject to return blocked project, and use `--no-categories` + `--no-notify` to avoid category/notify validation.
  </action>
  <verify>
    <automated>cd /home/luca/dev/punchlab/pilot && npx vitest run test/commands/add.test.ts --reporter=verbose 2>&1 | tail -40</automated>
  </verify>
  <done>
    - Blocked project warning (yellow) prints before "Queued" success message
    - Warning includes: "blocked" label, reason from DB, unblock hint with project path
    - Nice-to-have: failed job ID shown when available
    - JSON mode includes blockedWarning in output
    - Job is always queued regardless of blocked status
    - All existing add.test.ts tests still pass
    - New tests cover blocked/active/null/JSON scenarios
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run test/commands/add.test.ts` — all tests pass including new blocked warning tests
2. `npx tsc --noEmit` — no type errors
3. Manual: `pilot add <blocked-project> "test task" --dry-run` shows no crash (dry-run exits before blocked check, which is fine)
</verification>

<success_criteria>
- Adding to a blocked project shows yellow warning with reason + unblock hint before "Queued" line
- Adding to a blocked project still queues the job
- JSON mode includes blockedWarning field
- Nice-to-have: warning includes failed job ID when one exists
- No warning for active or unregistered projects
- All existing tests pass, 6+ new tests added
</success_criteria>

<output>
After completion, create `.planning/quick/260325-ebl-pilot-add-warn-when-adding-to-a-blocked-/260325-ebl-SUMMARY.md`
</output>
