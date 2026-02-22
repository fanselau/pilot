#!/usr/bin/env node
/**
 * Pilot v2 CLI entry point.
 *
 * Registers all v2 commands with commander. Command implementations
 * are stubs until wired in Plans 06-07.
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setJsonMode } from './util/output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

const program = new Command()
  .name('pilot')
  .description('Autonomous AI development pipeline — queue, delegate, execute, monitor.')
  .version(pkg.version, '-V, --version')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output');

// ── Global option handling ────────────────────────────────────────────────

program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = actionCommand.optsWithGlobals() as { json?: boolean };
  if (opts.json) {
    setJsonMode(true);
  }
});

// ── Stub helper ───────────────────────────────────────────────────────────

function stub(name: string): () => void {
  return () => {
    process.stderr.write(`pilot ${name}: not yet implemented (v2 Plan 06-07)\n`);
    process.exit(1);
  };
}

// ── Default command: status ───────────────────────────────────────────────

program.action(stub('status'));

// ── Core commands (daily use) ─────────────────────────────────────────────

program
  .command('add <project> <requirement>')
  .description('Queue work: auto-detects scope or use --as')
  .option('--as <scope>', 'Force scope: quick, phase, or milestone')
  .option('--next', 'Insert at front of queue')
  .option('--dry-run', 'Show what would happen without queuing')
  .action(stub('add'));

program
  .command('status [project]')
  .alias('s')
  .description('One-shot dashboard to stdout')
  .action(stub('status'));

program
  .command('log [id]')
  .description('Session transcript')
  .option('--follow', 'Live tail new messages')
  .option('--last <n>', 'Show last N messages', parseInt)
  .action(stub('log'));

program
  .command('queue')
  .alias('q')
  .description('Show job queue')
  .action(stub('queue'));

program
  .command('cancel <id>')
  .description('Cancel a pending job')
  .action(stub('cancel'));

program
  .command('retry <id>')
  .description('Retry a failed job')
  .action(stub('retry'));

program
  .command('bump <id>')
  .description('Move job to front of queue')
  .action(stub('bump'));

// ── Infrastructure commands ───────────────────────────────────────────────

program
  .command('setup <dir>')
  .description('Set up project for Pilot (links pilot-gsd)')
  .action(stub('setup'));

program
  .command('update')
  .description('Update pilot-gsd definitions')
  .action(stub('update'));

program
  .command('doctor')
  .description('Health check: opencode binary, DB access, disk, memory')
  .option('--fix', 'Attempt to fix issues')
  .action(stub('doctor'));

program
  .command('service <action>')
  .description('Daemon management: start, stop, status')
  .action(stub('service'));

program
  .command('gc')
  .description('Clean old sessions, compact DBs')
  .action(stub('gc'));

program
  .command('config')
  .description('Show resolved configuration')
  .action(stub('config'));

// ── Parse and run ─────────────────────────────────────────────────────────

program.parse();
