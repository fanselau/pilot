# Phase 74: Required Categories on pilot add - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/required-categories.md)

<domain>
## Phase Boundary

Make `--categories` required on `pilot add`. When missing, show a helpful error that lists all available categories AND installed skills per category so the caller can pick intelligently and retry. Add project-level default categories as fallback. Rewrite the skills manifest to use `{ repo, skill, categories }` format (replacing `{ install }` / git-clone approach with JIT `npx skills add` via the runner).

This is a skills infrastructure rewrite + CLI enforcement change. Touches add command, skills core, default-skills catalog, types, DB schema, setup command, runner injection, and the skills CLI subcommands.

</domain>

<decisions>
## Implementation Decisions

### Required --categories Flag
- `pilot add` errors if `--categories` is missing (same enforcement pattern as `--notify`)
- Accepts comma-separated list: `--categories frontend,testing,docs`
- Multiple categories encouraged — most tasks span 2-3 categories
- `--no-categories` flag to explicitly opt out (universal skills only, for edge cases)

### Helpful Rejection Message
- When `--categories` is missing, error output must be self-contained enough for AI caller to pick correct categories and retry
- Category descriptions are hardcoded alongside `PREDEFINED_CATEGORIES` (not generated)
- Installed skills section is dynamic — reads from `~/.pilot/skills/manifest.json`
- Group installed skills by category, skip categories with 0 installed skills
- Show total count of installed skills
- Include corrected usage example at the bottom

### CATEGORY_INFO Constant
- Add `CATEGORY_INFO: Record<string, string>` to `src/core/skills.ts` with descriptions for all 15 categories
- Add 3 new categories: `deployment`, `accessibility`, `architecture`
- Exact values from PRD:
  - frontend: 'React, UI components, layouts, client-side logic'
  - backend: 'Server logic, workers, middleware, auth'
  - api: 'REST/GraphQL endpoints, request handling, validation'
  - database: 'Schema, migrations, queries, ORM (Drizzle, Prisma)'
  - devops: 'CI/CD, GitHub Actions, Docker, infrastructure'
  - deployment: 'Cloudflare Workers, Wrangler, Vercel, edge deploys'
  - testing: 'Unit tests, E2E, vitest, playwright'
  - docs: 'README, changelogs, documentation, comments'
  - ui-design: 'Design systems, Tailwind, styling, responsive'
  - performance: 'Lighthouse, bundle size, caching, optimization'
  - security: 'Auth, input validation, OWASP, secrets management'
  - accessibility: 'WCAG, screen readers, focus management, ARIA'
  - architecture: 'Component patterns, refactoring, code organization'
  - prompting: 'LLM prompts, agent instructions, system prompts'
  - general: 'Catch-all — coding standards, debugging, review'

### Project-Level Defaults
- If project has default categories configured, use those when `--categories` is omitted (no error)
- `pilot setup <project>` gets `--categories <defaults>` flag to set project defaults
- Store `default_categories` in projects table (pilot.db) as TEXT (JSON array)
- Project defaults can be overridden per-job with explicit `--categories`
- `pilot project list` shows default categories per project

### SkillRef Catalog Format Change
- New format: `{ repo: string; skill: string; categories: string[] }` replacing `{ install: 'author/skill-name' }`
- `repo` is full URL: e.g. `'https://github.com/anthropics/skills'`
- `skill` is the `--skill` flag value: e.g. `'frontend-design'`

### Skills Manifest = Pure Registry (No File Paths)
- Manifest (`~/.pilot/skills/manifest.json`) contains `{ repo, skill, categories }` entries only — no file paths, no local copies
- `~/.pilot/skills/` directory no longer stores skill files

### Skills CLI = Manifest Editor Only
- Keep: `pilot skills list`, `pilot skills register`, `pilot skills remove`, `pilot skills categories`
- Remove: `addSkill()` git clone path, `pilot skills add <github-repo>`, `bootstrapDefaultSkills()`, `pilot setup` skill installation prompts, `syncManifest()` filesystem scanning, `injectSkills()` / `cleanupInjectedSkills()` copy logic
- New: `pilot skills register <repo> --skill <name> --categories <cats>` — add entry to manifest

### Runner: JIT Installation via `npx skills add`
- Before spawn: resolve job categories → get matching `{ repo, skill }` from manifest → `npx skills add <repo> --skill <skill> --agent opencode --yes` into project dir
- After spawn: clean up `.opencode/skill/`
- `--agent opencode` is critical — installs to `.opencode/skill/` only

### Re-tag Existing Default Skills
- Re-tag Cloudflare skills (`wrangler`, `cloudflare-gen`) from `['devops']` to `['deployment', 'devops']`

### Nice to Have (include if time permits)
- `pilot skills categories` standalone command — same output as the rejection message (already exists, just needs CATEGORY_INFO descriptions)
- Validate category names against `PREDEFINED_CATEGORIES` — warn on unknown but don't reject
- `pilot add` shell completion for category names

### Claude's Discretion
- Exact migration ordering for adding `default_categories` column to projects table
- Whether `pilot skills register` replaces `pilot skills add` or is a new subcommand
- Internal naming of helper functions for the error message formatter
- Whether to keep `SkillEntry.path` field or remove it entirely from the type

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `requirements/required-categories.md` — Complete PRD with schema, technical notes, file-by-file change list

### Core Files (Modified)
- `src/commands/add.ts` — enforcement logic + error formatting
- `src/core/skills.ts` — CATEGORY_INFO, PREDEFINED_CATEGORIES expansion, rewrite addSkill→register, remove injectSkills/cleanupInjectedSkills copy path, new JIT install
- `src/core/default-skills.ts` — SkillRef format change, re-tag Cloudflare skills
- `src/core/types.ts` — Project.defaultCategories, SkillEntry format update, SkillManifest update
- `src/core/db.ts` — projects table default_categories column, migration, rowToProject update
- `src/commands/setup.ts` — --categories flag for project defaults
- `src/commands/skills.ts` — rewrite add→register, update categories with descriptions, remove sync
- `src/core/runner.ts` — rewrite injectSkills to use `npx skills add`, update cleanupInjectedSkills

</canonical_refs>

<specifics>
## Specific Ideas

### Error Message Format (from PRD)
```
Error: --categories is required. Pick one or more from the list below.

Available categories:
  frontend      React, UI components, layouts, client-side logic
  backend       Server logic, workers, middleware, auth
  ...

Installed skills (17 total):
  general     coding-standards, code-reviewer, systematic-debugging, typescript
  frontend    frontend-patterns, react-best-practices, frontend-design
  ...

Usage: pilot add <project> <req> --categories frontend,testing [--notify main]
       pilot add <project> <req> --no-categories  (skip skills)
```

### SkillRef New Format
```typescript
interface SkillRef {
  repo: string;       // e.g. 'https://github.com/anthropics/skills'
  skill: string;      // e.g. 'frontend-design' (the --skill flag)
  categories: string[];
}
```

### JIT Install Command
```bash
npx skills add <repo-url> --skill <name> --agent opencode --yes
```

</specifics>

<deferred>
## Deferred Ideas

None — PRD covers phase scope

</deferred>

---

*Phase: 74-required-categories-on-pilot-add*
*Context gathered: 2026-03-20 via PRD Express Path*
