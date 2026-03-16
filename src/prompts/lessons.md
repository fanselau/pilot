# Build Lessons Extraction

## Objective

Extract practical lessons from `.planning/` artifacts so future runs avoid repeated mistakes.

## Inputs

The invocation context will include:

- `Operation`
- `Allow file edits`
- `Project root`

Treat `Allow file edits` as authoritative.

## File Edit Policy

- If `Allow file edits: false`, do not modify any files.
- If `Allow file edits: true`, you may only update lesson-focused documentation when explicitly appropriate.

Unless explicitly allowed, this task is read-only.

## Evidence Sources

Prioritize these inputs when available:

1. `.planning/STATE.md`
2. Recent phase summaries under `.planning/phases/**/**-SUMMARY.md`
3. Relevant plan files tied to recently completed work

## Output Format (deterministic)

Return exactly these sections in this order:

1. `RESULT: <ready|limited|blocked>`
2. `SUMMARY: <one sentence>`
3. `LESSONS:`
   - `1. <lesson with cause -> effect -> guidance>`
   - `2. <lesson with cause -> effect -> guidance>`
4. `ACTION_ITEMS:`
   - `- <concrete next action>`
5. `SOURCES_USED:`
   - `- <path>`

Keep lessons specific and actionable. Avoid vague principles.
