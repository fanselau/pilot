/**
 * Deep project progress analysis.
 *
 * Powers `pilot progress` by reading .planning/ structure to determine
 * per-phase status, overall completion, current phase, next action,
 * and blockers.
 *
 * Pure core module — no UI dependencies.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { ProgressInfo, PhaseProgress } from './types.js';

/**
 * Parse phase directory name into number and name.
 *
 * Handles: "01-foundation" → { num: 1, name: "foundation" }
 * Handles: "03.1-hotfix" → { num: 3.1, name: "hotfix" }
 */
function parsePhaseDirName(dirName: string): { num: number; name: string } | null {
  const match = dirName.match(/^(\d+(?:\.\d+)?)-(.+)$/);
  if (!match) return null;
  return {
    num: parseFloat(match[1]),
    name: match[2],
  };
}

/**
 * Get deep progress analysis for a project.
 *
 * Reads .planning/ROADMAP.md for phase list, then checks each phase
 * directory for PLAN.md and SUMMARY.md files to determine status.
 */
async function getProgress(projectPath: string): Promise<ProgressInfo> {
  const planningDir = path.join(projectPath, '.planning');
  const projectName = path.basename(projectPath);

  const emptyResult: ProgressInfo = {
    project: projectName,
    overall: 0,
    phases: [],
    currentPhase: null,
    nextAction: 'No planning data found',
    blockers: [],
  };

  // Check .planning/ exists
  try {
    await access(planningDir);
  } catch {
    return emptyResult;
  }

  // Parse ROADMAP.md for phase definitions
  let roadmapPhases: Array<{ num: number; name: string }> = [];
  try {
    const roadmap = await readFile(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    const phaseRegex = /^### Phase (\d+):\s*(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = phaseRegex.exec(roadmap)) !== null) {
      roadmapPhases.push({
        num: parseInt(match[1], 10),
        name: match[2].trim(),
      });
    }
  } catch {
    return emptyResult;
  }

  if (roadmapPhases.length === 0) {
    return emptyResult;
  }

  // Read STATE.md for current phase
  let currentPhase: number | null = null;
  try {
    const stateContent = await readFile(path.join(planningDir, 'STATE.md'), 'utf8');
    const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s*of\s*\d+/);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1], 10);
    }
  } catch {
    // No STATE.md
  }

  // Scan phase directories
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirEntries: string[] = [];
  try {
    phaseDirEntries = (await readdir(phasesDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // No phases/ directory
  }

  // Build per-phase progress
  const phases: PhaseProgress[] = [];
  let doneCount = 0;

  for (const phase of roadmapPhases) {
    const padded = String(phase.num).padStart(2, '0');

    // Find matching phase directory (e.g., "01-foundation")
    const matchingDir = phaseDirEntries.find((d) => {
      const parsed = parsePhaseDirName(d);
      return parsed !== null && parsed.num === phase.num;
    });

    if (!matchingDir) {
      phases.push({
        number: phase.num,
        name: phase.name,
        status: 'pending',
        plans: 0,
      });
      continue;
    }

    // Count plan and summary files
    let planCount = 0;
    let summaryCount = 0;
    try {
      const files = await readdir(path.join(phasesDir, matchingDir));
      planCount = files.filter((f) => f.endsWith('-PLAN.md')).length;
      summaryCount = files.filter((f) => f.endsWith('-SUMMARY.md')).length;
    } catch {
      // Skip unreadable dirs
    }

    let status: PhaseProgress['status'];
    if (planCount > 0 && summaryCount >= planCount) {
      status = 'done';
      doneCount++;
    } else if (summaryCount > 0 || (currentPhase !== null && phase.num === currentPhase)) {
      status = 'in-progress';
    } else if (planCount > 0) {
      status = 'in-progress';
    } else {
      status = 'pending';
    }

    phases.push({
      number: phase.num,
      name: phase.name,
      status,
      plans: planCount,
    });
  }

  // Calculate overall progress
  const totalPhases = roadmapPhases.length;
  const overall = totalPhases > 0 ? Math.round((doneCount / totalPhases) * 100) : 0;

  // Determine next action
  let nextAction = 'All phases complete';
  if (currentPhase !== null) {
    const currentPhaseInfo = phases.find((p) => p.number === currentPhase);
    if (currentPhaseInfo) {
      if (currentPhaseInfo.status === 'done') {
        // Find next incomplete phase
        const nextPhase = phases.find((p) => p.status !== 'done');
        if (nextPhase) {
          nextAction = `plan phase ${nextPhase.number}`;
        }
      } else if (currentPhaseInfo.plans === 0) {
        nextAction = `plan phase ${currentPhase}`;
      } else {
        nextAction = `execute phase ${currentPhase}`;
      }
    }
  } else {
    const firstPending = phases.find((p) => p.status !== 'done');
    if (firstPending) {
      nextAction = `plan phase ${firstPending.number}`;
    }
  }

  return {
    project: projectName,
    overall,
    phases,
    currentPhase,
    nextAction,
    blockers: [],
  };
}

export { getProgress };
