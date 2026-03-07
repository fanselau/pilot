import { getJob } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';

interface UndoOptions {
  dryRun?: boolean;
  force?: boolean;
}

async function undoCommand(id: string, opts: UndoOptions): Promise<void> {
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }

  if (isJsonMode()) {
    outputJson({
      id,
      status: 'not-implemented',
      message: 'undo safety pipeline will be implemented in the next task',
      dryRun: opts.dryRun ?? false,
      force: opts.force ?? false,
    });
    return;
  }

  outputHuman(`Undo command wired for job ${job.id}.`);
  process.stderr.write('Undo safety pipeline not implemented yet.\n');
  process.exit(2);
}

export { undoCommand };
