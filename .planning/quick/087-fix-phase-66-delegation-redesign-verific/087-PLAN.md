---
phase: quick-087
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
autonomous: true

must_haves:
  truths:
    - "src/prompts/*.md files are copied to dist/prompts/ during build"
    - "delegate.ts and runner.ts can load their .md prompts at runtime from dist/"
    - "npm run build succeeds without errors"
    - "vitest run passes (no regressions)"
  artifacts:
    - path: "package.json"
      provides: "postbuild script that copies prompts"
      contains: "prompts"
  key_links:
    - from: "src/core/delegate.ts"
      to: "dist/prompts/delegate.md"
      via: "import.meta.url relative path resolves to ../prompts/delegate.md from dist/core/"
      pattern: "fileURLToPath.*prompts/delegate.md"
    - from: "src/core/runner.ts"
      to: "dist/prompts/judge.md"
      via: "import.meta.url relative path resolves to ../prompts/judge.md from dist/core/"
      pattern: "fileURLToPath.*prompts/judge.md"
---

<objective>
Fix runtime file resolution for prompt .md files in the built dist/ output.

Both delegate.ts and runner.ts load .md prompt files via `import.meta.url`-relative paths at module init time. TypeScript's `tsc` only emits .ts → .js files, so `src/prompts/*.md` files are never copied to `dist/prompts/`. This causes runtime crashes when running from dist/.

Fix: Extend the existing `postbuild` script in package.json to also copy `src/prompts/*.md` → `dist/prompts/`.

Output: A working build that includes prompt files in dist/prompts/.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@package.json
@tsconfig.json
@src/core/delegate.ts (lines 26-28: loads delegate.md via import.meta.url)
@src/core/runner.ts (lines 24-26: loads judge.md via import.meta.url)
@src/prompts/delegate.md
@src/prompts/judge.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add prompt file copy to postbuild script</name>
  <files>package.json</files>
  <action>
Update the `postbuild` script in package.json to ALSO copy `src/prompts/*.md` to `dist/prompts/`.

The current postbuild is a Node one-liner that patches the shebang in dist/index.js. Extend it to first create `dist/prompts/` and copy all .md files from `src/prompts/` into it, THEN do the existing shebang patching.

Use a Node.js one-liner approach (consistent with existing style) or chain a simple `mkdir -p dist/prompts && cp src/prompts/*.md dist/prompts/` before the existing Node -e command using `&&`.

Preferred approach (simplest, most readable):
```
"postbuild": "mkdir -p dist/prompts && cp src/prompts/*.md dist/prompts/ && node -e \"<existing shebang patch code>\""
```

This keeps the existing shebang patching intact and prepends the copy step.
  </action>
  <verify>
Run `npm run build` — should complete without errors.
Verify `dist/prompts/delegate.md` and `dist/prompts/judge.md` exist:
  `ls -la dist/prompts/`
Verify the built output runs:
  `node dist/index.js --help`
  </verify>
  <done>
`npm run build` succeeds, `dist/prompts/delegate.md` and `dist/prompts/judge.md` exist, `node dist/index.js --help` runs without module load errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify tests pass</name>
  <files></files>
  <action>
Run the full test suite to confirm no regressions. The 3 pre-existing test failures (doctor.test.ts, update.test.ts, web/actions.test.ts) were fixed in quick task 086.

Run: `npx vitest run`

If any tests fail that are UNRELATED to the prompt file change, note them but do not fix — they are out of scope. If tests fail DUE TO the prompt file change, fix the issue.
  </action>
  <verify>
`npx vitest run` — all tests pass (or only pre-existing failures unrelated to this change).
  </verify>
  <done>
Test suite passes. Build produces dist/prompts/ with both .md files. The runtime file resolution issue is fixed.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` completes successfully
2. `ls dist/prompts/` shows delegate.md and judge.md
3. `node dist/index.js --help` runs without import/module-load errors
4. `npx vitest run` passes
</verification>

<success_criteria>
- dist/prompts/delegate.md and dist/prompts/judge.md exist after build
- The CLI binary can be invoked from dist/ without runtime file-not-found errors
- No test regressions introduced
</success_criteria>

<output>
After completion, create `.planning/quick/087-fix-phase-66-delegation-redesign-verific/087-SUMMARY.md`
</output>
