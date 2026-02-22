# Pilot v2 — Architecture Redesign

## The Problem

Pilot v1 has three layers that don't compose well:

1. **opencode** — SQLite DB with all sessions, messages, tool calls. The real ground truth.
2. **pilot-gsd** — Markdown workflows in `.planning/`. GSD commands orchestrate AI agents.
3. **pilot CLI** — Queue runner + monitoring. Maintains shadow state (JSON queue, PID files, /tmp logs, process scanning) that duplicates or contradicts the real sources.

### Specific Failures
- `pilot log` / `pilot tail` read /tmp files instead of opencode DB → empty or stale
- `pilot status` scans PIDs + JSON history instead of querying sessions → incomplete
- `add-and-build` has a broken skip heuristic (`shouldSkipAddPhase` matches first keyword in ROADMAP) → silently skips work
- `build-full` rejects existing projects → can't add features
- `quick` mode loses requirement context (passes title, not content)
- verify retries have no separate cap → runs 10x
- Runner tracks processes via PID polling → fragile, misses completions

## The Design

### Principle: Pilot is a thin orchestration layer

```
┌─────────────────────────────────────────────┐
│                  pilot CLI                   │
│  Queue (SQLite) → Spawn → Monitor → Report  │
└──────────┬──────────────────┬───────────────┘
           │                  │
     ┌─────▼─────┐    ┌──────▼──────┐
     │  opencode  │    │  pilot-gsd  │
     │  (SQLite)  │    │ (.planning) │
     │  sessions  │    │  workflows  │
     │  messages  │    │  phases     │
     │  parts     │    │  STATE.md   │
     └───────────┘    └─────────────┘
```

**Pilot owns:** the queue, delegation AI, spawning, monitoring, CLI UX
**opencode owns:** session state, logs, messages (the ground truth DB)
**pilot-gsd owns:** project structure, phases, planning artifacts (.planning/ markdown)
**delegation AI owns:** reading .planning/ and deciding what GSD commands to run (replaces all manual .planning/ parsing)

### Queue: SQLite (not JSON)

Replace `~/.pilot/queue.json` with `~/.pilot/pilot.db`:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,           -- short human-typeable ID
  project TEXT NOT NULL,
  scope TEXT NOT NULL,            -- 'quick' | 'phase' | 'milestone'
  description TEXT NOT NULL,      -- what to do (full text, not title)
  requirement_path TEXT,          -- optional path to .md file
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  priority INTEGER DEFAULT 0,
  depends_on TEXT,                -- job ID dependency
  session_id TEXT,                -- opencode session ID (set on spawn)
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3
);

CREATE TABLE job_history (
  -- same schema, for completed/failed jobs moved out of active
);
```

**Why SQLite:** Atomic, queryable, no file locking issues, trivial to join with opencode DB.

### CLI: `pilot add --as <scope>` as primary interface

```
pilot add <project> <requirement> [--as quick|phase|milestone]
```

**That's it.** One command to queue work.

- `<requirement>` can be:
  - A file path (`requirements/feature.md`) → reads content, stores in description
  - A string description (`"Add dark mode support"`)
  - A directory (`requirements/v2/`) → milestone scope

**Scope detection (when `--as` omitted):**
- File path → phase (one feature = one phase)
- Directory with multiple .md files → milestone
- Short string (<200 chars, no file match) → quick
- User can always override with `--as`

**When `--as` is given, trust it.** No "smart" detection that silently overrides.

### Scope → GSD Command Mapping

Each scope maps to a deterministic GSD workflow:

| Scope | GSD Flow | What happens |
|-------|----------|-------------|
| `quick` | `gsd-quick "$description"` | Single session, 1-3 tasks, commits directly |
| `phase` | `gsd-add-phase "$description"` → `gsd-plan-phase $N --auto` → `gsd-execute-phase $N` → `gsd-verify-phase $N` | Full lifecycle: add phase, plan, execute, verify |
| `milestone` | `gsd-new-milestone` or `gsd-new-project --auto @file` | Multi-phase: creates roadmap from requirement dir |

**No more `build-full` / `continue` / `continue-all` / `add-and-build` / `run-command`.** Those are implementation details that leaked into the interface. The user thinks in scopes, not lifecycle modes.

### Runner: Delegate + Spawn + Poll

```typescript
class Runner {
  async run() {
    while (true) {
      const job = await db.getNextPendingJob();
      if (!job) { await sleep(5000); continue; }
      await this.launch(job);
    }
  }

  async launch(job: Job) {
    await db.markRunning(job.id);
    
    // 1. Delegation AI reads .planning/ and decides what GSD commands to run
    const plan = await this.delegate(job);
    
    // 2. Execute each step as a separate opencode session
    for (const step of plan.steps) {
      const title = `${job.project}-${step.command}-${job.id}`;
      await this.spawnAndWait(job.projectDir, step.command, step.args, title);
    }
    
    await db.markCompleted(job.id);
  }

  async spawnAndWait(cwd: string, command: string, args: string, title: string) {
    // Spawn detached opencode session
    const proc = spawn('opencode', [
      'run', '--format', 'default', '--title', title,
      '--command', `gsd-${command}`, args
    ], { cwd, stdin: 'ignore', detached: true });
    proc.unref();
    
    // Poll opencode's SQLite DB for session completion
    while (true) {
      const session = opencode.getSessionByTitle(title);
      if (session && this.isSessionDone(session)) return session;
      await sleep(5000);
    }
  }
  
  isSessionDone(session): boolean {
    // Session is done when: process is dead AND no new messages for 60s
    // Read from opencode DB — no PID tracking needed
    const lastMsg = opencode.getLastMessage(session.id);
    const ageMs = Date.now() - new Date(lastMsg.created_at).getTime();
    const processAlive = opencode.isSessionActive(session.id);
    return !processAlive && ageMs > 60_000;
  }
}
```

**No PID tracking. No /tmp log files. No process table scanning. No .planning/ parsing.**

Three things happen: delegate → spawn → poll DB. That's the whole runner.

### The Delegation AI: No More .planning Parsing

**Core insight:** Every time pilot tries to parse `.planning/` (find phase numbers, check summaries, detect state), it breaks. These are markdown files written by AI — let AI read them.

Replace ALL `.planning/` parsing with a **delegation AI session**:

```
pilot add hub "Add dark mode" --as phase
```

The runner doesn't parse anything. It spawns a **delegation session** — a short, cheap AI call that:

1. Reads `.planning/STATE.md`, `ROADMAP.md`, and the requirement
2. Decides what GSD commands to run and in what order
3. Outputs a structured execution plan (JSON)

```typescript
// The delegation prompt
const prompt = `
You are the Pilot delegation AI. Your job is to read the project's .planning/ 
state and decide what GSD commands to run for this job.

Job: ${job.scope} scope — "${job.description}"
Project: ${job.project} at ${projectDir}

Read these files:
- .planning/STATE.md
- .planning/ROADMAP.md  
- The requirement: ${job.requirement_path || 'inline: ' + job.description}

Based on the current state, output a JSON array of steps:

\`\`\`json
{
  "steps": [
    { "command": "gsd-add-phase", "args": "Add dark mode support" },
    { "command": "gsd-plan-phase", "args": "17 --auto" },
    { "command": "gsd-execute-phase", "args": "17" },
    { "command": "gsd-verify-phase", "args": "17" }
  ],
  "reasoning": "Phase 16 is complete. Adding as phase 17. No blockers."
}
\`\`\`

Rules:
- For 'quick' scope: single step — gsd-quick with the full description
- For 'phase' scope: add-phase → plan → execute → verify (determine phase number from ROADMAP)
- For 'milestone' scope: new-project or new-milestone as appropriate
- If the project needs something else first (e.g. unfinished phase blocking), say so
- If the requirement file exists, include "Read {path} for full details" in the args
- Be precise about phase numbers — read ROADMAP.md to determine the next one
`;
```

The delegation AI is:
- **Cheap:** One short session, reads a few files, outputs JSON. Use a fast model (Sonnet).
- **Accurate:** It actually understands the markdown context instead of regex-matching
- **Flexible:** Can handle edge cases (incomplete phases, blocked work, reordering)
- **Self-healing:** If STATE.md is messy, the AI can still figure out intent

The runner then executes the steps sequentially, spawning real opencode sessions for each GSD command.

```typescript
class Runner {
  async launch(job: Job) {
    // Step 1: Delegation AI decides what to do
    const plan = await this.delegate(job);
    
    // Step 2: Execute each step as a separate opencode session
    for (const step of plan.steps) {
      const sessionTitle = `${job.project}-${step.command}-${job.id}`;
      await this.spawnAndWait(job.projectDir, step.command, step.args, sessionTitle);
    }
    
    await db.markCompleted(job.id);
  }
  
  async delegate(job: Job): Promise<ExecutionPlan> {
    // Short AI session that reads .planning/ and outputs JSON steps
    // Uses cheap model (Sonnet), takes ~10-30 seconds
    const sessionTitle = `${job.project}-delegate-${job.id}`;
    await this.spawnAndWait(job.projectDir, 'delegate', delegationPrompt, sessionTitle);
    
    // Read the delegation output from opencode DB
    const messages = opencode.getSessionMessages(sessionTitle);
    return parseExecutionPlan(messages);
  }
}
```

**This kills:**
- `shouldSkipAddPhase` (the AI reads ROADMAP and decides)
- `getLastPhase` / `findPhaseDir` / `countSummaryFiles` (AI reads .planning/)
- `phase-state.ts` entirely (AI replaces all of it)
- All lifecycle mode routing (delegation AI handles all scopes uniformly)
- The `LIFECYCLE_MODES` set and `launchLifecycleMode` function

**This enables:**
- Smart recovery: "Phase 15 execution failed on plan 3. Re-running execute-phase 15 to continue."
- Context-aware decisions: "Requirement overlaps with phase 14. Suggest quick task instead."
- Natural language status: delegation AI can also power `pilot status` with project-aware summaries

### Phase scope: Delegation handles it

```
User: pilot add hub "Add dark mode" --as phase

Runner:
  1. Spawns delegation AI (Sonnet, ~15s)
  2. Delegation reads .planning/, outputs:
     [add-phase "Add dark mode", plan-phase 17 --auto, execute-phase 17, verify-phase 17]
  3. Runner executes each step as opencode session
  4. Each step completion detected via opencode DB polling
  5. Job marked complete
```

No parsing. No regex. No `shouldSkipAddPhase`. The AI reads the project state and makes the call.

### Monitoring: Read from opencode DB

```
pilot status          → query opencode DB for active sessions + pilot DB for queue
pilot log <session>   → query opencode DB message table, format transcript
pilot tail <session>  → poll opencode DB message table, stream new messages
pilot stuck           → query opencode DB for sessions with no new messages > threshold
```

All monitoring reads from opencode's SQLite. No parallel state.

**Session identification:** Pilot sets `--title` when spawning. Title format: `{project}-{scope}-{step}-{jobId}`. Query by title prefix to find all sessions for a job.

### TUI: Optional, reads from DBs

The TUI becomes a real-time dashboard reading from two DBs:

```
┌─ Queue ──────────────────────────────┐
│ pending: 3  running: 1  today: 5     │
│                                      │
│ ● hub phase (soft-launch) 12m        │
│   └ step: execute-phase 3            │
│   └ tokens: 45k in / 12k out        │
│   └ last msg: 2s ago                 │
│                                      │
│ ○ pilot quick (fix-log) pending      │
│ ○ hub quick (add-share) pending      │
├─ Recent ─────────────────────────────┤
│ ✓ hub quick (beta-mode) 8m ago       │
│ ✗ pilot phase (db-refactor) failed   │
│   └ error: gsd-execute-phase exit 1  │
└──────────────────────────────────────┘
```

**Data sources:**
- Queue panel → pilot.db
- Running details (tokens, last message) → opencode.db
- Completed/failed → pilot.db + opencode.db

### Daemon: systemd service

```ini
[Unit]
Description=Pilot Queue Runner
After=network.target

[Service]
Type=simple
ExecStart=/home/luca/.local/share/fnm/node-versions/v24.13.0/installation/bin/node /path/to/pilot/dist/runner.js
Restart=always
RestartSec=10
User=luca
Environment=PATH=/home/luca/.local/share/fnm/node-versions/v24.13.0/installation/bin:/usr/local/bin:/usr/bin
WorkingDirectory=/home/luca/dev/punchlab

[Install]
WantedBy=multi-user.target
```

`pilot run` starts the runner in foreground (for TUI). 
`pilot service start/stop/restart` manages the systemd unit.

## Full CLI Surface

### Philosophy
The CLI should feel like `git` — a few core commands you use daily, everything else discoverable.
Beautiful output by default. JSON with `--json`. No walls of text.

### Core Commands (daily use)

```bash
# The main command — queue work
pilot add <project> <requirement> [--as quick|phase|milestone]
pilot add hub requirements/dark-mode.md                    # auto-detects scope
pilot add hub requirements/dark-mode.md --as phase         # explicit scope
pilot add hub "Fix the nav spacing on mobile" --as quick   # inline description
pilot add hub requirements/v2/ --as milestone              # directory = milestone

# Watch everything (default command when you just type `pilot`)
pilot                              # opens TUI dashboard
pilot status                       # one-shot dashboard to stdout (no TUI)
pilot status hub                   # project-specific status

# Follow a job
pilot log <id>                     # full transcript (from opencode DB)
pilot log <id> --follow            # live tail (replaces separate `tail` command)
pilot log <id> --last 20           # last 20 messages
pilot log                          # latest running job (smart default)

# Queue management
pilot queue                        # show queue with status indicators
pilot cancel <id>                  # cancel pending job
pilot retry <id>                   # retry failed job
pilot bump <id>                    # move job to front of queue
```

### Infrastructure Commands (occasional use)

```bash
pilot setup <dir>                  # set up project for pilot (links pilot-gsd)
pilot update                       # update pilot-gsd definitions
pilot doctor                       # health check (opencode binary, DB access, disk, memory)
pilot service start|stop|status    # systemd daemon management
pilot gc                           # clean old sessions, compact DBs
```

### Output Design

Every command should have beautiful, information-dense output:

```bash
$ pilot status

  pilot v2.0.0                                    ● daemon running

  ┌─ Active ──────────────────────────────────────────────────────┐
  │  ● hub  phase  "Add dark mode"         12m  ██████░░░  3/4   │
  │    └─ executing phase 17 • 45k tokens • last msg 3s ago      │
  └──────────────────────────────────────────────────────────────-┘

  ┌─ Queue (2) ───────────────────────────────────────────────────┐
  │  ○ pilot  quick  "Fix log output"                   pending   │
  │  ○ hub    quick  "Add share buttons"                pending   │
  └───────────────────────────────────────────────────────────────┘

  ┌─ Recent ──────────────────────────────────────────────────────┐
  │  ✓ hub    quick  "Beta mode conversion"     8m ago    2m 31s  │
  │  ✗ pilot  phase  "DB refactor"             1h ago    failed   │
  │  ✓ hub    quick  "SEO meta updates"        3h ago      47s   │
  └───────────────────────────────────────────────────────────────┘

$ pilot log abc1

  hub · phase · "Add dark mode" · abc1
  step 3/4: gsd-execute-phase 17 · running 8m · 34k tokens

  ┌─────────────────────────────────────────────────────────────┐
  │ 20:14:02  [assistant] Reading phase 17 plans...             │
  │ 20:14:05  [tool:read] src/styles/theme.ts                  │
  │ 20:14:08  [assistant] Creating dark mode CSS variables...   │
  │ 20:14:12  [tool:edit] src/styles/theme.ts (+42 -3)         │
  │ 20:14:15  [tool:edit] src/components/Layout.tsx (+8 -2)    │
  │ 20:14:22  [assistant] Adding theme toggle component...      │
  │ 20:14:30  [tool:write] src/components/ThemeToggle.tsx       │
  │ 20:14:35  [tool:bash] pnpm tsc --noEmit ✓                  │
  │ ▊                                                           │
  └─────────────────────────────────────────────────────────────┘

$ pilot add hub requirements/dark-mode.md --as phase

  ✓ Queued: hub · phase · "Add dark mode support"  (id: abc1)
  Position: next up (queue empty)
  Daemon: ● running — will pick up automatically

$ pilot queue

  #   project  scope  description                    status
  1   hub      phase  Add dark mode support          ● running (12m)
  2   pilot    quick  Fix log output                 ○ pending
  3   hub      quick  Add share buttons              ○ pending
```

### Colors & Symbols (consistent language)
- `●` running (blue/cyan, animated dot in TUI)
- `○` pending (dim)
- `✓` completed (green)
- `✗` failed (red)
- `◌` cancelled (dim strikethrough)
- Progress bar: `██████░░░` for multi-step jobs
- Timestamps: relative ("3s ago", "12m") not absolute

**Removed from v1:**
- `build`, `execute`, `plan`, `verify`, `research`, `quick` — GSD internals, not user commands
- `run` (replaced by `pilot` for TUI, `pilot service start` for daemon)
- `import`, `init`, `insert`, `move`, `scope`, `stop`, `milestone`, `map`, `todos`, `debug`
- `tail` (merged into `pilot log --follow`)
- `stuck` (delegation AI handles stuck detection, TUI shows it)
- `projects` / `progress` (merged into `pilot status <project>`)

## Migration Path

### Phase 1: Core rewrite (do all at once — clean break)
- New `pilot.db` SQLite for queue
- Delegation AI replaces lifecycle.ts, phase-state.ts, smart-add.ts, verify-routing.ts, verify-strategies.ts
- Runner: delegate → spawn → poll opencode DB
- All monitoring reads opencode DB
- Kill: queue.json, PID files, /tmp logs, process scanning, shouldSkipAddPhase, all lifecycle modes

### Phase 2: CLI surface
- Slim down to the commands listed above
- `pilot add --as` as the primary interface
- `pilot service` for systemd daemon

### Phase 3: TUI refresh
- Read from pilot.db + opencode.db
- Token counts, message previews, delegation reasoning
- Clean, information-dense layout

**No gradual migration.** The current codebase is too tangled with broken abstractions. Clean break, keep the GSD workflows (they work), replace everything in between.

## What Gets Deleted

```
src/core/lifecycle.ts          — replaced by delegation AI
src/core/phase-state.ts        — replaced by delegation AI
src/core/smart-add.ts          — replaced by simple scope detection
src/core/verify-routing.ts     — delegation AI decides when to verify
src/core/verify-strategies.ts  — delegation AI picks strategy
src/core/queue-parser.ts       — replaced by SQLite
src/core/process.ts            — replaced by opencode DB polling
src/core/sessions.ts           — replaced by opencode DB reads
src/commands/build.ts          — gone (lifecycle mode)
src/commands/execute.ts        — gone (lifecycle mode)
src/commands/plan.ts           — gone (lifecycle mode)
src/commands/verify.ts         — gone (lifecycle mode)
src/commands/research.ts       — gone (lifecycle mode)
src/commands/quick.ts          — gone (now just scope=quick via add)
src/commands/milestone.ts      — gone (now just scope=milestone via add)
src/commands/init.ts           — gone
src/commands/insert.ts         — gone
src/commands/move.ts           — gone
src/commands/scope.ts          — gone
src/commands/import.ts         — gone (no more queue.json)
~/.pilot/queue.json            — replaced by ~/.pilot/pilot.db
/tmp/gsd-*.log                 — gone (opencode DB has logs)
/tmp/pilot-runner.log          — gone (systemd journal)
```

~60% of the codebase deleted, replaced by delegation AI + DB reads.

## Do NOT
- Merge phase-state.ts or .planning/ reading into this — that stays as-is
- Change pilot-gsd workflows — they work fine, the problem is how pilot calls them
- Add a web UI — TUI + CLI is the interface
- Over-abstract the scope→command mapping — keep it a simple switch statement
- Build a plugin system — three scopes is enough
