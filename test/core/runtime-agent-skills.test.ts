import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillEntry } from '../../src/core/types.js';
import {
  RUNTIME_AGENT_SKILL_TARGETS,
  applyRuntimeAgentSkillsPatch,
  restoreRuntimeAgentSkillsPatch,
} from '../../src/core/runtime-agent-skills.js';
import { resolveSkillsForJob } from '../../src/core/skills.js';

vi.mock('../../src/core/skills.js', () => ({
  resolveSkillsForJob: vi.fn(),
}));

const mockedResolveSkillsForJob = vi.mocked(resolveSkillsForJob);

async function readConfig(projectDir: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(projectDir, '.planning', 'config.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function skillEntry(name: string): SkillEntry {
  return {
    name,
    description: '',
    categories: [],
    repo: `https://example.com/${name}`,
    skill: name,
  };
}

describe('applyRuntimeAgentSkillsPatch', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-runtime-skills-'));
    mockedResolveSkillsForJob.mockReset();
    await mkdir(path.join(projectDir, '.planning'), { recursive: true });
    await mkdir(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    await writeFile(path.join(projectDir, '.planning', 'config.json'), '{}\n', 'utf8');
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('builds a deterministic agentSkills map for discovered allowlisted gsd agents', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('alpha-skill'), skillEntry('beta-skill')]);
    await mkdir(path.join(projectDir, '.opencode', 'skill', 'alpha-skill'), { recursive: true });
    await mkdir(path.join(projectDir, '.opencode', 'skill', 'beta-skill'), { recursive: true });
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-executor.md'), '---\n---\n', 'utf8');
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'random-agent.md'), '---\n---\n', 'utf8');

    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);
    const config = await readConfig(projectDir);
    const expectedPaths = [
      path.join(projectDir, '.opencode', 'skill', 'alpha-skill'),
      path.join(projectDir, '.opencode', 'skill', 'beta-skill'),
    ];

    expect(handle.applied).toBe(true);
    expect(handle.snapshot.selectedSkills).toEqual(['alpha-skill', 'beta-skill']);
    expect(handle.snapshot.invalidSkills).toEqual([]);
    expect(handle.snapshot.agentSkills).toEqual({
      'gsd-executor': expectedPaths,
      'gsd-planner': expectedPaths,
    });
    expect(config.agent_skills).toEqual(handle.snapshot.agentSkills);
  });

  it('preserves user-defined agent_skills first and appends Pilot-generated paths with dedupe', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('alpha-skill')]);
    const alphaPath = path.join(projectDir, '.opencode', 'skill', 'alpha-skill');
    await mkdir(alphaPath, { recursive: true });
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');
    await writeFile(
      path.join(projectDir, '.planning', 'config.json'),
      `${JSON.stringify({
        agent_skills: {
          'gsd-planner': [alphaPath, '/custom/user-skill'],
          'custom-agent': ['/keep/me'],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);
    const config = await readConfig(projectDir);

    expect(handle.snapshot.agentSkills).toEqual({
      'custom-agent': ['/keep/me'],
      'gsd-planner': [alphaPath, '/custom/user-skill'],
    });
    expect(config.agent_skills).toEqual(handle.snapshot.agentSkills);
    expect(handle.snapshot.mergePolicy).toBe('append-user-then-pilot');
  });

  it('skips missing or invalid skill directories and reports invalid skill names', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('valid-skill'), skillEntry('missing-skill')]);
    await mkdir(path.join(projectDir, '.opencode', 'skill', 'valid-skill'), { recursive: true });
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');

    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);

    expect(handle.applied).toBe(true);
    expect(handle.snapshot.invalidSkills).toEqual(['missing-skill']);
    expect(handle.snapshot.agentSkills['gsd-planner']).toEqual([
      path.join(projectDir, '.opencode', 'skill', 'valid-skill'),
    ]);
  });

  it('returns applied false and leaves config unchanged when no valid skill paths exist', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('missing-skill')]);
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');
    await writeFile(
      path.join(projectDir, '.planning', 'config.json'),
      `${JSON.stringify({ custom: { keep: true } }, null, 2)}\n`,
      'utf8',
    );

    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);
    const config = await readConfig(projectDir);

    expect(handle.applied).toBe(false);
    expect(handle.snapshot.applied).toBe(false);
    expect(handle.snapshot.restoreStatus).toBe('skipped');
    expect(handle.snapshot.invalidSkills).toEqual(['missing-skill']);
    expect(config).toEqual({ custom: { keep: true } });
  });

  it('restores the exact pre-run agent_skills state', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('alpha-skill')]);
    await mkdir(path.join(projectDir, '.opencode', 'skill', 'alpha-skill'), { recursive: true });
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');
    await writeFile(
      path.join(projectDir, '.planning', 'config.json'),
      `${JSON.stringify({
        custom: { keep: true },
        agent_skills: {
          'gsd-planner': ['/user/path'],
          'custom-agent': ['/keep/me'],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const before = await readConfig(projectDir);
    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);
    const restored = await restoreRuntimeAgentSkillsPatch(projectDir, handle);
    const after = await readConfig(projectDir);

    expect(restored.restoreStatus).toBe('restored');
    expect(after).toEqual(before);
  });

  it('removes agent_skills entirely on restore when the key did not exist before', async () => {
    mockedResolveSkillsForJob.mockReturnValue([skillEntry('alpha-skill')]);
    await mkdir(path.join(projectDir, '.opencode', 'skill', 'alpha-skill'), { recursive: true });
    await writeFile(path.join(projectDir, '.opencode', 'agents', 'gsd-planner.md'), '---\n---\n', 'utf8');

    const handle = await applyRuntimeAgentSkillsPatch(projectDir, ['frontend']);
    await restoreRuntimeAgentSkillsPatch(projectDir, handle);

    const config = await readConfig(projectDir);
    expect(config).not.toHaveProperty('agent_skills');
  });

  it('exports the rollout target allowlist', () => {
    expect(RUNTIME_AGENT_SKILL_TARGETS).toContain('gsd-planner');
    expect(RUNTIME_AGENT_SKILL_TARGETS).toContain('gsd-executor');
  });
});
