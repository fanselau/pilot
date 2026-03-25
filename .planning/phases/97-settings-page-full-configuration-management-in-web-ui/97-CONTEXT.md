# Phase 97: Settings Page — Full Configuration Management in Web UI - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/webui-settings-page.md)

<domain>
## Phase Boundary

Add a comprehensive `/settings` route to the Pilot Web UI that exposes all configuration knobs with a clean, developer-friendly interface. Every setting that can be changed via CLI or config file should be viewable and editable from the web. Includes 9 sections: General, Runner, Memory, Job Defaults, Notifications, Logging, Models, Projects, Skills.

</domain>

<decisions>
## Implementation Decisions

### API Layer (Server Functions)
- `getFullConfigFn` — returns full resolved config with `source` field per key indicating where value comes from (`env`, `config`, `default`). Also returns env var name for env-sourced values.
- `updateConfigFn` — accepts partial config updates, validates types/ranges, writes to `~/.pilot/config.json`. Returns success/failure with field-level errors.
- `getModelTableFn` — returns full model resolution table: all agent roles × provider modes × profiles, with resolved model IDs. Include custom provider modes from DB.
- `updateModelMappingFn` — update individual agent-role model assignment for a given provider mode + profile combination
- `getSkillsListFn` — returns installed skills with names, descriptions, category tags
- `installSkillFn` — install skill from GitHub URL
- `removeSkillFn` — remove skill by name
- `updateSkillTagsFn` — update category tags for a skill
- `getSystemInfoFn` — returns total system RAM (for Memory section context bar)

### Navigation & Layout
- New route at `/settings` — add "Settings" link (gear icon) to `AppHeader` in `__root.tsx`
- Single-page layout with sticky left sidebar for section navigation (anchor-based scroll)
- Sidebar sections: General, Runner, Memory, Job Defaults, Notifications, Logging — separator — Models, Projects, Skills
- Responsive: below `lg` breakpoint, sidebar collapses into horizontal scrollable pill row at top
- Floating "Save Changes" button (bottom-right, `fixed`) appears when any field is dirty. Shows count of changed sections.
- Toast feedback on successful save, inline field errors on validation failure

### Source Badges & Reset
- Every field label row shows a `Badge` indicating source: `env` (blue), `config` (gray/neutral), `default` (muted)
- Fields set via env var are read-only with tooltip showing env var name (e.g. "Set via PILOT_MAX_PARALLEL")
- Fields with non-default values show a `↺` reset-to-default icon button

### Section 1: General (Card)
- `projectDir` — `Input` (text), placeholder "~/dev". Description: "Base directory for resolving project shorthand names"
- Async validation: warn (yellow border) if path doesn't exist on disk

### Section 2: Runner (Card)
- `runner.maxParallel` — `Switch` for "Auto-detect (from RAM)" + conditional `NumberField` (min=1, max=32) when auto-detect is off. null = auto-detect.
- `runner.queueGraceSeconds` — `NumberField` (min=0, max=3600) with "s" suffix. Description: "Minimum age before runner picks up a new job"

### Section 3: Memory (Card)
- Context bar at top: shows total system RAM, reserved amount, available to Pilot (read-only info from `getSystemInfoFn`)
- Three fields in 3-column grid (stacks on mobile): sessionMaxMb, reservedMb, killThresholdMb — all `NumberField` (min=256, step=256, suffix "MB")
- Cross-field validation: warn if `killThresholdMb >= sessionMaxMb - reservedMb`

### Section 4: Job Defaults (Card)
- `defaults.modelProfile` — `Select` with options: quality, balanced, budget
- `defaults.providerMode` — `Select` with options: claude-only, openai-only, hybrid, plus any custom modes from model table
- `defaults.notifyTarget` — `Input` (text, nullable). Placeholder: "e.g. main"
- `defaults.scope` — `Select` with options: (none), quick, phase, debug, fast
- 2-column grid layout, stacks on mobile

### Section 5: Notifications (Card)
- Two `Fieldset` groups: "OpenClaw Webhook" and "Telegram"
- OpenClaw: openclawHooksUrl (text, nullable), openclawHooksToken (password with show/hide toggle)
- Telegram: telegramBotToken (password with show/hide), telegramChatId (text, nullable), "Send Test" button
- Sensitive fields set via env: show last 4 chars only (`••••••abcd`) and read-only state

### Section 6: Logging (Card)
- `logging.level` — `Select` with options: DEBUG, INFO, WARN, ERROR
- `logging.noColor` — `Switch` in horizontal row layout
- Compact card — no grid, just stacked with separator

### Section 7: Models (Card with internal Tabs)
- Tab row: one tab per provider mode (claude-only, openai-only, hybrid, + custom modes)
- Each tab: table of agent roles → model assignments for each profile tier (quality/balanced/budget)
- Table columns: Agent Role | Quality | Balanced | Budget
- Table rows: all 12 agent roles (executor, planner, roadmapper, verifier, judge, debugger, phase-researcher, project-researcher, research-synthesizer, codebase-mapper, plan-checker, integration-checker)
- Each cell: inline-editable `Select` or `Combobox` with available model IDs
- Variant field: optional secondary select for variant (high, xhigh, medium, spark)
- "Add Custom Mode" button → dialog with name input, copies from existing mode as template
- "Delete Custom Mode" button (only for custom modes)

### Section 8: Projects (Card)
- Table/list of all registered projects from `getProjectsListFn` (already exists)
- Columns: Project Path (truncated, tooltip for full), Owner, Status (active/blocked), Categories, Notify Route
- Status column: `Badge` — green "active", red "blocked" with reason on hover
- Each row expandable/click-to-open with editable fields: Owner, Default Categories, Notify Route, Block/Unblock toggle
- Use existing `blockProjectFn`/`unblockProjectFn` server functions for mutations

### Section 9: Skills (Card)
- List of installed skills as cards/table rows: Name, Description, Categories (as `Badge` tags)
- Per-skill actions: Edit categories (inline tag editor or dialog), Remove (with confirmation dialog)
- "Install Skill" section at top: `Input` for GitHub URL + "Install" `Button`
- Show install progress/status inline (loading spinner → success toast or error)
- "Available Categories" reference list shown below skills list

### Technology Constraints
- Stack: TanStack Start, React 19, shadcn/ui (new-york style), Tailwind CSS v4, better-sqlite3 for DB
- Use `createServerFn` for all new server functions. GET for reads, POST for mutations. Input validation via `.inputValidator()`.
- Config reading: `getConfig()` and `getConfigSource()` already exist — use them for source tracking
- Config writing: Write to `~/.pilot/config.json` — read existing, deep-merge updates, write back. Use `fs.writeFileSync` with atomic rename pattern.
- Model table: `AGENT_MODELS` table and resolution logic is in `src/core/models.ts` — expose via server function
- Skills: CLI uses `src/commands/skills.ts` — extract logic into shared functions callable from server fns
- Projects: `getProjectsListFn` and mutation fns already exist — reuse them
- Polling: Fetch once on mount, refetch on save. No polling interval needed.
- Route: Create `web/src/routes/settings.tsx` (file-based routing auto-registers)
- Components: All needed shadcn components are already installed (Card, Field, Fieldset, Switch, Select, Input, Badge, Tabs, Toast, Separator, Button, Dialog, Sheet, Combobox, Command)

### DON'Ts
- Don't create a separate settings API server — use TanStack Start server functions
- Don't use WebSockets or SSE — use polling pattern
- Don't make Models table editable without proper validation of model IDs against known valid models
- Don't store UI state in config file — use localStorage
- Don't expose raw JSON editing as primary interface — structured fields first
- Don't add auth/login — behind Tailscale
- Don't break existing server functions or API patterns

### Agent's Discretion
- How to structure internal component files (sub-components vs single file)
- State management approach for dirty form tracking (useReducer, zustand, etc.)
- How to implement the sidebar scroll-spy behavior
- Exact Tailwind breakpoints and spacing details
- Whether to use react-hook-form or manual state for form handling

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Config System
- `src/core/types.ts` — PilotConfig, ConfigFileSchema, ConfigSource, ConfigFileDefaults types
- `src/core/config.ts` — getConfig(), getConfigSource(), loadConfigFile(), getConfigFileDefaults() functions

### Model System
- `src/core/models.ts` — AGENT_MODELS table, resolveAgentModel(), resolveAllAgentModels(), resolveTopLevelModel()
- `src/core/model-store.ts` — Dynamic model DB CRUD (getModelEntry, getAllEntriesForModeAndProfile)

### Skills System
- `src/core/skills.ts` — Manifest-only skill registry, PREDEFINED_CATEGORIES, CATEGORY_INFO
- `src/core/types.ts` — SkillEntry, SkillManifest types

### Web UI Architecture
- `web/src/lib/server-fns.ts` — Existing server function patterns (createServerFn, GET/POST, inputValidator)
- `web/src/routes/__root.tsx` — AppHeader component, QueryClientProvider setup, navigation
- `web/src/components/ui/` — All available shadcn/ui components

### Requirements
- `requirements/webui-settings-page.md` — Full requirements document

</canonical_refs>

<specifics>
## Specific Ideas

- Section sidebar uses anchor-based scroll with Intersection Observer for scroll-spy
- Source badges should use specific colors: `env` (blue), `config` (gray/neutral), `default` (muted/dashed)
- Models table should be read from `AGENT_MODELS` in models.ts + any custom modes from `model-store.ts`
- Memory section context bar should call `getSystemInfoFn` which uses `os.totalmem()` server-side
- Sensitive fields set via env should mask values showing only last 4 chars

</specifics>

<deferred>
## Deferred Ideas

- Keyboard shortcut to open settings (e.g. `Cmd+,` or via command palette)
- Config diff preview before saving (show what changed in JSON format)
- Export/import config as JSON (download/upload buttons)
- Undo last save (keep one-deep history in memory)
- Search/filter within settings page
- Runner status indicator in settings header (running/stopped with start/stop button)

</deferred>

---

*Phase: 97-settings-page-full-configuration-management-in-web-ui*
*Context gathered: 2026-03-25 via PRD Express Path*
