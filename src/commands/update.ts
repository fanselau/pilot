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
import { getAllProjects } from '../core/db.js';

async function updateCommand(): Promise<void> {
  const pilotRoot = path.resolve(import.meta.dirname, '..', '..');

  // 1. Update the npm package
  outputHuman(`  ${dim('Updating get-shit-done-cc...')}`);
  try {
    const { stdout: updateStdout } = await execa('bun', ['update', 'get-shit-done-cc'], {
      cwd: pilotRoot,
    });
    outputHuman(`  ${green('✓')} get-shit-done-cc updated`);
    if (updateStdout.trim()) {
      outputHuman(`  ${dim(updateStdout.trim())}`);
    }
  } catch (err) {
    const msg = errMsg(err);
    process.stderr.write(`  ${red('✗')} Failed to update get-shit-done-cc: ${msg}\n`);
    if (isJsonMode()) {
      outputJson({ updated: false, packageUpdated: false, error: msg });
    }
    process.exit(1);
  }

  // 2. Re-run installer per registered project
  const projects = getAllProjects();
  const projectResults: Array<{ path: string; success: boolean; error?: string }> = [];

  if (projects.length === 0) {
    outputHuman(`  ${dim('No registered projects to update.')}`);
  } else {
    outputHuman(`  ${dim(`Re-running installer for ${projects.length} project(s)...`)}`);

    const installerBin = path.join(pilotRoot, 'node_modules', '.bin', 'get-shit-done-cc');

    for (const project of projects) {
      if (project.status === 'blocked') {
        outputHuman(`  ${yellow('⊘')} ${project.path} ${dim('(blocked — skipped)')}`);
        continue;
      }

      const { exitCode, stderr } = await execa(installerBin, ['--opencode', '--local'], {
        cwd: project.path,
        timeout: 60_000,
        reject: false,
      });

      if (exitCode === 0) {
        outputHuman(`  ${green('✓')} ${project.path}`);
        projectResults.push({ path: project.path, success: true });
      } else {
        const errorMsg = stderr.trim();
        outputHuman(`  ${red('✗')} ${project.path}: ${errorMsg.slice(0, 120)}`);
        projectResults.push({ path: project.path, success: false, error: errorMsg });
        // Continue — don't abort the loop for individual project failures
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
      packageUpdated: true,
      projects: projectResults,
    });
    return;
  }

  outputHuman('');
  outputHuman(`  ${green('✓')} Update complete`);
}

export { updateCommand };
