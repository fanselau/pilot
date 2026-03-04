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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb, isSessionDone } from './opencode-db.js';
import type { Job, DelegationPlan, DelegationStep } from './types.js';

/**
 * Known GSD instruction text fragments that should NEVER appear in a phase title.
 * If an add-phase directory name contains any of these phrases, it means the AI
 * misinterpreted the prompt instructions as the phase title.
 */
const GSD_INSTRUCTION_BLOCKLIST: readonly string[] = [
  'add a new integer phase',
  'add a new phase to the end',
  'execute all plans',
  'spawn subagents',
  'current milestone in the roadmap',
  'phase to the end of',
  'run /gsd-plan-phase',
  'run /gsd-execute-phase',
  'break down into tasks',
  'to be planned',
];

/**
 * Check if a title contains any known GSD instruction phrase.
 * Returns the matched blocklist phrase if found (case-insensitive substring match),
 * or null if the title is clean.
 */
function matchesBlocklist(title: string): string | null {
  const lower = title.toLowerCase();
  for (const phrase of GSD_INSTRUCTION_BLOCKLIST) {
    if (lower.includes(phrase)) {
      return phrase;
    }
  }
  return null;
}

/**
 * Extract a human-readable title from a requirement file's `# Title` heading.
 * Returns the title text (trimmed), or null if no heading found or file unreadable.
 *
 * Used to pass clean titles to add-phase instead of file paths, preventing
 * ugly slugified phase directory names like `requirements-tui-visual-polish-md`.
 */
function extractRequirementTitle(requirementPath: string): string | null {
  try {
    const content = readFileSync(requirementPath, 'utf8');
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      return match[1].trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Spawn a delegation AI session to determine what GSD commands to run for a job.
 * Uses a short cheap AI session that reads .planning/ and outputs a JSON plan.
 *
 * Tries delegation AI once, then falls back to deterministic scope-based mapping.
 */
async function delegate(job: Job, projectDir: string): Promise<DelegationPlan> {
  // Bare-number descriptions (e.g. "25") are explicit phase identifiers —
  // skip delegation AI entirely, go straight to deterministic execute-phase.
  if (job.scope === 'phase' && /^\d+$/.test(job.description.trim())) {
    return fallbackPlan(job, projectDir);
  }

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
        // Phase on uninitialized project — init then single-session phase
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'phase', args: buildPhaseArgs(job) },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then single-session phase',
        };
      }
      // Project exists — single-session phase orchestration
      return resolvePhaseForFallback(projectDir, job);

    case 'milestone':
      if (!hasPlanning) {
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'phase', args: buildPhaseArgs(job) },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then single-session phase',
        };
      }
      // Milestone on initialized project: if requirementPath is a directory,
      // iterate files and create one phase per file
      return buildMilestonePlan(job, projectDir);
  }
}

/**
 * Build args for gsd-phase single-session orchestrator.
 *
 * Routes based on job state:
 * - requirementPath exists: `@path --auto`
 * - description is a bare number: `--phase N --auto`
 * - otherwise: `description --auto`
 *
 * Appends `--resume` when job.resumeHint is set, so retried phase jobs
 * pick up where they left off instead of starting fresh.
 */
function buildPhaseArgs(job: Job): string {
  let args: string;
  if (job.requirementPath) {
    args = `@${job.requirementPath} --auto`;
  } else if (/^\d+$/.test(job.description.trim())) {
    args = `--phase ${job.description.trim()} --auto`;
  } else {
    args = `${job.description} --auto`;
  }

  // Append resume flag when job has a resume hint from a prior attempt
  if (job.resumeHint) {
    args += ' --resume';
  }

  return args;
}

/**
 * R1: Resolve phase identifier for fallback when scope='phase' and project has ROADMAP.md.
 *
 * Returns a single `{ command: 'phase' }` step that delegates the full lifecycle
 * (add→plan→execute) to gsd-phase single-session orchestrator.
 */
function resolvePhaseForFallback(_projectDir: string, job: Job): DelegationPlan {
  return {
    steps: [{ command: 'phase', args: buildPhaseArgs(job) }],
    reasoning: 'Single-session phase orchestration via gsd-phase',
  };
}

/**
 * Scan .planning/phases/ directory for existing phase dirs and return next phase number.
 * Matches NN-* prefix pattern, same as GSD's gsd-tools.cjs.
 * Returns 1 if no phases dir or no matching dirs.
 */
function getNextPhaseNumber(phasesDir: string): number {
  try {
    const entries = readdirSync(phasesDir);
    let maxPhase = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)-/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxPhase) maxPhase = n;
      }
    }
    return maxPhase + 1;
  } catch {
    return 1; // No phases dir or unreadable
  }
}

/**
 * Build a milestone plan for an initialized project.
 * If requirementPath is a directory, create add→plan→execute per .md file.
 * Otherwise, fall back to single add-phase.
 */
function buildMilestonePlan(job: Job, projectDir: string): DelegationPlan {
  if (job.requirementPath) {
    try {
      const stat = statSync(job.requirementPath);
      if (stat.isDirectory()) {
        const files = readdirSync(job.requirementPath)
          .filter(f => f.endsWith('.md'))
          .sort();

        if (files.length > 0) {
          const steps: DelegationStep[] = [];

          for (const file of files) {
            const filePath = path.join(job.requirementPath, file);
            steps.push({ command: 'phase', args: `@${filePath} --auto` });
          }

          return {
            steps,
            reasoning: `Fallback: milestone with ${files.length} requirement files, one phase command per file`,
          };
        }
      }
    } catch {
      // Fall through to single add-phase
    }
  }

  // Default: full phase lifecycle (add + plan + execute)
  const phaseArgs = job.requirementPath
    ? `@${job.requirementPath} --auto`
    : `${job.description} --auto`;
  return {
    steps: [
      { command: 'phase', args: phaseArgs },
    ],
    reasoning: 'Fallback: project already initialized, running full phase lifecycle',
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
async function attemptDelegation(job: Job, projectDir: string, attempt: number): Promise<DelegationPlan & { _sessionTitle: string }> {
  const ts = Date.now().toString(36).slice(-4);
  const title = `pilot-delegate-${job.id}-${attempt}-${ts}`;

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
  return { ...plan, _sessionTitle: title };
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

    // Wait for session to actually complete before extracting result
    if (!isSessionDone(sessionId)) continue;

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

export {
  delegate,
  parseDelegationOutput,
  resolveOpencodeBinary,
  waitForDelegationResult,
  resolvePhaseForFallback,
  fallbackPlan,
  buildNewProjectArgs,
  buildQuickArgs,
  buildPhaseArgs,
  getNextPhaseNumber,
  buildMilestonePlan,
  extractRequirementTitle,
  GSD_INSTRUCTION_BLOCKLIST,
  matchesBlocklist,
};
