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
  // Phase scope: skip delegation AI entirely, use deterministic multi-step plan.
  // The fallback inspects .planning/phases/ state and produces [add-phase, plan-phase, execute-phase]
  // with state-aware step selection (skips completed steps).
  // This avoids the broken single-session gsd-phase orchestrator that AI tends to output.
  if (job.scope === 'phase') {
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
        // Phase on uninitialized project — init then multi-step phase lifecycle
        const title = (job.requirementPath ? extractRequirementTitle(job.requirementPath) : null)
          ?? job.description;
        const addPhaseArgs = title;
        const planPhaseArgs = job.requirementPath ? `1 @${job.requirementPath}` : '1';
        const executePhaseArgs = '1';
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'add-phase', args: addPhaseArgs },
            { command: 'plan-phase', args: planPhaseArgs },
            { command: 'execute-phase', args: executePhaseArgs },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then multi-step phase lifecycle (add→plan→execute)',
        };
      }
      // Project exists — multi-step phase orchestration with state-aware step selection
      return resolvePhaseForFallback(projectDir, job);

    case 'milestone':
      if (!hasPlanning) {
        // Milestone on uninitialized project — init then multi-step phase lifecycle
        const title = (job.requirementPath ? extractRequirementTitle(job.requirementPath) : null)
          ?? job.description;
        const addPhaseArgs = title;
        const planPhaseArgs = job.requirementPath ? `1 @${job.requirementPath}` : '1';
        const executePhaseArgs = '1';
        return {
          steps: [
            { command: 'new-project', args: buildNewProjectArgs(job) },
            { command: 'add-phase', args: addPhaseArgs },
            { command: 'plan-phase', args: planPhaseArgs },
            { command: 'execute-phase', args: executePhaseArgs },
          ],
          reasoning: 'Fallback: project not initialized, running new-project then multi-step phase lifecycle (add→plan→execute)',
        };
      }
      // Milestone on initialized project: if requirementPath is a directory,
      // iterate files and create one multi-step phase lifecycle per file
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

  // No existing phase — generate all 3 steps: add-phase, plan-phase, execute-phase
  // We don't know the phase number yet (add-phase will create it), so plan-phase
  // and execute-phase use a placeholder. The runner's arg patching will update them
  // after add-phase creates the directory.
  const nextPhaseNumber = getNextPhaseNumber(phasesDir);
  const addPhaseArgs = title;
  const planPhaseArgs = job.requirementPath
    ? `${nextPhaseNumber} @${job.requirementPath}`
    : String(nextPhaseNumber);
  const executePhaseArgs = String(nextPhaseNumber);

  return {
    steps: [
      { command: 'add-phase', args: addPhaseArgs },
      { command: 'plan-phase', args: planPhaseArgs },
      { command: 'execute-phase', args: executePhaseArgs },
    ],
    reasoning: `No existing phase for "${title}" — running full lifecycle: add-phase → plan-phase → execute-phase`,
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
 * If requirementPath is a directory, create multi-step add→plan→execute per .md file.
 * Otherwise, fall back to single multi-step phase lifecycle.
 */
function buildMilestonePlan(job: Job, projectDir: string): DelegationPlan {
  const phasesDir = path.join(projectDir, '.planning', 'phases');

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
            const title = extractRequirementTitle(filePath) ?? file.replace(/\.md$/, '');

            // Check if this requirement already has a phase
            const existing = findExistingPhaseDir(phasesDir, title);
            if (existing) {
              const state = getPhaseState(phasesDir, existing.dirName);
              if (state.isComplete) {
                // Skip entirely — already complete
                continue;
              }
              if (state.planCount > 0) {
                // Plans exist — only execute-phase
                steps.push({ command: 'execute-phase', args: String(existing.phaseNumber) });
                continue;
              }
              // Phase dir exists but no plans
              steps.push({ command: 'plan-phase', args: `${existing.phaseNumber} @${filePath}` });
              steps.push({ command: 'execute-phase', args: String(existing.phaseNumber) });
            } else {
              // New requirement — full lifecycle
              // Phase number will be determined at runtime by runner arg patching
              const nextNum = getNextPhaseNumber(phasesDir) + steps.filter(s => s.command === 'add-phase').length;
              steps.push({ command: 'add-phase', args: title });
              steps.push({ command: 'plan-phase', args: `${nextNum} @${filePath}` });
              steps.push({ command: 'execute-phase', args: String(nextNum) });
            }
          }

          if (steps.length === 0) {
            return {
              steps: [],
              reasoning: `Milestone: all ${files.length} requirement phases already complete`,
            };
          }

          return {
            steps,
            reasoning: `Fallback: milestone with ${files.length} requirement files, multi-step phase lifecycle per file`,
          };
        }
      }
    } catch {
      // Fall through to single multi-step plan
    }
  }

  // Default: full multi-step phase lifecycle (add + plan + execute)
  const title = (job.requirementPath ? extractRequirementTitle(job.requirementPath) : null)
    ?? job.description;

  const existing = findExistingPhaseDir(phasesDir, title);
  if (existing) {
    const state = getPhaseState(phasesDir, existing.dirName);
    if (state.isComplete) {
      return {
        steps: [],
        reasoning: `Phase "${title}" already complete`,
      };
    }
    if (state.planCount > 0) {
      return {
        steps: [{ command: 'execute-phase', args: String(existing.phaseNumber) }],
        reasoning: `Phase "${title}" has plans, running execute-phase only`,
      };
    }
    const planPhaseArgs = job.requirementPath
      ? `${existing.phaseNumber} @${job.requirementPath}`
      : String(existing.phaseNumber);
    return {
      steps: [
        { command: 'plan-phase', args: planPhaseArgs },
        { command: 'execute-phase', args: String(existing.phaseNumber) },
      ],
      reasoning: `Phase "${title}" directory exists but no plans — running plan-phase + execute-phase`,
    };
  }

  const nextPhaseNumber = getNextPhaseNumber(phasesDir);
  const addPhaseArgs = title;
  const planPhaseArgs = job.requirementPath
    ? `${nextPhaseNumber} @${job.requirementPath}`
    : String(nextPhaseNumber);
  const executePhaseArgs = String(nextPhaseNumber);

  return {
    steps: [
      { command: 'add-phase', args: addPhaseArgs },
      { command: 'plan-phase', args: planPhaseArgs },
      { command: 'execute-phase', args: executePhaseArgs },
    ],
    reasoning: 'Fallback: project already initialized, running full phase lifecycle (add→plan→execute)',
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
  getNextPhaseNumber,
  buildMilestonePlan,
  extractRequirementTitle,
  findExistingPhaseDir,
  getPhaseState,
  GSD_INSTRUCTION_BLOCKLIST,
  matchesBlocklist,
};
