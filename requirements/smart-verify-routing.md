# Smart Verify Routing

## Problem

`verify-auto` currently assumes every project is a web app and tries to run browser-based UAT. For non-web projects (markdown-only repos like pilot-gsd, pure libraries, CLI tools without HTTP), this causes:

1. Agent correctly identifies "nothing to browser-test" but sits idle for 60+ min
2. Gets killed, retried 3x, entire build marked FAIL
3. Runner re-enters verify loop on re-queue — no escape without manual intervention
4. Human has to kill processes, edit STATE.md, edit ROADMAP.md, switch to run-command mode

This happened 3+ times on pilot-gsd during a single build session (2026-02-20).

## Goal

Pilot detects project type and routes verification to the appropriate strategy. Non-web projects get file-content verification, not browser UAT.

## Requirements

### Must Have
- [ ] Project type detection based on available signals:
  - Has `dev` script in package.json that starts a server → web project → browser UAT
  - Has HTML/JSX/TSX route files → web project → browser UAT
  - Has only markdown/JSON/config files → non-web → file-content verification
  - Has CLI entry point but no server → CLI project → run commands and check output
  - Heuristic: if `grep -r 'localhost\|:3000\|:8080\|vite\|next\|remix' package.json` → web
- [ ] File-content verification for non-web projects:
  - Run grep-based checks from ROADMAP success criteria
  - Validate YAML frontmatter parses correctly (for agent/command files)
  - Check that expected files exist and aren't stubs
  - Run any test suite if `npm test` / `vitest` exists
- [ ] CLI verification for CLI projects:
  - Build (`npm run build`)
  - Run `--help` and check exit code
  - Run test suite
  - Check that binary is executable
- [ ] `pilot verify` command accepts `--strategy auto|browser|file|cli` flag
- [ ] When `--strategy auto` (default), detect and log which strategy was chosen

### Must Have (Runner)
- [ ] If verify fails 3x with "not applicable" or "no web UI" in log content → auto-skip verify, mark phase as "verified-manually", continue to next phase
- [ ] Log: "Skipping browser verify for non-web project, using file-content verification"
- [ ] Never loop on verify for the same phase more than 3 attempts total (across all strategies)

### Nice to Have
- [ ] Per-project config: `.pilot/config.json` with `verifyStrategy: "browser" | "file" | "cli" | "auto"`
- [ ] Combine strategies: run file-content checks THEN browser if applicable
- [ ] Report format consistent across strategies (pass/fail/issues with counts)

## Technical Notes
- This integrates with the smart-tail requirement (detecting "not applicable" in logs)
- verify-auto is a GSD command, but pilot's runner can pre-screen and choose strategy before spawning
- File-content verification can be done by pilot directly (grep, fs checks) — no need to spawn an opencode agent for it
- For pilot-gsd specifically: grep for remaining `~/.claude/`, `/gsd:`, missing `model:` fields, `AskUserQuestion` in tools — all mechanical checks

## Do NOT
- Remove browser-based UAT — it's the right strategy for web projects
- Make project type detection overly complex — simple heuristics are fine
- Require manual project type annotation — auto-detect with override option
