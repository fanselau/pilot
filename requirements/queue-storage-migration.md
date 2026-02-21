# Queue Storage Migration — From QUEUE.md to JSON

## Problem

The queue is currently a hand-edited markdown file (`QUEUE.md`) with emoji status markers (`🔨`, `✅`, `❌ FAIL:`) parsed by regex. This was acceptable for a bash script but is fundamentally wrong for a real CLI:

- Status tracked via sed find-and-replace on emoji prefixes
- No metadata: no timestamps, no attempt counts, no phase tracking, no history
- Race conditions: concurrent reads/writes with mkdir-based locking
- Fragile: wrong `##` prefix or unicode encoding = invisible to parser
- No dependency tracking (was planned as `depends-on:` in markdown, never built)
- History destroyed: completed/failed items get emoji-prefixed in place, no log

## Goal

Pilot owns its queue as structured JSON. The CLI is the only interface. QUEUE.md goes away.

## Requirements

### Must Have

- [ ] Queue stored as `~/.pilot/queue.json` (global, not per-project)
- [ ] Schema:
  ```json
  {
    "version": 1,
    "items": [{
      "id": "4-char alphanumeric (e.g. a3x9)",
      "project": "string",
      "mode": "build-full | add-and-build | run-command",
      "description": "string",
      "status": "queued | running | completed | failed | blocked",
      "addedAt": "ISO-8601",
      "startedAt": "ISO-8601 | null",
      "completedAt": "ISO-8601 | null",
      "phase": "number | null",
      "attempts": "number",
      "maxAttempts": "number (default 3)",
      "timeoutMinutes": "number | null (default: 60, null = no timeout)",
      "dependsOn": "id | null",
      "error": "string | null",
      "meta": {}
    }],
    "history": [{
      "...same schema...",
      "duration": "seconds"
    }]
  }
  ```
- [ ] `pilot add <project> <mode> [description]` — appends to items array, returns id
- [ ] `pilot add --after <id>` — insert after specific item
- [ ] `pilot add --before <id>` — insert before specific item  
- [ ] `pilot add --next` — insert at top of pending items (after running/done, before all queued)
- [ ] `pilot add --timeout <minutes>` — per-item timeout (kills process if exceeded, marks failed, retries if attempts remain). Default: 60 min. `--timeout 0` = no timeout.
- [ ] `pilot add --depends-on <id>` — set dependency (item waits until dep completes)
- [ ] `pilot remove <id>` — removes queued item (not running)
- [ ] `pilot move <id> --after <id>` — reorder existing item
- [ ] `pilot move <id> --before <id>` — reorder existing item
- [ ] `pilot move <id> --next` — move to top of pending
- [ ] `pilot queue` — renders items table (human-readable), `--json` for raw
- [ ] `pilot queue --history` — shows completed/failed from history array
- [ ] `pilot run` reads from JSON, updates status in-place with proper file locking (`proper-lockfile`)
- [ ] `pilot build <project> [description]` — add + run in one command
- [ ] On completion/failure, item moves from `items` to `history` with duration + error
- [ ] History capped (keep last 100, or last 7 days)

### Dependencies
- [ ] `dependsOn: id` — item waits until dependency completes
- [ ] `dependsOn` across projects: e.g., pilot-gsd must finish before pilot can use it
- [ ] Circular dependency detection on add

### Migration
- [ ] `pilot import <queue.md>` — one-time import from QUEUE.md format
- [ ] After migration, QUEUE.md is no longer read by `pilot run`
- [ ] Clear deprecation warning if QUEUE.md exists and `~/.pilot/queue.json` doesn't

### Nice to Have
- [ ] `pilot queue --watch` — live-updating queue view
- [ ] `pilot queue --compact` — one-line-per-item view with just id + project + status
- [ ] `pilot retry <id>` — re-queue a failed item from history
- [ ] Queue events logged to post-mortem JSONL for analysis
- [ ] `pilot queue --clear-history` — prune history

## Technical Notes

- `proper-lockfile` already in the dependency list (Phase 3 spec)
- Short human-typeable IDs: 4-char lowercase alphanumeric via nanoid with custom alphabet `0123456789abcdefghijklmnopqrstuvwxyz` size 4 (e.g., `a3x9`, `k2m7`). Must be easy to type in CLI flags.
- `~/.pilot/` directory also good for future config, caches, credentials
- Runner state machine (scan → launch → reap) stays the same, just reads JSON instead of parsing markdown
- Items array is the source of truth — no separate PID files needed if we track status here

## Do NOT
- Keep QUEUE.md as a parallel system — one source of truth only
- Store queue per-project — it's a global scheduler
- Use SQLite (overkill for <100 items, JSON is human-debuggable)
- Break `pilot queue --json` contract from Phase 2 (add backward compat fields if needed)
