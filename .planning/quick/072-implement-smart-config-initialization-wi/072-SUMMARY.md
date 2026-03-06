---
phase: "quick-072"
plan: 1
subsystem: config
tags: [providers, init, detection, config, cli]

dependency-graph:
  requires: ["phase-36"]
  provides: ["detectProviders", "pilot-init-command", "provider-availability-check"]
  affects: ["runner-startup", "setup-integration"]

tech-stack:
  added: []
  patterns: ["provider auto-detection via opencode models", "readline interactive prompts"]

file-tracking:
  key-files:
    created:
      - src/core/providers.ts
      - src/commands/init.ts
      - test/core/providers.test.ts
      - test/commands/init.test.ts
    modified:
      - src/index.ts
      - src/core/runner.ts
      - src/commands/setup.ts
      - test/core/runner-lock.test.ts

decisions:
  - key: "provider-detection-graceful-fallback"
    value: "detectProviders returns empty set on any failure — timeout, missing binary, non-zero exit"
    rationale: "Prevents false warnings when opencode is not installed or not configured"
  - key: "availability-check-skips-empty-detection"
    value: "checkProviderAvailability returns no warning when detection found zero providers"
    rationale: "Avoids false positives when opencode binary is unavailable"
  - key: "init-uses-readline-not-new-dep"
    value: "Node.js built-in readline for interactive prompts"
    rationale: "Zero new dependencies; plan explicitly stated no new deps"
  - key: "runner-lock-test-mock-update"
    value: "Added getConfigFileDefaults to config.js mock and providers.js mock in runner-lock.test.ts"
    rationale: "runner.run() now imports these during startup; tests need them mocked"

metrics:
  duration: "~6 minutes"
  completed: "2026-03-06"
---

# Quick Task 072: Smart Config Initialization with Provider Detection

**One-liner:** Auto-detect available AI providers via `opencode models` and create interactive `pilot init` for first-time config with provider-aware defaults.

## What Was Done

### Task 1: Provider Detection Module and Init Command
- Created `src/core/providers.ts` with `detectProviders()` that runs `opencode models` with 10s timeout, parses provider prefixes (e.g., `anthropic/claude-sonnet-4-6` → `anthropic`)
- `getAvailableModes()` filters ProviderMode options by detected providers (both → all 3 modes, single → that mode only, none → claude-only fallback)
- `getDefaultMode()` recommends the optimal mode (both → hybrid, single → that provider, none → claude-only)
- `checkProviderAvailability(mode)` returns a warning string when configured mode doesn't match available providers
- Created `src/commands/init.ts` with full interactive flow using Node.js `readline`
- Supports `--yes` for non-interactive mode with auto-detected defaults
- Supports `--force` to overwrite existing config
- Writes `~/.pilot/config.json` with chmod 0o600
- Registered as top-level `pilot init` command in Infrastructure section of index.ts

### Task 2: Runner Startup Warning and Setup Integration
- Added provider availability check in `runner.ts` after startup reconciliation, before main loop
- Non-blocking: logs warning to stderr if configured provider mode mismatches detected providers
- Skips warning when detection fails entirely (avoids false positives)
- Added auto-trigger of `pilot init` at end of `setupCommand()` when no config.json exists
- Only triggers in interactive mode (not JSON mode)

### Task 3: Tests
- 22 tests for `providers.ts`: stdout parsing, mode filtering, default selection, detectProviders with mock execa, checkProviderAvailability for all mismatch scenarios
- 6 tests for `init.ts`: --yes creates config with correct structure, valid JSON, 0o600 permissions, early return on existing config, --force overwrite, directory creation
- Fixed `runner-lock.test.ts` to include `getConfigFileDefaults` in config.js mock and add providers.js mock (regression from runner.ts integration)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] runner-lock.test.ts mock missing getConfigFileDefaults**
- **Found during:** Task 3 verification
- **Issue:** Adding provider check to runner.run() means it now imports getConfigFileDefaults, which the runner-lock test mock didn't include
- **Fix:** Added getConfigFileDefaults to config.js mock and providers.js mock in runner-lock.test.ts
- **Files modified:** test/core/runner-lock.test.ts
- **Commit:** 5e34ad7

## Verification Results

- `npx tsc --noEmit` — passes with no type errors ✓
- `npx vitest run test/core/providers.test.ts test/commands/init.test.ts` — 28/28 tests pass ✓
- `npx vitest run` — 516/519 pass (3 pre-existing failures from local config file overriding defaults in config.test.ts and db.test.ts) ✓
- `node dist/index.js init --help` — shows command with --yes and --force flags ✓
