# Overnight Fixes — Critical Issues

## Problem
Several critical issues prevent pilot from being demo-ready:
1. `status` and `stuck` commands hang because `sessions.ts` calls `claude` binary (should be `opencode`)
2. `sessions.ts` uses `claude session list --format json` and `claude export` — opencode equivalents may differ
3. `init.ts` references `.claude/` directory instead of `.opencode/`
4. `config.ts` searches for `claude` binary in `~/.claude/bin/claude`
5. Progress calculation overflows (pet-portraits=1100%, real-estate-staging=120%)
6. No README.md
7. package.json missing metadata (description, keywords, license, author, repository)

## Goal
All CLI commands work without hanging. Project is presentable with docs.

## Requirements

### Must Have

- [ ] **Fix sessions.ts**: Replace ALL `claude` binary calls with `opencode` equivalents:
  - `claude session list --format json` → `opencode session list --output json` (verify actual opencode CLI flags by running `opencode session --help` or `opencode --help`)
  - `claude export <id>` → whatever opencode uses (may need to check `opencode session export` or similar)
  - If opencode doesn't have session list/export, implement a fallback that reads session data from `~/.local/share/opencode/` directory directly (check what files exist there)
  - Add a 5-second timeout to ALL subprocess calls so they never hang
  - **IMPORTANT**: Test the actual opencode binary at `/home/luca/.opencode/bin/opencode` to see what subcommands it supports

- [ ] **Fix init.ts**: Replace `.claude` directory reference with `.opencode`
  - Line 30: `const claudeDir = path.join(projectDir, '.claude')` → `.opencode`

- [ ] **Fix config.ts**: Update binary detection:
  - Search for `opencode` first, then `claude` as fallback
  - Check `~/.opencode/bin/opencode` instead of `~/.claude/bin/claude`
  - Rename variables from `claude*` to `binary*` or `opencode*`

- [ ] **Fix spawn.ts**: Already handles opencode, but clean up:
  - Remove `~/.claude/bin/claude` from fallback paths (line 249)
  - Remove `claude.json` fallback (line 157) — we only use opencode.json
  - Update error message (line 263-264)

- [ ] **Fix progress calculation**: Cap progress at 100% or fix the math
  - Check `src/core/progress.ts` for the overflow bug
  - If phase count exceeds plan count (e.g. phases added mid-build), handle gracefully

- [ ] **Add README.md** with:
  - Project description (1-2 paragraphs)
  - Quick start (install, setup, basic usage)
  - All commands with brief descriptions
  - Configuration (env vars)
  - Architecture overview (core modules, TUI, queue runner)
  - License: MIT

- [ ] **Fix package.json metadata**:
  ```json
  {
    "description": "Autonomous AI development pipeline CLI — monitors, orchestrates, and manages AI coding agents",
    "keywords": ["ai", "development", "pipeline", "automation", "cli", "opencode"],
    "repository": {
      "type": "git",
      "url": "https://github.com/punchlab-dev/pilot.git"
    },
    "author": "PunchLab <hello@punchlab.dev>",
    "license": "MIT"
  }
  ```

### Nice to Have

- [ ] Add LICENSE file (MIT)
- [ ] Rename all `claude` variable names to `opencode` or `binary` for consistency
- [ ] Add `--timeout` flag to `status` and `stuck` commands

## Technical Notes
- opencode binary is at `/home/luca/.opencode/bin/opencode` — NOT in standard PATH
- The binary may not support `session list` — check `opencode --help` first
- If no session listing is available, the fallback should scan log files in the configured logDir for session info (PID files + log files already give us running sessions)
- Tests in `test/core/sessions.test.ts` mock execa — update mocks to use `opencode` commands
- PATH must include: `/home/luca/.opencode/bin:/home/luca/.local/bin:/home/luca/.local/share/fnm/node-versions/v24.13.0/installation/bin`

## Do NOT
- Remove session functionality entirely — it's used by status, stuck, and log commands
- Change the stuck scoring algorithm — it works correctly
- Modify the TUI dashboard — it works and has tests
- Touch the queue parser or runner — they work
- Add any new dependencies
