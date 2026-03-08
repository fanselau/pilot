# Phase 47: AGENTS.md Integration — CLI Commands & Doctor Check - Research

**Researched:** 2026-03-08
**Domain:** CLI command integration, opencode session spawning, doctor health checks
**Confidence:** HIGH

## Summary

This phase adds three CLI features: AGENTS.md generation during `pilot setup`, AI-powered AGENTS.md health checking in `pilot doctor`, and a new `pilot lessons` command. All three spawn opencode sessions using the established pattern (execa → detached process → poll opencode DB for completion).

The codebase has well-established patterns for all required integrations. The doctor command uses a `Check[]` array pattern with `{name, status: 'pass'|'fail'|'warn', detail}` objects. The setup command already has a TTY-aware interactive prompt pattern (for skill bootstrapping) that can be reused for the AGENTS.md prompt. Session spawning uses `execa` with the opencode binary, `--command` flag for GSD commands, and `--model` for model selection. The `_top:judge` scope resolves to haiku-tier models for budget AI sessions.

The `gsd-setup-agents` and `gsd-lessons` commands do NOT exist yet in the GSD submodule. The current GSD commands directory has 31 commands, none matching these names. Per the requirements, invocations should be stubbed with TODO comments and tested with mocks.

**Primary recommendation:** Follow the established runner/delegate spawn pattern (execa → detached → poll isSessionDone), reuse setup's TTY prompt pattern for AGENTS.md offer, add a new doctor check function, and stub the GSD command invocations since they don't exist yet.

## Standard Stack

No new libraries needed. This phase uses only existing codebase dependencies.

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| execa | (existing) | Spawn opencode sessions | Already used by runner, delegate, setup |
| commander | (existing) | CLI command registration | All commands use this |
| better-sqlite3 | (existing, via sqlite.ts wrapper) | Read opencode DB for session polling | Used by opencode-db.ts |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| node:readline | built-in | TTY interactive prompts | AGENTS.md generation prompt during setup |
| node:fs/promises | built-in | File existence checks | Checking for AGENTS.md |

### Alternatives Considered

None — this phase extends existing infrastructure, no new dependencies needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── commands/
│   ├── setup.ts       # Modified — add AGENTS.md prompt after successful setup
│   ├── doctor.ts      # Modified — add AGENTS.md health check
│   └── lessons.ts     # NEW — pilot lessons command
├── core/
│   └── agents-md.ts   # NEW — shared logic: spawn sessions, check AGENTS.md
└── index.ts           # Modified — register `lessons` command
```

### Pattern 1: Session Spawning (from delegate.ts / runner.ts)

**What:** Spawn an opencode session via execa, don't await the process, poll the opencode SQLite DB for completion.
**When to use:** All three features need to spawn opencode sessions.
**Example:**
```typescript
// Source: src/core/delegate.ts lines 214-237
import { execa } from 'execa';
import { findSessionByTitle, isSessionDone, exportSessionFromDb } from './opencode-db.js';
import { resolveOpencodeBinary } from './delegate.js';

const opencodeBin = resolveOpencodeBinary();
const title = `pilot-agents-${Date.now().toString(36).slice(-4)}`;

const proc = execa(opencodeBin, [
  'run',
  '--format', 'default',
  '--model', model,          // from resolveTopLevelModel
  '--title', title,
  '--command', 'gsd-setup-agents',  // or gsd-lessons
  args,
], {
  cwd: projectDir,
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  detached: true,
  cleanup: false,
});
proc.catch(() => {});
proc.unref();

// Poll for completion
const pollMs = 2_000;
while (true) {
  await new Promise(r => setTimeout(r, pollMs));
  const sessionId = findSessionByTitle(title);
  if (!sessionId) continue;
  if (!isSessionDone(sessionId)) continue;
  // Extract result from session
  const exported = exportSessionFromDb(sessionId);
  break;
}
```

### Pattern 2: Doctor Check Pattern (from doctor.ts)

**What:** A function that returns `Check[]` where each check has `{name, status, detail}`.
**When to use:** Adding the AGENTS.md health check to doctor.
**Example:**
```typescript
// Source: src/commands/doctor.ts lines 22-26 and 50-280
interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

// Doctor checks are synchronous/async functions that push to a checks array
async function agentsMdHealthCheck(projectPath: string): Promise<Check[]> {
  const checks: Check[] = [];
  const agentsMdPath = path.join(projectPath, 'AGENTS.md');
  
  if (!(await fileExists(agentsMdPath))) {
    checks.push({
      name: 'AGENTS.md',
      status: 'warn',  // info-level, not a hard failure
      detail: 'No AGENTS.md — generate one with: pilot setup <project>',
    });
    return checks;
  }
  
  // Spawn AI session to check drift...
  // ... with timeout
  return checks;
}
```

### Pattern 3: TTY Interactive Prompt (from setup.ts)

**What:** Use node:readline to prompt user, only if `process.stdin.isTTY` is true.
**When to use:** The AGENTS.md generation prompt during setup.
**Example:**
```typescript
// Source: src/commands/setup.ts lines 118-125
if (process.stdin.isTTY) {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question('  No AGENTS.md found. Generate one? [Y/n] ', resolve);
  });
  rl.close();
  if (answer.toLowerCase() !== 'n') {
    // spawn gsd-setup-agents session
  }
}
```

### Pattern 4: CLI Command Registration (from index.ts)

**What:** Commander-based command registration with dynamic imports.
**When to use:** Registering the new `pilot lessons` command.
**Example:**
```typescript
// Source: src/index.ts — all commands follow this pattern
program
  .command('lessons [project]')
  .description('Extract lessons from recent builds into AGENTS.md candidates')
  .option('--approve', 'Interactive picker to promote candidates into AGENTS.md')
  .action(async (project: string | undefined, opts: Record<string, unknown>) => {
    const { lessonsCommand } = await import('./commands/lessons.js');
    await lessonsCommand(project, opts as { approve?: boolean });
  });
```

### Pattern 5: Model Resolution for Budget Sessions (from models.ts)

**What:** Use `resolveTopLevelModel` with `'judge'` scope to get haiku-tier model.
**When to use:** Doctor's AI health check session needs the cheapest available model.
**Example:**
```typescript
// Source: src/core/models.ts lines 35, 154-182
// _top:judge maps to haiku across all profiles and all provider modes
const { model, variant } = resolveTopLevelModel('judge', 'budget', providerMode);
// Returns 'anthropic/claude-haiku-4-5' for claude-only budget
```

### Anti-Patterns to Avoid

- **Don't await the execa process directly:** The runner/delegate pattern uses `proc.catch(() => {}); proc.unref()` and polls the DB instead. Direct await can hang if the process dies unexpectedly.
- **Don't auto-commit AGENTS.md changes:** Requirements explicitly say "leave as unstaged file for user review."
- **Don't make AGENTS.md check a hard failure in doctor:** It should be `warn` level, not `fail`. The requirements say "warnings, not hard failures."
- **Don't use hardcoded heuristics for AGENTS.md analysis:** The requirements explicitly prohibit this — must use AI-powered analysis.
- **Don't block doctor if AI check times out:** Use a timeout and gracefully degrade to a warning.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Opencode binary path | Custom resolution | `resolveOpencodeBinary()` from delegate.ts | Already handles HOME, candidates |
| Session completion polling | Custom polling loop | `findSessionByTitle()` + `isSessionDone()` from opencode-db.ts | Handles WAL, corruption, edge cases |
| Model resolution | Hardcoded model strings | `resolveTopLevelModel('judge', 'budget', mode)` | Respects SQLite overrides from Phase 46 |
| Session result extraction | Custom DB queries | `exportSessionFromDb(sessionId)` from opencode-db.ts | Handles message parsing, text concatenation |
| Project path resolution | `path.resolve()` | `resolveProjectDir()` from config.ts | Handles tilde, shorthand names, projectDir |
| Check output formatting | Custom formatting | Existing `Check` interface + doctor formatting loop | Consistent with existing doctor output |

**Key insight:** Every building block needed for this phase already exists in the codebase. The work is composition and integration, not invention.

## Common Pitfalls

### Pitfall 1: AI Health Check Blocking Doctor

**What goes wrong:** The AI health check session hangs (model error, network issue, stuck session) and blocks the entire doctor command.
**Why it happens:** Opencode sessions can fail silently or take minutes.
**How to avoid:** Use a timeout (e.g., 60-90 seconds) on the polling loop. If timeout is reached, push a `warn` check saying "AGENTS.md health check timed out" and return. Never let the AI check block other doctor checks.
**Warning signs:** Doctor command taking > 30 seconds.

### Pitfall 2: Session PID Liveness Not Checked

**What goes wrong:** The polling loop runs forever because the opencode process died but `isSessionDone()` never returns true (no step-finish in DB).
**Why it happens:** Process can be killed by OOM, signal, etc. before writing final DB records.
**How to avoid:** Track the PID from `proc.pid` and check liveness with `process.kill(pid, 0)` on each poll cycle, just like `waitForDelegationResult` does in delegate.ts (lines 264-284).
**Warning signs:** Doctor or lessons command hanging indefinitely.

### Pitfall 3: GSD Commands Don't Exist Yet

**What goes wrong:** `opencode run --command gsd-setup-agents` fails because the command file doesn't exist in the GSD submodule.
**Why it happens:** The gsd-setup-agents and gsd-lessons commands are being built in parallel and aren't in the submodule yet.
**How to avoid:** Stub the invocations with clear TODO comments. Tests should mock the session spawning entirely. The code should handle the "command not found" error gracefully.
**Warning signs:** Session spawns fail immediately with no assistant messages.

### Pitfall 4: Setup Prompt Breaking JSON Mode

**What goes wrong:** AGENTS.md prompt outputs to stdout in JSON mode, corrupting JSON output.
**Why it happens:** Not checking `isJsonMode()` before showing the interactive prompt.
**How to avoid:** Guard with `if (!isJsonMode() && process.stdin.isTTY)` before prompting, same as the skill offer pattern in setup.ts line 99.
**Warning signs:** JSON output tests failing.

### Pitfall 5: Doctor Running Per-Project AI Check Without --project Flag

**What goes wrong:** System-level `pilot doctor` (no `--project`) tries to run AI health checks on all registered projects, making it extremely slow.
**Why it happens:** Trying to be too helpful with the system-level doctor check.
**How to avoid:** The AGENTS.md AI check should ONLY run with `--project <path>`. In system-level doctor, at most show a one-liner suggestion. The `--skip-agents` flag should disable the per-project check.
**Warning signs:** `pilot doctor` taking minutes instead of seconds.

### Pitfall 6: Not Waiting for Session Completion Before Printing Results

**What goes wrong:** The lessons or setup command prints "done" before the session has written its output.
**Why it happens:** Checking `findSessionByTitle()` returns a session ID, but not checking `isSessionDone()`.
**How to avoid:** Always poll until `isSessionDone()` returns true, then extract results.
**Warning signs:** Empty or partial results printed.

## Code Examples

### Spawning a Budget AI Session with Timeout

```typescript
// Pattern for doctor's AGENTS.md health check
import { execa } from 'execa';
import { resolveOpencodeBinary } from '../core/delegate.js';
import { findSessionByTitle, isSessionDone, exportSessionFromDb } from '../core/opencode-db.js';
import { resolveTopLevelModel } from '../core/models.js';

async function spawnAgentsMdCheck(
  projectDir: string,
  timeoutMs: number = 90_000,
): Promise<string | null> {
  const { model, variant } = resolveTopLevelModel('judge', 'budget', 'claude-only');
  const opencodeBin = resolveOpencodeBinary();
  const ts = Date.now().toString(36).slice(-4);
  const title = `pilot-agents-check-${ts}`;
  
  const proc = execa(opencodeBin, [
    'run',
    '--format', 'default',
    '--model', model,
    ...(variant ? ['--variant', variant] : []),
    '--title', title,
    '--command', 'gsd-setup-agents',  // TODO: replace with actual health check command
    `check ${projectDir}`,
  ], {
    cwd: projectDir,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: true,
    cleanup: false,
  });
  proc.catch(() => {});
  proc.unref();
  
  const start = Date.now();
  const pollMs = 2_000;
  const pid = proc.pid;
  
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollMs));
    
    // PID liveness check
    if (pid !== undefined) {
      try { process.kill(pid, 0); } catch {
        // Process dead
        const sessionId = findSessionByTitle(title);
        if (sessionId && isSessionDone(sessionId)) {
          return extractLastAssistantContent(sessionId);
        }
        return null; // Died without completing
      }
    }
    
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;
    if (!isSessionDone(sessionId)) continue;
    
    return extractLastAssistantContent(sessionId);
  }
  
  // Timeout — kill the process
  if (pid !== undefined) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
  }
  return null;
}

function extractLastAssistantContent(sessionId: string): string | null {
  try {
    const exported = exportSessionFromDb(sessionId) as {
      messages: Array<{ role: string; content: string }>;
    };
    const lastAssistant = [...exported.messages]
      .reverse()
      .find(m => m.role === 'assistant');
    return lastAssistant?.content ?? null;
  } catch {
    return null;
  }
}
```

### Adding AGENTS.md Prompt to Setup

```typescript
// Insert after skill bootstrap in setup.ts (around line 149)
// Same pattern as the skill offer

// Check for AGENTS.md
const agentsMdPath = path.join(absDir, 'AGENTS.md');
if (!await exists(agentsMdPath) && !isJsonMode()) {
  if (process.stdin.isTTY) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('  No AGENTS.md found. Generate one? [Y/n] ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'n') {
      // TODO: spawn gsd-setup-agents session
      outputHuman(`  ${dim('Generating AGENTS.md...')}`);
    }
  } else {
    outputHuman(`  ${dim('No AGENTS.md found. Generate with: pilot setup <project>')}`);
  }
}
```

### Doctor Check Pattern (Adding to projectHealthCheck)

```typescript
// Add to projectHealthCheck() in doctor.ts after the Agent Checks section

// ── AGENTS.md Health Check ──────────────────────────────────────────────
if (!skipAgents) {
  const agentsMdPath = path.join(absPath, 'AGENTS.md');
  if (await fileExists(agentsMdPath)) {
    // Spawn AI session for drift detection
    try {
      const result = await spawnAgentsMdCheck(absPath, 90_000);
      if (result) {
        // Parse AI findings into check entries
        checks.push({
          name: 'AGENTS.md health',
          status: 'pass',  // or 'warn' based on AI findings
          detail: result.slice(0, 200),
        });
      } else {
        checks.push({
          name: 'AGENTS.md health',
          status: 'warn',
          detail: 'Health check timed out or failed — skipped',
        });
      }
    } catch {
      checks.push({
        name: 'AGENTS.md health',
        status: 'warn',
        detail: 'Health check failed',
      });
    }
  } else {
    checks.push({
      name: 'AGENTS.md',
      status: 'warn',
      detail: 'Not found — generate with: pilot setup <project>',
    });
  }
}
```

### Command Registration for Lessons

```typescript
// In index.ts, add after the skills commands section
program
  .command('lessons [project]')
  .description('Extract lessons from recent builds into AGENTS.md candidates')
  .option('--approve', 'Interactive picker to promote candidates')
  .action(async (project: string | undefined, opts: Record<string, unknown>) => {
    const { lessonsCommand } = await import('./commands/lessons.js');
    await lessonsCommand(project, opts as { approve?: boolean });
  });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Hardcoded model strings | `resolveTopLevelModel()` + SQLite | Phase 46 (just completed) | Must use model resolution, not raw strings |
| v1 doctor (PID/log scanning) | v2 doctor (check array pattern) | v2 rewrite | Follow Check[] pattern |
| Per-session model specification | Profile-based model assignment | Phase 46 | Use 'judge' scope for budget sessions |

**Deprecated/outdated:**
- Direct model string usage: Always use `resolveTopLevelModel()` which checks SQLite first, then falls back to `AGENT_MODELS` table.

## Open Questions

1. **AGENTS.md Health Check Prompt Design**
   - What we know: The AI session needs to read AGENTS.md + project files and report drift
   - What's unclear: What exact prompt/command will the GSD health check use? Since gsd-setup-agents doesn't exist yet, we don't know its interface
   - Recommendation: Design the pilot-side integration to pass the project path and expect a text/JSON report back. Stub the actual command invocation. The GSD side can define the protocol later.

2. **Doctor --skip-agents Flag Interaction with --project**
   - What we know: `--skip-agents` should skip the AI health check
   - What's unclear: Should `--skip-agents` be available only with `--project`, or also system-level?
   - Recommendation: Add it as a top-level doctor flag. System-level doctor doesn't run AI checks anyway, so the flag is a no-op there — but having it available doesn't hurt.

3. **Lessons --approve Interactive Picker**
   - What we know: Nice-to-have feature for promoting lesson candidates into AGENTS.md
   - What's unclear: What UI/UX for the interactive picker? TUI? readline prompts?
   - Recommendation: Defer `--approve` to nice-to-have scope. Start with the basic `pilot lessons [project]` that just extracts and prints candidates.

4. **Provider Mode for Doctor AI Sessions**
   - What we know: Doctor should use cheapest model
   - What's unclear: Should it use the system default provider mode or always claude-only?
   - Recommendation: Use the configured default provider mode from `getConfigFileDefaults().providerMode`. This respects the user's preference while `'judge'` scope + `'budget'` profile ensures the cheapest model within that mode.

## Sources

### Primary (HIGH confidence)

- `src/core/delegate.ts` — Session spawning pattern, `resolveOpencodeBinary`, `waitForDelegationResult`
- `src/core/runner.ts` — `spawnAndWait()`, model resolution, PID tracking, timeout handling
- `src/commands/doctor.ts` — Check interface, `projectHealthCheck()`, `systemHealthCheck()`, formatting
- `src/commands/setup.ts` — TTY prompt pattern, skill bootstrap flow, post-setup hooks
- `src/core/models.ts` — `resolveTopLevelModel()`, `_top:judge` maps to haiku-tier
- `src/core/opencode-db.ts` — `findSessionByTitle()`, `isSessionDone()`, `exportSessionFromDb()`
- `src/index.ts` — Commander registration pattern with dynamic imports
- `pilot-gsd/commands/gsd/` — 31 commands listed, NO gsd-setup-agents or gsd-lessons

### Secondary (MEDIUM confidence)

- `test/commands/setup.test.ts` — Test patterns: vi.mock for core modules, process.exit mocking, TTY simulation
- `test/core/delegate.test.ts` — Test patterns: mocking node:fs, creating mock data structures
- `test/core/runner.test.ts` — Test patterns: mocking /proc/meminfo, testing pure exported helpers
- `test/setup.ts` — Global test setup: PILOT_CONFIG_FILE isolation, HOME isolation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in codebase, no new dependencies
- Architecture: HIGH — patterns directly observable in existing code
- Pitfalls: HIGH — derived from actual codebase patterns and requirements constraints
- GSD command interface: LOW — commands don't exist yet, must stub

**Research date:** 2026-03-08
**Valid until:** 2026-04-07 (30 days — stable codebase patterns, but GSD commands may appear sooner)
