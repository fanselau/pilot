/**
 * `pilot doctor` — Health check for Pilot system and individual projects.
 *
 * Without flags: Checks opencode binary, get-shit-done-cc binary, pilot data dir, system memory.
 * With --project <path>: Checks project-level config, commands, planning, git, agents.
 * Reports pass/fail/warn for each check. Supports --json output.
 *
 * NOTE: This is the v2 doctor — completely different from the deleted v1 version
 * which did PID/log scanning. This checks opencode binary, DB access, disk, memory.
 */

import { accessSync, constants as fsConstants, readFileSync, statSync } from 'node:fs';
import { access, readFile, readdir, lstat, stat } from 'node:fs/promises';
import { execaSync, execa } from 'execa';
import path from 'node:path';
import os from 'node:os';
import { getConfig } from '../core/config.js';
import { resolveOpencodeBinary } from '../core/delegate.js';
import { errMsg } from '../util/errors.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDir(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ── Project health check ───────────────────────────────────────────────────

async function projectHealthCheck(projectPath: string, smokeTest?: boolean, skipAgents?: boolean): Promise<Check[]> {
  const absPath = path.resolve(projectPath);
  const checks: Check[] = [];

  // ── Config Checks ──────────────────────────────────────────────────────

  // opencode.json exists
  const configPath = path.join(absPath, 'opencode.json');
  let configParsed: Record<string, unknown> | null = null;
  if (await fileExists(configPath)) {
    checks.push({ name: 'opencode.json exists', status: 'pass', detail: configPath });

    // opencode.json valid JSON
    try {
      const raw = await readFile(configPath, 'utf8');
      configParsed = JSON.parse(raw) as Record<string, unknown>;
      checks.push({ name: 'opencode.json valid JSON', status: 'pass', detail: 'Valid' });
    } catch (err) {
      checks.push({ name: 'opencode.json valid JSON', status: 'fail', detail: `Invalid JSON: ${errMsg(err)}` });
    }

    if (configParsed) {
      // opencode.json uses permission (singular)
      if ('permissions' in configParsed) {
        checks.push({
          name: 'permission key',
          status: 'fail',
          detail: 'Uses "permissions" (plural) — should be "permission" (singular)',
        });
      } else if ('permission' in configParsed) {
        checks.push({ name: 'permission key', status: 'pass', detail: 'Uses "permission" (singular)' });
      }

      // opencode.json instructions paths
      if (Array.isArray(configParsed.instructions)) {
        for (const instrPath of configParsed.instructions as string[]) {
          const resolvedPath = path.resolve(absPath, instrPath);
          if (await fileExists(resolvedPath)) {
            checks.push({ name: `instruction: ${instrPath}`, status: 'pass', detail: resolvedPath });
          } else {
            checks.push({ name: `instruction: ${instrPath}`, status: 'fail', detail: `Instruction file not found: ${instrPath}` });
          }
        }
      }

      // opencode.json permissions permissive
      const perm = configParsed.permission as Record<string, Record<string, string>> | undefined;
      if (perm) {
        for (const permType of ['read', 'write', 'edit', 'bash'] as const) {
          const permSection = perm[permType];
          if (permSection && permSection['**'] === 'allow') {
            checks.push({ name: `permission.${permType}`, status: 'pass', detail: '{ "**": "allow" }' });
          } else {
            checks.push({
              name: `permission.${permType}`,
              status: 'warn',
              detail: `Missing permissive ${permType} permission — add: { "**": "allow" }`,
            });
          }
        }
      }
    }
  } else {
    checks.push({ name: 'opencode.json exists', status: 'fail', detail: `Not found — run: pilot setup ${projectPath}` });
  }

  // ── Command Checks ─────────────────────────────────────────────────────

  const commandDir = path.join(absPath, '.opencode', 'command');
  if (await fileExists(commandDir)) {
    checks.push({ name: '.opencode/command/ exists', status: 'pass', detail: commandDir });

    // project commands linked
    const projectCommandsDir = path.join(absPath, 'commands');
    if (await isDir(projectCommandsDir)) {
      try {
        const projectCmds = (await readdir(projectCommandsDir)).filter(f => f.endsWith('.md'));
        let commandDirFiles: string[] = [];
        try {
          commandDirFiles = await readdir(commandDir);
        } catch { /* empty */ }
        const missing = projectCmds.filter(f => !commandDirFiles.includes(f));
        if (missing.length > 0) {
          checks.push({
            name: 'project commands linked',
            status: 'fail',
            detail: `Missing commands: ${missing.join(', ')}. Run: pilot setup ${projectPath}`,
          });
        } else if (projectCmds.length > 0) {
          checks.push({ name: 'project commands linked', status: 'pass', detail: `${projectCmds.length} commands linked` });
        }
      } catch { /* empty */ }
    }

    // gsd-help.md present (upstream installer sentinel)
    const helpMd = path.join(commandDir, 'gsd-help.md');
    if (await fileExists(helpMd)) {
      checks.push({ name: 'gsd-help.md present', status: 'pass', detail: 'Found' });
    } else {
      checks.push({ name: 'gsd-help.md present', status: 'fail', detail: 'gsd-help.md not found — run pilot setup --refresh' });
    }

    // gsd-tools.cjs present
    const opencodeDir = path.join(absPath, '.opencode');
    const toolsCjs = path.join(opencodeDir, 'get-shit-done', 'bin', 'gsd-tools.cjs');
    if (await fileExists(toolsCjs)) {
      checks.push({ name: 'gsd-tools.cjs present', status: 'pass', detail: 'Found' });
    } else {
      checks.push({ name: 'gsd-tools.cjs present', status: 'warn', detail: 'gsd-tools.cjs not found — run pilot setup --refresh' });
    }

    // GSD VERSION
    const versionFile = path.join(opencodeDir, 'get-shit-done', 'VERSION');
    try {
      const version = (await readFile(versionFile, 'utf8')).trim();
      checks.push({ name: 'GSD version', status: 'pass', detail: version });
    } catch {
      checks.push({ name: 'GSD version', status: 'warn', detail: 'VERSION file not found' });
    }

    // Broken symlinks in .opencode/
    try {
      const opencodeEntries = await readdir(opencodeDir);
      for (const entry of opencodeEntries) {
        const entryPath = path.join(opencodeDir, entry);
        try {
          const entryStats = await lstat(entryPath);
          if (entryStats.isSymbolicLink()) {
            try {
              await import('node:fs/promises').then(m => m.realpath(entryPath));
            } catch {
              checks.push({
                name: `broken symlink: .opencode/${entry}`,
                status: 'warn',
                detail: 'broken symlink — may need migration, run pilot setup --refresh',
              });
            }
          }
        } catch {
          // Can't stat — skip
        }
      }
    } catch {
      // Can't read .opencode/ — skip
    }
  } else {
    checks.push({ name: '.opencode/command/ exists', status: 'fail', detail: `Not found — run: pilot setup ${projectPath}` });
  }

  // ── Planning State Checks ──────────────────────────────────────────────

  const planningDir = path.join(absPath, '.planning');
  if (await isDir(planningDir)) {
    checks.push({ name: '.planning/ exists', status: 'pass', detail: planningDir });

    // .planning/ not gitignored
    const gitignorePath = path.join(absPath, '.gitignore');
    if (await fileExists(gitignorePath)) {
      try {
        const gitignoreContent = await readFile(gitignorePath, 'utf8');
        const lines = gitignoreContent.split('\n').map(l => l.trim());
        if (lines.some(l => l === '.planning/' || l === '.planning')) {
          checks.push({ name: '.planning/ not gitignored', status: 'warn', detail: '.planning/ is gitignored — planning artifacts should be committed' });
        } else {
          checks.push({ name: '.planning/ not gitignored', status: 'pass', detail: 'Not gitignored' });
        }
      } catch { /* empty */ }
    }

    // STATE.md exists
    if (await fileExists(path.join(planningDir, 'STATE.md'))) {
      checks.push({ name: 'STATE.md exists', status: 'pass', detail: 'Found' });
    } else {
      checks.push({ name: 'STATE.md exists', status: 'warn', detail: 'STATE.md not found — will be created on first planning run' });
    }

    // ROADMAP.md exists
    if (await fileExists(path.join(planningDir, 'ROADMAP.md'))) {
      checks.push({ name: 'ROADMAP.md exists', status: 'pass', detail: 'Found' });
    } else {
      checks.push({ name: 'ROADMAP.md exists', status: 'warn', detail: 'ROADMAP.md not found — will be created on first planning run' });
    }

    // config.json exists and valid
    const planConfigPath = path.join(planningDir, 'config.json');
    if (await fileExists(planConfigPath)) {
      try {
        const raw = await readFile(planConfigPath, 'utf8');
        JSON.parse(raw);
        checks.push({ name: '.planning/config.json', status: 'pass', detail: 'Valid JSON' });
      } catch (err) {
        checks.push({ name: '.planning/config.json', status: 'fail', detail: `Invalid JSON: ${errMsg(err)}` });
      }
    }
  } else {
    checks.push({ name: '.planning/ exists', status: 'fail', detail: `Not found — run: pilot add ${projectPath} "<description>"` });
  }

  // ── Git Checks ─────────────────────────────────────────────────────────

  const gitDir = path.join(absPath, '.git');
  if (await isDir(gitDir)) {
    checks.push({ name: 'git repository', status: 'pass', detail: 'Initialized' });

    // gc.auto disabled
    try {
      const gcResult = await execa('git', ['-C', absPath, 'config', 'gc.auto'], { reject: false });
      if (gcResult.exitCode === 0 && gcResult.stdout.trim() === '0') {
        checks.push({ name: 'gc.auto disabled', status: 'pass', detail: 'gc.auto = 0' });
      } else {
        checks.push({
          name: 'gc.auto disabled',
          status: 'warn',
          detail: `gc.auto not set to 0 — run: git -C ${absPath} config gc.auto 0`,
        });
      }
    } catch {
      checks.push({
        name: 'gc.auto disabled',
        status: 'warn',
        detail: `gc.auto not set to 0 — run: git -C ${absPath} config gc.auto 0`,
      });
    }

    // .opencode/ gitignored
    if (await fileExists(path.join(absPath, '.gitignore'))) {
      try {
        const gitignoreContent = await readFile(path.join(absPath, '.gitignore'), 'utf8');
        const lines = gitignoreContent.split('\n').map(l => l.trim());
        if (lines.some(l => l === '.opencode/' || l === '.opencode')) {
          checks.push({ name: '.opencode/ gitignored', status: 'pass', detail: 'In .gitignore' });
        } else {
          checks.push({ name: '.opencode/ gitignored', status: 'warn', detail: 'Add .opencode/ to .gitignore' });
        }
      } catch { /* empty */ }
    } else {
      checks.push({ name: '.opencode/ gitignored', status: 'warn', detail: 'Add .opencode/ to .gitignore' });
    }
  } else {
    checks.push({ name: 'git repository', status: 'fail', detail: 'Not a git repo — run: git init' });
  }

  // ── Notify status (informational) ────────────────────────────────────────

  try {
    const { getProject } = await import('../core/db.js');
    const projectRecord = getProject(absPath);
    if (projectRecord?.notifyOpenClawRoute) {
      checks.push({
        name: 'Notify route',
        status: 'pass',
        detail: `Structured route configured (agent: ${projectRecord.notifyOpenClawRoute.agentId})`,
      });
    } else if (projectRecord?.owner) {
      checks.push({
        name: 'Notify route',
        status: 'warn',
        detail: `Owner '${projectRecord.owner}' set but no structured route. Run: pilot project "${absPath}" --notify-openclaw --notify-agent ${projectRecord.owner} --notify-channel <channel> --notify-to <target>`,
      });
    } else {
      checks.push({
        name: 'Notify route',
        status: 'warn',
        detail: 'No notify configured (optional). To enable: pilot setup <dir> --owner <agent-id>',
      });
    }
  } catch {
    // DB unavailable — skip notify check silently
  }

  // ── Agent Checks ───────────────────────────────────────────────────────

  const agentsDir = path.join(absPath, '.opencode', 'agents');
  if (await fileExists(agentsDir)) {
    checks.push({ name: '.opencode/agents/ exists', status: 'pass', detail: agentsDir });
  } else {
    checks.push({ name: '.opencode/agents/ exists', status: 'warn', detail: 'No agents directory' });
  }

  // ── AGENTS.md Health Check ──────────────────────────────────────────────

  if (!skipAgents) {
    try {
      const { checkAgentsMdExists, spawnAgentsMdSession } = await import('../core/agents-md.js');
      const agentsMdExists = await checkAgentsMdExists(absPath);

      if (!agentsMdExists) {
        checks.push({
          name: 'AGENTS.md',
          status: 'warn',
          detail: `Not found — generate with: pilot setup ${projectPath}`,
        });
      } else {
        // Spawn AI session for drift detection using the AGENTS health operation.
        // The AI session reads AGENTS.md, package.json, and project structure
        // to detect stale references, wrong versions, and deleted paths.
        try {
          const result = await spawnAgentsMdSession({
            projectDir: absPath,
            operation: 'health',
            timeoutMs: 90_000,
          });

          if (result !== null && result.length > 0) {
            // Parse AI findings — any non-empty response with "drift", "stale", "issue", "warning"
            // keywords suggests problems; otherwise healthy
            const lower = result.toLowerCase();
            const hasDrift = /\b(drift|stale|outdated|mismatch|missing|deleted|wrong|issue|warning|error)\b/.test(lower);
            const detail = result.length > 200 ? result.slice(0, 197) + '...' : result;
            checks.push({
              name: 'AGENTS.md health',
              status: hasDrift ? 'warn' : 'pass',
              detail,
            });
          } else {
            checks.push({
              name: 'AGENTS.md health',
              status: 'warn',
              detail: 'Health check timed out or failed — skipped',
            });
          }
        } catch {
          checks.push({
            name: 'AGENTS.md health',
            status: 'warn',
            detail: 'Health check failed — skipped',
          });
        }
      }
    } catch (err) {
      // Import failure or unexpected error — never crash doctor
      checks.push({
        name: 'AGENTS.md health',
        status: 'warn',
        detail: `Health check unavailable: ${errMsg(err).slice(0, 150)}`,
      });
    }
  }

  // ── Smoke Test ─────────────────────────────────────────────────────────

  if (smokeTest) {
    try {
      const result = await execa('opencode', ['run', 'echo ok'], {
        cwd: absPath,
        timeout: 30_000,
        reject: false,
      });
      if (result.exitCode === 0 && result.stdout.includes('ok')) {
        checks.push({ name: 'smoke test', status: 'pass', detail: 'opencode run "echo ok" succeeded' });
      } else {
        checks.push({
          name: 'smoke test',
          status: 'fail',
          detail: `Exit code ${result.exitCode}: ${result.stderr.slice(0, 200)}`,
        });
      }
    } catch (err) {
      checks.push({ name: 'smoke test', status: 'fail', detail: `Smoke test failed: ${errMsg(err)}` });
    }
  }

  return checks;
}

// ── System health check (original behavior) ─────────────────────────────

async function systemHealthCheck(skipAgents?: boolean, fix?: boolean): Promise<Check[]> {
  const config = getConfig();
  const checks: Check[] = [];

  // Check opencode binary via the same resolution chain used at runtime
  const resolvedBinary = resolveOpencodeBinary();
  if (resolvedBinary !== 'opencode') {
    // Resolved to an actual path (absolute or PATH-resolved)
    checks.push({ name: 'opencode binary', status: 'pass', detail: resolvedBinary });
  } else {
    // Fell through to bare 'opencode' fallback — try PATH as last resort
    try {
      const whichResult = execaSync('which', ['opencode'], { reject: false });
      if (whichResult.stdout?.trim()) {
        checks.push({ name: 'opencode binary', status: 'pass', detail: whichResult.stdout.trim() });
      } else {
        checks.push({ name: 'opencode binary', status: 'fail', detail: 'Not found — install opencode' });
      }
    } catch {
      checks.push({ name: 'opencode binary', status: 'fail', detail: 'Not found — install opencode' });
    }
  }

  // Check get-shit-done-cc binary
  const pilotRoot = path.resolve(import.meta.dirname, '..', '..');
  const gsdBinPath = path.join(pilotRoot, 'node_modules', '.bin', 'get-shit-done-cc');
  try {
    accessSync(gsdBinPath);
    checks.push({ name: 'get-shit-done-cc', status: 'pass', detail: gsdBinPath });
  } catch {
    checks.push({ name: 'get-shit-done-cc', status: 'fail', detail: 'Not installed — run bun install' });
  }

  // Check pilot data directory
  try {
    accessSync(config.pilotDir);
    checks.push({ name: 'pilot dir', status: 'pass', detail: config.pilotDir });
  } catch {
    checks.push({ name: 'pilot dir', status: 'warn', detail: 'Will be created on first job add' });
  }

  // Check config file
  const configPath = path.join(config.pilotDir, 'config.json');
  try {
    accessSync(configPath);
    try {
      const raw = readFileSync(configPath, 'utf8');
      JSON.parse(raw);
      const stats = statSync(configPath);
      const mode = stats.mode & 0o777;
      if ((mode & 0o044) !== 0) {
        checks.push({
          name: 'config file',
          status: 'warn',
          detail: `${configPath} — world/group readable (mode: ${mode.toString(8)}), may expose tokens. Run: chmod 600 ${configPath}`,
        });
      } else {
        checks.push({ name: 'config file', status: 'pass', detail: configPath });
      }
    } catch (parseErr) {
      checks.push({
        name: 'config file',
        status: 'fail',
        detail: `${configPath} — invalid JSON: ${errMsg(parseErr)}`,
      });
    }
  } catch {
    checks.push({
      name: 'config file',
      status: 'warn',
      detail: 'No config file — using defaults. Run: pilot config init',
    });
  }

  // Check system memory
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  if (freeMb > 2048) {
    checks.push({ name: 'memory', status: 'pass', detail: `${freeMb}MB free` });
  } else if (freeMb > 500) {
    checks.push({ name: 'memory', status: 'warn', detail: `${freeMb}MB free (low)` });
  } else {
    checks.push({ name: 'memory', status: 'fail', detail: `${freeMb}MB free (critical)` });
  }

  // Check cgroups v2 availability
  try {
    const mountResult = execaSync('mount', [], { reject: false });
    const hasCgroup2 = mountResult.stdout.includes('cgroup2');
    if (hasCgroup2) {
      checks.push({ name: 'cgroups v2', status: 'pass', detail: 'cgroup2 mounted' });
    } else {
      checks.push({
        name: 'cgroups v2',
        status: 'warn',
        detail: 'cgroup2 not mounted — systemd-run memory limits will not work (Ubuntu 20.04 or older)',
      });
    }
  } catch {
    checks.push({
      name: 'cgroups v2',
      status: 'warn',
      detail: 'cgroup2 not mounted — systemd-run memory limits will not work (Ubuntu 20.04 or older)',
    });
  }

  // Check user lingering
  try {
    const username = os.userInfo().username;
    const result = execaSync('loginctl', ['show-user', username, '--property=Linger'], {
      reject: false,
    });
    const lingerOutput = result.exitCode === 0 ? result.stdout.trim() : 'Linger=unknown';
    if (lingerOutput.includes('Linger=yes')) {
      checks.push({ name: 'user lingering', status: 'pass', detail: 'Enabled via loginctl' });
    } else {
      checks.push({
        name: 'user lingering',
        status: 'warn',
        detail: `Not enabled (${lingerOutput}) — run: loginctl enable-linger ${username}`,
      });
    }
  } catch {
    checks.push({
      name: 'user lingering',
      status: 'warn',
      detail: 'Could not check — run: loginctl enable-linger $USER',
    });
  }

  // Show resource management configuration
  const sessionMb = config.sessionMemoryMaxMb;
  const reservedMb = config.reservedMemoryMb;
  const killMb = config.memoryKillThresholdMb;
  checks.push({
    name: 'resource limits',
    status: 'pass',
    detail: `session cap: ${sessionMb}MB | reserved: ${reservedMb}MB | kill threshold: ${killMb}MB`,
  });

  // ── Service unit health check ──────────────────────────────────────────────

  const unitPath = path.join(os.homedir(), '.config', 'systemd', 'user', 'pilot-runner.service');
  try {
    const unitContent = readFileSync(unitPath, 'utf8');
    // Parse ExecStart line
    const execStartMatch = unitContent.match(/^ExecStart=(.+)$/m);
    if (execStartMatch) {
      const execStartLine = execStartMatch[1].trim();
      // Extract the binary path from ExecStart (e.g. "/usr/bin/env bun /path/to/pilot run --daemon")
      // The actual pilot binary is after the interpreter part
      const parts = execStartLine.split(/\s+/);
      // Find the pilot binary: skip /usr/bin/env and bun/node, the next path-like arg is the binary
      let pilotBinaryPath: string | null = null;
      for (const part of parts) {
        if (part.startsWith('/') && !part.startsWith('/usr/bin/env') && part !== 'bun' && part !== 'node') {
          // Skip the interpreter binary if it's an absolute path to bun/node
          if (part.endsWith('/bun') || part.endsWith('/node')) continue;
          pilotBinaryPath = part;
          break;
        }
      }

      if (pilotBinaryPath) {
        try {
          accessSync(pilotBinaryPath, fsConstants.X_OK);
          checks.push({
            name: 'service unit',
            status: 'pass',
            detail: `ExecStart binary: ${pilotBinaryPath}`,
          });
        } catch {
          checks.push({
            name: 'service unit',
            status: 'fail',
            detail: `ExecStart points to missing binary: ${pilotBinaryPath} — run: pilot service install`,
          });
        }
      } else {
        checks.push({
          name: 'service unit',
          status: 'warn',
          detail: `Could not parse binary path from ExecStart: ${execStartLine.slice(0, 100)}`,
        });
      }
    } else {
      checks.push({
        name: 'service unit',
        status: 'warn',
        detail: 'No ExecStart found in unit file',
      });
    }
  } catch {
    checks.push({
      name: 'service unit',
      status: 'warn',
      detail: 'Service not installed — run: pilot service install',
    });
  }

  // ── Shell exposure health check ──────────────────────────────────────────
  try {
    const { verifyShellExposure } = await import('../core/shell-exposure.js');
    const exposure = await verifyShellExposure();

    // If --fix requested and any findings are non-pass, run ensureShellExposure
    const hasShellIssues = exposure.findings.some(f => f.status !== 'pass');
    if (fix && hasShellIssues) {
      const { ensureShellExposure } = await import('../core/shell-exposure.js');
      const fixResult = await ensureShellExposure();
      for (const finding of fixResult.findings) {
        const fixStatus = finding.status === 'fail' ? 'warn' : 'pass';
        const fixAction = finding.status === 'created' ? 'Fixed (created)' :
                          finding.status === 'refreshed' ? 'Fixed (refreshed)' :
                          finding.status === 'pass' ? 'OK' : 'Failed to fix';
        checks.push({
          name: `shell: ${finding.tool}`,
          status: fixStatus,
          detail: `${fixAction}: ${finding.stablePath} → ${finding.resolvedTarget}`,
        });
      }
    } else {
      for (const finding of exposure.findings) {
        if (finding.status === 'pass') {
          checks.push({
            name: `shell: ${finding.tool}`,
            status: 'pass',
            detail: `${finding.stablePath} → ${finding.resolvedTarget}`,
          });
        } else {
          checks.push({
            name: `shell: ${finding.tool}`,
            status: 'warn',
            detail: `${finding.detail} — run: pilot doctor --fix`,
          });
        }
      }
    }

    // Surface fnm exclusion as informational note
    checks.push({
      name: 'shell: fnm',
      status: 'pass',
      detail: exposure.fnmNote,
    });
  } catch (err) {
    checks.push({
      name: 'shell exposure',
      status: 'warn',
      detail: `Check failed: ${errMsg(err).slice(0, 150)}`,
    });
  }

  // ── AGENTS.md coverage across registered projects (file check only, no AI) ──

  if (!skipAgents) {
    try {
      const { getAllProjects } = await import('../core/db.js');
      const { checkAgentsMdExists } = await import('../core/agents-md.js');
      const projects = getAllProjects();

      if (projects.length > 0) {
        let withAgentsMd = 0;
        for (const proj of projects) {
          if (await checkAgentsMdExists(proj.path)) {
            withAgentsMd++;
          }
        }
        checks.push({
          name: 'AGENTS.md coverage',
          status: withAgentsMd === projects.length ? 'pass' : 'warn',
          detail: `${withAgentsMd}/${projects.length} projects have AGENTS.md`,
        });
      }
    } catch {
      // DB unavailable or import error — skip silently
    }
  }

  return checks;
}

// ── Main command ───────────────────────────────────────────────────────────

async function doctorCommand(projectPath?: string, smokeTest?: boolean, skipAgents?: boolean, fix?: boolean): Promise<void> {
  const checks = projectPath
    ? await projectHealthCheck(projectPath, smokeTest, skipAgents)
    : await systemHealthCheck(skipAgents, fix);

  if (isJsonMode()) {
    outputJson({ checks });
    return;
  }

  const title = projectPath
    ? `Pilot Doctor — Project: ${path.resolve(projectPath)}`
    : 'Pilot Doctor';

  outputHuman('');
  outputHuman(`  ${bold(title)}`);
  outputHuman('');
  for (const c of checks) {
    const icon =
      c.status === 'pass' ? green('✓') : c.status === 'fail' ? red('✗') : yellow('⚠');
    outputHuman(`  ${icon} ${c.name.padEnd(26)} ${dim(c.detail)}`);
  }
  outputHuman('');

  if (fix) {
    const shellFixed = checks.filter(c => c.name.startsWith('shell:') && c.detail.startsWith('Fixed'));
    if (shellFixed.length > 0) {
      outputHuman(`  ${green('✓')} Shell exposure repaired (${shellFixed.length} launcher(s))`);
      outputHuman('');
    }
  }

  const hasFail = checks.some(c => c.status === 'fail');
  if (hasFail) {
    process.exit(1);
  }
}

export { doctorCommand };
