# Pilot v2 — Complete Rewrite

## Overview
Pilot v2 is a clean-break rewrite. Delete v1 code, build v2 from scratch. No migration, no compatibility layer.

Read these companion docs for full context:
- `requirements/pilot-v2-architecture.md` — architecture, delegation AI, CLI design
- `requirements/pilot-v2-tui.md` — TUI framework choice (OpenTUI), layouts, navigation

## Phase 1: Nuke & Foundation

### Delete Everything Except
Keep ONLY these files from v1:
- `src/core/config.ts` — project dir config (clean up)
- `src/core/opencode-db.ts` — opencode SQLite reader (extend, don't rewrite)
- `src/core/setup.ts` — project setup (clean up)
- `src/util/` — colors.ts, format.ts, output.ts (clean up)
- `package.json`, `tsconfig.json`, `vitest.config.ts`

### Delete These Entirely
```
src/commands/build.ts, execute.ts, plan.ts, verify.ts, research.ts, quick.ts
src/commands/milestone.ts, init.ts, insert.ts, move.ts, scope.ts, stop.ts
src/commands/import.ts, map.ts, todos.ts, debug.ts
src/core/lifecycle.ts, phase-state.ts, smart-add.ts
src/core/verify-routing.ts, verify-strategies.ts
src/core/queue-parser.ts, process.ts, sessions.ts
src/core/runner-log.ts, postmortem.ts, lock.ts
src/tui/ (entire directory — will rebuild with OpenTUI later)
```

### New SQLite Queue (`~/.pilot/pilot.db`)

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone')),
  description TEXT NOT NULL,
  requirement_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER DEFAULT 0,
  depends_on TEXT REFERENCES jobs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  -- Delegation AI output
  delegation_plan TEXT,  -- JSON array of steps
  current_step INTEGER DEFAULT 0,
  -- Link to opencode
  session_titles TEXT  -- JSON array of opencode session titles for this job
);
```

Generate short IDs: 4 alphanumeric chars (keep from v1, it works).

### New `src/core/db.ts` — Pilot DB

Simple wrapper around better-sqlite3 for pilot.db:
- `getNextPending()` — next job by priority/created_at
- `markRunning(id)`, `markCompleted(id)`, `markFailed(id, error)`
- `cancel(id)`, `retry(id)`
- `getQueue()` — all pending + running
- `getRecent(limit)` — last N completed/failed
- `addJob(project, scope, description, requirementPath?)`
- `updateDelegationPlan(id, plan)`, `advanceStep(id)`
- Auto-create DB + tables on first access

### Extend `src/core/opencode-db.ts`

Add these queries (read-only from opencode's SQLite):
- `getSessionByTitle(title)` — find session by exact title match
- `getSessionMessages(sessionId, since?)` — get messages, optionally after timestamp
- `getLastMessage(sessionId)` — most recent message
- `isSessionActive(sessionId)` — check if session process is alive (from DB state)
- `getSessionTokens(sessionId)` — aggregate token usage from messages
- `getRecentSessions(limit)` — last N sessions with metadata

### New `src/core/delegate.ts` — Delegation AI

The key innovation. Instead of parsing .planning/ with regex, spawn a short cheap AI session to read project state and decide what GSD commands to run.

```typescript
interface DelegationPlan {
  steps: Array<{
    command: string;  // e.g. "quick", "add-phase", "plan-phase", "execute-phase", "verify-phase"
    args: string;     // e.g. "17 --auto"
  }>;
  reasoning: string;
}

async function delegate(job: Job, projectDir: string): Promise<DelegationPlan> {
  // Spawn opencode session with delegation prompt
  // The AI reads .planning/STATE.md + ROADMAP.md + requirement
  // Outputs JSON execution plan
  // Use fast model (configured in pilot config, default: sonnet)
}
```

The delegation prompt should:
1. Read `.planning/STATE.md` and `.planning/ROADMAP.md`
2. Read the requirement file if `job.requirement_path` exists
3. Based on `job.scope`:
   - `quick` → output single step: `{ command: "quick", args: "<full description>" }`
   - `phase` → determine next phase number, output: add-phase → plan-phase → execute-phase → verify-phase
   - `milestone` → output: new-project or new-milestone steps
4. Handle edge cases: blocked phases, incomplete previous work, conflicts
5. Output valid JSON wrapped in ```json``` block

Create a GSD command file for this: `.opencode/command/gsd-delegate.md` that instructs the AI on how to read project state and output the plan.

### New `src/core/runner.ts` — Clean Runner

Simple event loop:
1. Get next pending job from pilot.db
2. Run delegation AI → get execution plan
3. Store plan in job record
4. Execute steps sequentially:
   - Spawn opencode session with `setsid` + stdin ignore
   - Poll opencode DB for session completion (no new messages for 60s + process dead)
   - On completion: advance step counter
5. After all steps: mark job completed
6. On any step failure: mark job failed with step info + error
7. Loop

No PID tracking. No /tmp log files. No process scanning. No lifecycle modes.

Concurrency: configurable max parallel jobs (default 1). Simple semaphore.

Stuck detection: if a session has no new messages for configurable threshold (default 90 min), mark as stuck, optionally kill + retry.

### New CLI Entry Point (`src/index.ts`)

Slim commander setup. Commands:

```
pilot                     → TUI (placeholder for now, just show status)
pilot add <project> <req> [--as quick|phase|milestone] [--next]
pilot status [project]    → one-shot dashboard to stdout
pilot log [id]            → session transcript [--follow] [--last N]
pilot queue               → show queue
pilot cancel <id>
pilot retry <id>
pilot bump <id>           → move to front
pilot setup <dir>
pilot update
pilot doctor
pilot service start|stop|status
pilot gc                  → clean old data
```

### New `src/commands/add.ts`

```typescript
async function addCommand(project: string, requirement: string, opts) {
  const projectDir = resolveProject(project);
  
  // Determine scope
  let scope = opts.as;
  if (!scope) {
    // Auto-detect: file → phase, directory → milestone, string → quick
    if (isFile(requirement)) scope = 'phase';
    else if (isDirectory(requirement)) scope = 'milestone';
    else scope = 'quick';
  }
  
  // Read requirement content if it's a file
  let description = requirement;
  let requirementPath = null;
  if (isFile(requirement)) {
    requirementPath = requirement;
    description = readFileSync(resolve(projectDir, requirement), 'utf8');
    // Extract title from first markdown heading
    const title = description.match(/^#\s+(.+)/m)?.[1] || requirement;
    description = title;  // Short description for display
  }
  
  // Add to queue
  const id = db.addJob(project, scope, description, requirementPath);
  
  // Beautiful output
  console.log(`  ✓ Queued: ${project} · ${scope} · "${description}"  (id: ${id})`);
  console.log(`  Position: ${db.getQueuePosition(id)}`);
  
  // Check if daemon is running
  if (isDaemonRunning()) {
    console.log(`  Daemon: ● running — will pick up automatically`);
  } else {
    console.log(`  Daemon: ○ stopped — run: pilot service start`);
  }
}
```

CRITICAL: When scope is `quick` and the requirement is a file, the FULL FILE CONTENT must be passed as the description/args to gsd-quick. This is what broke v1.

### New `src/commands/status.ts`

Read from both DBs, produce beautiful formatted output per the CLI design in pilot-v2-architecture.md.

### New `src/commands/log.ts`

Read session messages from opencode DB. Format as transcript.
`--follow` mode: poll for new messages every 500ms.
`--last N`: show last N messages.
Smart default: if no ID given, show latest running job's log.

### Dependencies Cleanup

Remove: `ink`, `react`, `@types/react`, `ink-testing-library`, `cli-table3`, `ora`, `proper-lockfile`, `nanoid`, `tree-kill`

Keep: `better-sqlite3`, `commander`, `execa`, `picocolors`, `tsx`, `typescript`, `vitest`

Add: `date-fns` (relative time formatting)

(OpenTUI added in a later phase when TUI is built)

## Phase 2: TUI (Later — separate requirement)

Not in this build. Focus on CLI + runner + delegation AI first. The CLI `pilot status` output is the initial interface. TUI comes after core is solid.

## Do NOT
- Keep any v1 lifecycle code (lifecycle.ts, phase-state.ts, smart-add.ts)
- Keep any v1 monitoring code (process.ts, sessions.ts, runner-log.ts)
- Keep the JSON queue (queue-store.ts, queue-parser.ts)
- Keep the Ink TUI (entire src/tui/ directory)
- Add compatibility with v1 queue.json
- Parse .planning/ files with regex — that's what delegation AI is for
- Over-engineer the runner — it's a simple loop
- Add features not listed here — ship the core, iterate later
