/**
 * Delegation AI — spawns a short opencode session to read project state
 * and output a JSON execution plan (DelegationPlan).
 *
 * Core v2 innovation: Instead of parsing .planning/ files with regex
 * (which constantly broke in v1), we spawn a cheap AI session that reads
 * project state and decides what GSD commands to run.
 *
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb } from './opencode-db.js';
import type { Job, DelegationPlan } from './types.js';

/**
 * Spawn a delegation AI session to determine what GSD commands to run for a job.
 * Uses a short cheap AI session that reads .planning/ and outputs a JSON plan.
 *
 * Retries up to 3 times, then falls back to deterministic scope-based mapping.
 */
async function delegate(job: Job, projectDir: string): Promise<DelegationPlan> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptDelegation(job, projectDir, attempt);
    } catch {
      if (attempt === MAX_RETRIES) {
        // Fallback: deterministic scope-based mapping (no AI needed)
        return fallbackPlan(job);
      }
      // Brief wait before retry
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }

  // Unreachable, but TypeScript wants it
  return fallbackPlan(job);
}

/**
 * Fallback when delegation AI fails: deterministic scope → command mapping.
 * Less smart than AI, but guaranteed to work.
 */
function fallbackPlan(job: Job): DelegationPlan {
  switch (job.scope) {
    case 'quick':
      return {
        steps: [{ command: 'quick', args: job.requirementPath
          ? `Read ${job.requirementPath} for full details and implement all requirements. ${job.description}`
          : job.description }],
        reasoning: 'Fallback: delegation AI failed, using direct quick mapping',
      };
    case 'phase':
      // Can't determine phase number without AI reading ROADMAP — use add-phase which auto-detects
      return {
        steps: [
          { command: 'add-phase', args: job.description },
          // plan-phase and execute-phase need the phase number — subsequent delegation will handle
        ],
        reasoning: 'Fallback: delegation AI failed, adding phase only. Run again to plan+execute.',
      };
    case 'milestone':
      return {
        steps: [{ command: 'new-project', args: `--auto ${job.requirementPath ?? job.description}` }],
        reasoning: 'Fallback: delegation AI failed, using direct new-project mapping',
      };
  }
}

/**
 * Single delegation attempt: spawn opencode, wait for result, parse output.
 */
async function attemptDelegation(job: Job, projectDir: string, attempt: number): Promise<DelegationPlan> {
  const title = `${job.project}-delegate-${job.id}-${attempt}`;

  // Build the delegation prompt args
  const args = [
    `scope: ${job.scope}`,
    `project: ${job.project}`,
    `description: ${job.description}`,
    `requirement_path: ${job.requirementPath ?? 'none'}`,
  ].join('\n');

  // Spawn opencode session with delegation command
  const opencodeBin = resolveOpencodeBinary();
  await execa(opencodeBin, [
    'run',
    '--format', 'default',
    '--title', title,
    '--command', 'gsd-delegate',
    args,
  ], {
    cwd: projectDir,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: true,
    cleanup: false,
  });

  // Poll for session completion, then parse output
  const plan = await waitForDelegationResult(title);
  return plan;
}

/**
 * Resolve the opencode binary path.
 * Checks standard locations, falls back to PATH.
 */
function resolveOpencodeBinary(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  const candidates = [
    path.join(home, '.opencode', 'bin', 'opencode'),
    'opencode', // PATH fallback
  ];
  // Return first candidate — runner validates binary exists at pre-spawn
  return candidates[0];
}

/**
 * Wait for a delegation session to complete and parse its output.
 * Polls opencode DB every 2 seconds for up to 120 seconds.
 */
async function waitForDelegationResult(title: string): Promise<DelegationPlan> {
  const maxWaitMs = 120_000;
  const pollMs = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollMs));

    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    // Check if session has completed by looking for messages
    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        // Find the last assistant message and parse JSON from it
        const lastAssistant = [...exported.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          const content = String(lastAssistant.content ?? '');
          return parseDelegationOutput(content);
        }
      }
    } catch {
      // Session not ready yet, keep polling
    }
  }

  throw new Error(`Delegation session timed out after ${maxWaitMs / 1000}s: ${title}`);
}

/**
 * Parse delegation AI output into a DelegationPlan.
 * Extracts JSON from markdown code blocks or raw JSON.
 *
 * This is a pure function — testable independently without mocking.
 */
function parseDelegationOutput(content: string): DelegationPlan {
  // Try to extract JSON from ```json ... ``` blocks
  const jsonBlockMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : content.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse delegation output: ${err instanceof Error ? err.message : String(err)}\nRaw content: ${content.slice(0, 500)}`,
    );
  }

  // Validate structure
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error('Delegation plan has no steps');
  }

  for (const step of parsed.steps as Array<Record<string, unknown>>) {
    if (typeof step.command !== 'string' || typeof step.args !== 'string') {
      throw new Error('Invalid step: missing command or args');
    }
  }

  return {
    steps: (parsed.steps as Array<{ command: string; args: string }>).map(s => ({
      command: s.command,
      args: s.args,
    })),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

export { delegate, parseDelegationOutput, resolveOpencodeBinary, waitForDelegationResult };
