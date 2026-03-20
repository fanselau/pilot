# Required Categories on pilot add

## Problem
`--categories` is opt-in, so skills never get injected unless the caller remembers to pass it. The caller (usually an AI agent) literally just wrote the requirement — it has perfect context to pick categories. We just need to require it and make the rejection helpful enough that the AI can self-correct.

## Goal
Make `--categories` required on `pilot add`. When missing, show a helpful error that lists all available categories AND installed skills per category so the caller can pick intelligently and retry.

## Requirements

### Must Have

#### Required Flag
- [ ] `pilot add` errors if `--categories` is missing (same enforcement pattern as `--notify`)
- [ ] Accepts comma-separated list: `--categories frontend,testing,docs`
- [ ] Multiple categories encouraged — most tasks span 2-3 categories
- [ ] `--no-categories` flag to explicitly opt out (universal skills only, for edge cases)

#### Helpful Rejection Message
When `--categories` is missing, the error output must be **self-contained enough for an AI caller to pick correct categories and retry**. Format:

```
Error: --categories is required. Pick one or more from the list below.

Available categories:
  frontend      React, UI components, layouts, client-side logic
  backend       Server logic, workers, middleware, auth
  api           REST/GraphQL endpoints, request handling, validation
  database      Schema, migrations, queries, ORM (Drizzle, Prisma)
  devops        CI/CD, GitHub Actions, Docker, infrastructure
  deployment    Cloudflare Workers, Wrangler, Vercel, edge deploys
  testing       Unit tests, E2E, vitest, playwright
  docs          README, changelogs, documentation, comments
  ui-design     Design systems, Tailwind, styling, responsive
  performance   Lighthouse, bundle size, caching, optimization
  security      Auth, input validation, OWASP, secrets management
  accessibility WCAG, screen readers, focus management, ARIA
  architecture  Component patterns, refactoring, code organization
  prompting     LLM prompts, agent instructions, system prompts
  general       Catch-all — coding standards, debugging, review

Installed skills (17 total):
  general     coding-standards, code-reviewer, systematic-debugging, typescript
  frontend    frontend-patterns, react-best-practices, frontend-design
  security    security-review
  ui-design   tailwind-design-system, design-system-patterns, web-design-guidelines
  testing     testing, javascript-testing-patterns, tdd-workflow
  ...

Usage: pilot add <project> <req> --categories frontend,testing [--notify main]
       pilot add <project> <req> --no-categories  (skip skills)
```

- [ ] Category descriptions are hardcoded alongside `PREDEFINED_CATEGORIES` (not generated)
- [ ] Installed skills section is dynamic — reads from `~/.pilot/skills/manifest.json`
- [ ] Group installed skills by category, skip categories with 0 installed skills
- [ ] Show total count of installed skills
- [ ] Include the corrected usage example at the bottom

#### Project-Level Defaults (fallback)
- [ ] If project has default categories configured, use those when `--categories` is omitted (no error)
- [ ] `pilot setup <project>` gets `--categories <defaults>` flag to set project defaults
- [ ] Store in project record (pilot.db)
- [ ] Project defaults can be overridden per-job with explicit `--categories`
- [ ] `pilot project list` shows default categories per project

### Nice to Have
- [ ] `pilot skills categories` standalone command — same output as the rejection message
- [ ] Validate category names against `PREDEFINED_CATEGORIES` — warn on unknown categories but don't reject (extensible)
- [ ] `pilot add` shell completion for category names

## Technical Notes

### Where to Change
- `src/commands/add.ts` — enforcement logic + error formatting
- `src/core/skills.ts` — extend `PREDEFINED_CATEGORIES` with description strings, add new categories: `deployment`, `accessibility`, `architecture`
- `src/core/default-skills.ts` — re-tag Cloudflare skills (`wrangler`, `cloudflare-gen`) from `['devops']` to `['deployment', 'devops']`
- `src/core/types.ts` — project record gets `defaultCategories: string[] | null`
- `src/commands/setup.ts` — accept `--categories` for project defaults

### Category Descriptions
Store alongside the predefined list in `src/core/skills.ts`:
```typescript
export const CATEGORY_INFO: Record<string, string> = {
  frontend: 'React, UI components, layouts, client-side logic',
  backend: 'Server logic, workers, middleware, auth',
  api: 'REST/GraphQL endpoints, request handling, validation',
  database: 'Schema, migrations, queries, ORM (Drizzle, Prisma)',
  devops: 'CI/CD, GitHub Actions, Docker, infrastructure',
  deployment: 'Cloudflare Workers, Wrangler, Vercel, edge deploys',
  testing: 'Unit tests, E2E, vitest, playwright',
  docs: 'README, changelogs, documentation, comments',
  'ui-design': 'Design systems, Tailwind, styling, responsive',
  performance: 'Lighthouse, bundle size, caching, optimization',
  security: 'Auth, input validation, OWASP, secrets management',
  accessibility: 'WCAG, screen readers, focus management, ARIA',
  architecture: 'Component patterns, refactoring, code organization',
  prompting: 'LLM prompts, agent instructions, system prompts',
  general: 'Catch-all — coding standards, debugging, review',
};
```

### AI Caller Pattern
The typical caller is Gorb (CTO agent) or another AI that just analyzed the requirement:
```bash
pilot add ~/dev/punchlab/myproject requirements/auth-flow.md \
  --categories backend,security,api \
  --notify main
```
The AI knows the requirement content — it just needs to see the category menu once to pick correctly.

## Install Method: `skills add` CLI Only
**One install path. No global skill cache. No alternatives.**

```bash
npx skills add <repo-url> --skill <name> --agent opencode --yes
```

Example: `npx skills add https://github.com/anthropics/skills --skill frontend-design --agent opencode --yes`

**`--agent opencode` is critical** — without it, `skills add` installs to ALL 28 platforms (Cursor, Claude Code, Copilot, etc.), creating 28 directories. With `--agent opencode`, it only installs to `.opencode/skill/`.

This installs directly into the project's `.opencode/skill/` dir. Run before spawn, clean up after.

### Catalog format change
The current `SkillRef` format `{ install: 'author/skill-name' }` is **wrong** — it conflates repo owner with skill name. Most skills live in monorepos:
- `affaan-m/everything-claude-code` has 126 skills
- `anthropics/skills` has 18 skills

New format:
```typescript
interface SkillRef {
  repo: string;       // e.g. 'https://github.com/anthropics/skills'
  skill: string;      // e.g. 'frontend-design' (the --skill flag)
  categories: string[];
}
```

### Architecture
- **No `~/.pilot/skills/` directory for skill files** — no global cache
- **Manifest (`~/.pilot/skills/manifest.json`) is a pure registry** — maps categories to `{ repo, skill }` entries. No file paths, no local copies.
- Before spawn: resolve job categories → get matching `{ repo, skill }` from manifest → `npx skills add <repo> --skill <skill> --yes` into project dir
- After spawn: clean up `.opencode/skill/`
### Pilot skills CLI = manifest editor only
Remove all install/bootstrap/sync logic. The runner handles actual installation JIT.

**Keep:**
- `pilot skills list` — show registered skills + categories
- `pilot skills register <repo> --skill <name> --categories <cats>` — add entry to manifest
- `pilot skills remove <name>` — remove from manifest  
- `pilot skills categories` — show all categories with descriptions + registered skill counts (same output as the rejection message)

**Remove:**
- `addSkill()` git clone path (`src/core/skills.ts`)
- `pilot skills add <github-repo>` command
- `bootstrapDefaultSkills()` (`src/core/default-skills.ts`) — no more bootstrap step
- `pilot setup` skill installation prompts — setup doesn't touch skills anymore
- `syncManifest()` filesystem scanning — manifest is edited via CLI only, not inferred from disk
- `injectSkills()` / `cleanupInjectedSkills()` copy logic — runner uses `skills add` directly into project

**Manifest stays at `~/.pilot/skills/manifest.json`** but only contains `{ repo, skill, categories }` entries — no file paths.

## Do NOT
- Auto-infer categories — the caller has better context than keyword matching
- Break existing queued jobs that have no categories
- Make the error message terse — it needs to be complete enough for an AI to self-correct
- Add interactive category picker — callers are non-interactive AI agents
