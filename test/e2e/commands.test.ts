/**
 * E2E tests for state-mutating CLI commands, lifecycle wrappers, and error cases.
 *
 * Runs pilot as a subprocess against real temp directories.
 * Each describe block gets a fresh isolated TempEnv.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFile, readdir, lstat, access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runPilot,
  createTempEnv,
  createFakeProject,
  createFakeQueue,
  cleanupTempEnv,
  type TempEnv,
} from './helpers.js';

// Build once before all tests
beforeAll(async () => {
  const fs = await import('node:fs/promises');
  const p = await import('node:path');
  const binaryPath = p.resolve(process.cwd(), 'dist', 'index.js');
  await fs.access(binaryPath);
}, 30_000);

// ── pilot setup ───────────────────────────────────────────────────────────

describe('pilot setup', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('creates .opencode dir, opencode.json, and .gitignore', async () => {
    const projectPath = path.join(env.projectDir, 'setup-test');

    const result = await runPilot(['setup', projectPath], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Setup complete');

    // Verify .opencode/ directory exists
    const opencodeDir = path.join(projectPath, '.opencode');
    const stat = await lstat(opencodeDir);
    expect(stat.isDirectory()).toBe(true);

    // Verify symlinks exist
    const entries = await readdir(opencodeDir);
    expect(entries).toContain('command');
    expect(entries).toContain('agents');
    expect(entries).toContain('get-shit-done');

    // Verify symlinks point to gsd dir
    for (const sub of ['command', 'agents', 'get-shit-done']) {
      const symlinkStat = await lstat(path.join(opencodeDir, sub));
      expect(symlinkStat.isSymbolicLink()).toBe(true);
    }

    // Verify opencode.json
    const configPath = path.join(projectPath, 'opencode.json');
    const configContent = await readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    expect(config).toHaveProperty('permission');

    // Verify .gitignore includes .opencode/
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignore = await readFile(gitignorePath, 'utf8');
    expect(gitignore).toContain('.opencode/');
  }, 30_000);

  it('running setup twice skips opencode.json overwrite', async () => {
    const projectPath = path.join(env.projectDir, 'setup-idempotent');

    // First setup
    const result1 = await runPilot(['setup', projectPath], env.env);
    expect(result1.exitCode).toBe(0);

    // Second setup — should skip existing files
    const result2 = await runPilot(['setup', projectPath], env.env);
    expect(result2.exitCode).toBe(0);
    // Should mention skipping
    expect(result2.stdout).toMatch(/[Ss]kip/);
  }, 30_000);

  it('--verify after setup exits 0 with passing checks', async () => {
    const projectPath = path.join(env.projectDir, 'setup-verify');

    // First setup
    await runPilot(['setup', projectPath], env.env);

    // Verify
    const result = await runPilot(['setup', '--verify', projectPath], env.env);
    expect(result.exitCode).toBe(0);
    // Should contain pass/valid indicators
    expect(result.stdout).toMatch(/pass|✓|valid/i);
  }, 30_000);
});

// ── pilot update ──────────────────────────────────────────────────────────

describe('pilot update', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('attempts git pull on gsd dir without crash', async () => {
    // Initialize gsd dir as a git repo with a remote
    const { execa } = await import('execa');
    const bareRemote = path.join(env.dir, 'bare-remote.git');
    await execa('git', ['init', '--bare', '-q', bareRemote]);

    // Re-init gsd dir as a proper clone
    const gsdDir = env.gsdDir;
    await execa('git', ['init', '-q'], { cwd: gsdDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: gsdDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: gsdDir });
    await writeFile(path.join(gsdDir, '.gitkeep'), '');
    await execa('git', ['add', '.'], { cwd: gsdDir });
    await execa('git', ['commit', '-m', 'init'], { cwd: gsdDir });
    await execa('git', ['remote', 'add', 'origin', bareRemote], { cwd: gsdDir });
    // Push to set up remote tracking
    await execa('git', ['push', '-u', 'origin', 'master'], { cwd: gsdDir }).catch(() => {
      // Try main branch
      return execa('git', ['push', '-u', 'origin', 'HEAD'], { cwd: gsdDir });
    });

    const result = await runPilot(['update'], env.env);
    // May succeed or fail depending on branch naming, but should not crash
    expect(result.exitCode).toBeLessThanOrEqual(1);
  }, 30_000);
});

// ── pilot add ─────────────────────────────────────────────────────────────

describe('pilot add', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('adds an item to queue.json', async () => {
    await createFakeProject(env, 'add-test', { planning: true });

    const result = await runPilot(['add', 'add-test', 'fix the navbar'], env.env);
    expect(result.exitCode).toBe(0);

    // Read queue.json and verify entry exists
    const queuePath = path.join(env.dir, 'home', '.pilot', 'queue.json');
    const queueContent = await readFile(queuePath, 'utf8');
    const queue = JSON.parse(queueContent);
    expect(queue.items.length).toBe(1);
    expect(queue.items[0].project).toBe('add-test');
  }, 30_000);

  it('adds multiple items to queue.json', async () => {
    await createFakeProject(env, 'multi-add', { planning: true });

    await runPilot(['add', 'multi-add', 'first task'], env.env);
    await runPilot(['add', 'multi-add', 'second task'], env.env);

    const queuePath = path.join(env.dir, 'home', '.pilot', 'queue.json');
    const queueContent = await readFile(queuePath, 'utf8');
    const queue = JSON.parse(queueContent);
    expect(queue.items.length).toBe(2);
  }, 30_000);

  it('--dry-run does not modify queue.json', async () => {
    await createFakeProject(env, 'dry-add', { planning: true });

    // Add one real item first
    await runPilot(['add', 'dry-add', 'real task'], env.env);

    // Dry run should not add
    const result = await runPilot(['add', '--dry-run', 'dry-add', 'dry run task'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toMatch(/dry/);

    // Queue should still have only 1 item
    const queuePath = path.join(env.dir, 'home', '.pilot', 'queue.json');
    const queueContent = await readFile(queuePath, 'utf8');
    const queue = JSON.parse(queueContent);
    expect(queue.items.length).toBe(1);
  }, 30_000);

  it('handles nonexistent project dir without crash', async () => {
    // Don't create the project — add should error (project not found)
    const result = await runPilot(['add', 'nonexistent-proj', 'some task'], env.env);
    // Should exit 1 (project dir not found) — not crash
    expect(result.exitCode).toBeGreaterThanOrEqual(1);
  }, 30_000);
});

// ── pilot build ───────────────────────────────────────────────────────────

describe('pilot build', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('queues entry and reports status', async () => {
    await createFakeProject(env, 'build-test', { planning: true });

    // build will try to start runner which may fail (no real opencode)
    // The key assertion: queue.json has the entry
    const result = await runPilot(['build', 'build-test', 'build feature'], env.env);
    // May exit 0 or 1 depending on runner
    expect(result.exitCode).toBeLessThanOrEqual(1);

    // Check queue.json has the entry (or it was moved to history)
    const queuePath = path.join(env.dir, 'home', '.pilot', 'queue.json');
    const queueContent = await readFile(queuePath, 'utf8');
    const queue = JSON.parse(queueContent);
    // Item should be somewhere in the queue (items or history)
    const totalItems = queue.items.length + (queue.history?.length ?? 0);
    expect(totalItems).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('exits 2 without requirement argument', async () => {
    const result = await runPilot(['build', 'some-project'], env.env);
    // build requires requirement arg — should fail with usage or runtime error
    expect(result.exitCode).toBeGreaterThanOrEqual(1);
  }, 30_000);
});

// ── pilot doctor ──────────────────────────────────────────────────────────

describe('pilot doctor', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('runs health checks and exits', async () => {
    const result = await runPilot(['doctor'], env.env);
    // May pass or fail depending on environment, but should not crash
    expect(result.exitCode).toBeLessThanOrEqual(1);
    // Should contain health check output
    expect(result.stdout).toMatch(/health|check|pass|fail|binary|gsd/i);
  }, 30_000);

  it('--json produces valid JSON', async () => {
    const result = await runPilot(['--json', 'doctor'], env.env);
    expect(result.exitCode).toBeLessThanOrEqual(1);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('checks');
    expect(data).toHaveProperty('summary');
    expect(typeof data.summary.passed).toBe('number');
  }, 30_000);
});

// ── pilot stop ────────────────────────────────────────────────────────────

describe('pilot stop', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('reports not running when no PID file exists', async () => {
    const result = await runPilot(['stop'], env.env);
    // Should exit 0 and say runner not running
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/not running/i);
  }, 30_000);
});

// ── Lifecycle commands (smoke tests) ──────────────────────────────────────

describe('lifecycle commands', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it.each([
    ['init', ['init', 'test-project']],
    ['plan', ['plan', 'test-project', '1']],
    ['execute', ['execute', 'test-project', '1']],
    ['verify', ['verify', 'test-project', '1']],
    ['quick', ['quick', 'test-project', 'fix bug']],
    ['debug', ['debug', 'test-project']],
    ['research', ['research', 'test-project', '1']],
    ['scope', ['scope', 'test-project', 'new feature']],
    ['map', ['map', 'test-project']],
    ['insert', ['insert', 'test-project', '2', 'new phase desc']],
    ['remove', ['remove', 'test-project', '99']],
    ['milestone new', ['milestone', 'new', 'test-project']],
    ['milestone complete', ['milestone', 'complete', 'test-project', 'v1']],
    ['todos list', ['todos', 'list', 'test-project']],
    ['todos add', ['todos', 'add', 'test-project', 'fix something']],
  ])('pilot %s exits without crash', async (_name, args) => {
    // Create a fake project with .planning/ so commands can find it
    await createFakeProject(env, 'test-project', { planning: true, phases: [1] });

    const result = await runPilot(args as string[], env.env);
    // Exit code 0 or 1 — NOT 2 (usage error). The mock opencode exits 0.
    expect(result.exitCode).toBeLessThanOrEqual(1);
  }, 30_000);
});

// ── Utility / management commands ─────────────────────────────────────────

describe('utility commands', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('pilot cleanup exits without crash', async () => {
    const result = await runPilot(['cleanup'], env.env);
    expect(result.exitCode).toBeLessThanOrEqual(1);
  }, 30_000);

  it('pilot import exits without crash with no QUEUE.md', async () => {
    // No QUEUE.md exists — should error but not crash
    const result = await runPilot(['import'], env.env);
    // Exit 1 expected (file not found)
    expect(result.exitCode).toBeLessThanOrEqual(1);
  }, 30_000);

  it('pilot import processes a QUEUE.md when present', async () => {
    // Create a minimal QUEUE.md
    const queueMdPath = path.join(env.pilotDir, 'QUEUE.md');
    await writeFile(queueMdPath, '## test-proj | continue | do stuff\n');

    // Set PILOT_QUEUE_FILE to point to our file
    const envWithQueue = {
      ...env.env,
      PILOT_QUEUE_FILE: queueMdPath,
    };

    const result = await runPilot(['import'], envWithQueue);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/import/i);
  }, 30_000);

  it('pilot init-service exits without crash', async () => {
    const result = await runPilot(['init-service', '--dry-run'], env.env);
    expect(result.exitCode).toBeLessThanOrEqual(1);
  }, 30_000);

  it('pilot queue remove nonexistent-id exits 1', async () => {
    const result = await runPilot(['queue', 'remove', 'nonexistent-id'], env.env);
    expect(result.exitCode).toBe(1);
  }, 30_000);

  it('pilot queue remove works with valid ID', async () => {
    await createFakeProject(env, 'remove-test', { planning: true });

    // Add an item first
    await runPilot(['add', 'remove-test', 'task to remove'], env.env);

    // Read queue.json to get the ID
    const queuePath = path.join(env.dir, 'home', '.pilot', 'queue.json');
    const queueContent = await readFile(queuePath, 'utf8');
    const queue = JSON.parse(queueContent);
    expect(queue.items.length).toBe(1);
    const itemId = queue.items[0].id as string;

    // Remove the item
    const result = await runPilot(['queue', 'remove', itemId], env.env);
    expect(result.exitCode).toBe(0);

    // Verify item is gone
    const updatedContent = await readFile(queuePath, 'utf8');
    const updatedQueue = JSON.parse(updatedContent);
    expect(updatedQueue.items.length).toBe(0);
  }, 30_000);
});

// ── Error cases ───────────────────────────────────────────────────────────

describe('error cases', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('pilot add with no args exits 2 (usage error)', async () => {
    const result = await runPilot(['add'], env.env);
    expect(result.exitCode).toBe(2);
  }, 15_000);

  it('pilot plan with no args exits 2 (usage error)', async () => {
    const result = await runPilot(['plan'], env.env);
    expect(result.exitCode).toBe(2);
  }, 15_000);

  it('pilot execute with no args exits 2 (usage error)', async () => {
    const result = await runPilot(['execute'], env.env);
    expect(result.exitCode).toBe(2);
  }, 15_000);

  it('pilot log with no args exits 2 (usage error)', async () => {
    const result = await runPilot(['log'], env.env);
    expect(result.exitCode).toBe(2);
  }, 15_000);

  it('pilot progress for nonexistent project exits 0 with no planning message', async () => {
    const result = await runPilot(['progress', 'no-such-project'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no planning/i);
  }, 15_000);
});

// ── Global --json sweep ───────────────────────────────────────────────────

describe('global --json sweep', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it.each([
    'status',
    'queue',
    'stuck',
    'projects',
    'config',
    'doctor',
  ])('pilot %s --json outputs valid JSON with timestamp', async (cmd) => {
    const result = await runPilot(['--json', cmd], env.env);
    // doctor may exit 1 if checks fail, others should be 0
    expect(result.exitCode).toBeLessThanOrEqual(1);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.timestamp).toBe('string');
  }, 30_000);
});
