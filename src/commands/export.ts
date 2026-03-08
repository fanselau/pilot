import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getJob, getJobSteps } from '../core/db.js';
import { getConfig } from '../core/config.js';
import { buildJobObservability } from '../core/job-observability.js';
import { buildJobExportMarkdown } from '../core/job-export.js';
import { buildJobWhy, buildRetryWhy, buildUndoWhy } from '../core/job-introspection.js';
import { errMsg } from '../util/errors.js';
import { isJsonMode, outputHuman, outputJson } from '../util/output.js';

interface ExportOptions {
  json?: boolean;
  output?: string;
  stdout?: boolean;
}

function resolveOutputPath(jobId: string, explicitPath?: string): { outputPath: string; mode: 'default' | 'explicit' } {
  if (explicitPath) {
    return { outputPath: path.resolve(explicitPath), mode: 'explicit' };
  }

  const config = getConfig();
  return {
    outputPath: path.join(config.pilotDir, 'exports', `job-${jobId}.md`),
    mode: 'default',
  };
}

async function exportCommand(id: string, opts: ExportOptions): Promise<void> {
  void opts.json; // handled globally via util/output json mode

  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }

  if (opts.output && opts.stdout) {
    process.stderr.write('Invalid options: use either --output <path> or --stdout, not both.\n');
    process.exit(2);
  }

  const steps = getJobSteps(id);
  const observability = buildJobObservability(job);
  const markdown = buildJobExportMarkdown({
    job,
    steps,
    observability,
    statusWhy: buildJobWhy(job),
    retryWhy: buildRetryWhy(job),
    undoWhy: buildUndoWhy(job),
  });

  if (opts.stdout) {
    if (isJsonMode()) {
      outputJson({
        jobId: id,
        mode: 'stdout',
        markdown,
      });
      return;
    }

    process.stdout.write(`${markdown}\n`);
    return;
  }

  const { outputPath, mode } = resolveOutputPath(id, opts.output);
  try {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${markdown}\n`, 'utf8');
  } catch (error) {
    process.stderr.write(`Failed to write export artifact to ${outputPath}: ${errMsg(error)}\n`);
    process.stderr.write('Try a different path with --output <path> or use --stdout.\n');
    process.exit(1);
  }

  if (isJsonMode()) {
    outputJson({
      jobId: id,
      mode,
      outputPath,
      bytes: Buffer.byteLength(markdown, 'utf8'),
    });
    return;
  }

  outputHuman('');
  outputHuman(`  Export written: ${outputPath}`);
  outputHuman(`  Tip: use \`pilot export ${id} --stdout\` to stream markdown directly.`);
  outputHuman('');
}

export {
  exportCommand,
};

export type {
  ExportOptions,
};
