#!/usr/bin/env node
/**
 * Pilot CLI entry point.
 *
 * Commander program setup with global --json/--verbose flags,
 * grouped help output, and dynamic imports for all commands.
 */

import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setJsonMode } from './util/output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command()
  .name('pilot')
  .description('THE interface for the Pilot autonomous AI development pipeline.')
  .version(pkg.version, '-V, --version', 'Print version')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output')
  .exitOverride()
  .configureOutput({
    writeErr: (str: string) => process.stderr.write(str),
  });

// ── Custom grouped help ────────────────────────────────────────────────────

program.configureHelp({
  formatHelp: (cmd: Command, helper) => {
    const title = `Usage: ${cmd.name()} [options] [command]\n\n${cmd.description()}\n`;

    // Format options using helper methods (NOT helper.formatHelp which would recurse)
    const optionLines = helper.visibleOptions(cmd)
      .map((opt) => {
        const flags = helper.optionTerm(opt).padEnd(17);
        return `  ${flags}${helper.optionDescription(opt)}`;
      })
      .join('\n');

    const optionsSection = `Options:\n${optionLines}`;

    const COL_WIDTH = 28;

    const groups = [
      {
        name: 'Monitoring',
        commands: [
          ['status [options]', 'Dashboard (default command)'],
          ['queue [options]', 'Show queue items'],
          ['stuck [options]', 'Find stuck processes'],
          ['log <session>', 'Session transcript'],
          ['tail <session>', 'Live-follow session'],
          ['projects [options]', 'All projects with state'],
          ['progress [project]', 'Deep project progress'],
        ],
      },
      {
        name: 'Setup',
        commands: [
          ['setup <dir>', 'Set up project for Pilot'],
          ['update', 'Update pilot-gsd definitions'],
          ['config', 'Show configuration'],
          ['import [file]', 'Import QUEUE.md into queue.json'],
          ['doctor [options]', 'Health check: validate setup'],
          ['cleanup [options]', 'Clean stale PIDs, old logs, orphans'],
        ],
      },
      {
        name: 'Queue Management',
        commands: [
          ['run [options]', 'Start queue runner'],
          ['stop [options]', 'Stop queue runner'],
          ['add <project> <req>', 'Smart add to queue'],
          ['build <project> [req]', 'Smart add + run'],
        ],
      },
      {
        name: 'Project Lifecycle',
        commands: [
          ['init <project> [desc]', 'Initialize new project'],
          ['plan <project> <phase>', 'Plan a phase'],
          ['execute <project> <phase>', 'Execute a phase'],
          ['verify <project> <phase>', 'Automated UAT'],
          ['quick <project> <desc>', 'Quick ad-hoc task'],
          ['debug <project> [desc]', 'Debug session'],
          ['research <project> <phase>', 'Research a phase'],
        ],
      },
      {
        name: 'Project Management',
        commands: [
          ['scope <project> <desc>', 'Add phase to roadmap'],
          ['insert <project> <N> <d>', 'Insert decimal phase'],
          ['remove <project> <N>', 'Remove future phase'],
          ['milestone <subcommand>', 'Milestone management'],
          ['todos <subcommand>', 'Todo management'],
          ['map <project>', 'Map existing codebase'],
        ],
      },
      {
        name: 'Dashboard',
        commands: [
          ['tui [options]', 'Full-screen TUI dashboard'],
        ],
      },
    ];

    const commandsSection = groups
      .map((group) => {
        const lines = group.commands
          .map(([cmd, desc]) => `  ${(cmd as string).padEnd(COL_WIDTH)}${desc}`)
          .join('\n');
        return `${group.name}:\n${lines}`;
      })
      .join('\n\n');

    return `${title}\n${optionsSection}\n\n${commandsSection}\n`;
  },
});

// ── Helper: merge global + local opts and set json mode ────────────────────

interface GlobalOpts {
  json?: boolean;
  verbose?: boolean;
}

function mergeOpts<T extends Record<string, unknown>>(localOpts: T): T & GlobalOpts {
  const globalOpts = program.opts<GlobalOpts>();
  const merged = { ...globalOpts, ...localOpts } as T & GlobalOpts;
  setJsonMode(merged.json === true);
  return merged;
}

// ── Default command: status ────────────────────────────────────────────────

program.action(async () => {
  const opts = mergeOpts({});
  const { statusCommand } = await import('./commands/status.js');
  await statusCommand(opts);
});

// ── Monitoring commands ────────────────────────────────────────────────────

program
  .command('status')
  .alias('s')
  .description('Dashboard: running, stuck, queued, completed')
  .option('-v, --verbose', 'Full tables')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(opts);
  });

const queueCmd = program
  .command('queue')
  .alias('q')
  .description('Show queue items')
  .option('--history', 'Show completed/failed history')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { queueCommand } = await import('./commands/queue.js');
    await queueCommand(opts);
  });

queueCmd.command('remove')
  .argument('<id>', 'Queue item ID')
  .description('Remove a queued item')
  .action(async (id: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    void opts;
    const { queueRemoveCommand } = await import('./commands/queue.js');
    await queueRemoveCommand(id, { ...program.opts(), ...localOpts });
  });

program
  .command('stuck')
  .description('Find stuck processes')
  .option('-t, --threshold <minutes>', 'Stuck threshold (minutes)')
  .option('-k, --kill', 'Kill stuck processes')
  .option('-f, --force', 'Skip confirmation')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { stuckCommand } = await import('./commands/stuck.js');
    await stuckCommand(opts);
  });

program
  .command('log')
  .argument('<session>', 'Session title or ID')
  .description('Session transcript')
  .action(async (session: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { logCommand } = await import('./commands/log.js');
    await logCommand(session, opts);
  });

program
  .command('tail')
  .argument('<session>', 'Session to follow')
  .description('Live-follow session')
  .action(async (session: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { tailCommand } = await import('./commands/tail.js');
    await tailCommand(session, opts);
  });

program
  .command('projects')
  .alias('p')
  .description('All projects with state')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { projectsCommand } = await import('./commands/projects.js');
    await projectsCommand(opts);
  });

program
  .command('progress')
  .alias('pg')
  .argument('[project]', 'Project name')
  .description('Deep project progress')
  .action(async (project: string | undefined, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { progressCommand } = await import('./commands/progress.js');
    await progressCommand(project, opts);
  });

// ── Setup commands ─────────────────────────────────────────────────────────

program
  .command('setup')
  .argument('<dir>', 'Project directory')
  .description('Set up project for Pilot')
  .option('--verify', 'Re-check existing setup')
  .action(async (dir: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(dir, opts);
  });

program
  .command('update')
  .description('Update pilot-gsd definitions')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand(opts);
  });

program
  .command('config')
  .description('Show configuration')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { configCommand } = await import('./commands/config.js');
    await configCommand(opts);
  });

program
  .command('import')
  .argument('[file]', 'QUEUE.md path (defaults to PILOT_QUEUE_FILE)')
  .description('Import QUEUE.md into queue.json')
  .action(async (file: string | undefined, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    void opts;
    const { importCommand } = await import('./commands/import.js');
    await importCommand(file, { ...program.opts(), ...localOpts });
  });

program
  .command('doctor')
  .description('Health check: validate setup')
  .option('--fix', 'Auto-fix what we can')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand(opts);
  });

program
  .command('cleanup')
  .description('Clean stale PIDs, old logs, orphans')
  .option('--dry-run', 'Show what would be cleaned')
  .option('--all', 'Aggressive mode (also clean history)')
  .option('--keep-days <days>', 'Keep files newer than N days', '7')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { cleanupCommand } = await import('./commands/cleanup.js');
    await cleanupCommand(opts);
  });

// ── Queue Management (Phase 2 stubs) ──────────────────────────────────────

program
  .command('run')
  .description('Start queue runner')
  .option('--max-parallel <n>', 'Max parallel jobs', '5')
  .option('--max-retries <n>', 'Max retries', '3')
  .option('--once', 'Process queue once then exit')
  .option('--dry-run', 'Show what would run')
  .option('--force', 'Ignore stale PID file')
  .option('--no-tui', 'Run in headless mode (no TUI)')
  .option('--notify', 'Enable notifications')
  .option('--quiet', 'Suppress notifications')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { runCommand } = await import('./commands/run.js');
    await runCommand(opts);
  });

program
  .command('stop')
  .description('Stop queue runner')
  .option('-f, --force', 'Force kill after timeout')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { stopCommand } = await import('./commands/stop.js');
    await stopCommand(opts);
  });

program
  .command('add')
  .argument('<project>', 'Project name')
  .argument('<requirement>', 'Requirements file, directory, or description')
  .description('Smart add: auto-detects scope and queues work')
  .option('--dry-run', 'Show what would happen')
  .option('--as <scope>', 'Override scope: quick, phase, milestone')
  .action(async (project: string, input: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { addCommand } = await import('./commands/add.js');
    const result = await addCommand(project, input, opts);
    if (opts.json) {
      const { outputJson } = await import('./util/output.js');
      outputJson({
        action: result.dryRun ? 'dry-run' : 'added',
        ...result,
      });
    }
  });

program
  .command('build')
  .argument('<project>', 'Project name')
  .argument('[requirement]', 'Requirements file, directory, or description')
  .description('Smart add + run (convenience)')
  .option('--no-run', 'Add to queue without starting runner')
  .option('--as <scope>', 'Override scope: quick, phase, milestone')
  .action(async (project: string, input: string | undefined, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { buildCommand } = await import('./commands/build.js');
    await buildCommand(project, input, opts);
  });

// ── Project Lifecycle (Phase 2 stubs) ──────────────────────────────────────

program
  .command('init')
  .argument('<project>', 'Project name')
  .argument('[desc]', 'Project description')
  .description('Initialize new project')
  .option('--auto', 'Non-interactive mode')
  .action(async (project: string, desc: string | undefined, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { initCommand } = await import('./commands/init.js');
    await initCommand(project, desc, opts);
  });

program
  .command('plan')
  .argument('<project>', 'Project name')
  .argument('<phase>', 'Phase number')
  .description('Plan a phase')
  .option('--research', 'Include research')
  .option('--skip-research', 'Skip research')
  .option('--gaps', 'Plan gap closure')
  .action(async (project: string, phase: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { planCommand } = await import('./commands/plan.js');
    await planCommand(project, phase, opts);
  });

program
  .command('execute')
  .argument('<project>', 'Project name')
  .argument('<phase>', 'Phase number')
  .description('Execute a phase')
  .option('--gaps-only', 'Execute only gap closure')
  .action(async (project: string, phase: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { executeCommand } = await import('./commands/execute.js');
    await executeCommand(project, phase, opts);
  });

program
  .command('verify')
  .argument('<project>', 'Project name')
  .argument('<phase>', 'Phase number')
  .description('Automated UAT')
  .option('--port <port>', 'Port for verification server')
  .option('-s, --strategy <strategy>', 'Verify strategy: auto|browser|file|cli', 'auto')
  .action(async (project: string, phase: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { verifyCommand } = await import('./commands/verify.js');
    await verifyCommand(project, phase, opts);
  });

program
  .command('quick')
  .argument('<project>', 'Project name')
  .argument('<desc>', 'Task description')
  .description('Quick ad-hoc task')
  .action(async (project: string, desc: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { quickCommand } = await import('./commands/quick.js');
    await quickCommand(project, desc, opts);
  });

program
  .command('debug')
  .argument('<project>', 'Project name')
  .argument('[desc]', 'Debug description')
  .description('Debug session')
  .action(async (project: string, desc: string | undefined, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { debugCommand } = await import('./commands/debug.js');
    await debugCommand(project, desc, opts);
  });

program
  .command('research')
  .argument('<project>', 'Project name')
  .argument('<phase>', 'Phase number')
  .description('Research a phase')
  .action(async (project: string, phase: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { researchCommand } = await import('./commands/research.js');
    await researchCommand(project, phase, opts);
  });

// ── Project Management (Phase 2 stubs) ────────────────────────────────────

program
  .command('scope')
  .argument('<project>', 'Project name')
  .argument('<desc>', 'Phase description')
  .description('Add phase to roadmap')
  .option('--build', 'Also add + run')
  .action(async (project: string, desc: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { scopeCommand } = await import('./commands/scope.js');
    await scopeCommand(project, desc, opts);
  });

program
  .command('insert')
  .argument('<project>', 'Project name')
  .argument('<n>', 'Phase number')
  .argument('<desc>', 'Phase description')
  .description('Insert decimal phase')
  .action(async (project: string, n: string, desc: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { insertCommand } = await import('./commands/insert.js');
    await insertCommand(project, n, desc, opts);
  });

program
  .command('remove')
  .argument('<project>', 'Project name')
  .argument('<n>', 'Phase number')
  .description('Remove future phase')
  .action(async (project: string, n: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { removeCommand } = await import('./commands/remove.js');
    await removeCommand(project, n, opts);
  });

program
  .command('milestone')
  .argument('<subcommand>', 'Milestone subcommand')
  .argument('[args...]', 'Subcommand arguments')
  .description('Milestone management')
  .action(async (subcommand: string, args: string[], localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { milestoneCommand } = await import('./commands/milestone.js');
    await milestoneCommand(subcommand, args, opts);
  });

program
  .command('todos')
  .argument('<subcommand>', 'Todo subcommand')
  .argument('[args...]', 'Subcommand arguments')
  .description('Todo management')
  .action(async (subcommand: string, args: string[], localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { todosCommand } = await import('./commands/todos.js');
    await todosCommand(subcommand, args, opts);
  });

program
  .command('map')
  .argument('<project>', 'Project name')
  .description('Map existing codebase')
  .action(async (project: string, localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { mapCommand } = await import('./commands/map.js');
    await mapCommand(project, opts);
  });

// ── Dashboard (Phase 3) ───────────────────────────────────────────────────

program
  .command('tui')
  .description('Full-screen TUI dashboard')
  .option('-i, --interval <seconds>', 'Refresh interval', '3')
  .action(async (localOpts: Record<string, unknown>) => {
    const opts = mergeOpts(localOpts);
    const { tuiCommand } = await import('./commands/tui.js');
    await tuiCommand(opts);
  });

// ── Parse and execute ─────────────────────────────────────────────────────

try {
  await program.parseAsync();
} catch (err: unknown) {
  if (err instanceof CommanderError) {
    // Commander errors (unknown command, missing arg, help, version)
    // .exitOverride() throws CommanderError instead of calling process.exit
    // Help and version have exitCode 0
    if (err.exitCode === 0) {
      process.exit(0);
    }
    process.exit(2);
  }
  // Runtime errors
  if (err instanceof Error) {
    process.stderr.write(`Error: ${err.message}\n`);
  }
  process.exit(1);
}
