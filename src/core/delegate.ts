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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb, isSessionDone } from './opencode-db.js';
import { resolveTopLevelModel } from './models.js';
import { resolveSkillsForJob } from './skills.js';
import { errMsg } from '../util/errors.js';
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
 * Slugify a title to lowercase-hyphenated form for directory matching.
 * e.g. "Phase Delegation: Revert to Multi-Step" → "phase-delegation-revert-to-multi-step"
 */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Find an existing phase directory in .planning/phases/ that matches a title.
 * Scans for dirs matching `NN-slug` where slug is a substring match against the
 * slugified title.
 *
 * Returns { phaseNumber, dirName } or null if not found.
 */
function findExistingPhaseDir(phasesDir: string, title: string): { phaseNumber: number; dirName: string } | null {
  try {
    const titleSlug = slugifyTitle(title);
    const entries = readdirSync(phasesDir);

    for (const entry of entries) {
      const match = entry.match(/^(\d+)-(.+)$/);
      if (!match) continue;

      const phaseNumber = parseInt(match[1], 10);
      const dirSlug = match[2];

      // Check if the directory slug is a substring of the title slug, or vice versa
      // This handles both exact and partial matches (e.g. shortened slugs)
      if (titleSlug.includes(dirSlug) || dirSlug.includes(titleSlug)) {
        return { phaseNumber, dirName: entry };
      }

      // Also check word-level overlap: if the directory slug words appear in title slug
      const titleWords = titleSlug.split('-').filter(w => w.length > 3);
      const dirWords = dirSlug.split('-').filter(w => w.length > 3);
      const overlap = titleWords.filter(w => dirWords.includes(w));
      if (overlap.length >= 2) {
        return { phaseNumber, dirName: entry };
      }
    }
    return null;
  } catch {
    return null; // ENOENT or other error
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
  } catch {
    return { planCount: 0, summaryCount: 0, isComplete: false };
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
  // skip delegation AI entirely, go straight to deterministic fallback.
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
        // Phase on uninitialized project — init then run phase (GSD orchestrates internally)
        const phaseArgs = job.requirementPath ? `@${job.requirementPath} --auto` : `${job.description} --auto`;
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'phase', args: phaseArgs },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then phase (GSD orchestrates lifecycle internally)',
        };
      }
      // Project exists — state-aware step selection
      return resolvePhaseForFallback(projectDir, job);

    case 'milestone':
      if (!hasPlanning) {
        // Milestone on uninitialized project — init first, then spawn child jobs
        return {
          steps: [{ command: 'new-project', args: buildNewProjectArgs(job) }],
          reasoning: 'Milestone on uninitialized project — init first, then spawn child jobs',
        };
      }
      // Milestone coordinator — single new-milestone step, runner spawns child phase jobs
      return buildMilestonePlan(job, projectDir);
  }
}

/**
 * R1: Resolve phase identifier for fallback when scope='phase' and project has ROADMAP.md.
 *
 * Produces multi-step delegation plans: [add-phase, plan-phase, execute-phase]
 * with state-aware step selection that skips already-completed steps.
 *
 * - Existing phase dir found → skip add-phase
 * - Existing plans found → skip plan-phase
 * - All plans have summaries → all steps skipped (phase complete)
 * - Bare number description → only execute-phase (or nothing if complete)
 */
function resolvePhaseForFallback(projectDir: string, job: Job): DelegationPlan {
  const phasesDir = path.join(projectDir, '.planning', 'phases');

  // Handle bare number descriptions (e.g. job.description === "25")
  if (/^\d+$/.test(job.description.trim())) {
    const phaseNumber = parseInt(job.description.trim(), 10);
    // Find the phase directory by number
    let phaseDirName: string | null = null;
    try {
      const entries = readdirSync(phasesDir);
      for (const entry of entries) {
        const match = entry.match(/^(\d+)-/);
        if (match && parseInt(match[1], 10) === phaseNumber) {
          phaseDirName = entry;
          break;
        }
      }
    } catch {
      // No phases dir
    }

    if (phaseDirName) {
      const state = getPhaseState(phasesDir, phaseDirName);
      if (state.isComplete) {
        return {
          steps: [],
          reasoning: `Phase ${phaseNumber} already complete (${state.planCount}/${state.summaryCount} plans have summaries)`,
        };
      }
      if (state.planCount > 0) {
        // Plans exist but not all executed — only execute-phase needed
        return {
          steps: [{ command: 'execute-phase', args: String(phaseNumber) }],
          reasoning: `Phase ${phaseNumber} has ${state.planCount} plans, ${state.summaryCount} summaries — running execute-phase only`,
        };
      }
      // Phase dir exists but no plans — plan-phase + execute-phase
      return {
        steps: [
          { command: 'plan-phase', args: String(phaseNumber) },
          { command: 'execute-phase', args: String(phaseNumber) },
        ],
        reasoning: `Phase ${phaseNumber} directory exists but has no plans — running plan-phase then execute-phase`,
      };
    } else {
      // Phase dir not found — can't add without a title, just execute
      return {
        steps: [{ command: 'execute-phase', args: String(phaseNumber) }],
        reasoning: `Phase ${phaseNumber} explicitly requested — running execute-phase`,
      };
    }
  }

  // Non-numeric: use title-based phase lookup
  const title = (job.requirementPath ? extractRequirementTitle(job.requirementPath) : null)
    ?? job.description;

  const existing = findExistingPhaseDir(phasesDir, title);

  if (existing) {
    // Phase directory exists — check state to determine which steps are needed
    const state = getPhaseState(phasesDir, existing.dirName);

    if (state.isComplete) {
      return {
        steps: [],
        reasoning: `Phase "${title}" already complete (dir: ${existing.dirName}, ${state.planCount}/${state.summaryCount} plans have summaries)`,
      };
    }

    if (state.planCount > 0) {
      // Plans exist but not all executed — only execute-phase
      return {
        steps: [{ command: 'execute-phase', args: String(existing.phaseNumber) }],
        reasoning: `Phase "${title}" (${existing.dirName}) has ${state.planCount} plans, ${state.summaryCount} summaries — running execute-phase only`,
      };
    }

    // Phase dir exists but no plans — plan-phase + execute-phase
    const planPhaseArgs = job.requirementPath
      ? `${existing.phaseNumber} @${job.requirementPath}`
      : String(existing.phaseNumber);
    return {
      steps: [
        { command: 'plan-phase', args: planPhaseArgs },
        { command: 'execute-phase', args: String(existing.phaseNumber) },
      ],
      reasoning: `Phase "${title}" directory ${existing.dirName} exists but has no plans — running plan-phase then execute-phase`,
    };
  }

  // No existing phase — use phase command (GSD orchestrates the full lifecycle internally)
  const phaseArgs = job.requirementPath
    ? `@${job.requirementPath} --auto`
    : `${title} --auto`;

  return {
    steps: [
      { command: 'phase', args: phaseArgs },
    ],
    reasoning: `No existing phase for "${title}" — running phase command (GSD orchestrates add→plan→execute internally)`,
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
  } catch {
    // Skills system unavailable — skip hint silently
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
