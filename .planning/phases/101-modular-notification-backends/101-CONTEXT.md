# Phase 101: Modular Notification Backends - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/modular-notification-backends.md)

<domain>
## Phase Boundary

Replace the hardcoded OpenClaw `agent --deliver` notification system with a modular backend architecture. Deliver 4 backends (kimaki, openclaw, webhook, telegram), a backend registry, fan-out delivery in callback.ts, a `pilot notify` CLI subcommand group, `pilot add` multi-backend flag integration, `pilot project` route management, `pilot init` auto-detection, config schema updates, DB migration for `project.notifyRoutes`, and owner removal. Full test coverage for all new and refactored modules.

</domain>

<decisions>
## Implementation Decisions

### Backend Interface & Registry
- Create `src/core/notify-backends/types.ts` with `NotifyBackendKind`, `NotifyBackend` interface, `DetectResult`, `NotifyResult`, `NotifyRoute` discriminated union
- Create `src/core/notify-backends/registry.ts` with `getBackend()`, `getAllBackends()`, `getEnabledBackends()`, `enableBackend()`, `disableBackend()`, `getBackendConfig()`, `setBackendConfig()`
- Registry reads config via `loadConfigFile()` directly (not through `PilotConfig`/`getConfig()`)
- Backends registered at module load time via static imports (no dynamic plugin system)

### kimaki Backend
- `src/core/notify-backends/kimaki.ts` with `kind: 'kimaki'`, `displayName: 'Kimaki (Discord)'`
- `deliver()`: `sessionId` → `kimaki send --session`, `channelId` → `kimaki send --channel`
- `sessionId` takes priority over `channelId`
- Uses `execa('kimaki', [...], { timeout: 30_000, reject: false })`
- `detect()`: runs `kimaki --version`, returns 'detected' or 'not-found'
- `NotifyRoute` for kimaki: `{ kind: 'kimaki'; sessionId?: string; channelId?: string }`

### OpenClaw Backend (Move)
- Move `src/core/openclaw-deliver.ts` logic into `src/core/notify-backends/openclaw.ts`
- `kind: 'openclaw-agent-deliver'`, `displayName: 'OpenClaw'`
- Delete `src/core/openclaw-deliver.ts`, update all imports directly (no re-export wrapper)
- Behavior identical to current

### Webhook Backend
- `src/core/notify-backends/webhook.ts` with `kind: 'webhook'`, `displayName: 'Webhook (HTTP POST)'`
- Uses native `fetch()` (Node 18+ built-in), timeout 30s via `AbortController`
- JSON body with `jobId`, `project`, `status`, `description`, `duration`, `error`, `prompt`, `timestamp`
- `detect()`: returns `'available'` always

### Telegram Backend
- `src/core/notify-backends/telegram.ts` with `kind: 'telegram'`, `displayName: 'Telegram'`
- Bot API `sendMessage`, uses native `fetch()`, timeout 30s
- Reads `telegramBotToken` from config with fallback to old flat field
- `detect()`: returns `'detected'` if botToken configured, `'not-configured'` if not

### callback.ts Refactor
- `notifyJobCompletion(job)` becomes fan-out: calls `resolveNotifyRoutes()` → `Promise.allSettled()` on all backends
- Return `true` if at least one backend `result.ok === true`
- Preserve fire-and-forget semantics — never throws
- **Delivery ignores the enabled/disabled list** — if job has route, that backend fires regardless

### Route Resolution Update
- Rename `resolveNotifyRoute()` → `resolveNotifyRoutes()` returning `NotifyRoute[]`
- Delete `NotifyRouteResult` discriminated union — replace with plain `NotifyRoute[]`
- Job-level routes → project-level routes → legacy fallback
- Backward compat: single-object stored route wrapped in `[route]`

### Type Changes
- `Job.notifyRoute` changes from `OpenClawDeliverRoute | null` to `NotifyRoute[] | null`
- `Project.notifyOpenClawRoute` → `Project.notifyRoutes: NotifyRoute[] | null`
- DB column `notify_route` keeps name, JSON shape changes
- Migration: `ALTER TABLE projects ADD COLUMN notify_routes TEXT DEFAULT NULL`

### pilot add Integration
- `--notify-kimaki <sessionId>`, `--notify-webhook <url>`, `--notify-telegram <chatId>` flags
- `--notify <agentId>` continues to work (openclaw route via legacy derive)
- Multiple `--notify-*` flags can combine
- Notification required when backends enabled — error if no route and no default for an enabled backend
- `--no-notify` stores `notifyRoute: []` (empty array)
- `PILOT_DEFAULT_NOTIFY` env var deprecated

### pilot project Integration
- `--notify-kimaki-channel <channelId>`, `--notify-webhook <url>`, `--notify-telegram <chatId>`, `--clear-notify`
- Routes stored in `project.notifyRoutes: NotifyRoute[]`

### pilot notify CLI Subcommand
- Create `src/commands/notify.ts` following `src/commands/skills.ts` subcommand pattern
- `pilot notify list` — all backends with status/detection
- `pilot notify enable <kind>` — validates config before enabling
- `pilot notify disable <kind>` — warns if pending jobs exist
- `pilot notify test <kind> <target>` — sends test notification
- `pilot notify config <kind> [key] [value]` — convenience config wrapper

### Config Schema Update
- `notifications.backends` array is source of truth for active backends
- Nested backend config: `notifications.kimaki`, `notifications.openclaw`, `notifications.webhook`, `notifications.telegram`
- Legacy flat field migration in registry config reader (not auto-rewrite)
- Old PilotConfig fields deprecated with `@deprecated` JSDoc
- Update `CONFIG_FIELD_SPECS`, `buildConfigContent()`, `getDefaultConfigFileContent()`

### pilot init Update
- After provider/model questions, run `detect()` on all backends
- Present detected/available as selectable options
- In `--yes` mode: enable auto-detected backends needing no config

### Owner Removal
- **Hard remove** `project.owner`, `--owner` flags, `registerProject(path, owner)`, `updateProjectOwner()`
- DB migration: convert existing `owner` values into `notify_routes` openclaw entries, NULL out owner column
- Remove `Project.owner` from TypeScript type entirely
- Update web UI files that display `project.owner`

### Tests
- Unit tests for each backend's `deliver()` and `detect()`
- Registry tests: `getBackend`, `getEnabledBackends`, `enableBackend`, `disableBackend`
- `resolveNotifyRoutes()` tests: array, single-object legacy, null, project fallback, mixed
- callback.ts fan-out tests: multi-backend success/fail combinations
- `pilot add --notify-kimaki` tests: route storage, multi-flag, enabled-but-missing error, `--no-notify`, `--dry-run`
- `pilot notify` subcommand tests: list, enable, disable
- Existing `notify-route.ts` tests updated for new signature

### Agent's Discretion
- Internal error message wording
- Exact CLI help text formatting
- Order of backends in detection presentation
- Web UI display format for notifyRoutes (so long as it shows backend kind + target)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Notification System
- `requirements/modular-notification-backends.md` — Full requirements spec with architecture, file layout, DB changes, CLI spec, breaking changes
- `src/core/callback.ts` — Current notification entry point (refactor target)
- `src/core/notify-route.ts` — Current route resolution (refactor target)
- `src/core/openclaw-deliver.ts` — Current OpenClaw delivery (move target)

### Types & DB
- `src/core/types.ts` — `Job`, `Project`, `OpenClawDeliverRoute`, `PilotConfig`, `ConfigFileSchema`
- `src/core/db.ts` — DB schema, `registerProject()`, `updateProjectOwner()`, `addJob()`, `getProject()`
- `src/core/config.ts` — Config loading, `loadConfigFile()`, `getConfig()`, `_resetConfigCache()`, `CONFIG_FIELD_SPECS`

### CLI Patterns
- `src/commands/skills.ts` — Subcommand pattern for `pilot notify`
- `src/commands/add.ts` — `--notify` flag integration point
- `src/commands/project.ts` — `--owner` flag (remove), add `--notify-*` flags
- `src/commands/setup.ts` — `--owner` flag (remove)
- `src/commands/init.ts` — Backend auto-detection integration
- `src/index.ts` — CLI flag registration

### Web UI
- `web/src/components/settings/section-projects.tsx` — Displays `project.owner`
- `web/src/components/projects-list.tsx` — Displays `project.owner`
- `web/src/routes/projects.$projectPath.tsx` — Displays `project.owner`

</canonical_refs>

<specifics>
## Specific Ideas

- kimaki `send --session` resolves session → thread via internal lookup in `~/.kimaki/discord-sessions.db`
- Session ID sourced from kimaki-injected system prompt line: `Your current OpenCode session ID is: ses_xxx`
- Fan-out via `Promise.allSettled()` — one failure does NOT prevent others
- Runner.ts call sites (`notifyJobCompletion(job).catch(() => {})`) remain unchanged — all changes internal to callback.ts
- `project.owner` referenced in ~68 locations across 11+ files — comprehensive grep required
- SQLite doesn't support DROP COLUMN in older versions — NULL out owner column instead of dropping

</specifics>

<deferred>
## Deferred Ideas

- `pilot notify history` — recent delivery attempts with success/failure status
- `--notify-kimaki` auto-reads `KIMAKI_SESSION_ID` env var
- Retry logic per backend (single retry on transient failure)
- `pilot doctor` notification backend health integration
- Notification templates — customizable prompt format per backend

</deferred>

---

*Phase: 101-modular-notification-backends*
*Context gathered: 2026-03-30 via PRD Express Path*
