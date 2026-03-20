# Phase 72 Active Coupling Audit

Date: 2026-03-16
Plan: 72-04

## Goal

Verify active runtime, test, and operator-facing docs are free of fork-only coupling strings:

- `pilot-gsd`
- `PILOT_GSD_DIR`
- `gsd-setup-agents`
- `gsd-lessons`

## Active Surface Scope

- `src/`
- `test/`
- `README.md`
- `docs/`
- `skills/`

Historical artifacts under `.planning/phases/*` are intentionally excluded from this active-surface gate.

## Commands and Results

1. Initial active-surface audit:

```bash
rg -n --hidden "pilot-gsd|PILOT_GSD_DIR|gsd-setup-agents|gsd-lessons" src test README.md docs skills
```

Result: 5 hits in active tests.

- `test/core/gsd-config.test.ts` (tmpdir prefix string)
- `test/commands/setup.test.ts` (legacy command string in negative assertion)
- `test/commands/lessons.test.ts` (legacy command string in negative assertions)
- `test/commands/doctor.test.ts` (legacy command string in negative assertion)

2. Remediation applied:

- Renamed tmpdir prefix in `test/core/gsd-config.test.ts` to remove fork string.
- Replaced legacy string-based negative assertions in command tests with operation-contract assertions already present (`command` remains undefined).

3. Re-run active-surface audit:

```bash
rg -n --hidden "pilot-gsd|PILOT_GSD_DIR|gsd-setup-agents|gsd-lessons" src test README.md docs skills
```

Result: zero hits.

4. Skill sync verification:

```bash
pilot skills sync
```

Result: blocked in this shell (`/usr/bin/env: 'bun': No such file or directory`).

Fallback used:

```bash
node dist/index.js skills sync
```

Result: `Synced: 3 skills found`.

5. Lint verification:

```bash
npm run lint
```

Result: pass (`tsc --noEmit`).

## Audit Outcome

PASS: active runtime/test/docs/skills surfaces are free of the targeted fork-only coupling strings.

## Accepted Exceptions

None.
