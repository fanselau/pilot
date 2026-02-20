/**
 * pilot projects — All projects with git and planning state.
 *
 * Scans PILOT_PROJECT_DIR for project directories and displays
 * a table with branch, git state, planning state, and progress.
 */

import Table from 'cli-table3';
import { getConfig } from '../core/config.js';
import { scanProjects } from '../core/projects.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { formatProgressBar, truncateString } from '../util/format.js';
import { bold, green, yellow } from '../util/colors.js';
import type { ProjectInfo } from '../core/types.js';

interface ProjectsOpts {
  json?: boolean;
}

async function projectsCommand(opts: ProjectsOpts): Promise<void> {
  void opts; // used via isJsonMode()

  const config = getConfig();
  const projects = await scanProjects();

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({ projects });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${bold('Projects')} (${config.projectDir})`);
  outputHuman(sep);

  if (projects.length === 0) {
    outputHuman('No projects found');
    return;
  }

  const table = new Table({
    head: ['PROJECT', 'BRANCH', 'GIT', 'STATE', 'PROGRESS'],
    style: { head: [], border: [] },
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', right: '', 'right-mid': '',
      mid: '', 'mid-mid': '', middle: '  ',
    },
    colWidths: [22, 12, 7, 17, 16],
  });

  for (const project of projects) {
    table.push([
      truncateString(project.name, 20),
      truncateString(project.branch, 10),
      formatGitState(project.gitState),
      formatPlanningState(project),
      `${formatProgressBar(project.progress)} ${project.progress}%`,
    ]);
  }

  outputHuman(table.toString());
}

function formatGitState(state: 'clean' | 'dirty'): string {
  return state === 'clean' ? green('clean') : yellow('dirty');
}

function formatPlanningState(project: ProjectInfo): string {
  if (project.planningState === 'no-planning') {
    return 'no planning';
  }

  if (project.planningState === 'complete') {
    return 'complete';
  }

  // Active state — show phase + state
  const phaseStr = project.currentPhase !== undefined
    ? `Phase ${project.currentPhase}`
    : 'active';

  if (project.currentPhaseState) {
    // Extract a short state label from currentPhaseState
    const state = extractShortState(project.currentPhaseState);
    return `${phaseStr} ${state}`;
  }

  return phaseStr;
}

/**
 * Convert a verbose state string into a short display label.
 *
 * "In progress" → "exec"
 * "Phase complete" → "done"
 * Other → first word truncated
 */
function extractShortState(state: string): string {
  const lower = state.toLowerCase();
  if (lower.includes('in progress') || lower.includes('executing')) {
    return 'exec';
  }
  if (lower.includes('complete') || lower.includes('done')) {
    return 'done';
  }
  if (lower.includes('planning') || lower.includes('plan')) {
    return 'plan';
  }
  if (lower.includes('verif')) {
    return 'verify';
  }
  // Fallback: first word, max 8 chars
  const firstWord = state.split(/\s+/)[0] ?? state;
  return truncateString(firstWord.toLowerCase(), 8);
}

export { projectsCommand };
