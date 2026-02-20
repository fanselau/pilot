/**
 * pilot progress [project] — Deep phase progress display.
 *
 * Shows per-phase status list with progress bar, status icons,
 * current phase, next action, and blockers.
 */

import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';
import { getProgress } from '../core/progress.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { formatProgressBar } from '../util/format.js';
import { bold, green, yellow, dim } from '../util/colors.js';
import type { PhaseProgress } from '../core/types.js';

interface ProgressOpts {
  json?: boolean;
}

async function progressCommand(project: string | undefined, opts: ProgressOpts): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();

  // Resolve project path
  let projectPath: string;
  let projectName: string;

  if (project) {
    projectPath = path.join(config.projectDir, project);
    projectName = project;
  } else {
    // Detect from cwd — check if .planning/ exists in cwd or parent
    projectPath = await detectProjectFromCwd();
    if (!projectPath) {
      process.stderr.write(
        'Error: No project specified and no .planning/ found in current directory\n',
      );
      process.exit(1);
    }
    projectName = path.basename(projectPath);
  }

  const progressInfo = await getProgress(projectPath);

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({ progress: progressInfo });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${projectName} — ${bold('Progress')}`);
  outputHuman(sep);

  if (progressInfo.phases.length === 0) {
    outputHuman('No planning data found');
    return;
  }

  // Overall progress line
  const doneCount = progressInfo.phases.filter((p) => p.status === 'done').length;
  const totalCount = progressInfo.phases.length;
  outputHuman(
    `Overall: ${formatProgressBar(progressInfo.overall, 10)} ${progressInfo.overall}% (${doneCount}/${totalCount} phases)`,
  );
  outputHuman('');

  // Phase table header
  outputHuman(`${'Phase'.padEnd(7)}${'Status'.padEnd(14)}Description`);

  for (const phase of progressInfo.phases) {
    const numStr = String(phase.number).padStart(3);
    const statusStr = formatPhaseStatus(phase);
    outputHuman(`  ${numStr}    ${statusStr.padEnd(14)}${phase.name}`);
  }

  // Footer
  outputHuman('');
  if (progressInfo.currentPhase !== null) {
    outputHuman(`Current: Phase ${progressInfo.currentPhase} — executing`);
  }
  outputHuman(`Next action: ${progressInfo.nextAction}`);
  outputHuman(
    `Blockers: ${progressInfo.blockers.length > 0 ? progressInfo.blockers.join(', ') : 'none'}`,
  );
}

/**
 * Format phase status with icon.
 */
function formatPhaseStatus(phase: PhaseProgress): string {
  switch (phase.status) {
    case 'done':
      return green('✅ done');
    case 'in-progress':
      return yellow('🔨 exec');
    case 'pending':
      return dim('○ pending');
  }
}

/**
 * Detect project path from current working directory.
 *
 * Walks up from cwd looking for .planning/ directory.
 * Returns the directory containing .planning/ or empty string if not found.
 */
async function detectProjectFromCwd(): Promise<string> {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    try {
      await access(path.join(dir, '.planning'));
      return dir;
    } catch {
      // Not found, go up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return '';
}

export { progressCommand };
