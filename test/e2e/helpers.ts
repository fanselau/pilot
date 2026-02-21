/**
 * E2E test utilities for running pilot as a subprocess.
 *
 * Creates isolated temp environments with PILOT_* env vars,
 * fake project directories, and mock opencode binary.
 */

import { execaNode } from 'execa';
import { mkdtemp, mkdir, writeFile, symlink, rm, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TempEnv {
  dir: string;
  projectDir: string;
  logDir: string;
  pilotDir: string;
  gsdDir: string;
  binDir: string;
  env: Record<string, string>;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ── Binary path ────────────────────────────────────────────────────────────

const PILOT_BINARY = path.resolve(process.cwd(), 'dist', 'index.js');

// ── runPilot ───────────────────────────────────────────────────────────────

/**
 * Run `node dist/index.js ...args` as a subprocess.
 *
 * Merges provided env with defaults. Sets NO_COLOR=1 to strip ANSI.
 * Uses reject: false so non-zero exit codes don't throw.
 */
export async function runPilot(
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  const mergedEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    NO_COLOR: '1',
    ...(env ?? {}),
  };

  const result = await execaNode(PILOT_BINARY, args, {
    reject: false,
    env: mergedEnv,
    timeout: 15_000,
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 1,
  };
}

// ── createTempEnv ──────────────────────────────────────────────────────────

/**
 * Create a fully isolated temp environment for E2E testing.
 *
 * Sets up directories mimicking production structure with all
 * PILOT_* env vars pointing to temp paths.
 */
export async function createTempEnv(): Promise<TempEnv> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pilot-e2e-'));

  const projectDir = path.join(dir, 'projects');
  const logDir = path.join(dir, 'logs');
  const pilotDir = path.join(dir, 'home', '.pilot');
  const gsdDir = path.join(dir, 'gsd');
  const binDir = path.join(dir, 'bin');

  // Create all directories
  await mkdir(projectDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await mkdir(pilotDir, { recursive: true });
  await mkdir(path.join(gsdDir, 'commands'), { recursive: true });
  await mkdir(path.join(gsdDir, 'agents'), { recursive: true });
  await mkdir(path.join(gsdDir, 'get-shit-done'), { recursive: true });
  await mkdir(binDir, { recursive: true });

  // Symlink mock-opencode binary into bin/
  const mockPath = path.resolve(process.cwd(), 'test', 'e2e', 'fixtures', 'mock-opencode.sh');
  await symlink(mockPath, path.join(binDir, 'opencode'));

  // Build env vars
  const currentPath = process.env.PATH ?? '';
  const env: Record<string, string> = {
    PILOT_PROJECT_DIR: projectDir,
    PILOT_LOG_DIR: logDir,
    PILOT_QUEUE_FILE: path.join(pilotDir, 'QUEUE.md'),
    PILOT_GSD_DIR: gsdDir,
    PILOT_STUCK_THRESHOLD: '90',
    NO_COLOR: '1',
    // Prepend bin dir so mock-opencode is found as "opencode"
    PATH: `${binDir}:${currentPath}`,
    // Override HOME to isolate ~/.pilot/
    HOME: path.join(dir, 'home'),
  };

  return { dir, projectDir, logDir, pilotDir, gsdDir, binDir, env };
}

// ── createFakeProject ──────────────────────────────────────────────────────

interface FakeProjectOpts {
  planning?: boolean;
  phases?: number[];
  git?: boolean;
}

/**
 * Create a fake project directory under env.projectDir/name.
 *
 * Optionally adds .planning/ with STATE.md, ROADMAP.md, PROJECT.md
 * and phase directories. Inits a git repo unless git: false.
 */
export async function createFakeProject(
  env: TempEnv,
  name: string,
  opts?: FakeProjectOpts,
): Promise<string> {
  const projectPath = path.join(env.projectDir, name);
  await mkdir(projectPath, { recursive: true });

  // Git init (default: true)
  if (opts?.git !== false) {
    const { execa } = await import('execa');
    await execa('git', ['init', '-q'], { cwd: projectPath });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: projectPath });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: projectPath });
    // Create initial commit so git commands work
    await writeFile(path.join(projectPath, '.gitkeep'), '');
    await execa('git', ['add', '.'], { cwd: projectPath });
    await execa('git', ['commit', '-m', 'init', '--allow-empty'], { cwd: projectPath });
  }

  // Planning structure
  if (opts?.planning) {
    const planningDir = path.join(projectPath, '.planning');
    const phasesDir = path.join(planningDir, 'phases');
    await mkdir(phasesDir, { recursive: true });

    await writeFile(
      path.join(planningDir, 'STATE.md'),
      `# State\n\n## Current Position\n\nPhase: 1 of 3\nPlan: 1 of 2\nStatus: In progress\n`,
    );

    await writeFile(
      path.join(planningDir, 'ROADMAP.md'),
      `# Roadmap\n\n## Milestone: v1\n\n### Phase 1: Foundation\n**Plans:** 2 plans\n\n### Phase 2: Features\n**Plans:** 2 plans\n\n### Phase 3: Polish\n**Plans:** 1 plan\n`,
    );

    await writeFile(
      path.join(planningDir, 'PROJECT.md'),
      `# ${name}\n\n## What This Is\n\nA test project.\n`,
    );

    // Create phase directories if specified
    if (opts.phases) {
      for (const phaseNum of opts.phases) {
        const padded = String(phaseNum).padStart(2, '0');
        const phaseDir = path.join(phasesDir, `${padded}-phase-${phaseNum}`);
        await mkdir(phaseDir, { recursive: true });

        // Create a plan and summary file for each phase
        await writeFile(
          path.join(phaseDir, `${padded}-01-PLAN.md`),
          `---\nphase: ${padded}\nplan: 01\n---\n\n# Plan\n`,
        );

        await writeFile(
          path.join(phaseDir, `${padded}-01-SUMMARY.md`),
          `---\nphase: ${padded}\nplan: 01\n---\n\n# Summary\n\nDone.\n`,
        );
      }
    }
  }

  return projectPath;
}

// ── createFakeQueue ────────────────────────────────────────────────────────

interface FakeQueueItem {
  project: string;
  description: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
  mode?: string;
}

/**
 * Write a valid queue.json to env.pilotDir/queue.json matching QueueJsonFile type.
 *
 * Does NOT import from core — writes the matching JSON structure directly.
 */
export async function createFakeQueue(
  env: TempEnv,
  items: FakeQueueItem[],
): Promise<void> {
  const queueItems = items.map((item, i) => ({
    id: generateId(i),
    project: item.project,
    mode: item.mode ?? 'continue',
    description: item.description,
    status: item.status ?? 'queued',
    addedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    phase: null,
    attempts: 0,
    maxAttempts: 3,
    dependsOn: null,
    error: null,
    meta: {},
  }));

  const queueFile = {
    version: 1,
    items: queueItems,
    history: [],
    completedIds: [],
  };

  await writeFile(
    path.join(env.pilotDir, 'queue.json'),
    JSON.stringify(queueFile, null, 2),
  );
}

/**
 * Generate a 4-char alphanumeric ID deterministically from an index.
 */
function generateId(index: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  let n = index + 1000; // offset to get varied chars
  for (let i = 0; i < 4; i++) {
    id += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return id;
}

// ── cleanupTempEnv ─────────────────────────────────────────────────────────

/**
 * Remove temp environment directory recursively.
 *
 * Call in afterEach/afterAll to prevent temp dir buildup.
 */
export async function cleanupTempEnv(env: TempEnv): Promise<void> {
  await rm(env.dir, { recursive: true, force: true });
}
