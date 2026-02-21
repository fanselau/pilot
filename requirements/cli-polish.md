# CLI Polish — Wire Missing UX + Fix claude References

## Problem
The queue store and daemon infrastructure are solid, but the CLI UX layer we designed wasn't fully wired. Several agreed-upon flags are missing, claude references remain, and there's a dry-run bug.

## Requirements

### Must Have

#### 1. Wire `--next`, `--before`, `--after`, `--depends-on` to `pilot add`
- [ ] `pilot add <project> <req> --next` — insert at top of pending queue (after running/done, before all queued)
- [ ] `pilot add <project> <req> --before <id>` — insert before specific item
- [ ] `pilot add <project> <req> --after <id>` — insert after specific item
- [ ] `pilot add <project> <req> --depends-on <id>` — set dependency
- [ ] All flags registered in `src/index.ts` on the add command
- [ ] `addItem()` in queue-store.ts must support `position` parameter: `{ before?: string, after?: string, next?: boolean }` — use `splice()` instead of `push()` when positioning
- [ ] Error if --before/--after references non-existent ID

#### 2. Wire `--phase` and `--milestone` flags to `pilot add`
- [ ] `pilot add <project> <req> --phase` — explicit phase scope (requires .md file)
- [ ] `pilot add <project> <req> --milestone` — explicit milestone scope (requires directory)
- [ ] Default (no flag) = quick task
- [ ] Remove heuristic scope detection — caller decides
- [ ] `--as` flag kept as alias for backward compat but `--phase`/`--milestone` are preferred

#### 3. Implement `pilot move`
- [ ] `pilot move <id> --next` — move to top of pending
- [ ] `pilot move <id> --before <id>` — reorder before item
- [ ] `pilot move <id> --after <id>` — reorder after item
- [ ] Only works on `queued` items (not running/completed/failed/blocked)
- [ ] Register in src/index.ts under Queue Management group

#### 4. Fix `pilot build` to be synchronous/blocking
- [ ] `pilot build` = add to queue + start runner in `--once` mode + wait for that specific item to complete
- [ ] Print result when done (success/failure)
- [ ] Exit with 0 on success, 1 on failure

#### 5. Complete claude→opencode migration
- [ ] Replace ALL remaining `claude` references in src/ with `opencode`
- [ ] `src/core/doctor.ts` — check for opencode binary, not claude
- [ ] `src/commands/config.ts` — opencode paths, not claude
- [ ] `src/core/sessions.ts` — opencode session commands
- [ ] `src/core/cleanup.ts` — pgrep for opencode only
- [ ] `src/core/setup.ts` — keep `.claude` as legacy fallback detection but prefer `.opencode` everywhere
- [ ] Doctor should report "opencode" not "claude"

#### 6. Fix `add --help` output
- [ ] `pilot add --help` should show only the add command's options, not the full CLI help
- [ ] This is likely a commander.js subcommand registration issue

#### 7. Fix dry-run bug
- [ ] `pilot run --once --dry-run` must NOT consume queue items
- [ ] The E2E test `--dry-run exits 0 and leaves queue unchanged` must pass

#### 8. Fix `pilot add` to show runner status
- [ ] After queuing, print: "Runner active (PID xxx)" or "Runner not active. Start with: pilot run"
- [ ] Check PID file for pilot-runner

### Nice to Have
- [ ] `pilot add --help` shows examples section
- [ ] `pilot queue` shows items with their short IDs prominently

## Technical Notes
- Queue-store `addItem` already supports `dependsOn` — just needs `position` parameter added
- For `--next`: find index of first `queued` item, splice before it
- For `--before`/`--after`: find item by ID, splice at that index
- `pilot move` is basically: remove item from array, re-insert at new position
- Commander.js `--help` issue might be because `add` is registered as a standalone command not a subcommand

## Do NOT
- Break existing tests
- Remove `--as` flag (keep for backward compat)
- Change queue.json schema
- Auto-start daemon from add (we decided against this)
