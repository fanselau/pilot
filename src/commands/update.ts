/**
 * `pilot update` — Update GSD commands: refreshes npm package and re-runs installer per project.
 *
 * 1. Runs `bun update get-shit-done-cc` in the pilot repo root
 * 2. Re-runs `get-shit-done-cc --opencode --local` in each registered project
 * 3. Updates the OpenClaw skill if detected
 */

import path from 'node:path';
import { execa } from 'execa';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { errMsg } from '../util/errors.js';
import { green, red, yellow, dim } from '../util/colors.js';
import { installOpenClawSkill } from '../core/openclaw-skill.js';
import { getConfig } from '../core/config.js';
import { getAllProjects, updateProjectGsdState } from '../core/db.js';
import { ensureApprovedGsdPackage, inspectProjectGsdState } from '../core/managed-gsd.js';

type RolloutAction = 'blocked-skipped' | 'already-current' | 'update-to-approved' | 'repair-to-approved' | 'ahead-skipped';

interface RolloutResult {
  path: string;
  previousVersion: string | null;
  installedVersion: string | null;
  driftStatus: 'matches' | 'behind' | 'ahead' | 'unknown';
  action: RolloutAction;
  success: boolean;
  error?: string;
}

async function updateCommand(): Promise<void> {
  const pilotRoot = path.resolve(import.meta.dirname, '..', '..');
  const approvedVersion = getConfig().approvedGsdVersion;
  let runtimeVersion: string | null = null;

  outputHuman(`  ${dim(`Preparing approved GSD ${approvedVersion}...`)}`);
  try {
    const ensured = await ensureApprovedGsdPackage(approvedVersion, pilotRoot);
    runtimeVersion = ensured.changed ? approvedVersion : ensured.runtimeVersion;
    outputHuman(`  ${green('✓')} Approved runtime ready (${runtimeVersion ?? 'unknown'})`);
  } catch (err) {
    const msg = errMsg(err);
    process.stderr.write(`  ${red('✗')} Failed to prepare approved GSD: ${msg}\n`);
    if (isJsonMode()) {
      outputJson({ updated: false, approvedVersion, runtimeVersion, projects: [], error: msg });
    }
    process.exit(1);
  }

  const projects = getAllProjects();
  const projectResults: RolloutResult[] = [];

  if (projects.length === 0) {
    outputHuman(`  ${dim('No registered projects to update.')}`);
  } else {
    outputHuman(`  ${dim(`Rolling out approved version across ${projects.length} project(s)...`)}`);

    const installerBin = path.join(pilotRoot, 'node_modules', '.bin', 'get-shit-done-cc');

    for (const project of projects) {
      const state = await inspectProjectGsdState(project.path, approvedVersion);
      updateProjectGsdState(project.path, state);

      if (project.status === 'blocked') {
        outputHuman(`  ${yellow('⊘')} ${project.path} ${dim('(blocked — skipped)')}`);
        projectResults.push({
          path: project.path,
          previousVersion: state.installedVersion,
          installedVersion: state.installedVersion,
          driftStatus: state.driftStatus,
          action: 'blocked-skipped',
          success: true,
        });
        continue;
      }

      if (state.driftStatus === 'matches') {
        outputHuman(`  ${green('✓')} ${project.path} ${dim('(already-current)')}`);
        projectResults.push({
          path: project.path,
          previousVersion: state.installedVersion,
          installedVersion: state.installedVersion,
          driftStatus: state.driftStatus,
          action: 'already-current',
          success: true,
        });
        continue;
      }

      if (state.driftStatus === 'ahead') {
        outputHuman(`  ${yellow('⊘')} ${project.path} ${dim('(ahead-skipped)')}`);
        projectResults.push({
          path: project.path,
          previousVersion: state.installedVersion,
          installedVersion: state.installedVersion,
          driftStatus: state.driftStatus,
          action: 'ahead-skipped',
          success: true,
        });
        continue;
      }

      const action: RolloutAction = state.driftStatus === 'behind' ? 'update-to-approved' : 'repair-to-approved';

      const { exitCode, stderr } = await execa(installerBin, ['--opencode', '--local'], {
        cwd: project.path,
        timeout: 60_000,
        reject: false,
      });

      if (exitCode === 0) {
        const refreshedState = await inspectProjectGsdState(project.path, approvedVersion);
        updateProjectGsdState(project.path, refreshedState);
        outputHuman(`  ${green('✓')} ${project.path} ${dim(`(${action})`)}`);
        projectResults.push({
          path: project.path,
          previousVersion: state.installedVersion,
          installedVersion: refreshedState.installedVersion,
          driftStatus: refreshedState.driftStatus,
          action,
          success: true,
        });
      } else {
        const errorMsg = stderr.trim();
        const failedState = {
          approvedVersion,
          installedVersion: state.installedVersion,
          driftStatus: state.installedVersion ? state.driftStatus : 'unknown',
          checkedAt: new Date().toISOString(),
          error: errorMsg,
        };
        updateProjectGsdState(project.path, failedState);
        outputHuman(`  ${red('✗')} ${project.path}: ${errorMsg.slice(0, 120)}`);
        projectResults.push({
          path: project.path,
          previousVersion: state.installedVersion,
          installedVersion: failedState.installedVersion,
          driftStatus: failedState.driftStatus,
          action,
          success: false,
          error: errorMsg,
        });
      }
    }
  }

  // 3. Update OpenClaw skill if OpenClaw is detected
  const skillResult = installOpenClawSkill();
  if (skillResult.installed) {
    outputHuman(`  ${green('✓')} OpenClaw skill updated`);
  }

  if (isJsonMode()) {
    outputJson({
      updated: true,
      approvedVersion,
      runtimeVersion,
      projects: projectResults,
    });
    return;
  }

  const updatedCount = projectResults.filter((project) => project.action === 'update-to-approved' && project.success).length;
  const alreadyCurrentCount = projectResults.filter((project) => project.action === 'already-current').length;
  const blockedCount = projectResults.filter((project) => project.action === 'blocked-skipped').length;
  const aheadCount = projectResults.filter((project) => project.action === 'ahead-skipped').length;
  const failedCount = projectResults.filter((project) => !project.success).length;

  outputHuman('');
  outputHuman(`  updated: ${updatedCount}`);
  outputHuman(`  already-current: ${alreadyCurrentCount}`);
  outputHuman(`  blocked: ${blockedCount}`);
  outputHuman(`  ahead: ${aheadCount}`);
  outputHuman(`  failed: ${failedCount}`);
  outputHuman(`  ${green('✓')} Update complete`);
}

export { updateCommand };
