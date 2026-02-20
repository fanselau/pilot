# Finishing Touches — Polish, DX, and Production Readiness

## Problem

Pilot's core features are built but it's not production-ready. Missing quality-of-life features, no health checks, no notifications, no global install, and several untested paths. These are the final touches to make pilot a real tool you'd actually want to use daily.

## Requirements

### 1. `pilot doctor` — Health Check Command
- [ ] Validates entire setup in one command:
  - opencode binary found and executable
  - PILOT_GSD_DIR exists and has agent/command/workflow files
  - Symlinks in project `.opencode/` dirs are valid (not broken)
  - git gc.auto=0 on all snapshot repos (`~/.local/share/opencode/snapshot/*/` AND `snapshot/global/`)
  - Enough free RAM (warn if <2GB available)
  - No zombie/orphaned opencode processes
  - No stale PID files (PID file exists but process dead)
  - QUEUE file readable
  - `~/.pilot/` directory exists and writable
- [ ] Output: green checkmarks for pass, red X for fail, fix suggestions
- [ ] `pilot doctor --fix` auto-fixes what it can (kill zombies, remove stale PIDs, set gc.auto=0)
- [ ] `pilot doctor --json` for machine consumption

### 2. Notifications on Build Complete/Fail
- [ ] Config: `~/.pilot/config.json` with notification settings:
  ```json
  {
    "notifications": {
      "enabled": true,
      "on": ["complete", "fail", "stuck"],
      "webhook": "https://...",
      "telegram": { "botToken": "...", "chatId": "..." }
    }
  }
  ```
- [ ] When a queue item completes → send notification with project name, duration, commit count
- [ ] When a queue item fails → send notification with project name, error, last log lines
- [ ] When stuck detected → send notification with process details and stuck score
- [ ] Start simple: just webhook POST. Telegram nice-to-have.
- [ ] `pilot run --notify` flag to enable even without config
- [ ] `pilot run --quiet` flag to suppress all notifications

### 3. Runner Log
- [ ] `pilot run` writes its own log to `~/.pilot/logs/runner-<date>.log`
- [ ] `pilot log runner` shows the runner log (not just session logs)
- [ ] `pilot tail runner` live-follows the runner log
- [ ] Log rotation: keep last 7 days of runner logs

### 4. Global Install
- [ ] `npm link` support: `cd ~/dev/punchlab/pilot && npm link` → `pilot` available globally
- [ ] Or: install script that creates `~/.local/bin/pilot` symlink to `dist/index.js`
- [ ] `pilot --version` works from anywhere
- [ ] Document in README: "Install: `npm link` or `ln -s $(pwd)/dist/index.js ~/.local/bin/pilot`"
- [ ] `bin` field in package.json pointing to dist/index.js

### 5. Setup Validation
- [ ] After `pilot setup <dir>`, verify all symlinks resolve to actual files
- [ ] If pilot-gsd dir has no agents/*.md → error with clear message
- [ ] If `.opencode/` already exists with real files (not symlinks) → warn and ask before overwriting
- [ ] `pilot setup --verify <dir>` re-checks existing setup without modifying

### 6. `pilot cleanup` — Maintenance Command
- [ ] Remove stale PID files (PID file exists but process dead)
- [ ] Remove old log files (older than `--keep-days`, default 7)
- [ ] Kill orphaned opencode processes (running but not tracked by any queue item)
- [ ] Remove empty/broken log files
- [ ] `pilot cleanup --dry-run` shows what would be cleaned
- [ ] `pilot cleanup --all` aggressive mode (also cleans history, old queue entries)

### 7. TUI Smoke Test
- [ ] Verify `pilot tui` actually launches without crashing
- [ ] Test with real data: running processes, queue items, completed items
- [ ] Test keyboard navigation: q quit, arrows select, Enter expand
- [ ] Fix any rendering issues found
- [ ] Add `--no-tui` fallback flag to `pilot run` for running in dumb terminals

### 8. Cross-Project Parallel Builds
- [ ] Integration test: queue 2+ different projects, verify they run in parallel
- [ ] Same-project items must run sequentially (already spec'd, verify it works)
- [ ] `pilot status` shows all parallel sessions correctly
- [ ] `pilot stuck` checks all parallel sessions
- [ ] Max parallel respects `--max-parallel` flag

## Technical Notes
- `pilot doctor` can reuse existing checks from `preSpawnChecks` in spawn.ts
- Notifications: start with a simple `fetch()` to a webhook URL. Don't over-engineer.
- Global install: package.json `"bin": { "pilot": "./dist/index.js" }` + `npm link` is the standard Node way
- Runner log: just `fs.appendFileSync` to a datestamped file, same format as console output
- Cleanup: scan `/tmp/gsd-*.log` and `~/.pilot/logs/` for old files

## Do NOT
- Add complex notification systems (Slack, Discord, email) — webhook is enough for v1
- Make `pilot doctor` slow — it should complete in <2 seconds
- Auto-clean without `--force` or `--dry-run` first run
- Break the existing CLI interface — these are additions, not changes
