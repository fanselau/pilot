import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

const AUTONOMOUS_GSD_DEFAULTS: JsonObject = {
  mode: 'yolo',
  granularity: 'standard',
  parallelization: true,
  commit_docs: true,
  model_profile: 'balanced',
  planning: {
    commit_docs: true,
    search_gitignored: false,
  },
  git: {
    branching_strategy: 'none',
  },
  workflow: {
    research: true,
    plan_check: true,
    verifier: true,
    auto_advance: true,
    nyquist_validation: true,
    ui_phase: true,
    ui_safety_gate: false,
    node_repair: true,
    node_repair_budget: 2,
  },
};

const PILOT_WINS_PATHS = [
  'mode',
  'workflow.auto_advance',
  'workflow.node_repair',
  'workflow.ui_safety_gate',
] as const;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeWithUserValues(defaults: JsonObject, user: JsonObject): JsonObject {
  const merged: JsonObject = { ...defaults };

  for (const [key, userValue] of Object.entries(user)) {
    const defaultValue = merged[key];
    if (isPlainObject(defaultValue) && isPlainObject(userValue)) {
      merged[key] = deepMergeWithUserValues(defaultValue, userValue);
      continue;
    }
    merged[key] = userValue;
  }

  return merged;
}

function getPathValue(source: JsonObject, keyPath: string): JsonValue | undefined {
  const keys = keyPath.split('.');
  let cursor: JsonValue | undefined = source;

  for (const key of keys) {
    if (!isPlainObject(cursor) || !(key in cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }

  return cursor;
}

function setPathValue(target: JsonObject, keyPath: string, value: JsonValue): void {
  const keys = keyPath.split('.');
  const lastKey = keys.pop();
  if (!lastKey) {
    return;
  }

  let cursor: JsonObject = target;
  for (const key of keys) {
    const existing = cursor[key];
    if (!isPlainObject(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as JsonObject;
  }

  cursor[lastKey] = value;
}

function applyPilotWins(config: JsonObject): JsonObject {
  for (const keyPath of PILOT_WINS_PATHS) {
    const safeValue = getPathValue(AUTONOMOUS_GSD_DEFAULTS, keyPath);
    if (safeValue !== undefined) {
      setPathValue(config, keyPath, safeValue);
    }
  }
  return config;
}

async function ensureLockTarget(configPath: string): Promise<void> {
  try {
    await access(configPath);
  } catch {
    await writeFile(configPath, '{}\n', 'utf8');
  }
}

async function readConfigOrEmpty(configPath: string): Promise<JsonObject> {
  try {
    const raw = await readFile(configPath, 'utf8');
    if (raw.trim().length === 0) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

async function writeConfigAtomically(configPath: string, config: JsonObject): Promise<void> {
  const tmpPath = `${configPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  try {
    await rename(tmpPath, configPath);
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch {
      // Best effort cleanup.
    }
    throw error;
  }
}

function isAutonomousGsdConfig(config: unknown): boolean {
  if (!isPlainObject(config)) {
    return false;
  }

  if (config.mode !== 'yolo') {
    return false;
  }

  const workflow = config.workflow;
  return isPlainObject(workflow) && workflow.auto_advance === true;
}

async function ensureAutonomousGsdConfig(projectDir: string): Promise<void> {
  const planningDir = path.join(projectDir, '.planning');
  const configPath = path.join(planningDir, 'config.json');

  await mkdir(planningDir, { recursive: true });
  await ensureLockTarget(configPath);

  let release: (() => Promise<void>) | null = null;

  try {
    release = await lockfile.lock(configPath, {
      realpath: false,
      retries: {
        retries: 25,
        factor: 1.2,
        minTimeout: 20,
        maxTimeout: 100,
      },
    });

    const existing = await readConfigOrEmpty(configPath);
    const merged = deepMergeWithUserValues(AUTONOMOUS_GSD_DEFAULTS, existing);
    const nextConfig = applyPilotWins(merged);

    await writeConfigAtomically(configPath, nextConfig);
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Best effort unlock.
      }
    }
  }
}

export {
  AUTONOMOUS_GSD_DEFAULTS,
  PILOT_WINS_PATHS,
  ensureAutonomousGsdConfig,
  isAutonomousGsdConfig,
};
