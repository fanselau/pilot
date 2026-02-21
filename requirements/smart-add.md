# Smart Add — Simple Task Routing

## Problem
Adding work to the pipeline currently requires knowing GSD internals (build-full, add-and-build, run-command). Users shouldn't need to know any of that.

## Goal
One command: `pilot add <project> <description-or-file>`. Default is a quick task. Caller explicitly opts into phase/milestone when needed. Simple, predictable, well-documented.

## The Interface

```bash
# Quick task (default) — just describe what you want
pilot add resume-roast "fix the favicon 404"
pilot add resume-roast "add dark mode toggle"

# Phase — point at a requirements file
pilot add resume-roast requirements/dark-mode.md --phase

# Milestone — point at a directory of requirements
pilot add resume-roast requirements/v2/ --milestone

# Ordering & dependencies
pilot add resume-roast "fix X" --next              # top of queue
pilot add resume-roast "fix Y" --after a3x9        # after specific item
pilot add resume-roast "fix Z" --depends-on a3x9   # wait for item to complete
pilot add resume-roast "fix W" --timeout 30         # kill after 30 min

# Dry run
pilot add resume-roast "fix X" --dry-run
```

## Requirements

### Must Have — Scope (caller decides)

- [ ] **Default = quick task**: String description or file → runs `quick` command. No milestone, no phase overhead. This is the 90% case.
- [ ] **`--phase`**: Requires a requirements .md file as input. Adds a phase to the project's current milestone. Runs plan → execute → verify cycle.
- [ ] **`--milestone`**: Requires a directory of requirements files. Creates a new milestone with multiple phases. Each .md file = one phase.
- [ ] Log the decision: "✓ Queued [a3x9] resume-roast | quick | fix the favicon 404"

### Must Have — Project State Detection

- [ ] **No project directory** → Error: "Project 'x' not found in $PILOT_PROJECT_DIR"
- [ ] **No `.opencode/`** → Auto-run `pilot setup` first, then continue
- [ ] **No `.planning/`** → For `--phase`/`--milestone`: auto-run `pilot init` first
- [ ] **Already queued** → Warn but proceed: "⚠ resume-roast already queued. Adding anyway."
- [ ] **Currently running** → Warn but proceed: "⚠ resume-roast is running. Queuing after completion."

### Must Have — Input Handling

- [ ] **String description** → Pass directly as the task description. Do NOT generate a requirements file from it.
- [ ] **File path** → Validate it exists. For `--phase`: copy to project's `requirements/` if not already there.
- [ ] **Directory path** → Only valid with `--milestone`. Each .md file becomes a phase.

### Must Have — Queue Integration

- [ ] Writes to `~/.pilot/queue.json`
- [ ] Supports: `--next`, `--before <id>`, `--after <id>`, `--depends-on <id>`, `--timeout <minutes>`
- [ ] `--dry-run` shows what would happen
- [ ] Returns the queue item ID
- [ ] Prints runner status: "Runner active (PID xxx)" or "Runner not active. Start with: pilot run"

### Nice to Have

- [ ] `pilot add <project> --from-issue <github-url>` — fetch GitHub issue as description
- [ ] `pilot add <project> --interactive` — asks clarifying questions

## Examples

```bash
$ pilot add resume-roast "fix the favicon 404"
✓ Queued [a3x9] resume-roast | quick | fix the favicon 404
Runner active (PID 12345)

$ pilot add resume-roast requirements/dark-mode.md --phase
✓ Queued [k2m7] resume-roast | phase | Dark Mode
Runner active (PID 12345)

$ pilot add resume-roast requirements/v2/ --milestone
✓ Queued [b4p2] resume-roast | milestone | v2 (4 phases)
Runner not active. Start with: pilot run

$ pilot add resume-roast "urgent fix" --next --timeout 15
✓ Queued [c8n1] resume-roast | quick | urgent fix (top of queue, 15min timeout)
Runner active (PID 12345)
```

## Documentation

The `--phase` and `--milestone` flags must be well-documented in `pilot add --help`:

```
SCOPE:
  (default)      Quick task — small fix or feature, runs immediately
  --phase        Single feature with requirements file, goes through plan→execute→verify
  --milestone    Multi-phase project from a directory of requirements files

ORDERING:
  --next         Insert at top of pending queue
  --before <id>  Insert before specific queue item
  --after <id>   Insert after specific queue item
  --depends-on <id>  Wait for item to complete before starting
  --timeout <min>    Kill if running longer than N minutes (default: 60, 0=no timeout)
```

## Do NOT
- Auto-detect scope from content heuristics — the caller decides
- Generate requirements files from string descriptions — pass strings directly
- Expose GSD modes (build-full, add-and-build, run-command) to the user
- Auto-start the daemon from `add` — daemon is managed separately (systemd / manual `pilot run`)
