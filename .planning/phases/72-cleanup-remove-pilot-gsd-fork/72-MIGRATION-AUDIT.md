# Phase 72 Migration Audit

Generated: 2026-03-16T09:33:00Z
Plan: 72-05

## Task 1 - Migration-order gate across registered projects

### Command baseline

- `pilot` launcher failed in this environment (`/usr/bin/env: 'bun': No such file or directory`), so commands were executed via `node dist/index.js ...` after `npm run build`.
- Project inventory source: `node dist/index.js projects --json`.

### Registered projects

1. `/home/luca/dev/punchlab/pilot`
2. `/home/luca/dev/punchlab/pilot-gsd`
3. `/home/luca/dev/punchlab/presentr`
4. `/home/luca/dev/smashleads/smashkit/content`
5. `/home/luca/dev/smashleads/smashkit/dev`
6. `/home/luca/dev/smashleads/smashkit/main`
7. `/home/luca/dev/werkbank/benefitu`

### Refresh + verification evidence

Each project was refreshed using:

- `node dist/index.js setup <project> --refresh --skip-skills --json`
- `node dist/index.js doctor --project <project> --skip-agents --json`

| Project | setup errors | doctor fails | doctor warns | .opencode/command | gsd-help.md | Gate |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `/home/luca/dev/punchlab/pilot` | 0 | 0 | 1 | pass | pass | pass |
| `/home/luca/dev/punchlab/pilot-gsd` | 0 | 0 | 1 | pass | pass | pass |
| `/home/luca/dev/punchlab/presentr` | 1 | 2 | 1 | fail | missing | **blocker** |
| `/home/luca/dev/smashleads/smashkit/content` | 0 | 1 | 0 | pass | pass | **blocker** |
| `/home/luca/dev/smashleads/smashkit/dev` | 0 | 1 | 0 | pass | pass | **blocker** |
| `/home/luca/dev/smashleads/smashkit/main` | 1 | 2 | 2 | fail | missing | **blocker** |
| `/home/luca/dev/werkbank/benefitu` | 1 | 1 | 2 | fail | missing | **blocker** |

### Blocker details

- `/home/luca/dev/punchlab/presentr`
  - setup error: `Skipping GSD installation: no package.json found in project (GSD installer requires a Node.js project)`
  - doctor fail: `.opencode/command/ exists: Not found`
  - doctor fail: `.planning/ exists: Not found`
- `/home/luca/dev/smashleads/smashkit/content`
  - doctor fail: `git repository: Not a git repo — run: git init`
- `/home/luca/dev/smashleads/smashkit/dev`
  - doctor fail: `git repository: Not a git repo — run: git init`
- `/home/luca/dev/smashleads/smashkit/main`
  - setup error: `Skipping GSD installation: no package.json found in project (GSD installer requires a Node.js project)`
  - doctor fail: `.opencode/command/ exists: Not found`
  - doctor fail: `.planning/ exists: Not found`
- `/home/luca/dev/werkbank/benefitu`
  - setup error: `Skipping GSD installation: no package.json found in project (GSD installer requires a Node.js project)`
  - doctor fail: `.opencode/command/ exists: Not found`

### Migration gate verdict

- Result: **BLOCKED**.
- Requirement check: migration-order gate was executed before any cleanup/removal action.
- Phase progression note: destructive cleanup/removal work must not proceed until blockers above are remediated and this gate is rerun with all projects passing.
