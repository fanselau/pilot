---
phase: quick-019
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .opencode/command/gsd-add-phase.md
  - src/core/runner.ts
  - src/core/delegate.ts
  - test/core/runner.test.ts
  - test/core/delegate.test.ts
autonomous: true

must_haves:
  truths:
    - "add-phase creates a phase directory whose slug matches the requirement title, not GSD instruction text"
    - "add-phase rejects phase titles that match known GSD instruction fragments"
    - "add-phase rejects duplicate phase titles that already exist in ROADMAP.md"
    - "verifyStepArtifacts catches bad add-phase titles and fails the step"
  artifacts:
    - path: ".opencode/command/gsd-add-phase.md"
      provides: "Hardened GSD prompt with explicit title extraction and anti-confusion guardrails"
    - path: "src/core/runner.ts"
      provides: "Enhanced verifyStepArtifacts with title similarity check and blocklist guard"
    - path: "src/core/delegate.ts"
      provides: "Exported GSD_INSTRUCTION_BLOCKLIST and title validation helpers"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/delegate.ts"
      via: "import GSD_INSTRUCTION_BLOCKLIST, extractRequirementTitle"
      pattern: "GSD_INSTRUCTION_BLOCKLIST|matchesBlocklist"
---

<objective>
Harden `add-phase` reliability so it creates correctly-titled phases every time instead of picking up GSD instruction text fragments or creating duplicates.

Purpose: `phase` and `milestone` scopes are unreliable because `add-phase` frequently misinterprets the phase title. This fix addresses three failure modes: (1) GSD instruction text used as title, (2) duplicate phases, (3) nonsensical slugified names.

Output: Hardened GSD prompt, blocklist guard in verifyStepArtifacts, and duplicate detection — all with tests.
</objective>

<execution_context>
@.planning/quick/019-harden-add-phase-reliability-problem-add/019-PLAN.md
</execution_context>

<context>
@requirements/fix-premature-completion-detection.md (example requirement that triggered the bug)
@.opencode/command/gsd-add-phase.md (current GSD prompt — root cause)
@src/core/runner.ts (verifyStepArtifacts for add-phase)
@src/core/delegate.ts (extractRequirementTitle, fallback plan building)
@test/core/runner.test.ts (existing verifyStepArtifacts tests)
@test/core/delegate.test.ts (existing extractRequirementTitle tests)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Harden GSD prompt + add blocklist and title validation to runner</name>
  <files>
    .opencode/command/gsd-add-phase.md
    src/core/delegate.ts
    src/core/runner.ts
    test/core/runner.test.ts
    test/core/delegate.test.ts
  </files>
  <action>
### 1. Fix the GSD prompt (`.opencode/command/gsd-add-phase.md`)

The root cause: the prompt's `<objective>` says "Add a new integer phase to the end of the current milestone in the roadmap" and the AI sometimes uses this text as the phase title. Fix by:

1. In `<step name="parse_arguments">`, wrap the description in explicit tags and add a CRITICAL warning:

```
CRITICAL: The arguments ARE the phase title/description. Use them VERBATIM.
Do NOT use text from this prompt template as the phase title.
Do NOT use phrases like "Add a new integer phase" as the title.

The phase title is EXACTLY what was passed as arguments. For example:
- Args: "Fix premature completion detection" → title = "Fix premature completion detection"  
- Args: "TUI Visual Polish" → title = "TUI Visual Polish"

WRONG: Using "Add a new integer phase to the end of the current milestone" as the title
RIGHT: Using the exact text from the arguments
```

2. In `<step name="generate_slug">`, add before generating the slug:

```
VALIDATION before proceeding:
- The description must NOT contain any of these GSD instruction phrases:
  "add a new integer phase", "execute all plans", "spawn subagents",
  "current milestone in the roadmap", "phase to the end"
- If the description matches any instruction phrase, STOP. The arguments were
  misinterpreted. Re-read the original arguments and use them verbatim.
```

3. In `<step name="update_roadmap">`, add a duplicate check:

```
DUPLICATE CHECK: Before inserting, scan all existing `### Phase N:` headings.
If any existing phase title (case-insensitive) matches the new description,
STOP and report: "Phase already exists: Phase {N}: {title}". Do NOT create a duplicate.
```

### 2. Add GSD instruction blocklist to `delegate.ts`

Add an exported constant `GSD_INSTRUCTION_BLOCKLIST` — an array of lowercase phrases that are known GSD instruction fragments. These should NEVER appear in a phase title:

```typescript
const GSD_INSTRUCTION_BLOCKLIST: readonly string[] = [
  'add a new integer phase',
  'add a new phase to the end',
  'execute all plans',
  'spawn subagents',
  'current milestone in the roadmap',
  'phase to the end of',
  'run /gsd-plan-phase',
  'run /gsd-execute-phase',
  'break down into tasks',
  'to be planned',
];
```

Add a helper function `matchesBlocklist(title: string): string | null` that returns the matched blocklist phrase if found (case-insensitive substring match), or null if clean. Export both.

### 3. Enhance `verifyStepArtifacts` in `runner.ts` for add-phase

After the existing add-phase directory creation check succeeds, add TWO more validations:

**a) Blocklist check on the new directory name:**
Import `GSD_INSTRUCTION_BLOCKLIST` and `matchesBlocklist` from delegate.ts. Convert the new directory slug back to words (replace hyphens with spaces). If `matchesBlocklist` returns non-null, return `{ ok: false, error: 'add-phase created directory with GSD instruction text as title: "${match}" — directory: ${newDirName}' }`.

**b) Title similarity check (warning only, logged to stderr):**
The `step.args` contains the expected title. Normalize both the step.args and the new directory slug (lowercase, strip non-alpha). If the normalized directory slug shares fewer than 50% of words with the normalized expected title AND the directory has ≥3 words, log a warning: `[runner] WARNING: add-phase directory "${newDir}" does not match expected title "${step.args}"`. This is a warning (not a failure) because the GSD agent may legitimately clean up the title.

**c) Duplicate detection in ROADMAP.md:**
Read `${projectDir}/.planning/ROADMAP.md`. Extract all existing phase titles from `### Phase N: <title>` headings. If any existing title (case-insensitive, trimmed) matches the new directory's slug-to-title conversion, return `{ ok: false, error: 'add-phase created duplicate phase: "${existingTitle}" already exists' }`.

### 4. Update ArtifactVerification interface

Add an optional `warning?: string` field to `ArtifactVerification` for the title mismatch warning. The runner loop should log warnings to stderr but NOT fail the step.

### 5. Tests

**In `test/core/delegate.test.ts`:**
- Add tests for `matchesBlocklist`:
  - Returns matched phrase for "add a new integer phase to the end of the current milestone"
  - Returns matched phrase for titles containing "execute all plans"
  - Returns null for legitimate titles like "Fix premature completion detection"
  - Case-insensitive matching

**In `test/core/runner.test.ts`:**
- Add test: `verifyStepArtifacts` for add-phase fails when new directory name matches blocklist
  - Mock: prevPhaseDirs = ['01-setup'], current = ['01-setup', '02-add-a-new-integer-phase-to-the-end']
  - Expected: ok: false, error contains "GSD instruction text"
- Add test: `verifyStepArtifacts` for add-phase succeeds with legitimate directory name
  - Mock: prevPhaseDirs = ['01-setup'], current = ['01-setup', '02-fix-premature-completion']
  - Expected: ok: true
- Add test: `verifyStepArtifacts` for add-phase fails when duplicate exists in ROADMAP
  - Mock ROADMAP with existing "### Phase 1: Fix premature completion detection"
  - Mock new dir = '02-fix-premature-completion-detection'
  - Expected: ok: false, error contains "duplicate"
  </action>
  <verify>
Run `npx vitest run test/core/delegate.test.ts test/core/runner.test.ts` — all tests pass.
Run `npx tsc --noEmit` — no type errors.
Manually verify gsd-add-phase.md has the hardened prompt text.
  </verify>
  <done>
- GSD prompt explicitly instructs AI to use args verbatim as phase title
- GSD prompt includes self-validation step against instruction phrases  
- GSD prompt includes duplicate check before inserting
- `matchesBlocklist()` catches known GSD instruction phrases in titles
- `verifyStepArtifacts` for add-phase validates new directory against blocklist
- `verifyStepArtifacts` for add-phase detects duplicate phase titles in ROADMAP
- All existing + new tests pass, no type errors
  </done>
</task>

</tasks>

<verification>
```bash
npx vitest run test/core/delegate.test.ts test/core/runner.test.ts
npx tsc --noEmit
```
</verification>

<success_criteria>
- `matchesBlocklist("Add a new integer phase to the end of the current milestone")` returns matched phrase
- `matchesBlocklist("Fix premature completion detection")` returns null
- `verifyStepArtifacts` rejects add-phase when directory name matches GSD instruction blocklist
- `verifyStepArtifacts` rejects add-phase when phase title duplicates existing ROADMAP entry
- `gsd-add-phase.md` has explicit CRITICAL instruction to use args verbatim
- All tests pass, TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/019-harden-add-phase-reliability-problem-add/019-SUMMARY.md`
</output>
