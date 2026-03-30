---
phase: 101-modular-notification-backends
plan: 01
subsystem: notifications
tags: [execa, fetch, telegram-api, discord, webhook, notification-backends]

# Dependency graph
requires: []
provides:
  - NotifyBackend interface and NotifyBackendKind type
  - 4 backend implementations (kimaki, openclaw, webhook, telegram)
  - Backend registry with config-based enable/disable and config read/write
affects: [callback-refactor, notify-cli, pilot-add-integration, pilot-init]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NotifyBackend interface contract with deliver/detect/validateConfig"
    - "Discriminated union NotifyRoute on kind field"
    - "Config-based backend enable/disable via notifications.backends array"
    - "Legacy flat config field fallback reading for telegram and openclaw"

key-files:
  created:
    - src/core/notify-backends/types.ts
    - src/core/notify-backends/kimaki.ts
    - src/core/notify-backends/openclaw.ts
    - src/core/notify-backends/webhook.ts
    - src/core/notify-backends/telegram.ts
    - src/core/notify-backends/registry.ts
    - test/core/notify-backends/backends.test.ts
    - test/core/notify-backends/registry.test.ts
  modified: []

key-decisions:
  - "Job parameter in deliver() uses minimal shape (not full Job type) to avoid circular imports"
  - "Openclaw validateConfig reads nested notifications.openclaw.hooksUrl first, then legacy flat notifications.openclawHooksUrl"
  - "Telegram getBotToken reads nested notifications.telegram.botToken first, then legacy flat notifications.telegramBotToken"
  - "Registry writeNotifications creates config dir/file if missing, resets config cache after every write"
  - "Registry maps openclaw-agent-deliver kind to 'openclaw' config key for config section lookups"

patterns-established:
  - "NotifyBackend: interface with kind/displayName/deliver/detect/validateConfig"
  - "Backend config via loadConfigFile() directly, not through PilotConfig/getConfig()"
  - "Real filesystem I/O in registry tests via PILOT_CONFIG_FILE env var override"

requirements-completed: [NBACK-TYPES, NBACK-REGISTRY, NBACK-KIMAKI, NBACK-OPENCLAW, NBACK-WEBHOOK, NBACK-TELEGRAM]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 101 Plan 01: Backend Types, Implementations & Registry Summary

**NotifyBackend interface with 4 backend implementations (kimaki/openclaw/webhook/telegram) and config-based registry with enable/disable/config read-write — 44 tests passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T11:26:01Z
- **Completed:** 2026-03-30T11:31:42Z
- **Tasks:** 2
- **Files created:** 8

## Accomplishments
- Defined NotifyBackend interface, NotifyBackendKind, DetectResult, NotifyResult, and NotifyRoute discriminated union in types.ts
- Implemented all 4 backends: kimaki (execa CLI), openclaw (moved from openclaw-deliver.ts logic), webhook (native fetch), telegram (Bot API via fetch)
- Created backend registry with 7 exported functions: getBackend, getAllBackends, getEnabledBackends, enableBackend, disableBackend, getBackendConfig, setBackendConfig
- 44 tests total (23 backend + 21 registry) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backend types and all 4 backend implementations** - `9b316c9` (test: RED), `1cf12ce` (feat: GREEN)
2. **Task 2: Create backend registry with config-based enable/disable** - `fcecdd8` (feat)

## Files Created/Modified
- `src/core/notify-backends/types.ts` - NotifyBackendKind, NotifyBackend interface, DetectResult, NotifyResult, NotifyRoute union
- `src/core/notify-backends/kimaki.ts` - Kimaki (Discord) backend with execa CLI delivery via sessionId or channelId
- `src/core/notify-backends/openclaw.ts` - OpenClaw backend with identical execa args/timeout as current openclaw-deliver.ts
- `src/core/notify-backends/webhook.ts` - Webhook backend with native fetch, JSON payload, AbortController timeout
- `src/core/notify-backends/telegram.ts` - Telegram backend with Bot API sendMessage, legacy flat field fallback
- `src/core/notify-backends/registry.ts` - Registry with static backend map, config read/write, enable/disable
- `test/core/notify-backends/backends.test.ts` - 23 tests for all 4 backends
- `test/core/notify-backends/registry.test.ts` - 21 tests for registry with real filesystem I/O

## Decisions Made
- Used minimal job shape `{ id, project, status, description, startedAt, completedAt, error }` in deliver() instead of full Job type to avoid circular imports
- OpenClaw backend reads nested config path first (`notifications.openclaw.hooksUrl`) then falls back to legacy flat field (`notifications.openclawHooksUrl`)
- Telegram backend uses same pattern for botToken
- Registry uses `writeNotifications()` helper that reads/modifies/writes the full config file with `_resetConfigCache()` after each write
- Registry maps `openclaw-agent-deliver` kind to `openclaw` config section key for config lookups

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend abstraction layer complete, ready for Plan 02 (callback.ts refactor and route resolution update)
- All 4 backends implement NotifyBackend interface with consistent deliver/detect/validateConfig
- Registry ready for CLI integration (pilot notify commands) and pilot add integration

## Self-Check: PASSED

All 8 created files verified on disk. All 3 commits (9b316c9, 1cf12ce, fcecdd8) verified in git log.

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
