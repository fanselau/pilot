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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb } from './opencode-db.js';
import type { Job, DelegationPlan } from './types.js';

/**
 * Spawn a delegation AI session to determine what GSD commands to run for a job.
 * Uses a short cheap AI session that reads .planning/ and outputs a JSON plan.
 *
 * Tries delegation AI once, then falls back to deterministic scope-based mapping.
 */
async function delegate(job: Job, projectDir: string): Promise<DelegationPlan> {
  const MAX_RETRIES = 1;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptDelegation(job, projectDir, attempt);
    } catch {
      if (attempt === MAX_RETRIES) {
        return fallbackPlan(job, projectDir);
      }
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }

  return fallbackPlan(job, projectDir);
}

/**
 * Fallback when delegation AI fails: deterministic scope → command mapping.
 * Inspects project state to build an appropriate plan.
 */
function fallbackPlan(job: Job, projectDir: string): DelegationPlan {
  const hasPlanning = existsSync(path.join(projectDir, '.planning', 'ROADMAP.md'));

  switch (job.scope) {
    case 'quick':
      if (!hasPlanning) {
        // Quick on uninitialized project — init first, then quick
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'quick', args: buildQuickArgs(job) },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then quick task',
        };
      }
      return {
        steps: [{ command: 'quick', args: buildQuickArgs(job) }],
        reasoning: 'Fallback: direct quick mapping',
      };

    case 'phase':
      if (!hasPlanning) {
        // Phase on uninitialized project — full milestone lifecycle
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'plan-phase', args: '1 --auto' },
            { command: 'execute-phase', args: '1' },
          ],
          reasoning: 'Fallback: project not initialized, running full lifecycle',
        };
      }
      // Project exists — resolve phase identifier safely (R1)
      return resolvePhaseForFallback(projectDir, job);

    case 'milestone':
      if (!hasPlanning) {
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'plan-phase', args: '1 --auto' },
            { command: 'execute-phase', args: '1' },
          ],
          reasoning: 'Fallback: full milestone lifecycle: init → plan → execute',
        };
      }
      return {
        steps: [
          { command: 'add-phase', args: job.description },
        ],
        reasoning: 'Fallback: project already initialized, adding as new phase',
      };
  }
}

/**
 * R1: Resolve phase identifier for fallback when scope='phase' and project has ROADMAP.md.
 *
 * If job.description is a numeric phase identifier, execute it directly.
 * Otherwise, build a full lifecycle: add-phase → plan-phase → execute-phase.
 * Never blindly pass requirement titles to execute-phase.
 */
function resolvePhaseForFallback(projectDir: string, job: Job): DelegationPlan {
  const roadmapPath = path.join(projectDir, '.planning', 'ROADMAP.md');
  let roadmapContent: string;
  try {
    roadmapContent = readFileSync(roadmapPath, 'utf8');
  } catch {
    // No ROADMAP — can't resolve, fail fast with actionable error
    return {
      steps: [{ command: 'execute-phase', args: '1' }],
      reasoning: `Fallback: ROADMAP.md not found at ${roadmapPath}, defaulting to phase 1`,
    };
  }

  // If description is already a phase number, just execute it
  if (/^\d+$/.test(job.description.trim())) {
    return {
      steps: [{ command: 'execute-phase', args: job.description.trim() }],
      reasoning: 'Fallback: description is numeric phase identifier',
    };
  }

  // Count existing phases in ROADMAP to determine next phase number
  const phaseMatches = roadmapContent.match(/^###\s+Phase\s+(\d+)/gm) || [];
  const maxPhase = phaseMatches.reduce((max, match) => {
    const numMatch = match.match(/(\d+)/);
    const n = numMatch ? parseInt(numMatch[1], 10) : 0;
    return Math.max(max, n);
  }, 0);
  const nextPhase = maxPhase + 1;

  // Build full lifecycle: add → plan → execute
  const addArgs = job.requirementPath
    ? `@${job.requirementPath}`
    : job.description;

  return {
    steps: [
      { command: 'add-phase', args: addArgs },
      { command: 'plan-phase', args: `${nextPhase} --auto` },
      { command: 'execute-phase', args: `${nextPhase}` },
    ],
    reasoning: `Fallback: "${job.description}" is not a phase number, creating as phase ${nextPhase}`,
  };
}

/**
 * Build args for gsd-new-project.
 * IMPORTANT: opencode's yargs parser swallows args starting with --.
 * So we put the file reference FIRST, then the auto flag.
 * GSD checks for --auto presence anywhere in $ARGUMENTS.
 */
function buildNewProjectArgs(job: Job): string {
  if (job.requirementPath) {
    return `@${job.requirementPath} --auto`;
  }
  return `${job.description} --auto`;
}

/**
 * Build args for gsd-quick.
 */
function buildQuickArgs(job: Job): string {
  if (job.requirementPath) {
    return `Read ${job.requirementPath} for full details and implement all requirements. ${job.description}`;
  }
  return job.description;
}

/**
 * Single delegation attempt: spawn opencode, wait for result, parse output.
 */
async function attemptDelegation(job: Job, projectDir: string, attempt: number): Promise<DelegationPlan> {
  const title = `pilot-delegate-${job.id}-${attempt}`;

  const args = [
    `scope: ${job.scope}`,
    `project: ${job.project}`,
    `description: ${job.description}`,
    `requirement_path: ${job.requirementPath ?? 'none'}`,
  ].join('\n');

  const opencodeBin = resolveOpencodeBinary();
  const proc = execa(opencodeBin, [
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
  // Don't await — we poll the DB instead
  proc.catch(() => {});
  proc.unref();

  const plan = await waitForDelegationResult(title);
  return plan;
}

/**
 * Resolve the opencode binary path.
 */
function resolveOpencodeBinary(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  const candidates = [
    path.join(home, '.opencode', 'bin', 'opencode'),
    'opencode',
  ];
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

    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        const lastAssistant = [...exported.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          const content = String(lastAssistant.content ?? '');
          return parseDelegationOutput(content);
        }
      }
    } catch {
      // Session not ready yet
    }
  }

  throw new Error(`Delegation session timed out after ${maxWaitMs / 1000}s: ${title}`);
}

/**
 * Parse delegation AI output into a DelegationPlan.
 */
function parseDelegationOutput(content: string): DelegationPlan {
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

export { delegate, parseDelegationOutput, resolveOpencodeBinary, waitForDelegationResult, resolvePhaseForFallback };
