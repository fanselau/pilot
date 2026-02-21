/**
 * Project scanning, git state, and .planning state detection.
 *
 * Powers `pilot projects` by enumerating project directories under
 * PILOT_PROJECT_DIR and reporting git branch, dirty/clean state,
 * and planning phase progress.
 *
 * Pure core module — no UI dependencies.
 */

import { readdir, readFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { getConfig } from './config.js';
import type { ProjectInfo } from './types.js';

// ── Planning State ─────────────────────────────────────────────────────────

interface PlanningStateResult {
  state: 'no-planning' | 'active' | 'complete';
  currentPhase?: number;
  currentPhaseState?: string;
  progress: {
    done: number;
    total: number;
    percent: number;
  };
}

/**
 * Detect planning state by reading .planning/ directory contents.
 *
 * Checks for ROADMAP.md (phase count), STATE.md (current phase),
 * and phase directories with SUMMARY.md files (completion tracking).
 */
async function detectPlanningState(planningDir: string): Promise<PlanningStateResult> {
  const noPlanningResult: PlanningStateResult = {
    state: 'no-planning',
    progress: { done: 0, total: 0, percent: 0 },
  };

  // Check if .planning/ exists
  try {
    await access(planningDir);
  } catch {
    return noPlanningResult;
  }

  // Read ROADMAP.md — count ### Phase N: lines for total
  let totalPhases = 0;
  try {
    const roadmap = await readFile(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    const phaseMatches = roadmap.match(/^### Phase \d+/gm);
    totalPhases = phaseMatches ? phaseMatches.length : 0;
  } catch {
    // No ROADMAP.md — still might have .planning/ with no structure yet
    return noPlanningResult;
  }

  if (totalPhases === 0) {
    return noPlanningResult;
  }

  // Read STATE.md — extract current phase
  let currentPhase: number | undefined;
  let currentPhaseState: string | undefined;
  try {
    const stateContent = await readFile(path.join(planningDir, 'STATE.md'), 'utf8');
    // Look for "Phase: N of M" pattern
    const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s*of\s*\d+/);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1], 10);
    }
    // Look for status line
    const statusMatch = stateContent.match(/Status:\s*(.+)/);
    if (statusMatch) {
      currentPhaseState = statusMatch[1].trim();
    }
  } catch {
    // No STATE.md — that's ok
  }

  // Scan phases/ directory for completion info
  let donePhases = 0;
  try {
    const phasesDir = path.join(planningDir, 'phases');
    const phaseDirs = await readdir(phasesDir, { withFileTypes: true });

    for (const dir of phaseDirs) {
      if (!dir.isDirectory()) continue;

      // Check if this phase directory has a UAT or SUMMARY indicating done
      try {
        const phaseFiles = await readdir(path.join(phasesDir, dir.name));
        const summaryFiles = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md'));
        const planFiles = phaseFiles.filter((f) => f.endsWith('-PLAN.md'));

        // Phase is done if it has plan files and all have matching summaries
        if (planFiles.length > 0 && summaryFiles.length >= planFiles.length) {
          donePhases++;
        }
      } catch {
        // Skip unreadable phase dirs
      }
    }
  } catch {
    // No phases/ directory
  }

  // Cap donePhases at totalPhases — extra phase dirs (decimal phases, renamed) can inflate count
  donePhases = Math.min(donePhases, totalPhases);
  const percent = totalPhases > 0 ? Math.min(100, Math.round((donePhases / totalPhases) * 100)) : 0;
  const state = donePhases >= totalPhases ? 'complete' : 'active';

  return {
    state,
    currentPhase,
    currentPhaseState,
    progress: {
      done: donePhases,
      total: totalPhases,
      percent,
    },
  };
}

// ── Project Info ───────────────────────────────────────────────────────────

/**
 * Get detailed info about a single project directory.
 *
 * Runs git commands (branch, status) and checks .planning/ state.
 * All errors are handled gracefully — missing git repo returns defaults.
 */
async function getProjectInfo(projectPath: string): Promise<ProjectInfo> {
  const name = path.basename(projectPath);

  // Git branch
  let branch = 'unknown';
  try {
    const result = await execa('git', ['branch', '--show-current'], { cwd: projectPath });
    branch = result.stdout.trim() || 'HEAD';
  } catch {
    // Not a git repo or git error
  }

  // Git state (clean/dirty)
  let gitState: 'clean' | 'dirty' = 'clean';
  try {
    const result = await execa('git', ['status', '--porcelain'], { cwd: projectPath });
    if (result.stdout.trim().length > 0) {
      gitState = 'dirty';
    }
  } catch {
    // Not a git repo — treat as clean
  }

  // Planning state
  const planningDir = path.join(projectPath, '.planning');
  const planningResult = await detectPlanningState(planningDir);

  return {
    name,
    path: projectPath,
    branch,
    gitState,
    planningState: planningResult.state,
    currentPhase: planningResult.currentPhase,
    currentPhaseState: planningResult.currentPhaseState,
    progress: planningResult.progress.percent,
  };
}

// ── Scan Projects ──────────────────────────────────────────────────────────

/**
 * Scan PILOT_PROJECT_DIR for project directories.
 *
 * Returns ProjectInfo[] sorted alphabetically by name.
 * Skips hidden directories (starting with `.`).
 */
async function scanProjects(): Promise<ProjectInfo[]> {
  const config = getConfig();
  const projectDir = config.projectDir;

  let dirNames: string[];
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    dirNames = entries
      .filter((entry) => entry.isDirectory() && !String(entry.name).startsWith('.'))
      .map((entry) => String(entry.name));
  } catch {
    return [];
  }

  // Sort alphabetically by name
  dirNames.sort((a, b) => a.localeCompare(b));

  const projects: ProjectInfo[] = [];
  for (const name of dirNames) {
    const fullPath = path.join(projectDir, name);
    const info = await getProjectInfo(fullPath);
    projects.push(info);
  }

  return projects;
}

export { scanProjects, getProjectInfo, detectPlanningState };
export type { PlanningStateResult };
