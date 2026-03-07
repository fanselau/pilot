---
phase: quick-076
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/core/callback.ts]
autonomous: true

must_haves:
  truths:
    - "src/core/callback.ts has a comment noting it uses /hooks/wake"
  artifacts:
    - path: "src/core/callback.ts"
      provides: "Comment noting /hooks/wake usage"
  key_links: []
---

<objective>
Add a comment to the top of src/core/callback.ts noting it uses /hooks/wake.

Purpose: Annotate the callback module with its webhook dependency.
Output: Updated callback.ts with comment, committed.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/callback.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /hooks/wake comment to callback.ts</name>
  <files>src/core/callback.ts</files>
  <action>
    Read src/core/callback.ts. Note that lines 1-15 already contain a JSDoc block mentioning /hooks/wake.
    Add a single-line comment `// Uses: /hooks/wake` immediately before the existing JSDoc block (as the very first line of the file).
    This makes the /hooks/wake dependency scannable at a glance without reading the full JSDoc.
    Then commit the change with message: `chore: add /hooks/wake comment to callback.ts`
  </action>
  <verify>Read src/core/callback.ts and confirm the first line is `// Uses: /hooks/wake`</verify>
  <done>src/core/callback.ts has a comment at the top noting it uses /hooks/wake, committed to git.</done>
</task>

</tasks>

<verification>
- src/core/callback.ts first line contains a comment referencing /hooks/wake
- Change is committed
</verification>

<success_criteria>
- Comment present at top of src/core/callback.ts noting /hooks/wake usage
- Clean git commit
</success_criteria>

<output>
After completion, create `.planning/quick/076-add-a-comment-to-the-top-of-src-core-cal/076-SUMMARY.md`
</output>
