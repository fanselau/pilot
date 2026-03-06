---
phase: "quick-072"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/providers.ts
  - src/commands/init.ts
  - src/index.ts
  - src/commands/setup.ts
  - src/core/runner.ts
autonomous: true
must_haves:
  truths:
    - "detectProviders() runs opencode models and returns set of provider prefixes"
    - "pilot init creates interactive config with detected providers filtering mode options"
    - "pilot init writes valid ~/.pilot/config.json with selected values"
    - "Runner startup logs warning if configured provider mode is not available"
    - "pilot setup triggers init if config.json missing"
    - "Graceful fallback when opencode models fails"
  artifacts:
    - path: "src/core/providers.ts"
      provides: "detectProviders function"
    - path: "src/commands/init.ts"
      provides: "pilot init interactive command"
    - path: "src/index.ts"
      provides: "init command registration"
  key_links:
    - from: "src/commands/init.ts"
      to: "src/core/providers.ts"
      via: "import detectProviders"
      pattern: "detectProviders"
    - from: "src/commands/setup.ts"
      to: "src/commands/init.ts"
      via: "triggers init if no config"
      pattern: "initCommand"
---

<objective>
Implement smart config initialization with auto-detect available providers.

Purpose: Let users run `pilot init` to interactively create ~/.pilot/config.json with provider-aware defaults, and warn at runner startup if configured provider mode doesn't match available providers.

Output: New provider detection module, interactive init command, setup integration, runner startup warning.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/config.ts — loadConfigFile(), getConfigFileDefaults(), config file resolution
@src/core/delegate.ts — resolveOpencodeBinary() at line 243
@src/core/types.ts — ConfigFileSchema, ProviderMode type
@src/commands/config.ts — getDefaultConfigFileContent(), configInitCommand() as reference
@src/commands/setup.ts — setupCommand() where init integration goes
@src/core/runner.ts — run() method at line 226 for startup warning location
@src/index.ts — command registration patterns
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create provider detection module and init command</name>
  <files>
    src/core/providers.ts
    src/commands/init.ts
    src/index.ts
  </files>
  <action>
**1. Create `src/core/providers.ts`:**

Create a `detectProviders()` function that:
- Imports `resolveOpencodeBinary` from `./delegate.js` and `execa` from `execa`
- Runs `opencode models` via execa with a 10-second timeout
- Parses stdout lines, extracting provider prefixes before the `/` in model IDs (e.g., `anthropic/claude-sonnet-4-6` → `anthropic`, `openai/gpt-4o` → `openai`)
- Returns `{ providers: Set<string>, hasAnthropic: boolean, hasOpenai: boolean }`
- On ANY failure (timeout, not installed, non-zero exit), returns `{ providers: new Set(), hasAnthropic: false, hasOpenai: false }`
- Export a `getAvailableModes()` function that takes the detection result and returns filtered `ProviderMode[]`: if both anthropic+openai → `['hybrid', 'claude-only', 'openai-only']`, only anthropic → `['claude-only']`, only openai → `['openai-only']`, neither → `['claude-only']` (fallback)
- Export a `getDefaultMode()` function that takes detection result and returns the recommended default: both → `'hybrid'`, only anthropic → `'claude-only'`, only openai → `'openai-only'`, neither → `'claude-only'`
- Export a `checkProviderAvailability(mode: ProviderMode)` async function that runs detectProviders() and returns `{ available: boolean, warning: string | null }`. If mode is `openai-only` but no openai detected, warning = `'⚠ Provider mode openai-only selected but OpenAI models not detected in opencode. Run: pilot init to reconfigure.'`. Similarly for other mismatches. If mode is `claude-only` and no anthropic detected, also warn. If `hybrid` and missing either, warn about the missing one.

**2. Create `src/commands/init.ts`:**

Create a `pilot init` command using Node.js built-in `readline` (no new deps) for interactive prompts:

```typescript
import readline from 'node:readline';
```

Create a helper `ask(rl, question, options?, defaultValue?)` that prompts and validates input.

The `initCommand(opts: { yes?: boolean })` function flow:
1. Check if `~/.pilot/config.json` exists. If yes, print yellow warning: "Config file already exists: {path}. Use 'pilot config edit' to modify or run 'pilot init --force' to recreate." and return (unless `--force` option is provided).
2. Print header: "Pilot Configuration Setup"
3. Call `detectProviders()` with a spinner message: "Detecting available providers..."
4. Display detected providers: "Detected providers: anthropic, openai" or "No providers detected (opencode models unavailable)" in dim
5. Get available modes via `getAvailableModes(detection)` and default mode via `getDefaultMode(detection)`
6. If `--yes` flag: use all auto-detected defaults, skip interactive prompts
7. Otherwise, prompt interactively:
   - **Provider mode**: Show only available modes as numbered options (e.g., `[1] hybrid (default)  [2] claude-only  [3] openai-only`). Accept number or name. Default to getDefaultMode().
   - **Model profile**: `[1] quality  [2] balanced (default)  [3] budget`. Default to `balanced`.
   - **Project directory**: Default to `~/dev`. Accept any path.
8. Build config object using the structure from `getDefaultConfigFileContent()` in config.ts (import it or replicate the shape), setting `defaults.providerMode`, `defaults.modelProfile`, and `projectDir`
9. Create `~/.pilot/` dir if needed (`mkdirSync recursive`)
10. Write config.json with `JSON.stringify(config, null, 2)`, chmod 0o600
11. Print summary:
    ```
    ✓ Config written to ~/.pilot/config.json
    
      Provider mode:  hybrid
      Model profile:  balanced
      Project dir:    ~/dev
    
    Run 'pilot config' to see full resolved configuration.
    ```

Add `--force` flag to allow overwriting existing config.

**3. Register in `src/index.ts`:**

Add `pilot init` as a top-level command (NOT under `config` subgroup) since it's a first-run experience:
```typescript
program
  .command('init')
  .description('Interactive first-time configuration setup')
  .option('--yes', 'Accept auto-detected defaults without prompting')
  .option('--force', 'Overwrite existing config file')
  .action(async (opts) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(opts);
  });
```

Place it in the Infrastructure section, near `setup`.
  </action>
  <verify>
    Run `npx tsc --noEmit` to verify no type errors.
    Run `node dist/index.js init --help` shows init command with --yes and --force flags.
  </verify>
  <done>
    detectProviders() exists and handles opencode models output parsing + failure gracefully.
    pilot init command registered and shows interactive flow.
    --yes flag creates config with auto-detected defaults non-interactively.
  </done>
</task>

<task type="auto">
  <name>Task 2: Runner startup warning and setup integration</name>
  <files>
    src/core/runner.ts
    src/commands/setup.ts
  </files>
  <action>
**1. Add runner startup provider check in `src/core/runner.ts`:**

In the `run()` method, after the startup reconciliation block (around line 358, after the "clean orphaned PID files" block ends ~line 388), BEFORE the main `while (this.running)` loop at line 391, add:

```typescript
// ── Startup: check provider mode availability ─────────────────────
{
  const { checkProviderAvailability } = await import('./providers.js');
  const { getConfigFileDefaults } = await import('./config.js');
  const defaults = getConfigFileDefaults();
  const { warning } = await checkProviderAvailability(defaults.providerMode);
  if (warning) {
    process.stderr.write(`${warning}\n`);
  }
}
```

This is a non-blocking warning only — does NOT prevent job execution.

**2. Integrate init into setup in `src/commands/setup.ts`:**

At the end of `setupCommand()`, after the successful setup output (after line 96, before the final `}`), add a check:

```typescript
// Trigger init if no config file exists
const { existsSync } = await import('node:fs');
const { join } = await import('node:path');
const { homedir } = await import('node:os');
const configPath = join(homedir(), '.pilot', 'config.json');
if (!existsSync(configPath) && !isJsonMode()) {
  outputHuman('');
  outputHuman(dim(`  No config file found. Running initial configuration...`));
  outputHuman('');
  const { initCommand } = await import('./init.js');
  await initCommand({});
}
```

Import `isJsonMode` is already imported. Import `dim` is already imported.
This only triggers for interactive (non-JSON) mode and only when config doesn't exist.
  </action>
  <verify>
    Run `npx tsc --noEmit` to verify no type errors.
    Grep runner.ts for `checkProviderAvailability` to confirm integration.
    Grep setup.ts for `initCommand` to confirm integration.
  </verify>
  <done>
    Runner logs warning on startup if provider mode is misconfigured (non-blocking).
    pilot setup triggers init automatically when no config.json exists.
    Neither blocks execution — warnings only.
  </done>
</task>

<task type="auto">
  <name>Task 3: Tests for provider detection and init command</name>
  <files>
    test/core/providers.test.ts
    test/commands/init.test.ts
  </files>
  <action>
**1. Create `test/core/providers.test.ts`:**

Test the provider detection module:
- `detectProviders()` parses multi-line output with `anthropic/claude-sonnet-4-6`, `openai/gpt-4o` → `hasAnthropic: true, hasOpenai: true`
- `detectProviders()` returns empty set on execa timeout/failure (mock execa to throw)
- `getAvailableModes()` returns correct filtered modes:
  - both providers → `['hybrid', 'claude-only', 'openai-only']`
  - anthropic only → `['claude-only']`
  - openai only → `['openai-only']`
  - neither → `['claude-only']`
- `getDefaultMode()` returns correct defaults:
  - both → `'hybrid'`
  - anthropic only → `'claude-only'`
  - openai only → `'openai-only'`
  - neither → `'claude-only'`
- `checkProviderAvailability('openai-only')` with no openai → returns warning string
- `checkProviderAvailability('claude-only')` with anthropic available → returns null warning

Mock `execa` and `resolveOpencodeBinary` to avoid real subprocess calls. Use `vi.mock()` for the execa module and delegate module.

For detectProviders, the key thing to test is the PARSING logic. Mock execa to return known stdout and verify the Set<string> result. Example mock output:
```
anthropic
  anthropic/claude-sonnet-4-6
  anthropic/claude-haiku-3.5
openai
  openai/gpt-4o
  openai/o3-mini
```

**2. Create `test/commands/init.test.ts`:**

Test the init command behavior:
- With `--yes` flag: creates config.json at expected path with auto-detected defaults (mock detectProviders)
- Respects existing config file (returns early without overwrite unless `--force`)
- With `--force`: overwrites existing config
- Written config has valid JSON with expected structure (defaults.providerMode, defaults.modelProfile, projectDir)
- Config file has 0o600 permissions

Use temp directories (via `os.tmpdir()`) and set `PILOT_CONFIG_FILE` env var to redirect writes.
Mock `detectProviders` to return controlled results.
For interactive tests, mock readline or just test the `--yes` code path which is non-interactive.

Follow the test patterns established in `test/core/config.test.ts` for env var overrides and temp file usage.
  </action>
  <verify>
    Run `npx vitest run test/core/providers.test.ts test/commands/init.test.ts` — all tests pass.
    Run `npx tsc --noEmit` — no type errors.
  </verify>
  <done>
    Provider detection parsing is tested with mocked subprocess output.
    Mode filtering and default selection logic is tested for all provider combinations.
    Init command --yes path creates valid config file.
    Existing config guard and --force override are tested.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no type errors
- `npx vitest run test/core/providers.test.ts test/commands/init.test.ts` — all tests pass
- `npx vitest run` — full test suite passes (no regressions)
- `node dist/index.js init --help` shows command with --yes and --force options
- `node dist/index.js init --yes` creates config in non-interactive mode
</verification>

<success_criteria>
- detectProviders() parses opencode models output into provider set, handles failures gracefully
- pilot init creates interactive config with provider-filtered mode options
- --yes flag enables non-interactive mode with auto-detected defaults
- Runner logs non-blocking warning on startup for misconfigured provider mode
- pilot setup triggers init when config.json doesn't exist
- All new code has test coverage
</success_criteria>

<output>
After completion, create `.planning/quick/072-implement-smart-config-initialization-wi/072-SUMMARY.md`
</output>
