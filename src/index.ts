#!/usr/bin/env node
/**
 * Pilot v2 CLI entry point.
 *
 * All commands wired with dynamic imports for fast startup.
 * Default command (no args) shows status dashboard.
 * Global --json flag handled via preAction hook.
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

// ── Default command: status ───────────────────────────────────────────────

program.action(async () => {
  const { statusCommand } = await import('./commands/status.js');
  await statusCommand(program.opts() as { json?: boolean });
});

// ── Core commands (daily use) ─────────────────────────────────────────────

program
  .command('add <project> <requirement>')
  .description('Queue work: auto-detects scope or use --as')
  .option('--as <scope>', 'Force scope: quick, phase, or milestone')
  .option('--next', 'Insert at front of queue')
  .option('--dry-run', 'Show what would happen without queuing')
  .option('--profile <profile>', 'Model profile: quality, balanced, or budget')
  .option('--provider <provider>', 'Provider mode (run pilot models to see available modes)')
  .option('--force', 'Bypass project setup check')
  .option('--start-immediately', 'Bypass queue grace wait and launch as soon as eligible (less review/cancel time)')
  .option('--timeout <minutes>', 'Per-job timeout in minutes (default: 0 = infinite)', (v: string) => parseInt(v, 10))
  .option('--notify <agentId>', 'Agent ID to notify on completion (optional, e.g. main)')
  .option('--notify-url <url>', 'Custom webhook URL for completion callback')
  .option('--no-notify', 'Explicitly skip completion notification')
  .option('--categories <cats>', 'Skill categories for this job (comma-separated): frontend,testing')
  .option('--no-categories', 'Skip skill injection (universal skills only)')
  .action(async (project: string, requirement: string, opts: Record<string, unknown>) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(project, requirement, { ...program.opts(), ...opts } as Parameters<typeof addCommand>[2]);
  });

program
  .command('status [project]')
  .alias('s')
  .description('One-shot dashboard to stdout')
  .option('--why', 'Show concise reason/action guidance for queued and guarded jobs')
  .action(async (_project: string | undefined, opts: Record<string, unknown>) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand({ ...program.opts(), ...opts } as { json?: boolean; why?: boolean });
  });

program
  .command('log [id]')
  .description('Session activity stream')
  .option('--summary', 'Show compact metadata summary instead of full transcript stream')
  .option('--follow', 'Live tail new activity')
  .option('--last <n>', 'Show last N parts', parseInt)
  .option('-v, --verbose', 'Show reasoning and full tool output')
  .option('--delegation', 'Show only delegation session')
  .option('--flat', 'Show task parts without expanding child sessions')
  .option('--task <n>', 'Show only the Nth child session (1-indexed)', (v: string) => parseInt(v, 10))
  .action(async (id: string | undefined, opts: Record<string, unknown>) => {
    const { logCommand } = await import('./commands/log.js');
    await logCommand(id, { ...program.opts(), ...opts } as Parameters<typeof logCommand>[1]);
  });

program
  .command('info <id>')
  .description('Full job metadata, config, tokens, and cost')
  .action(async (id: string) => {
    const { infoCommand } = await import('./commands/info.js');
    await infoCommand(id, program.opts() as { json?: boolean });
  });

program
  .command('export <id>')
  .description('Generate portable markdown artifact for a job')
  .option('--output <path>', 'Write export markdown to a specific file path')
  .option('--stdout', 'Print markdown export to stdout instead of writing a file')
  .action(async (id: string, opts: Record<string, unknown>) => {
    const { exportCommand } = await import('./commands/export.js');
    await exportCommand(id, { ...program.opts(), ...opts } as { json?: boolean; output?: string; stdout?: boolean });
  });

program
  .command('queue')
  .alias('q')
  .description('Show job queue')
  .option('--history', 'Show completed/failed jobs')
  .action(async (opts: Record<string, unknown>) => {
    const { queueCommand } = await import('./commands/queue.js');
    await queueCommand({ ...program.opts(), ...opts } as Parameters<typeof queueCommand>[0]);
  });

// ── Queue management ──────────────────────────────────────────────────────

program
  .command('cancel <id>')
  .description('Cancel a pending job')
  .action(async (id: string) => {
    const { cancelCommand } = await import('./commands/cancel.js');
    await cancelCommand(id);
  });

program
  .command('kill <id>')
  .description('Force-quit a running job (kills opencode session + marks failed)')
  .option('--force', 'Force termination (default behavior, kept for backward compat)')
  .action(async (id: string, opts: Record<string, unknown>) => {
    const { killCommand } = await import('./commands/kill.js');
    await killCommand(id, opts as { force?: boolean });
  });

program
  .command('undo <id>')
  .description('Undo a job using recorded git recovery checkpoints')
  .option('--dry-run', 'Preview what undo would reset without mutating git state')
  .option('--force', 'Override guarded-history safety refusals')
  .action(async (id: string, opts: Record<string, unknown>) => {
    const { undoCommand } = await import('./commands/undo.js');
    await undoCommand(id, opts as { dryRun?: boolean; force?: boolean });
  });

program
  .command('bump <id>')
  .description('Move job to front of queue')
  .action(async (id: string) => {
    const { bumpCommand } = await import('./commands/bump.js');
    await bumpCommand(id);
  });

program
  .command('milestone <action> <id>')
  .description('Milestone management: status, resume, skip')
  .action(async (action: string, id: string) => {
    const { milestoneCommand } = await import('./commands/milestone.js');
    await milestoneCommand(action, id);
  });

// ── Infrastructure ────────────────────────────────────────────────────────

program
  .command('init')
  .description('Interactive first-time configuration setup')
  .option('--yes', 'Accept auto-detected defaults without prompting')
  .option('--force', 'Overwrite existing config file')
  .action(async (opts: Record<string, unknown>) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(opts as { yes?: boolean; force?: boolean });
  });

program
  .command('setup <dir>')
  .description('Set up project for Pilot (installs GSD commands)')
  .option('--verify', 'Verify existing setup')
  .option('--refresh', 'Refresh existing setup (re-link symlinks, merge config)')
  .option('--force', 'With --refresh: overwrite opencode.json instead of merging')
  .option('--skip-skills', 'With --refresh: skip skill re-offering')
  .option('--owner <agentId>', 'Register project owner (agent ID for notifications)')
  .option('--update', 'Update owner of existing registered project')
  .option('--categories <categories>', 'Set default skill categories for this project (comma-separated)')
  .action(async (dir: string, opts: Record<string, unknown>) => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(dir, opts as { verify?: boolean; refresh?: boolean; force?: boolean; skipSkills?: boolean; owner?: string; update?: boolean; categories?: string });
  });

program
  .command('projects')
  .description('List all registered managed projects')
  .option('--blocked', 'Show only blocked projects')
  .action(async (opts: Record<string, unknown>) => {
    const { projectsCommand } = await import('./commands/projects.js');
    await projectsCommand(opts as { blocked?: boolean });
  });

program
  .command('project <path>')
  .description('Show or manage a registered project')
  .option('--block <reason>', 'Block project with reason')
  .option('--unblock', 'Unblock a blocked project')
  .option('--owner <agentId>', 'Change project owner')
  .option('--notify-openclaw', 'Set a structured OpenClaw notify route on this project')
  .option('--notify-agent <agentId>', 'Route field: target OpenClaw agent id')
  .option('--notify-channel <channel>', 'Route field: reply channel (e.g. telegram)')
  .option('--notify-to <target>', 'Route field: reply target (e.g. telegram:-123456)')
  .option('--notify-account <accountId>', 'Route field: optional reply account id')
  .option('--clear-notify-openclaw', 'Clear the structured OpenClaw notify route for this project')
  .option('--jobs', 'Show recent jobs for this project')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const { projectCommand } = await import('./commands/project.js');
    await projectCommand(path, opts as Parameters<typeof projectCommand>[1]);
  });

program
  .command('unblock <project>')
  .description('Unblock a blocked project (allow queued jobs to run)')
  .action(async (project: string) => {
    const { unblockCommand } = await import('./commands/unblock.js');
    await unblockCommand(project);
  });

program
  .command('update')
  .description('Update GSD commands for all projects')
  .action(async () => {
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand();
  });

const configCmd = program
  .command('config')
  .description('Configuration management');

// Default action (no subcommand) = show
configCmd.action(async () => {
  const { configShowCommand } = await import('./commands/config.js');
  await configShowCommand();
});

configCmd
  .command('init')
  .description('Create config file with defaults')
  .option('--defaults', 'Write all defaults without prompting')
  .action(async (opts: Record<string, unknown>) => {
    const { configInitCommand } = await import('./commands/config.js');
    await configInitCommand(opts as { defaults?: boolean });
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value (dot-notation: runner.pollInterval)')
  .action(async (key: string, value: string) => {
    const { configSetCommand } = await import('./commands/config.js');
    await configSetCommand(key, value);
  });

configCmd
  .command('get <key>')
  .description('Get a resolved config value')
  .action(async (key: string) => {
    const { configGetCommand } = await import('./commands/config.js');
    await configGetCommand(key);
  });

configCmd
  .command('path')
  .description('Show config file path')
  .action(async () => {
    const { configPathCommand } = await import('./commands/config.js');
    await configPathCommand();
  });

configCmd
  .command('edit')
  .description('Open config in $EDITOR')
  .action(async () => {
    const { configEditCommand } = await import('./commands/config.js');
    await configEditCommand();
  });

const skillsCmd = program
  .command('skills')
  .description('Manage skill library for AI sessions');

// Default action (no subcommand) = list
skillsCmd.action(async () => {
  const { skillsListCommand } = await import('./commands/skills.js');
  await skillsListCommand();
});

skillsCmd
  .command('list')
  .description('List installed skills')
  .action(async () => {
    const { skillsListCommand } = await import('./commands/skills.js');
    await skillsListCommand();
  });

skillsCmd
  .command('register <repo>')
  .description('Register a skill in the manifest (e.g. https://github.com/owner/repo)')
  .requiredOption('--skill <name>', 'Skill name within the repo')
  .requiredOption('--categories <cats>', 'Assign categories (comma-separated)')
  .action(async (repo: string, opts: Record<string, unknown>) => {
    const { skillsRegisterCommand } = await import('./commands/skills.js');
    await skillsRegisterCommand(repo, opts as { skill: string; categories: string });
  });

skillsCmd
  .command('remove <name>')
  .description('Remove an installed skill')
  .action(async (name: string) => {
    const { skillsRemoveCommand } = await import('./commands/skills.js');
    await skillsRemoveCommand(name);
  });

skillsCmd
  .command('categories')
  .description('List all categories with skill counts')
  .action(async () => {
    const { skillsCategoriesCommand } = await import('./commands/skills.js');
    await skillsCategoriesCommand();
  });

skillsCmd
  .command('tag <name>')
  .description('Add/update categories for an installed skill')
  .requiredOption('--categories <cats>', 'Categories (comma-separated)')
  .action(async (name: string, opts: Record<string, unknown>) => {
    const { skillsTagCommand } = await import('./commands/skills.js');
    await skillsTagCommand(name, opts as { categories: string });
  });



const modelsCmd = program
  .command('models')
  .description('View and edit model assignments');

// Default action (no subcommand) = show
modelsCmd.action(async () => {
  const { modelsShowCommand } = await import('./commands/models.js');
  await modelsShowCommand(program.opts() as { json?: boolean });
});

modelsCmd
  .command('show [mode]')
  .description('Show model mapping for a provider mode')
  .action(async (mode: string | undefined) => {
    const { modelsShowCommand } = await import('./commands/models.js');
    await modelsShowCommand({ ...program.opts(), providerMode: mode } as { json?: boolean; providerMode?: string });
  });

modelsCmd
  .command('edit')
  .description('Interactive model reassignment')
  .action(async () => {
    const { modelsEditCommand } = await import('./commands/models.js');
    await modelsEditCommand(program.opts() as { json?: boolean });
  });

modelsCmd
  .command('reset [mode]')
  .description('Reset model assignments to built-in defaults')
  .action(async (mode: string | undefined) => {
    const { modelsResetCommand } = await import('./commands/models.js');
    await modelsResetCommand(mode, program.opts() as { json?: boolean });
  });

modelsCmd
  .command('add-provider <name>')
  .description('Create a new custom provider mode')
  .option('--clone <mode>', 'Clone entries from an existing provider mode')
  .action(async (name: string, opts: Record<string, unknown>) => {
    const { modelsAddProviderCommand } = await import('./commands/models.js');
    await modelsAddProviderCommand(name, { ...program.opts(), ...opts } as { clone?: string; json?: boolean });
  });

modelsCmd
  .command('remove-provider <name>')
  .description('Remove a custom provider mode')
  .action(async (name: string) => {
    const { modelsRemoveProviderCommand } = await import('./commands/models.js');
    await modelsRemoveProviderCommand(name, program.opts() as { json?: boolean });
  });

modelsCmd
  .command('diff')
  .description('Show customized model entries vs built-in defaults')
  .option('--provider-mode <mode>', 'Provider mode to diff (default: configured mode)')
  .action(async (opts: Record<string, unknown>) => {
    const { modelsDiffCommand } = await import('./commands/models.js');
    await modelsDiffCommand({ ...program.opts(), providerMode: opts.providerMode as string | undefined } as { json?: boolean; providerMode?: string });
  });

modelsCmd
  .command('export')
  .description('Export all model config as JSON')
  .action(async () => {
    const { modelsExportCommand } = await import('./commands/models.js');
    await modelsExportCommand(program.opts() as { json?: boolean });
  });

modelsCmd
  .command('import <file>')
  .description('Import model config from JSON file')
  .action(async (file: string) => {
    const { modelsImportCommand } = await import('./commands/models.js');
    await modelsImportCommand(file, program.opts() as { json?: boolean });
  });

program
  .command('doctor')
  .description('Health check: opencode binary, DB access, disk, memory')
  .option('--project <path>', 'Check a specific project setup')
  .option('--smoke-test', 'Run a live smoke test (requires --project)')
  .option('--skip-agents', 'Skip AI-powered AGENTS.md health check')
  .option('--fix', 'Auto-repair shell exposure (create stable launchers in ~/.local/bin)')
  .action(async (opts: Record<string, unknown>) => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand(opts.project as string | undefined, opts.smokeTest as boolean | undefined, opts.skipAgents as boolean | undefined, opts.fix as boolean | undefined);
  });

program
  .command('lessons [project]')
  .description('Extract lessons from recent builds into AGENTS.md candidates')
  .option('--approve', 'Interactive picker to promote candidates (coming soon)')
  .action(async (project: string | undefined, opts: Record<string, unknown>) => {
    const { lessonsCommand } = await import('./commands/lessons.js');
    await lessonsCommand(project, opts as { approve?: boolean });
  });

program
  .command('service <action>')
  .description('Daemon management: install, start, stop, status')
  .action(async (action: string) => {
    const { serviceCommand } = await import('./commands/service.js');
    await serviceCommand(action);
  });

program
  .command('reload')
  .description('Signal running daemon to reload after build')
  .action(async () => {
    const { reloadCommand } = await import('./commands/reload.js');
    await reloadCommand();
  });

program
  .command('gc')
  .description('Clean old jobs, vacuum DB, remove orphaned PID files')
  .option('--dry-run', 'Preview what would be cleaned without doing it')
  .option('--days <number>', 'Age threshold in days (default: 30)', parseInt)
  .action(async (opts: Record<string, unknown>) => {
    const { gcCommand } = await import('./commands/gc.js');
    await gcCommand({ ...program.opts(), ...opts } as { dryRun?: boolean; days?: number; json?: boolean });
  });

// ── TUI dashboard ─────────────────────────────────────────────────────────

program
  .command('tui')
  .description('Full-screen TUI dashboard')
  .option('--interval <seconds>', 'Refresh interval', parseInt, 3)
  .action(async (opts: Record<string, unknown>) => {
    const { tuiCommand } = await import('./commands/tui.js');
    await tuiCommand({ interval: opts.interval as number | undefined });
  });

// ── Runner (foreground) ───────────────────────────────────────────────────

program
  .command('run')
  .description('Start queue runner in foreground')
  .option('--once', 'Process queue once then exit')
  .option('--daemon', 'Run as daemon (no TTY output)')
  .option('--max-parallel <n>', 'Max concurrent jobs', parseInt)
  .action(async (opts: Record<string, unknown>) => {
    const { createRunner } = await import('./core/runner.js');
    const runner = createRunner({
      once: opts.once as boolean | undefined,
      maxParallel: opts.maxParallel as number | undefined,
    });
    await runner.run();
  });

// ── Parse and run ─────────────────────────────────────────────────────────

program.parse();
