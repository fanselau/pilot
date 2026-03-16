# AGENTS.md Setup

## Objective

Generate or refresh a project-level `AGENTS.md` that helps coding agents work safely and consistently in this repository.

## Inputs

The invocation context will include:

- `Operation`
- `Allow file edits`
- `Project root`

Treat `Allow file edits` as authoritative.

## File Edit Policy

- If `Allow file edits: true`, you may create or update `AGENTS.md` in the project root.
- If `Allow file edits: false`, do not modify files. Produce a proposed `AGENTS.md` draft in your response only.

Do not edit any files other than `AGENTS.md`.

## Required Analysis

1. Read repository context needed to author a useful `AGENTS.md` (for example `README.md`, key config files, and planning docs).
2. Identify conventions that matter for contributors (commands, testing, code style, safety rules).
3. Produce clear guardrails for future agent sessions.

## Output Format (deterministic)

Return exactly these sections in this order:

1. `RESULT: <updated|draft-only|blocked>`
2. `SUMMARY: <one sentence>`
3. `AGENTS_MD_PATH: <path or n/a>`
4. `KEY_POINTS:`
   - `- <point>`
   - `- <point>`
5. `DRAFT_PREVIEW:`
   - Include the full proposed `AGENTS.md` content in fenced markdown code.

If blocked, explain why under `SUMMARY` and still include best-effort `KEY_POINTS`.
