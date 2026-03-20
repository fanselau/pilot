---
phase: quick
plan: mcv
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - src/core/skills.ts
  - test/core/runner.test.ts
  - test/core/runner-recovery.test.ts
autonomous: true
requirements: [skills-system-v2-compat, delegation-no-ai-categories, codex-installSkillsForJob]

must_haves:
  truths:
    - "runner.ts uses installSkillsForJob() instead of injectSkills/cleanupInjectedSkills"
    - "installSkillsForJob() uses JIT `npx skills add` CLI, not cpSync from ~/.pilot/skills/"
    - "delegate.ts does not assign categories in delegation output (already clean)"
    - "DelegationIntent has no AI-assigned categories field (already fixed by m85)"
    - "No Phase 73 code introduces new references to ~/.pilot/skills/ as runtime inject cache"
  artifacts:
    - path: "src/core/skills.ts"
      provides: "installSkillsForJob() function using npx skills add CLI for JIT project-local install"
      exports: ["installSkillsForJob"]
    - path: "src/core/runner.ts"
      provides: "Runner using installSkillsForJob instead of old inject/cleanup pattern"
    - path: "src/core/delegate.ts"
      provides: "Delegation output confirmed clean — no AI-assigned categories"
    - path: "src/core/types.ts"
      provides: "DelegationIntent confirmed clean — no vestigial categories field (fixed by m85)"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/skills.ts"
      via: "installSkillsForJob import"
      pattern: "installSkillsForJob"
    - from: "src/core/skills.ts"
      to: "npx skills add CLI"
      via: "execa('npx', ['skills', 'add', ...])"
      pattern: "npx.*skills.*add"
---

<objective>
Verify and fix Phase 73 (judge-and-retry-v2) code compatibility with updated requirements:
1. Skills system v2: JIT install via `npx skills add` directly into project, no global `~/.pilot/skills/` cache inject/cleanup cycle
2. Delegation: categories are user-assigned on `pilot add --categories`, never AI-inferred
3. Codex-first-class-citizen: `installSkillsForJob()` replaces old `injectSkills`/`cleanupInjectedSkills`

Previous quick task m85 already removed vestigial `categories?: string[]` from DelegationIntent.
This task addresses the remaining incompatibility: runner.ts still uses `injectSkills`/`cleanupInjectedSkills`.

Purpose: Phase 73 rewrote runner.ts (73-04) and carried forward the old inject/cleanup skill pattern. The updated skills-system-v2 requirement says skills should be installed JIT via `npx skills add <repo> --skill <name> --agent opencode --yes` directly into the project's `.opencode/skill/` directory, not copied from a `~/.pilot/skills/` cache. Replace the old pattern with `installSkillsForJob()` which uses the skills CLI.

Output: runner.ts uses `installSkillsForJob()`, skills.ts exports it using `execa('npx', ['skills', 'add', ...])` for JIT install, old inject/cleanup still available for backward compat but runner no longer calls them.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260320-m85-verify-phase-73-code-compatibility-with-/260320-m85-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/core/types.ts:
```typescript
export interface SkillEntry {
  name: string;
  description: string;
  categories: string[];
  source: string;       // repo URL (e.g. 'github:owner/repo') — used as arg to `npx skills add <source>`
  path: string;         // absolute path to skill directory (~/.pilot/skills/<name>/) — legacy, will be removed by Phase 74
}
```

From src/core/skills.ts (current exports used by runner):
```typescript
export function resolveSkillsForJob(categories: string[] | null): SkillEntry[];
export function injectSkills(skills: SkillEntry[], projectDir: string): string[];
export function cleanupInjectedSkills(projectDir: string): void;
// execa is already imported in skills.ts (used by addSkill)
```

From src/core/runner.ts (lines 79-82, current import):
```typescript
import {
  resolveSkillsForJob,
  injectSkills,
  cleanupInjectedSkills,
} from './skills.js';
```

From src/core/runner.ts (line 652-666, inject usage in launch()):
```typescript
const resolvedSkills = resolveSkillsForJob(job.categories ?? null);
if (resolvedSkills.length > 0) {
  try {
    const injected = injectSkills(resolvedSkills, projectDir);
    if (injected.length > 0) {
      process.stderr.write(
        `[runner] Injected ${injected.length} skill(s) for job ${job.id}: ${injected.join(', ')}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[runner] Warning: skill injection failed for job ${job.id}: ${errMsg(err)}\n`,
    );
  }
}
```

From src/core/runner.ts (line 771, cleanup in finally block):
```typescript
try {
  cleanupInjectedSkills(projectDir);
} catch {
  // Best-effort cleanup — don't fail the job
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create installSkillsForJob() and replace inject/cleanup in runner</name>
  <files>src/core/skills.ts, src/core/runner.ts, test/core/runner.test.ts, test/core/runner-recovery.test.ts</files>
  <action>
**In src/core/skills.ts:**

1. Add a new exported async function `installSkillsForJob()` that uses JIT `npx skills add` instead of the old cache-copy pattern:

```typescript
/**
 * Install matched skills for a job directly into project's .opencode/skill/ directory.
 * Uses resolveSkillsForJob() to find matching manifest entries, then runs
 * `npx skills add <repo> --skill <name> --agent opencode --yes` for each.
 *
 * This is the v2 replacement for the old injectSkills/cleanupInjectedSkills cycle.
 * Key differences from old pattern:
 * - No ~/.pilot/skills/ file cache — manifest is a pure registry
 * - Skills are installed via the `skills` CLI directly into the project
 * - `--agent opencode` ensures install to .opencode/skill/ only (not all 28 platforms)
 *
 * Returns list of skill names actually installed (skips already-present).
 */
export async function installSkillsForJob(
  categories: string[] | null,
  projectDir: string,
): Promise<string[]> {
  const resolved = resolveSkillsForJob(categories);
  if (resolved.length === 0) return [];

  const installed: string[] = [];
  for (const skill of resolved) {
    // Check if project already has this skill installed
    const destDir = path.join(projectDir, '.opencode', 'skill', skill.name);
    if (existsSync(destDir)) continue;

    try {
      await execa('npx', [
        'skills', 'add', skill.source,  // skill.source = repo URL (e.g. 'https://github.com/anthropics/skills')
        '--skill', skill.name,
        '--agent', 'opencode',
        '--yes',
      ], {
        cwd: projectDir,
        timeout: 60_000,
      });
      installed.push(skill.name);
    } catch (err) {
      process.stderr.write(`Warning: failed to install skill '${skill.name}': ${err}\n`);
    }
  }
  return installed;
}
```

Note: `skill.source` contains the repo URL (e.g. `'github:owner/repo'` or `'https://github.com/...'`). The manifest entry `{ name, source/repo, categories }` maps directly to `npx skills add <source> --skill <name>`. The `execa` import already exists in skills.ts (used by `addSkill`).

Note: Keep the old `injectSkills` and `cleanupInjectedSkills` exports intact — they may be used by tests or other code. Do NOT delete them.

**In src/core/runner.ts:**

2. Replace the import:
```typescript
// OLD:
import {
  resolveSkillsForJob,
  injectSkills,
  cleanupInjectedSkills,
} from './skills.js';

// NEW:
import {
  installSkillsForJob,
} from './skills.js';
```

3. Replace the inject block in `launch()` (around lines 652-666):
```typescript
// OLD:
const resolvedSkills = resolveSkillsForJob(job.categories ?? null);
if (resolvedSkills.length > 0) {
  try {
    const injected = injectSkills(resolvedSkills, projectDir);
    ...

// NEW:
try {
  const installed = await installSkillsForJob(job.categories ?? null, projectDir);
  if (installed.length > 0) {
    process.stderr.write(
      `[runner] Installed ${installed.length} skill(s) for job ${job.id}: ${installed.join(', ')}\n`,
    );
  }
} catch (err) {
  process.stderr.write(
    `[runner] Warning: skill installation failed for job ${job.id}: ${errMsg(err)}\n`,
  );
}
```

4. Replace the `cleanupInjectedSkills` call in the `finally` block (around line 771) with cleanup of `.opencode/skill/` (the directory `npx skills add --agent opencode` installs into):
```typescript
// OLD — DELETE:
try {
  cleanupInjectedSkills(projectDir);
} catch {
  // Best-effort cleanup — don't fail the job
}

// NEW — clean up JIT-installed skills after spawn:
try {
  const skillDir = path.join(projectDir, '.opencode', 'skill');
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
  }
} catch {
  // Best-effort cleanup — don't fail the job
}
```
Note: The `existsSync` and `rmSync` imports should already be available from runner.ts imports. If not, add them from `node:fs`.

**In test/core/runner.test.ts:**

5. Update the `../core/skills.js` mock (around lines 421-422 and 632-633):
```typescript
// OLD:
injectSkills: vi.fn(() => []),
cleanupInjectedSkills: vi.fn(),

// NEW:
installSkillsForJob: vi.fn(async () => []),
```

**In test/core/runner-recovery.test.ts:**

6. Update the `../core/skills.js` mock (around lines 105-106):
```typescript
// OLD:
injectSkills: vi.fn(() => []),
cleanupInjectedSkills: vi.fn(),

// NEW:
installSkillsForJob: vi.fn(async () => []),
```
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - runner.ts imports `installSkillsForJob` from skills.ts (not injectSkills/cleanupInjectedSkills)
    - runner.ts calls `installSkillsForJob(job.categories, projectDir)` in launch()
    - runner.ts has NO `cleanupInjectedSkills` call in finally block
    - runner.ts cleans up `.opencode/skill/` in finally block (rmSync)
    - skills.ts exports `installSkillsForJob` function
    - `installSkillsForJob` uses `execa('npx', ['skills', 'add', ...])` — NOT cpSync from skill.path
    - `grep -r "injectSkills\|cleanupInjectedSkills" src/core/runner.ts` returns zero matches
    - TypeScript compiles cleanly
    - All tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Final compatibility audit — grep for remaining old-pattern references in Phase 73 files</name>
  <files>none (read-only audit)</files>
  <action>
Run a comprehensive grep audit to confirm no Phase 73 code (runner.ts, delegate.ts, types.ts) still references old patterns:

1. `grep -rn "injectSkills\|cleanupInjectedSkills" src/core/runner.ts src/core/delegate.ts src/core/types.ts` — must return zero matches
2. `grep -rn "bootstrapDefaultSkills" src/core/runner.ts src/core/delegate.ts` — must return zero matches (it's OK in setup.ts/skills.ts/default-skills.ts — those are separate concerns)
3. `grep -rn "intent\.categories" src/` — must return zero matches (confirmed clean by m85)
4. Verify `delegate.ts` parseIntentOutput does NOT extract/map a `categories` field from AI output
5. Verify `DelegationIntent` type has no `categories` field on any variant
6. Verify `installSkillsForJob` in skills.ts uses `execa('npx', ['skills', 'add', ...])` — NOT `cpSync(skill.path, ...)` cache-copy pattern

If any of these fail, document what was found and fix it. If all pass, document the clean result.
  </action>
  <verify>
    <automated>bash -c 'set -e; echo "--- Check 1: No injectSkills/cleanupInjectedSkills in runner/delegate/types ---"; ! grep -rn "injectSkills\|cleanupInjectedSkills" src/core/runner.ts src/core/delegate.ts src/core/types.ts; echo "PASS"; echo "--- Check 2: No bootstrapDefaultSkills in runner/delegate ---"; ! grep -rn "bootstrapDefaultSkills" src/core/runner.ts src/core/delegate.ts; echo "PASS"; echo "--- Check 3: No intent.categories in src ---"; ! grep -rn "intent\.categories" src/; echo "PASS"; echo "--- Check 4: installSkillsForJob uses npx skills add, not cpSync ---"; grep -n "npx.*skills.*add\|skills.*add" src/core/skills.ts | grep -q "skills"; echo "PASS"; echo "--- All checks passed ---"'</automated>
  </verify>
  <done>
    - Zero grep matches for old skill injection patterns in Phase 73 core files
    - Zero grep matches for `intent.categories` anywhere in src/
    - Zero grep matches for `bootstrapDefaultSkills` in runner/delegate
    - `installSkillsForJob` confirmed to use `npx skills add` CLI (not cpSync cache-copy)
    - Compatibility confirmed: Phase 73 code is clean w.r.t. updated skills-system-v2, required-categories, and codex-first-class-citizen requirements
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no type errors
2. `npx vitest run` passes — all tests green
3. `grep -rn "injectSkills\|cleanupInjectedSkills" src/core/runner.ts` — zero matches
4. `grep -rn "intent\.categories" src/` — zero matches
5. `grep -rn "installSkillsForJob" src/core/runner.ts` — has matches (confirming new pattern)
6. `grep -n "npx.*skills\|skills.*add" src/core/skills.ts` — confirms JIT npx-based install (not cpSync)
</verification>

<success_criteria>
- runner.ts uses installSkillsForJob() (new pattern) instead of injectSkills/cleanupInjectedSkills (old pattern)
- installSkillsForJob() uses JIT `npx skills add` CLI — NOT cpSync from ~/.pilot/skills/ cache
- No cleanupInjectedSkills call exists in runner's finally block; runner cleans up .opencode/skill/ via rmSync
- delegate.ts confirmed clean: no AI-assigned categories
- DelegationIntent confirmed clean: no vestigial categories field (fixed by m85)
- All tests pass, TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260320-mcv-verify-phase-73-code-changes-are-compati/260320-mcv-SUMMARY.md`
</output>
