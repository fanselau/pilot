/**
 * Shared AGENTS.md session helpers.
 *
 * Provides reusable infrastructure for spawning opencode sessions that
 * manage AGENTS.md operations (setup generation, doctor health check,
 * lessons extraction).
 *
 * Three consumers use this module:
 *  1. `pilot setup`  — generates AGENTS.md for new projects
 *  2. `pilot doctor` — AI-powered drift detection on existing AGENTS.md
 *  3. `pilot lessons` — extracts build learnings into AGENTS.md candidates
 *
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveOpencodeBinary } from './delegate.js';
import { resolveTopLevelModel } from './models.js';
import { findSessionByTitle, isSessionDone, exportSessionFromDb } from './opencode-db.js';
import { errMsg } from '../util/errors.js';

type AgentsMdOperation = 'setup' | 'health' | 'lessons';

type AgentsMdSessionOptions = {
  projectDir: string;
  operation: AgentsMdOperation;
  timeoutMs?: number;
  providerMode?: string;
  allowEdits?: boolean;
};

type LegacyAgentsMdSessionOptions = {
  projectDir: string;
  command: string;
  timeoutMs?: number;
  providerMode?: string;
  allowEdits?: boolean;
};

const PROMPT_FILE_BY_OPERATION: Record<AgentsMdOperation, string> = {
  setup: 'agents-setup.md',
  health: 'agents-health.md',
  lessons: 'lessons.md',
};

// ── Public helpers ─────────────────────────────────────────────────────────

/**
 * Check if AGENTS.md exists in the project root.
 */
async function checkAgentsMdExists(projectDir: string): Promise<boolean> {
  try {
    await access(path.join(projectDir, 'AGENTS.md'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn an opencode session for AGENTS.md operations.
 *
 * Shared session-spawning helper used by setup, doctor, and lessons.
 * Follows the same detached-process + DB-polling pattern as delegate.ts.
 *
 * Returns the last assistant message content on success, or null on
 * failure/timeout. This function never throws — all errors are caught
 * and written to stderr.
 */
async function spawnAgentsMdSession(opts: AgentsMdSessionOptions | LegacyAgentsMdSessionOptions): Promise<string | null> {
  const { projectDir, timeoutMs = 90_000, providerMode = 'claude-only' } = opts;
  const operation = resolveOperation(opts);
  const allowEdits = resolveAllowEdits(opts, operation);

  try {
    // Resolve model — judge scope = haiku-tier (cheapest)
    const { model, variant } = resolveTopLevelModel('judge', 'budget', providerMode);

    // Resolve opencode binary
    const opencodeBin = resolveOpencodeBinary();

    // Resolve prompt content
    const prompt = await loadOperationPrompt(projectDir, operation, allowEdits);

    // Generate a unique session title
    const title = `pilot-agents-${operation}-${Date.now().toString(36).slice(-4)}`;

    // Build args
    const args = [
      'run',
      '--format', 'default',
      '--model', model,
      ...(variant ? ['--variant', variant] : []),
      '--title', title,
      prompt,
    ];

    // Spawn detached process — don't await directly, poll DB instead
    const proc = execa(opencodeBin, args, {
      cwd: projectDir,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      detached: true,
      cleanup: false,
    });
    proc.catch(() => {});
    proc.unref();

    const pid = proc.pid;
    const pollMs = 2_000;
    const start = Date.now();

    // Poll for completion
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, pollMs));

      // PID liveness check — if process died, check session one more time
      if (pid !== undefined) {
        try {
          process.kill(pid, 0);
        } catch {
          // Process is dead — check if session completed before dying
          const sessionId = findSessionByTitle(title);
          if (sessionId && isSessionDone(sessionId)) {
            return extractLastAssistantContent(sessionId);
          }
          return null; // Died without completing
        }
      }

      // Check session status in DB
      const sessionId = findSessionByTitle(title);
      if (!sessionId) continue;
      if (!isSessionDone(sessionId)) continue;

      return extractLastAssistantContent(sessionId);
    }

    // Timeout — kill the process
    if (pid !== undefined) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* ignore — may already be dead */ }
    }
    return null;
  } catch (err) {
    process.stderr.write(`[agents-md] spawnAgentsMdSession failed: ${errMsg(err)}\n`);
    return null;
  }
}

async function loadOperationPrompt(projectDir: string, operation: AgentsMdOperation, allowEdits: boolean): Promise<string> {
  const promptFile = PROMPT_FILE_BY_OPERATION[operation];
  const promptPath = path.resolve(import.meta.dirname, '..', 'prompts', promptFile);
  const promptBody = await readFile(promptPath, 'utf8');

  return `${promptBody}\n\n---\n\n## Invocation Context\n\nOperation: ${operation}\nAllow file edits: ${allowEdits ? 'true' : 'false'}\nProject root: ${projectDir}\n`;
}

function resolveOperation(opts: AgentsMdSessionOptions | LegacyAgentsMdSessionOptions): AgentsMdOperation {
  if ('operation' in opts) return opts.operation;

  const normalized = opts.command.toLowerCase();
  if (normalized.includes('lesson')) return 'lessons';
  if (normalized.includes('check') || normalized.includes('health')) return 'health';
  return 'setup';
}

function resolveAllowEdits(
  opts: AgentsMdSessionOptions | LegacyAgentsMdSessionOptions,
  operation: AgentsMdOperation,
): boolean {
  if (typeof opts.allowEdits === 'boolean') return opts.allowEdits;
  return operation === 'setup';
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Extract the last assistant message content from a completed session.
 * Returns the content string or null if no assistant message found.
 */
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

// ── Exports ────────────────────────────────────────────────────────────────

export { checkAgentsMdExists, spawnAgentsMdSession };
export type { AgentsMdOperation };
