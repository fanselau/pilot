/**
 * pilot add <project> <mode> [args] — Add to queue.
 *
 * Validates mode, locks QUEUE.md via proper-lockfile, and appends a new
 * queue entry.  Supports --dry-run and --json output.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { withQueueLock } from '../core/lock.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';

const VALID_MODES = [
  'build-full',
  'continue',
  'continue-all',
  'build-to-phase',
  'add-and-build',
  'run-command',
] as const;

export async function addCommand(
  project: string,
  mode: string,
  args: string[],
  opts: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();

  // Validate mode
  if (!VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
    process.stderr.write(
      `Error: Invalid mode '${mode}'. Valid: ${VALID_MODES.join(', ')}\n`,
    );
    process.exit(2);
  }

  // Validate project dir exists (except build-full which may create it)
  if (mode !== 'build-full') {
    const dir = path.join(config.projectDir, project);
    try {
      await access(dir);
    } catch {
      process.stderr.write(
        `Error: Project directory not found: ${dir}\n`,
      );
      process.exit(1);
    }
  }

  // Build the queue entry line
  const argsStr = args.length > 0 ? ` | ${args.join(' ')}` : '';
  const entryLine = `## ${project} | ${mode}${argsStr}`;

  // --dry-run: just show what would be added
  if (opts['dryRun'] === true) {
    if (isJsonMode()) {
      outputJson({
        action: 'dry-run',
        entry: { project, mode, args: args.join(' ') },
        line: entryLine,
      });
    } else {
      outputHuman(`Dry run — would add:\n  ${entryLine}`);
    }
    return;
  }

  // Append to QUEUE.md with file locking
  await withQueueLock(async () => {
    const content = await readFile(config.queueFile, 'utf8').catch(() => '');
    const newContent = content.trimEnd() + '\n\n' + entryLine + '\n';
    await writeFile(config.queueFile, newContent);
  });

  // Output
  if (isJsonMode()) {
    outputJson({
      action: 'added',
      entry: { project, mode, args: args.join(' ') },
    });
  } else {
    outputHuman(`✓ Added to queue: ${project} | ${mode}${argsStr}`);
  }
}
