# E2E Test Suite — Full CLI Validation

## Problem
Pilot has 337 unit tests but no end-to-end tests that exercise the actual CLI binary against real filesystem state. Before replacing the bash queue runner, we need confidence that every command works correctly in production conditions.

## Goal
A comprehensive E2E test suite that runs `pilot` as a subprocess against real (but temporary) project directories, queue files, and process states. Every command must be tested. This is the final gate before the switch.

## Requirements

### Must Have

- [ ] E2E test harness: creates temp directories mimicking real project structures (with .planning/, .opencode/, STATE.md, ROADMAP.md, QUEUE.md, etc.)
- [ ] Test helper to run `pilot <command>` as a child process and capture stdout, stderr, exit code
- [ ] Test helper to create fake opencode processes (for stuck/status detection)
- [ ] All monitoring commands tested E2E:
  - [ ] `pilot status` — with 0, 1, 3 running processes
  - [ ] `pilot status --json` — validates full JSON schema
  - [ ] `pilot status --verbose` — shows extended info
  - [ ] `pilot queue` — empty, with items, mixed statuses
  - [ ] `pilot queue --json` — validates schema
  - [ ] `pilot stuck` — no stuck, 1 stuck, threshold flag
  - [ ] `pilot stuck --kill` — actually terminates test process
  - [ ] `pilot log <session>` — valid session, missing session, fuzzy match
  - [ ] `pilot projects` — scans temp dir with multiple projects
  - [ ] `pilot projects --json`
  - [ ] `pilot progress <project>` — project with phases at various states
  - [ ] `pilot config` — shows resolved env vars
  - [ ] `pilot config --json`
- [ ] All queue management commands tested E2E:
  - [ ] `pilot add <project> <requirement>` — creates queue entry
  - [ ] `pilot add --dry-run` — no side effects
  - [ ] `pilot build <project>` — adds + would start runner
  - [ ] `pilot run` — processes at least one queue entry to completion (use a trivial command)
  - [ ] `pilot run --once` — processes one entry then exits
  - [ ] `pilot stop` — stops running runner
- [ ] All lifecycle commands tested E2E (verify they spawn correct opencode commands):
  - [ ] `pilot init <project>` 
  - [ ] `pilot plan <project> <phase>`
  - [ ] `pilot execute <project> <phase>`
  - [ ] `pilot verify <project> <phase>`
  - [ ] `pilot quick <project> "desc"`
  - [ ] `pilot debug <project>`
  - [ ] `pilot research <project> <phase>`
  - [ ] `pilot scope <project> "desc"`
  - [ ] `pilot map <project>`
- [ ] Setup/update commands tested E2E:
  - [ ] `pilot setup <dir>` — creates correct symlinks and config
  - [ ] `pilot setup --verify` — validates existing setup
  - [ ] `pilot update` — pulls pilot-gsd (mock git remote)
- [ ] TUI smoke test:
  - [ ] `pilot tui` starts and renders without crash (exit after 1 frame)
- [ ] Global flags tested:
  - [ ] `--json` on every command that supports it
  - [ ] `--verbose` / `-v` where supported
  - [ ] `--help` on every command
  - [ ] Unknown command shows help
- [ ] Error cases:
  - [ ] Missing project directory
  - [ ] Invalid queue file
  - [ ] No opencode binary found
  - [ ] Permission errors
  - [ ] Concurrent runner lock detection
- [ ] Exit codes validated: 0 for success, 1 for runtime error, 2 for usage error

### Nice to Have

- [ ] Performance benchmarks (status should complete in <2s)
- [ ] `pilot doctor` E2E (once Phase 11 lands)
- [ ] Notification delivery test (once Phase 11 lands)
- [ ] JSON queue migration test (import QUEUE.md → queue.json, once Phase 6 lands)

## Technical Notes

- Use vitest with longer timeouts (E2E can be slow)
- Separate test directory: `test/e2e/`
- Each test creates its own temp dir via `fs.mkdtemp`
- Set PILOT_* env vars to point at temp dirs
- Mock opencode binary with a simple shell script that exits after N seconds
- For `pilot run` E2E: use a queue entry that runs a trivial command (e.g., `echo done`)
- Tests must clean up temp dirs and kill any spawned processes
- Run separately from unit tests: `vitest run --dir test/e2e`

## Do NOT

- Run E2E tests against the real ~/dev directory
- Leave orphaned processes after test failures
- Depend on network access
- Make tests flaky with tight timing assumptions (use generous timeouts)
- Skip error case testing — these are the most important for production confidence
