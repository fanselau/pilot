/**
 * `pilot lessons [project]` — Extract lessons from recent builds into AGENTS.md candidates.
 *
 * Spawns an opencode session running `gsd-lessons` against the specified project
 * (or current directory). Prints extracted lesson candidates on completion.
 *
 * Handles:
 * - No .planning/ directory → helpful message + exit 0
 * - No AGENTS.md → informational suggestion (continues anyway)
 * - Session timeout → error message
 * - JSON mode → structured output
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { dim, bold, yellow } from '../util/colors.js';
import { checkAgentsMdExists, spawnAgentsMdSession } from '../core/agents-md.js';

async function lessonsCommand(projectArg?: string, opts?: { approve?: boolean }): Promise<void> {
  // Resolve project directory — defaults to cwd when omitted
  const projectDir = projectArg ? path.resolve(projectArg) : process.cwd();

  // Check if .planning/ directory exists
  const planningDir = path.join(projectDir, '.planning');
  let hasPlanningDir = false;
  try {
    await access(planningDir);
    hasPlanningDir = true;
  } catch {
    // .planning/ does not exist
  }

  if (!hasPlanningDir) {
    if (isJsonMode()) {
      outputJson({ lessons: null, projectDir, error: 'No .planning/ directory found' });
      return;
    }
    outputHuman(`  ${yellow('⚠')} No .planning/ directory found in ${dim(projectDir)}.`);
    outputHuman(`    Run some builds first to generate build history.`);
    return;
  }

  // Check if AGENTS.md exists — informational only, continue regardless
  const hasAgentsMd = await checkAgentsMdExists(projectDir);
  if (!hasAgentsMd && !isJsonMode()) {
    outputHuman(`  ${yellow('⚠')} No AGENTS.md found. Generate one first with: ${dim(`pilot setup ${projectDir}`)}`);
    outputHuman('');
  }

  // Handle --approve flag (nice-to-have, not yet supported)
  if (opts?.approve && !isJsonMode()) {
    outputHuman(`  ${dim('--approve flag not yet supported. Review candidates manually in .planning/LESSONS-CANDIDATES.md')}`);
    outputHuman('');
  }

  if (!isJsonMode()) {
    outputHuman(`  ${dim('Extracting lessons from')} ${bold(projectDir)} ${dim('...')}`);
  }

  // Spawn gsd-lessons session with longer timeout for build history analysis
  // TODO: Replace 'gsd-lessons' with actual command when available in pilot-gsd
  const result = await spawnAgentsMdSession({
    projectDir,
    command: 'gsd-lessons',
    timeoutMs: 120_000,
  });

  // Handle JSON mode
  if (isJsonMode()) {
    outputJson({ lessons: result ?? null, projectDir });
    return;
  }

  // Handle result
  if (result !== null && result.length > 0) {
    outputHuman('');
    outputHuman(`  ${bold(`Lesson candidates from ${projectDir}:`)}`);
    outputHuman('');
    outputHuman(result);
    outputHuman('');
  } else {
    outputHuman(`  ${yellow('⚠')} Lessons extraction failed or timed out.`);
  }
}

export { lessonsCommand };
