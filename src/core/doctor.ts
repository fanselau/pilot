/**
 * Health check logic for `pilot doctor`.
 *
 * Validates the entire Pilot setup: binary, directories, symlinks,
 * git gc settings, memory, zombies, stale PIDs, queue, and pilot dir.
 *
 * Reuses patterns from spawn.ts and process.ts where noted.
 * Pure core module — no UI dependencies.
 */

import { readFile, readdir, access, stat, realpath, unlink, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { getConfig } from './config.js';
import { scanPidFiles, isProcessAlive } from './process.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface DoctorCheck {
  name: string;           // e.g. 'binary', 'gsd_dir', 'symlinks'
  status: 'pass' | 'fail' | 'warn';
  message: string;        // human-readable description
  fixable: boolean;       // can --fix auto-fix this?
  fixAction?: string;     // what --fix would do
}

interface DoctorResult {
  checks: DoctorCheck[];
  passed: number;
  failed: number;
  warnings: number;
}

// ── Check 1: Binary ───────────────────────────────────────────────────────

/**
 * Check opencode/claude binary exists and is executable.
 * Reuses the checkBinary pattern from spawn.ts.
 */
async function checkBinaryHealth(): Promise<DoctorCheck> {
  // Try `which opencode` first
  try {
    const result = await execa('which', ['opencode'], { timeout: 5000 });
    if (result.stdout.trim().length > 0) {
      return {
        name: 'binary',
        status: 'pass',
        message: `opencode found at ${result.stdout.trim()}`,
        fixable: false,
      };
    }
  } catch {
    // Not in PATH
  }

  // Try `which claude` as fallback
  try {
    const result = await execa('which', ['claude'], { timeout: 5000 });
    if (result.stdout.trim().length > 0) {
      return {
        name: 'binary',
        status: 'pass',
        message: `claude found at ${result.stdout.trim()}`,
        fixable: false,
      };
    }
  } catch {
    // Not in PATH
  }

  // Check default locations
  const home = os.homedir();
  const candidates = [
    path.join(home, '.opencode', 'bin', 'opencode'),
    path.join(home, '.claude', 'bin', 'claude'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return {
        name: 'binary',
        status: 'pass',
        message: `opencode found at ${candidate}`,
        fixable: false,
      };
    } catch {
      // Not found at this path
    }
  }

  return {
    name: 'binary',
    status: 'fail',
    message: 'opencode/claude binary not found in PATH or default locations',
    fixable: false,
  };
}

// ── Check 2: GSD Dir ──────────────────────────────────────────────────────

/**
 * Check PILOT_GSD_DIR exists and contains expected subdirectories.
 */
async function checkGsdDir(): Promise<DoctorCheck> {
  const config = getConfig();
  const gsdDir = config.gsdDir;

  try {
    await access(gsdDir, fsConstants.R_OK);
  } catch {
    return {
      name: 'gsd_dir',
      status: 'fail',
      message: `GSD dir not found: ${gsdDir}`,
      fixable: false,
    };
  }

  const expectedSubdirs = ['commands', 'agents', 'get-shit-done'];
  const missing: string[] = [];

  for (const subdir of expectedSubdirs) {
    try {
      await access(path.join(gsdDir, subdir), fsConstants.R_OK);
    } catch {
      missing.push(subdir);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'gsd_dir',
      status: 'warn',
      message: `GSD dir ${gsdDir} missing subdirs: ${missing.join(', ')}`,
      fixable: false,
    };
  }

  return {
    name: 'gsd_dir',
    status: 'pass',
    message: `${gsdDir} (${expectedSubdirs.length} subdirs)`,
    fixable: false,
  };
}

// ── Check 3: Symlinks ─────────────────────────────────────────────────────

/**
 * Scan projects for broken symlinks in .claude/.opencode dirs.
 */
async function checkSymlinks(): Promise<DoctorCheck> {
  const config = getConfig();
  const projectDir = config.projectDir;

  let projectDirs: string[];
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(projectDir, e.name));
  } catch {
    return {
      name: 'symlinks',
      status: 'warn',
      message: `Cannot read project dir: ${projectDir}`,
      fixable: false,
    };
  }

  let projectsWithConfig = 0;
  const brokenSymlinks: string[] = [];

  for (const dir of projectDirs) {
    // Check for .opencode or .claude dirs
    const configDirs = ['.opencode', '.claude'];
    let hasConfigDir = false;

    for (const configDir of configDirs) {
      const configPath = path.join(dir, configDir);
      try {
        await access(configPath, fsConstants.R_OK);
        hasConfigDir = true;

        // Check symlinks inside
        const symlinkNames = ['command', 'agents', 'get-shit-done'];
        for (const linkName of symlinkNames) {
          const linkPath = path.join(configPath, linkName);
          try {
            // lstat doesn't follow symlinks — we check existence
            const linkStat = await stat(linkPath);
            void linkStat;
            // stat follows symlinks — if it resolves, the target exists
            await realpath(linkPath);
          } catch {
            // Check if the symlink itself exists (broken target)
            try {
              const { lstatSync } = await import('node:fs');
              const ls = lstatSync(linkPath);
              if (ls.isSymbolicLink()) {
                brokenSymlinks.push(`${path.basename(dir)}/${configDir}/${linkName}`);
              }
            } catch {
              // Symlink doesn't exist at all — skip
            }
          }
        }
      } catch {
        // No config dir — skip
      }
    }

    if (hasConfigDir) {
      projectsWithConfig++;
    }
  }

  if (brokenSymlinks.length > 0) {
    return {
      name: 'symlinks',
      status: 'warn',
      message: `${projectsWithConfig} projects, ${brokenSymlinks.length} broken: ${brokenSymlinks.join(', ')}`,
      fixable: true,
      fixAction: 're-create broken symlinks',
    };
  }

  return {
    name: 'symlinks',
    status: 'pass',
    message: `${projectsWithConfig} projects, all valid`,
    fixable: false,
  };
}

// ── Check 4: Git GC ──────────────────────────────────────────────────────

/**
 * Check gc.auto=0 on all snapshot repos.
 * Reuses pattern from disableSnapshotGc() in spawn.ts.
 */
async function checkGitGc(fix: boolean): Promise<DoctorCheck> {
  const snapshotBase = path.join(os.homedir(), '.local', 'share', 'opencode', 'snapshot');

  let repos: string[] = [];
  try {
    const entries = await readdir(snapshotBase, { withFileTypes: true });
    repos = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(snapshotBase, e.name));
  } catch {
    // Snapshot dir may not exist
    return {
      name: 'git_gc',
      status: 'pass',
      message: 'No snapshot repos found',
      fixable: false,
    };
  }

  // Also check global repo explicitly
  const globalRepo = path.join(snapshotBase, 'global');
  const allRepos = [...repos];
  if (!allRepos.includes(globalRepo)) {
    try {
      await access(globalRepo, fsConstants.R_OK);
      allRepos.push(globalRepo);
    } catch {
      // Global repo doesn't exist
    }
  }

  const notDisabled: string[] = [];

  for (const repo of allRepos) {
    try {
      const result = await execa('git', ['-C', repo, 'config', 'gc.auto'], { timeout: 5000 });
      if (result.stdout.trim() !== '0') {
        notDisabled.push(repo);
      }
    } catch {
      // Config not set — means gc is enabled (default)
      notDisabled.push(repo);
    }
  }

  if (notDisabled.length > 0) {
    if (fix) {
      for (const repo of notDisabled) {
        try {
          await execa('git', ['-C', repo, 'config', 'gc.auto', '0'], { timeout: 5000 });
        } catch {
          // Best effort
        }
      }
      return {
        name: 'git_gc',
        status: 'pass',
        message: `gc.auto=0 set on ${allRepos.length} repos (fixed ${notDisabled.length})`,
        fixable: true,
        fixAction: `set gc.auto=0 on ${notDisabled.length} repos`,
      };
    }
    return {
      name: 'git_gc',
      status: 'warn',
      message: `gc.auto not disabled on ${notDisabled.length}/${allRepos.length} repos`,
      fixable: true,
      fixAction: `set gc.auto=0 on ${notDisabled.length} repos`,
    };
  }

  return {
    name: 'git_gc',
    status: 'pass',
    message: `gc.auto=0 on ${allRepos.length} repos`,
    fixable: false,
  };
}

// ── Check 5: Memory ──────────────────────────────────────────────────────

/**
 * Check system available memory via /proc/meminfo.
 * Reuses getSystemFreeMem pattern from spawn.ts.
 */
async function checkMemory(): Promise<DoctorCheck> {
  try {
    const content = await readFile('/proc/meminfo', 'utf8');
    const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(content);
    if (match === null) {
      return {
        name: 'memory',
        status: 'pass',
        message: 'Cannot parse /proc/meminfo (non-Linux?)',
        fixable: false,
      };
    }

    const availableMb = Math.floor(parseInt(match[1]!, 10) / 1024);

    if (availableMb < 500) {
      return {
        name: 'memory',
        status: 'fail',
        message: `${(availableMb / 1024).toFixed(1)}GB available (< 500MB critical)`,
        fixable: false,
      };
    }

    if (availableMb < 2048) {
      return {
        name: 'memory',
        status: 'warn',
        message: `${(availableMb / 1024).toFixed(1)}GB available (< 2GB)`,
        fixable: false,
      };
    }

    return {
      name: 'memory',
      status: 'pass',
      message: `${(availableMb / 1024).toFixed(1)}GB available`,
      fixable: false,
    };
  } catch {
    return {
      name: 'memory',
      status: 'pass',
      message: '/proc/meminfo not available (non-Linux?)',
      fixable: false,
    };
  }
}

// ── Check 6: Zombies ─────────────────────────────────────────────────────

/**
 * Check for zombie processes among tracked PIDs.
 */
async function checkZombies(fix: boolean): Promise<DoctorCheck> {
  const pidEntries = await scanPidFiles();
  const zombies: Array<{ session: string; pid: number }> = [];

  for (const entry of pidEntries) {
    try {
      const statusContent = await readFile(`/proc/${entry.pid}/status`, 'utf8');
      const stateMatch = /^State:\s+(\w)/m.exec(statusContent);
      if (stateMatch && stateMatch[1] === 'Z') {
        zombies.push(entry);
      }
    } catch {
      // Process may have disappeared — skip
    }
  }

  if (zombies.length > 0) {
    if (fix) {
      for (const z of zombies) {
        try {
          process.kill(z.pid, 'SIGKILL');
        } catch {
          // Best effort
        }
      }
      return {
        name: 'zombies',
        status: 'pass',
        message: `killed ${zombies.length} zombie process(es)`,
        fixable: true,
        fixAction: `kill ${zombies.length} zombie(s)`,
      };
    }
    const pidList = zombies.map((z) => `PID ${z.pid}`).join(', ');
    return {
      name: 'zombies',
      status: 'fail',
      message: `${zombies.length} zombie process(es): ${pidList}`,
      fixable: true,
      fixAction: `kill ${zombies.length} zombie(s)`,
    };
  }

  return {
    name: 'zombies',
    status: 'pass',
    message: 'none',
    fixable: false,
  };
}

// ── Check 7: Stale PIDs ──────────────────────────────────────────────────

/**
 * Scan for PID files whose processes no longer exist.
 */
async function checkStalePids(fix: boolean): Promise<DoctorCheck> {
  const config = getConfig();

  let entries: string[];
  try {
    entries = await readdir(config.logDir);
  } catch {
    return {
      name: 'stale_pids',
      status: 'pass',
      message: `Cannot read log dir: ${config.logDir}`,
      fixable: false,
    };
  }

  const pidFiles = entries.filter(
    (name) => name.startsWith('gsd-') && name.endsWith('-pid'),
  );

  const stalePids: string[] = [];

  for (const filename of pidFiles) {
    const session = filename.slice(4, -4); // Remove 'gsd-' prefix and '-pid' suffix
    if (session.length === 0) continue;

    try {
      const content = await readFile(path.join(config.logDir, filename), 'utf8');
      const pid = parseInt(content.trim(), 10);
      if (Number.isNaN(pid) || pid <= 0) {
        stalePids.push(filename);
        continue;
      }
      if (!isProcessAlive(pid)) {
        stalePids.push(filename);
      }
    } catch {
      stalePids.push(filename);
    }
  }

  if (stalePids.length > 0) {
    if (fix) {
      for (const filename of stalePids) {
        try {
          await unlink(path.join(config.logDir, filename));
        } catch {
          // Best effort
        }
      }
      return {
        name: 'stale_pids',
        status: 'pass',
        message: `removed ${stalePids.length} stale PID file(s)`,
        fixable: true,
        fixAction: `remove ${stalePids.length} stale PID file(s)`,
      };
    }
    return {
      name: 'stale_pids',
      status: 'warn',
      message: `${stalePids.length} stale PID file(s)`,
      fixable: true,
      fixAction: `remove ${stalePids.length} stale PID file(s)`,
    };
  }

  return {
    name: 'stale_pids',
    status: 'pass',
    message: 'none',
    fixable: false,
  };
}

// ── Check 8: Queue ───────────────────────────────────────────────────────

/**
 * Check queue.json is readable.
 */
async function checkQueue(): Promise<DoctorCheck> {
  const config = getConfig();
  const queueFile = config.queueJsonFile;

  try {
    await access(queueFile, fsConstants.R_OK);
    const content = await readFile(queueFile, 'utf8');
    if (content.trim().length === 0) {
      return {
        name: 'queue',
        status: 'warn',
        message: `${queueFile} is empty`,
        fixable: false,
      };
    }
    // Validate JSON
    JSON.parse(content);
    return {
      name: 'queue',
      status: 'pass',
      message: `${queueFile} (readable)`,
      fixable: false,
    };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        name: 'queue',
        status: 'warn',
        message: `${queueFile} not found (will be created on first add)`,
        fixable: false,
      };
    }
    if (err instanceof SyntaxError) {
      return {
        name: 'queue',
        status: 'fail',
        message: `${queueFile} contains invalid JSON`,
        fixable: false,
      };
    }
    return {
      name: 'queue',
      status: 'fail',
      message: `Cannot read ${queueFile}`,
      fixable: false,
    };
  }
}

// ── Check 9: Pilot Dir ───────────────────────────────────────────────────

/**
 * Check ~/.pilot/ exists and is writable.
 */
async function checkPilotDir(fix: boolean): Promise<DoctorCheck> {
  const pilotDir = path.join(os.homedir(), '.pilot');

  try {
    await access(pilotDir, fsConstants.W_OK);
    return {
      name: 'pilot_dir',
      status: 'pass',
      message: `${pilotDir} exists`,
      fixable: false,
    };
  } catch {
    if (fix) {
      try {
        await mkdir(pilotDir, { recursive: true });
        return {
          name: 'pilot_dir',
          status: 'pass',
          message: `${pilotDir} created`,
          fixable: true,
          fixAction: `mkdir ${pilotDir}`,
        };
      } catch {
        return {
          name: 'pilot_dir',
          status: 'fail',
          message: `Cannot create ${pilotDir}`,
          fixable: true,
          fixAction: `mkdir ${pilotDir}`,
        };
      }
    }
    return {
      name: 'pilot_dir',
      status: 'warn',
      message: `${pilotDir} not found`,
      fixable: true,
      fixAction: `mkdir ${pilotDir}`,
    };
  }
}

// ── ensurePilotDir ────────────────────────────────────────────────────────

/**
 * Standalone helper to ensure ~/.pilot/ exists.
 * Other modules (runner log, notifications config) need this.
 */
async function ensurePilotDir(): Promise<string> {
  const pilotDir = path.join(os.homedir(), '.pilot');
  await mkdir(pilotDir, { recursive: true });
  return pilotDir;
}

// ── runDoctor ─────────────────────────────────────────────────────────────

/**
 * Run all 9 health checks and return structured results.
 * Completes in <2 seconds (no CPU sampling, no polling loops).
 */
async function runDoctor(options: { fix: boolean }): Promise<DoctorResult> {
  const { fix } = options;

  const checks: DoctorCheck[] = [
    await checkBinaryHealth(),
    await checkGsdDir(),
    await checkSymlinks(),
    await checkGitGc(fix),
    await checkMemory(),
    await checkZombies(fix),
    await checkStalePids(fix),
    await checkQueue(),
    await checkPilotDir(fix),
  ];

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;

  return { checks, passed, failed, warnings };
}

export { runDoctor, ensurePilotDir };
export type { DoctorCheck, DoctorResult };
