/**
 * E2E tests for all monitoring (read-only) CLI commands.
 *
 * Runs pilot as a subprocess against real temp directories.
 * Each test gets a fresh isolated TempEnv.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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
  // Build is expected to have been run already (npm run build)
  // Verify dist/index.js exists
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const binaryPath = path.resolve(process.cwd(), 'dist', 'index.js');
  await fs.access(binaryPath);
}, 30_000);

// ── pilot status ───────────────────────────────────────────────────────────

describe('pilot status', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 0 with empty state', async () => {
    const result = await runPilot(['status'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('0 running');
  }, 15_000);

  it('--json produces valid JSON with correct structure', async () => {
    const result = await runPilot(['--json', 'status'], env.env);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('running');
    expect(data.summary).toHaveProperty('stuck');
    expect(data.summary).toHaveProperty('queued');
    expect(data.summary).toHaveProperty('completed');
    expect(typeof data.summary.running).toBe('number');
  }, 15_000);

  it('--verbose exits 0', async () => {
    const result = await runPilot(['status', '--verbose'], env.env);
    expect(result.exitCode).toBe(0);
  }, 15_000);
});

// ── pilot queue ────────────────────────────────────────────────────────────

describe('pilot queue', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 0 with empty queue', async () => {
    const result = await runPilot(['queue'], env.env);
    expect(result.exitCode).toBe(0);
    // Should mention empty or show 0 active items
    expect(result.stdout).toMatch(/empty|0 active/i);
  }, 15_000);

  it('shows project names when items exist', async () => {
    await createFakeQueue(env, [
      { project: 'alpha-project', description: 'build alpha' },
      { project: 'beta-project', description: 'build beta' },
    ]);

    const result = await runPilot(['queue'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('alpha-project');
    expect(result.stdout).toContain('beta-project');
  }, 15_000);

  it('--json produces valid JSON with queue array', async () => {
    await createFakeQueue(env, [
      { project: 'test-proj', description: 'test' },
    ]);

    const result = await runPilot(['--json', 'queue'], env.env);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('queue');
    expect(Array.isArray(data.queue)).toBe(true);
    expect(data.queue.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('--history exits 0', async () => {
    const result = await runPilot(['queue', '--history'], env.env);
    expect(result.exitCode).toBe(0);
  }, 15_000);
});

// ── pilot stuck ────────────────────────────────────────────────────────────

describe('pilot stuck', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 0 with no PID files', async () => {
    const result = await runPilot(['stuck'], env.env);
    expect(result.exitCode).toBe(0);
    // Should mention no stuck or show threshold
    expect(result.stdout).toMatch(/stuck|threshold/i);
  }, 15_000);

  it('--threshold accepts custom value', async () => {
    const result = await runPilot(['stuck', '--threshold', '1'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1m');
  }, 15_000);

  it('--json produces valid JSON', async () => {
    const result = await runPilot(['--json', 'stuck'], env.env);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('threshold_minutes');
    expect(data).toHaveProperty('stuck');
    expect(data).toHaveProperty('suspect');
    expect(Array.isArray(data.stuck)).toBe(true);
    expect(Array.isArray(data.suspect)).toBe(true);
  }, 15_000);
});

// ── pilot log ──────────────────────────────────────────────────────────────

describe('pilot log', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 1 for nonexistent session', async () => {
    const result = await runPilot(['log', 'nonexistent-session-xyz'], env.env);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|error/i);
  }, 15_000);
});

// ── pilot tail ─────────────────────────────────────────────────────────────

describe('pilot tail', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 1 for nonexistent session', async () => {
    const result = await runPilot(['tail', 'nonexistent-session-xyz'], env.env);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|error/i);
  }, 15_000);
});

// ── pilot projects ─────────────────────────────────────────────────────────

describe('pilot projects', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('shows project names for fake projects', async () => {
    await createFakeProject(env, 'project-one', { planning: true });
    await createFakeProject(env, 'project-two');

    const result = await runPilot(['projects'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('project-one');
    expect(result.stdout).toContain('project-two');
  }, 15_000);

  it('--json produces valid JSON with projects array', async () => {
    await createFakeProject(env, 'json-proj', { planning: true });

    const result = await runPilot(['--json', 'projects'], env.env);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
  }, 15_000);
});

// ── pilot progress ─────────────────────────────────────────────────────────

describe('pilot progress', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 0 for project with planning', async () => {
    await createFakeProject(env, 'prog-project', { planning: true, phases: [1, 2] });

    const result = await runPilot(['progress', 'prog-project'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/progress|phase/i);
  }, 15_000);

  it('shows no planning data for nonexistent project', async () => {
    const result = await runPilot(['progress', 'no-such-project'], env.env);
    // Progress command shows "No planning data found" for missing projects
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no planning/i);
  }, 15_000);
});

// ── pilot config ───────────────────────────────────────────────────────────

describe('pilot config', () => {
  let env: TempEnv;

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await cleanupTempEnv(env);
  });

  it('exits 0 and shows config values', async () => {
    const result = await runPilot(['config'], env.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PILOT');
  }, 15_000);

  it('--json produces valid JSON with timestamp', async () => {
    const result = await runPilot(['--json', 'config'], env.env);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('config');
  }, 15_000);
});

// ── pilot --version ────────────────────────────────────────────────────────

describe('pilot version', () => {
  it('--version exits 0 and shows version number', async () => {
    const result = await runPilot(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  }, 15_000);
});

// ── pilot --help ───────────────────────────────────────────────────────────

describe('pilot help', () => {
  it('--help exits 0 and shows grouped commands', async () => {
    const result = await runPilot(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Monitoring');
    expect(result.stdout).toContain('Setup');
  }, 15_000);

  it('status --help exits 0', async () => {
    const result = await runPilot(['status', '--help']);
    expect(result.exitCode).toBe(0);
  }, 15_000);

  it('nonexistent command exits non-zero', async () => {
    const result = await runPilot(['nonexistent-command-xyz']);
    // Commander will either exit with 2 (unknown command) or 1
    expect(result.exitCode).not.toBe(0);
  }, 15_000);
});
