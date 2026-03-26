import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { mutatePlanningConfig, type JsonObject } from './gsd-config.js';
import { resolveSkillsForJob } from './skills.js';
import type { RuntimeAgentSkillsSnapshot } from './types.js';

const RUNTIME_AGENT_SKILL_TARGETS = [
  'gsd-planner',
  'gsd-roadmapper',
  'gsd-executor',
  'gsd-debugger',
  'gsd-phase-researcher',
  'gsd-project-researcher',
  'gsd-research-synthesizer',
  'gsd-codebase-mapper',
  'gsd-verifier',
  'gsd-plan-checker',
  'gsd-integration-checker',
] as const;

const TARGET_ALLOWLIST = new Set<string>(RUNTIME_AGENT_SKILL_TARGETS);
const AGENT_FILENAME_PATTERN = /^gsd-.*\.md$/;
const MERGE_POLICY = 'append-user-then-pilot' as const;

interface RuntimeAgentSkillsPatchHandle {
  snapshot: RuntimeAgentSkillsSnapshot;
  applied: boolean;
  previousAgentSkills: Record<string, string[]> | null;
  hadAgentSkillsKey: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function cloneAgentSkillsMap(agentSkills: Record<string, string[]> | null): Record<string, string[]> | null {
  if (!agentSkills) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(agentSkills).map(([agent, skillPaths]) => [agent, [...skillPaths]]),
  );
}

function readAgentSkillsMap(config: JsonObject): {
  agentSkills: Record<string, string[]> | null;
  hadAgentSkillsKey: boolean;
} {
  if (!Object.prototype.hasOwnProperty.call(config, 'agent_skills')) {
    return { agentSkills: null, hadAgentSkillsKey: false };
  }

  const raw = config['agent_skills'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { agentSkills: null, hadAgentSkillsKey: true };
  }

  const parsed: Record<string, string[]> = {};
  for (const [agent, value] of Object.entries(raw)) {
    if (isStringArray(value)) {
      parsed[agent] = [...value];
    }
  }

  return { agentSkills: parsed, hadAgentSkillsKey: true };
}

function normalizeSkillPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skillPath of paths) {
    const resolved = path.resolve(skillPath);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      normalized.push(resolved);
    }
  }

  return normalized;
}

function mergeAgentSkillPaths(existing: string[] | undefined, generated: string[]): string[] {
  return normalizeSkillPaths([...(existing ?? []), ...generated]);
}

async function discoverRuntimeAgentTargets(projectDir: string): Promise<string[]> {
  const agentsDir = path.join(projectDir, '.opencode', 'agents');

  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && AGENT_FILENAME_PATTERN.test(entry.name))
      .map((entry) => path.basename(entry.name, '.md'))
      .filter((agent) => TARGET_ALLOWLIST.has(agent))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function resolveValidSkillPaths(projectDir: string, selectedSkills: string[]): Promise<{
  validPaths: string[];
  invalidSkills: string[];
}> {
  const validPaths: string[] = [];
  const invalidSkills: string[] = [];

  for (const skillName of selectedSkills) {
    const candidatePath = path.join(projectDir, '.opencode', 'skill', skillName);

    try {
      const stats = await stat(candidatePath);
      if (!stats.isDirectory()) {
        invalidSkills.push(skillName);
        continue;
      }

      const normalizedPath = await realpath(candidatePath);
      if (!path.isAbsolute(normalizedPath)) {
        invalidSkills.push(skillName);
        continue;
      }

      validPaths.push(normalizedPath);
    } catch {
      invalidSkills.push(skillName);
    }
  }

  return {
    validPaths: normalizeSkillPaths(validPaths),
    invalidSkills,
  };
}

function buildSnapshot(
  categories: string[] | null,
  selectedSkills: string[],
  invalidSkills: string[],
  agentSkills: Record<string, string[]>,
  applied: boolean,
): RuntimeAgentSkillsSnapshot {
  return {
    categories: categories ? [...categories] : [],
    selectedSkills: [...selectedSkills],
    invalidSkills: [...invalidSkills],
    agentSkills: cloneAgentSkillsMap(agentSkills) ?? {},
    mergePolicy: MERGE_POLICY,
    applied,
    restoreStatus: applied ? 'pending' : 'skipped',
    restoreError: null,
  };
}

async function applyRuntimeAgentSkillsPatch(
  projectDir: string,
  categories: string[] | null,
): Promise<RuntimeAgentSkillsPatchHandle> {
  const selectedSkills = resolveSkillsForJob(categories).map((skill) => skill.name);
  const { validPaths, invalidSkills } = await resolveValidSkillPaths(projectDir, selectedSkills);
  const targetAgents = await discoverRuntimeAgentTargets(projectDir);

  let previousAgentSkills: Record<string, string[]> | null = null;
  let hadAgentSkillsKey = false;

  if (validPaths.length === 0 || targetAgents.length === 0) {
    const snapshot = buildSnapshot(categories, selectedSkills, invalidSkills, {}, false);
    return {
      snapshot,
      applied: false,
      previousAgentSkills,
      hadAgentSkillsKey,
    };
  }

  let writtenAgentSkills: Record<string, string[]> = {};

  await mutatePlanningConfig(projectDir, (config) => {
    const existing = readAgentSkillsMap(config);
    previousAgentSkills = cloneAgentSkillsMap(existing.agentSkills);
    hadAgentSkillsKey = existing.hadAgentSkillsKey;

    const mergedAgentSkills = cloneAgentSkillsMap(existing.agentSkills) ?? {};
    for (const agent of targetAgents) {
      mergedAgentSkills[agent] = mergeAgentSkillPaths(mergedAgentSkills[agent], validPaths);
    }

    writtenAgentSkills = cloneAgentSkillsMap(mergedAgentSkills) ?? {};
    config['agent_skills'] = mergedAgentSkills as unknown as JsonObject;
  });

  const snapshot = buildSnapshot(categories, selectedSkills, invalidSkills, writtenAgentSkills, true);

  return {
    snapshot,
    applied: true,
    previousAgentSkills,
    hadAgentSkillsKey,
  };
}

async function restoreRuntimeAgentSkillsPatch(
  projectDir: string,
  handle: RuntimeAgentSkillsPatchHandle,
): Promise<RuntimeAgentSkillsSnapshot> {
  const snapshot: RuntimeAgentSkillsSnapshot = {
    ...handle.snapshot,
    categories: [...handle.snapshot.categories],
    selectedSkills: [...handle.snapshot.selectedSkills],
    invalidSkills: [...handle.snapshot.invalidSkills],
    agentSkills: cloneAgentSkillsMap(handle.snapshot.agentSkills) ?? {},
    restoreError: null,
  };

  if (!handle.applied) {
    snapshot.restoreStatus = 'skipped';
    return snapshot;
  }

  await mutatePlanningConfig(projectDir, (config) => {
    if (!handle.hadAgentSkillsKey) {
      delete config['agent_skills'];
      return;
    }

    config['agent_skills'] = (cloneAgentSkillsMap(handle.previousAgentSkills) ?? {}) as unknown as JsonObject;
  });

  snapshot.restoreStatus = 'restored';
  return snapshot;
}

export {
  RUNTIME_AGENT_SKILL_TARGETS,
  applyRuntimeAgentSkillsPatch,
  restoreRuntimeAgentSkillsPatch,
  type RuntimeAgentSkillsPatchHandle,
};
