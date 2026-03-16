import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_GSD_DEFAULTS,
  ensureAutonomousGsdConfig,
  isAutonomousGsdConfig,
} from '../../src/core/gsd-config.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('ensureAutonomousGsdConfig', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-config-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('creates .planning/config.json with autonomous defaults in fresh projects', async () => {
    const configPath = path.join(projectDir, '.planning', 'config.json');

    await ensureAutonomousGsdConfig(projectDir);

    const config = await readJson(configPath);
    expect(config).toMatchObject(AUTONOMOUS_GSD_DEFAULTS as Record<string, unknown>);
    expect(isAutonomousGsdConfig(config)).toBe(true);
  });

  it('preserves non-critical user keys while overwriting PILOT_WINS safety keys', async () => {
    const planningDir = path.join(projectDir, '.planning');
    const configPath = path.join(planningDir, 'config.json');

    await mkdir(planningDir, { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({
        mode: 'interactive',
        customRootKey: 'keep-me',
        planning: {
          commit_docs: false,
          customPlanningKey: 'preserve',
        },
        git: {
          branching_strategy: 'feature-branches',
        },
        workflow: {
          auto_advance: false,
          node_repair: false,
          ui_safety_gate: true,
          verifier: false,
          customWorkflowKey: 'still-here',
        },
      }, null, 2)}\n`,
      'utf8',
    );

    await ensureAutonomousGsdConfig(projectDir);

    const config = await readJson(configPath);
    const workflow = config.workflow as Record<string, unknown>;
    const planning = config.planning as Record<string, unknown>;
    const git = config.git as Record<string, unknown>;

    expect(config.mode).toBe('yolo');
    expect(workflow.auto_advance).toBe(true);
    expect(workflow.node_repair).toBe(true);
    expect(workflow.ui_safety_gate).toBe(false);

    expect(config.customRootKey).toBe('keep-me');
    expect(planning.commit_docs).toBe(false);
    expect(planning.customPlanningKey).toBe('preserve');
    expect(git.branching_strategy).toBe('feature-branches');
    expect(workflow.verifier).toBe(false);
    expect(workflow.customWorkflowKey).toBe('still-here');
  });

  it('deep-merges nested objects key-by-key instead of replacing entire objects', async () => {
    const planningDir = path.join(projectDir, '.planning');
    const configPath = path.join(planningDir, 'config.json');

    await mkdir(planningDir, { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({
        workflow: {
          customWorkflowOnly: true,
        },
        planning: {
          customPlanningOnly: 'yes',
        },
        git: {
          customGitOnly: 'enabled',
        },
      }, null, 2)}\n`,
      'utf8',
    );

    await ensureAutonomousGsdConfig(projectDir);

    const config = await readJson(configPath);
    const workflow = config.workflow as Record<string, unknown>;
    const planning = config.planning as Record<string, unknown>;
    const git = config.git as Record<string, unknown>;

    expect(workflow.customWorkflowOnly).toBe(true);
    expect(workflow.plan_check).toBe(true);
    expect(workflow.verifier).toBe(true);

    expect(planning.customPlanningOnly).toBe('yes');
    expect(planning.search_gitignored).toBe(false);

    expect(git.customGitOnly).toBe('enabled');
    expect(git.branching_strategy).toBe('none');
  });

  it('writes atomically by leaving no tmp file and valid final JSON', async () => {
    const configPath = path.join(projectDir, '.planning', 'config.json');
    const tmpPath = `${configPath}.tmp`;

    await ensureAutonomousGsdConfig(projectDir);

    expect(await fileExists(tmpPath)).toBe(false);

    const raw = await readFile(configPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('handles concurrent ensure calls without corrupting config output', async () => {
    const planningDir = path.join(projectDir, '.planning');
    const configPath = path.join(planningDir, 'config.json');

    await mkdir(planningDir, { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({
        custom: {
          keep: true,
        },
        workflow: {
          auto_advance: false,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    await Promise.all([
      ensureAutonomousGsdConfig(projectDir),
      ensureAutonomousGsdConfig(projectDir),
      ensureAutonomousGsdConfig(projectDir),
    ]);

    const raw = await readFile(configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;

    expect(isAutonomousGsdConfig(config)).toBe(true);
    expect((config.custom as Record<string, unknown>).keep).toBe(true);
    expect(await fileExists(`${configPath}.tmp`)).toBe(false);
  });
});
