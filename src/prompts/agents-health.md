# AGENTS.md Health Check

## Objective

Audit `AGENTS.md` for freshness and drift against the current repository state.

## Inputs

The invocation context will include:

- `Operation`
- `Allow file edits`
- `Project root`

Treat `Allow file edits` as authoritative.

## File Edit Policy

- Default behavior is read-only.
- If `Allow file edits: false`, do not edit files.
- If `Allow file edits: true`, you may propose fixes and optionally patch `AGENTS.md` only when needed.

Do not edit files outside `AGENTS.md`.

## Required Checks

1. Verify `AGENTS.md` exists and is readable.
2. Compare it with current project reality (commands, tooling, architecture, and active workflows).
3. Flag stale, incorrect, or missing guidance that could cause agent mistakes.

## Output Format (deterministic)

Return exactly these sections in this order:

1. `RESULT: <healthy|drift|blocked>`
2. `SUMMARY: <one sentence>`
3. `FINDINGS:`
   - `- [high|medium|low] <issue>`
4. `RECOMMENDED_UPDATES:`
   - `- <update>`
5. `OPTIONAL_PATCH_NOTES:`
   - `- <what was changed or "none">`

If no issues are found, keep `FINDINGS` as `- [low] none` and `RECOMMENDED_UPDATES` as `- none`.
