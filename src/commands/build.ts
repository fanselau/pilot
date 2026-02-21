/**
 * pilot build <project> <requirement-or-description> — Smart add + run.
 *
 * Convenience wrapper: calls addCommand to queue work, then starts
 * the queue runner if not already active.
 */

import { execa } from 'execa';
import { readPidFile, isProcessAlive } from '../core/process.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { addCommand } from './add.js';

export async function buildCommand(
  project: string,
  input: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  if (!input) {
    process.stderr.write('Error: Provide a requirements file or description\n');
    process.exit(2);
  }

  // Run smart add (queues the work)
  const addResult = await addCommand(project, input, opts);

  // Unless --no-run, check if runner is active and start if not
  // Commander parses --no-run as opts['run'] === false
  const shouldRun = opts['run'] !== false;
  let runnerStarted = false;

  if (shouldRun && !addResult.dryRun) {
    const runnerPid = await readPidFile('pilot-runner');
    const runnerAlive = runnerPid !== null && isProcessAlive(runnerPid);

    if (runnerAlive) {
      if (!isJsonMode()) {
        outputHuman(`Runner already active (PID ${runnerPid})`);
      }
    } else {
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
      action: addResult.dryRun ? 'dry-run' : 'build',
      ...addResult,
      runner_started: runnerStarted,
    });
  }
}
