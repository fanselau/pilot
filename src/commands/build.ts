/**
 * pilot build <project> [desc] — Queue + run.
 *
 * Convenience command that detects mode from project state, adds to queue,
 * and starts the runner if not already active.
 *
 * - .planning/ exists → continue-all (no description needed)
 * - .planning/ doesn't exist → build-full (description = args)
 * - build-full with existing .planning/ → error (prevents phantom completion)
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { getConfig } from '../core/config.js';
import { readPidFile, isProcessAlive } from '../core/process.js';
import { withQueueLock } from '../core/lock.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { readFile, writeFile } from 'node:fs/promises';

export async function buildCommand(
  project: string,
  desc: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();
  const dir = path.join(config.projectDir, project);
  const planningDir = path.join(dir, '.planning');

  // Detect mode based on .planning/ existence
  let mode: string;
  let argsStr: string;
  let hasPlanningDir = false;

  try {
    await access(planningDir);
    hasPlanningDir = true;
  } catch {
    hasPlanningDir = false;
  }

  if (hasPlanningDir) {
    mode = 'continue-all';
    argsStr = '';
  } else {
    mode = 'build-full';
    argsStr = desc ?? '';
  }

  // Build the queue entry line
  const entryLine = argsStr.length > 0
    ? `## ${project} | ${mode} | ${argsStr}`
    : `## ${project} | ${mode}`;

  // Append to QUEUE.md with file locking
  await withQueueLock(async () => {
    const content = await readFile(config.queueFile, 'utf8').catch(() => '');
    const newContent = content.trimEnd() + '\n\n' + entryLine + '\n';
    await writeFile(config.queueFile, newContent);
  });

  if (!isJsonMode()) {
    outputHuman(`✓ Queued: ${project} | ${mode}${argsStr.length > 0 ? ' | ' + argsStr : ''}`);
  }

  // Unless --no-run, check if runner is active and start if not
  // Commander parses --no-run as opts['run'] === false
  const shouldRun = opts['run'] !== false;

  let runnerStarted = false;

  if (shouldRun) {
    // Check if runner is already active
    const runnerPid = await readPidFile('queue');
    const runnerAlive = runnerPid !== null && isProcessAlive(runnerPid);

    if (runnerAlive) {
      if (!isJsonMode()) {
        outputHuman(`Runner already active (PID ${runnerPid}), entry queued`);
      }
    } else {
      // Start runner as a detached child process
      try {
        const pilotBin = process.argv[1]!;
        const child = execa('node', [pilotBin, 'run'], {
          detached: true,
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'ignore',
        });
        child.unref();
        runnerStarted = true;

        if (!isJsonMode()) {
          outputHuman('✓ Runner started');
        }
      } catch (err) {
        if (!isJsonMode()) {
          outputHuman(`Warning: Failed to start runner: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  if (isJsonMode()) {
    outputJson({
      action: 'build',
      project,
      mode,
      args: argsStr,
      runner_started: runnerStarted,
    });
  }
}
