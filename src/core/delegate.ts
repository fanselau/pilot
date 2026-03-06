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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb, isSessionDone } from './opencode-db.js';
import { resolveTopLevelModel } from './models.js';
import { resolveSkillsForJob } from './skills.js';
import { errMsg } from '../util/errors.js';
import type { Job, DelegationPlan } from './types.js';

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
  } catch (err) {
    process.stderr.write(`[delegate] extractRequirementTitle readFileSync failed: ${errMsg(err)}\n`);
    return null;
  }
}

/**
 * Get the state of a phase directory: plan count, summary count, and whether complete.
 * isComplete = planCount > 0 && planCount === summaryCount
 */
function getPhaseState(phasesDir: string, phaseDirName: string): { planCount: number; summaryCount: number; isComplete: boolean } {
  try {
    const phaseDir = path.join(phasesDir, phaseDirName);
    const entries = readdirSync(phaseDir);
    const planCount = entries.filter(f => f.endsWith('-PLAN.md')).length;
    const summaryCount = entries.filter(f => f.endsWith('-SUMMARY.md')).length;
    const isComplete = planCount > 0 && planCount === summaryCount;
    return { planCount, summaryCount, isComplete };
  } catch (err) {
    process.stderr.write(`[delegate] getPhaseState readdirSync failed for ${phaseDirName}: ${errMsg(err)}\n`);
    return { planCount: 0, summaryCount: 0, isComplete: false };
  }
}

/**
 * Spawn a delegation AI session to determine what GSD commands to run for a job.
 * Uses a short cheap AI session that reads .planning/ and outputs a JSON plan.
 *
 * Fails fast on error — the runner's job retry mechanism (attempts 1/3 → 2/3 → 3/3)
 * handles retries. No fallback plan guessing.
 */
async function delegate(job: Job, projectDir: string): Promise<DelegationPlan> {
  try {
    return await attemptDelegation(job, projectDir, 1);
  } catch (err) {
    throw new Error(`${errMsg(err)}. Check project setup with: pilot doctor --project ${projectDir}`);
  }
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
  } catch (err) {
    process.stderr.write(`[delegate] getNextPhaseNumber readdirSync failed: ${errMsg(err)}\n`);
    return 1;
  }
}

/**
 * Build a milestone coordinator plan for an initialized project.
 *
 * The coordinator runs a single `new-milestone` step. After it completes,
 * the runner reads ROADMAP.md and spawns child phase jobs with depends_on chaining.
 * This replaces the old flat per-requirement step list (add-phase × N).
 */
function buildMilestonePlan(job: Job, _projectDir: string): DelegationPlan {
  return {
    steps: [{ command: 'new-milestone', args: buildNewMilestoneArgs(job) }],
    reasoning: 'Milestone coordinator — will spawn child phase jobs after new-milestone completes',
  };
}

/**
 * Build args for gsd-new-milestone.
 * Same convention as buildNewProjectArgs: file reference first, then flags.
 * GSD checks for --auto presence anywhere in $ARGUMENTS.
 */
function buildNewMilestoneArgs(job: Job): string {
  if (job.requirementPath) {
    return `@${job.requirementPath} --auto`;
  }
  return `${job.description} --auto`;
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

  const argLines = [
    `scope: ${job.scope}`,
    `project: ${job.project}`,
    `description: ${job.description}`,
    `requirement_path: ${job.requirementPath ?? 'none'}`,
  ];

  // Append skills hint if job has categories and matched skills exist
  try {
    const matchedSkills = resolveSkillsForJob(job.categories ?? null);
    if (matchedSkills.length > 0) {
      const categoryList = job.categories?.join(', ') ?? 'none';
      const skillNames = matchedSkills.map(s => s.name).join(', ');
      argLines.push(`\nAvailable Skills:`);
      argLines.push(`skill_categories: ${categoryList}`);
      argLines.push(`matched_skills: ${skillNames}`);
      argLines.push(`Note: Read these skills when relevant to the current task.`);
    }
  } catch (err) {
    process.stderr.write(`[delegate] skills resolution failed: ${errMsg(err)}\n`);
  }

  const args = argLines.join('\n');

  const opencodeBin = resolveOpencodeBinary();
  const topLevelModel = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);
  process.stderr.write(`[delegate] Model: ${topLevelModel}\n`);
  const proc = execa(opencodeBin, [
    'run',
    '--format', 'default',
    '--model', topLevelModel,
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

  const spawnedPid = proc.pid;
  const plan = await waitForDelegationResult(title, spawnedPid);
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
 * If pid is provided, checks process liveness each cycle — bails early on dead process.
 */
async function waitForDelegationResult(title: string, pid?: number): Promise<DelegationPlan> {
  const maxWaitMs = 120_000;
  const pollMs = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollMs));

    // Check if the spawned process is still alive
    if (pid !== undefined) {
      try {
        process.kill(pid, 0);
      } catch {
        // Process is dead — check if session completed before dying
        const sessionId = findSessionByTitle(title);
        if (sessionId && isSessionDone(sessionId)) {
          // Session completed — extract result below
          try {
            const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
            if (exported.messages.length > 0) {
              const lastAssistant = [...exported.messages].reverse().find(m => m.role === 'assistant');
              if (lastAssistant) {
                return parseDelegationOutput(String(lastAssistant.content ?? ''));
              }
            }
          } catch (err) {
            process.stderr.write(`[delegate] session export failed for ${title}: ${errMsg(err)}\n`);
          }
        }
        throw new Error(`Delegation process died before completing session: ${title}`);
      }
    }

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
    } catch (err) {
      process.stderr.write(`[delegate] session export failed for ${title}: ${errMsg(err)}\n`);
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
      `Failed to parse delegation output: ${errMsg(err)}\nRaw content: ${content.slice(0, 500)}`,
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

  const steps = (parsed.steps as Array<{ command: string; args: string }>).map(s => ({
    command: s.command,
    args: s.args,
  }));

  const filteredSteps = steps.flatMap(step => {
    // Strip --auto from plan-phase args (triggers broken Task() auto-advance)
    if (step.command === 'plan-phase' && step.args.includes('--auto')) {
      return [{ command: step.command, args: step.args.replace(/--auto/g, '').trim() }];
    }
    // Skip verify-phase (runner handles verification separately)
    if (step.command === 'verify-phase') {
      return [];
    }
    return [step];
  });

  return {
    steps: filteredSteps,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

export {
  delegate,
  parseDelegationOutput,
  resolveOpencodeBinary,
  buildNewProjectArgs,
  buildQuickArgs,
  getNextPhaseNumber,
  buildMilestonePlan,
  extractRequirementTitle,
  getPhaseState,
  GSD_INSTRUCTION_BLOCKLIST,
  matchesBlocklist,
};
