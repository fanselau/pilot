---
phase: quick-070-required-categories
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/index.ts
  - src/commands/skills.ts
  - src/commands/add.ts
  - test/commands/skills.test.ts
  - test/commands/add.test.ts
autonomous: true
must_haves:
  truths:
    - "Commands that require categories reject missing or empty --categories input with a clear error."
    - "Valid comma-separated categories are parsed consistently and passed through unchanged to command handlers."
    - "Regression tests cover both failing and passing category input paths."
  artifacts:
    - path: "src/index.ts"
      provides: "CLI-level required/validated categories contract on skills commands"
    - path: "src/commands/skills.ts"
      provides: "Runtime validation and normalized parsing for categories-aware skills flows"
    - path: "src/commands/add.ts"
      provides: "Consistent category parsing behavior for job creation input"
    - path: "test/commands/skills.test.ts"
      provides: "Command tests for missing/empty categories and valid categories"
    - path: "test/commands/add.test.ts"
      provides: "Add command tests for categories parsing and validation behavior"
  key_links:
    - from: "src/index.ts"
      to: "src/commands/skills.ts"
      via: "skills tag/add option definitions and handler options payload"
      pattern: "command\('tag <name>'\)|command\('add <repo>'\)|categories"
    - from: "src/commands/skills.ts"
      to: "src/core/skills.ts"
      via: "addSkill/tagSkill categories arrays"
      pattern: "addSkill\(|tagSkill\("
---

<objective>
Enforce required-categories behavior for skills-related CLI flows so category-dependent behavior is explicit, validated, and test-backed.

Purpose: Prevent silent no-op tagging/install behavior caused by missing or empty category input.
Output: Updated CLI contract and command validation with focused regression tests.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/index.ts
@src/commands/skills.ts
@src/commands/add.ts
@test/commands/skills.test.ts
@test/commands/add.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lock CLI contract for required categories</name>
  <files>src/index.ts</files>
  <action>Update the `pilot skills` command wiring so required-categories semantics are enforced at the CLI boundary (not just implicitly in handlers). Use Commander option configuration that fails fast when `--categories` is omitted for commands that are category-required, and keep optional behavior unchanged for commands where categories are intentionally optional. Do not introduce new commands or rename existing flags.</action>
  <verify>Run `bun test test/commands/skills.test.ts` and confirm required-option failure path is asserted.</verify>
  <done>Invoking a category-required command without categories exits non-zero with a clear, actionable message; valid invocations continue to handler execution.</done>
</task>

<task type="auto">
  <name>Task 2: Add runtime parsing/validation guards for empty category values</name>
  <files>src/commands/skills.ts, src/commands/add.ts</files>
  <action>Implement shared parsing behavior for comma-separated categories that trims whitespace, drops empty tokens, and rejects `--categories` when the result is empty for required flows. Ensure handler-level validation still protects behavior even if command wiring changes later. Preserve existing successful behavior for valid values and avoid changing category matching logic in core resolution.</action>
  <verify>Run `bun test test/commands/skills.test.ts test/commands/add.test.ts`.</verify>
  <done>Inputs like `--categories ""` or `--categories ",,,"` are rejected in required flows; valid lists like `frontend, testing` become `['frontend', 'testing']` and proceed normally.</done>
</task>

<task type="auto">
  <name>Task 3: Expand regression coverage for required-categories behavior</name>
  <files>test/commands/skills.test.ts, test/commands/add.test.ts</files>
  <action>Add targeted tests for: missing required categories, empty/whitespace-only categories, and valid category parsing. Assert both exit behavior and downstream function calls so tests catch contract regressions at CLI and command levels. Keep tests deterministic and aligned with existing mock patterns.</action>
  <verify>Run `bun test test/commands/skills.test.ts test/commands/add.test.ts` and then `bun test`.</verify>
  <done>Test suite includes explicit pass/fail cases for required categories and all new tests pass with no unrelated failures.</done>
</task>

</tasks>

<verification>
Run focused command tests first, then full test suite:
1) `bun test test/commands/skills.test.ts test/commands/add.test.ts`
2) `bun test`
</verification>

<success_criteria>
- Category-required commands cannot run without meaningful category input.
- Empty category payloads are blocked with clear errors instead of silently succeeding.
- Valid categories remain fully functional through add/tag/job flows.
- Regression tests enforce the required-categories contract.
</success_criteria>

<output>
After completion, create `.planning/quick/070-implement-the-required-categories-requir/070-SUMMARY.md`.
</output>
