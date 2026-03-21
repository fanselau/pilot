/**
 * SQLite queue database (pilot.db) — persistence layer for the v2 queue system.
 *
 * Wraps better-sqlite3 for pilot.db at ~/.pilot/pilot.db.
 * All functions are synchronous (better-sqlite3 is sync).
 * Auto-creates DB + table on first access.
 *
 * Pure core module — no UI dependencies.
 */

import Database from './sqlite.js';
import type { Database as DatabaseType } from './sqlite.js';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig, getConfigFileDefaults } from './config.js';
import type {
  Job,
  JobStep,
  JobScope,
  ModelProfile,
  DelegationResult,
  Project,
  ProjectStatus,
  ModelProfileRow,
  ProviderModeRow,
  OpenClawDeliverRoute,
  StepSource,
} from './types.js';
import { AGENT_MODELS } from './models.js';

// ── Constants ─────────────────────────────────────────────────────────────

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 4;

const VALID_DELEGATION_INTENT_TYPES = new Set([
  'quick',
  'init-project',
  'new-milestone',
  'plan-and-execute',
  'execute-only',
  'audit-milestone',
  'noop',
]);

const LEGACY_DELEGATION_PAYLOAD_BLOCK_REASON =
  'Legacy delegation payload blocked at runtime boundary; recreate this job with intent-based delegation.';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone')),
  description TEXT NOT NULL,
  requirement_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'completed_pending_review', 'review_hold')),
  priority INTEGER DEFAULT 0,
  depends_on TEXT REFERENCES jobs(id),
  parent_job_id TEXT REFERENCES jobs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  timeout INTEGER DEFAULT 0,
  delegation_plan TEXT,
  current_step INTEGER DEFAULT 0,
  session_titles TEXT,
  model_profile TEXT NOT NULL DEFAULT 'balanced',
  provider_mode TEXT NOT NULL DEFAULT 'claude-only',
  git_base_commit TEXT,
  git_head_commit TEXT,
  started_dirty INTEGER NOT NULL DEFAULT 0,
  skip_grace_period INTEGER NOT NULL DEFAULT 0,
  retry_budget INTEGER NOT NULL DEFAULT 2,
  retry_count INTEGER NOT NULL DEFAULT 0,
  retry_hint TEXT,
  last_failure_fingerprint TEXT,
  hung_count INTEGER NOT NULL DEFAULT 0,
  last_hung_reason TEXT,
  resumed_from_hold INTEGER NOT NULL DEFAULT 0
);
`;

const CREATE_JOB_STEPS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS job_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  step_index INTEGER NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'delegation',
  session_title TEXT,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  reason TEXT,
  verdict_source TEXT,
  verdict_reason TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT,
  duration_ms INTEGER
);
`;

const CREATE_JOB_RETRY_ATTEMPTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS job_retry_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  attempt_number INTEGER NOT NULL,
  session_titles TEXT,
  retry_strategy TEXT,
  retry_hint TEXT,
  failure_fingerprint TEXT,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_JOB_RETRY_ATTEMPTS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_job_retry_attempts_job_attempt
ON job_retry_attempts (job_id, attempt_number, id);
`;

const CREATE_PROJECTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
  blocked_reason TEXT,
  blocked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_MODEL_PROFILES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS model_profiles (
  provider_mode TEXT NOT NULL,
  agent_or_scope TEXT NOT NULL,
  profile TEXT NOT NULL CHECK(profile IN ('quality', 'balanced', 'budget')),
  model TEXT NOT NULL,
  variant TEXT,
  PRIMARY KEY (provider_mode, agent_or_scope, profile)
);
`;

const CREATE_PROVIDER_MODES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS provider_modes (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ── Module-level cached DB connection ─────────────────────────────────────

let cachedDb: DatabaseType | null = null;

// ── ID Generation ─────────────────────────────────────────────────────────

function shortId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

/**
 * Generate a unique short ID that doesn't exist in the jobs table.
 */
function generateUniqueId(db: DatabaseType): string {
  const check = db.prepare('SELECT 1 FROM jobs WHERE id = ?');
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = shortId();
    if (!check.get(id)) {
      return id;
    }
  }
  // Extremely unlikely — 36^4 = 1.6M possible IDs
  throw new Error('Failed to generate unique job ID after 100 attempts');
}

// ── Row → Job mapper ──────────────────────────────────────────────────────

interface JobRow {
  id: string;
  project: string;
  scope: string;
  description: string;
  requirement_path: string | null;
  status: string;
  priority: number;
  depends_on: string | null;
  parent_job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  resume_hint: string | null;
  attempts: number;
  timeout: number;
  delegation_plan: string | null;
  current_step: number;
  session_titles: string | null;
  model_profile: string;
  provider_mode: string;
  judge_verdict: string | null;
  actual_models: string | null;
  callback_url: string | null;
  callback_session_key: string | null;
  notify_route: string | null;
  categories: string | null;
  git_base_commit: string | null;
  git_head_commit: string | null;
  started_dirty: number;
  skip_grace_period: number;
  retry_budget: number;
  retry_count: number;
  retry_hint: string | null;
  last_failure_fingerprint: string | null;
  hung_count: number;
  last_hung_reason: string | null;
  resumed_from_hold: number;
}

interface ProjectRow {
  path: string;
  owner: string | null;
  notify_openclaw_route: string | null;
  status: string;
  blocked_reason: string | null;
  blocked_at: string | null;
  created_at: string;
  default_categories: string | null;
}

function parseOpenClawDeliverRoute(value: string | null | undefined): OpenClawDeliverRoute | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OpenClawDeliverRoute>;
    if (
      parsed
      && parsed.kind === 'openclaw-agent-deliver'
      && typeof parsed.agentId === 'string'
      && typeof parsed.channel === 'string'
      && typeof parsed.to === 'string'
      && (parsed.accountId === undefined || typeof parsed.accountId === 'string')
    ) {
      return {
        kind: 'openclaw-agent-deliver',
        agentId: parsed.agentId,
        channel: parsed.channel,
        to: parsed.to,
        ...(parsed.accountId !== undefined ? { accountId: parsed.accountId } : {}),
      };
    }
  } catch {
    // Invalid JSON - treat as missing route
  }

  return null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    path: row.path,
    owner: row.owner,
    notifyOpenClawRoute: parseOpenClawDeliverRoute(row.notify_openclaw_route),
    status: row.status as ProjectStatus,
    blockedReason: row.blocked_reason,
    blockedAt: row.blocked_at,
    createdAt: row.created_at,
    defaultCategories: row.default_categories ? JSON.parse(row.default_categories) as string[] : null,
  };
}

function parseFailureFingerprint(value: string | null | undefined): string[] | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // Backward compatibility: treat non-JSON storage as a single fingerprint token.
  }

  return [value];
}

interface DelegationPayloadGuardResult {
  normalized: string | null;
  isLegacy: boolean;
}

function isIntentPayload(value: unknown): value is DelegationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { intent?: unknown; reasoning?: unknown; steps?: unknown };

  // Explicitly block old step-array payload shapes.
  if (Array.isArray(candidate.steps)) {
    return false;
  }

  if (!candidate.intent || typeof candidate.intent !== 'object' || Array.isArray(candidate.intent)) {
    return false;
  }

  const intentType = (candidate.intent as { type?: unknown }).type;
  if (typeof intentType !== 'string' || !VALID_DELEGATION_INTENT_TYPES.has(intentType)) {
    return false;
  }

  return typeof candidate.reasoning === 'string';
}

function guardDelegationPayload(payload: string | null): DelegationPayloadGuardResult {
  if (!payload) {
    return { normalized: null, isLegacy: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { normalized: null, isLegacy: true };
  }

  if (!isIntentPayload(parsed)) {
    return { normalized: null, isLegacy: true };
  }

  return { normalized: JSON.stringify(parsed), isLegacy: false };
}

function rowToJob(row: JobRow): Job {
  const guardedPlan = guardDelegationPayload(row.delegation_plan);

  return {
    id: row.id,
    project: row.project,
    scope: row.scope as JobScope,
    description: row.description,
    requirementPath: row.requirement_path,
    status: row.status as Job['status'],
    priority: row.priority,
    dependsOn: row.depends_on,
    parentJobId: row.parent_job_id ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    resumeHint: row.resume_hint ?? null,
    attempts: row.attempts,
    timeout: row.timeout ?? 0,
    delegationPlan: guardedPlan.normalized,
    currentStep: row.current_step,
    sessionTitles: row.session_titles,
    modelProfile: (row.model_profile ?? 'balanced') as Job['modelProfile'],
    providerMode: (row.provider_mode ?? 'claude-only') as Job['providerMode'],
    judgeVerdict: row.judge_verdict ?? null,
    actualModels: (() => {
      if (!row.actual_models) return null;
      try { return JSON.parse(row.actual_models) as string[]; } catch { return null; }
    })(),
    callbackUrl: row.callback_url ?? null,
    callbackSessionKey: row.callback_session_key ?? null,
    notifyRoute: parseOpenClawDeliverRoute(row.notify_route),
    categories: (() => {
      if (!row.categories) return null;
      try { return JSON.parse(row.categories) as string[]; } catch { return null; }
    })(),
    gitBaseCommit: row.git_base_commit ?? null,
    gitHeadCommit: row.git_head_commit ?? null,
    startedDirty: row.started_dirty === 1,
    skipGracePeriod: row.skip_grace_period === 1,
    retryBudget: row.retry_budget ?? 2,
    retryCount: row.retry_count ?? 0,
    retryHint: row.retry_hint ?? null,
    lastFailureFingerprint: parseFailureFingerprint(row.last_failure_fingerprint),
    hungCount: row.hung_count ?? 0,
    lastHungReason: row.last_hung_reason ?? null,
  };
}

// ── DB Access ─────────────────────────────────────────────────────────────

/**
 * Open (or return cached) pilot.db.
 * Auto-creates ~/.pilot/ directory and the jobs table on first access.
 */
/**
 * Migrate the jobs table CHECK constraint to support review state values.
 *
 * SQLite does not support ALTER TABLE to modify CHECK constraints, so we detect
 * whether the current schema is outdated (doesn't mention 'completed_pending_review')
 * and recreate the table with the updated constraint if necessary.
 *
 * New databases already use the updated CREATE_TABLE_SQL — this is a no-op for them.
 */
function migrateReviewStates(db: DatabaseType): void {
  const tableRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'",
  ).get() as { sql: string } | undefined;

  // Already migrated or new database — nothing to do
  if (!tableRow || tableRow.sql.includes('completed_pending_review')) {
    return;
  }

  // Old CHECK constraint detected — recreate table with updated constraint
  db.pragma('foreign_keys = off');
  try {
    db.exec(`
      CREATE TABLE jobs_review_migration (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone')),
        description TEXT NOT NULL,
        requirement_path TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'completed_pending_review', 'review_hold')),
        priority INTEGER DEFAULT 0,
        depends_on TEXT,
        parent_job_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        resume_hint TEXT,
        attempts INTEGER DEFAULT 0,
        timeout INTEGER DEFAULT 0,
        delegation_plan TEXT,
        current_step INTEGER DEFAULT 0,
        session_titles TEXT,
        model_profile TEXT NOT NULL DEFAULT 'balanced',
        provider_mode TEXT NOT NULL DEFAULT 'claude-only',
        judge_verdict TEXT,
        actual_models TEXT,
        callback_url TEXT,
        callback_session_key TEXT,
        notify_route TEXT,
        categories TEXT,
        git_base_commit TEXT,
        git_head_commit TEXT,
        started_dirty INTEGER NOT NULL DEFAULT 0,
        skip_grace_period INTEGER NOT NULL DEFAULT 0,
        retry_budget INTEGER NOT NULL DEFAULT 2,
        retry_count INTEGER NOT NULL DEFAULT 0,
        retry_hint TEXT,
        last_failure_fingerprint TEXT,
        hung_count INTEGER NOT NULL DEFAULT 0,
        last_hung_reason TEXT
      );

      INSERT INTO jobs_review_migration (
        id, project, scope, description, requirement_path, status, priority,
        depends_on, parent_job_id, created_at, started_at, completed_at, error,
        resume_hint, attempts, timeout, delegation_plan, current_step, session_titles,
        model_profile, provider_mode, judge_verdict, actual_models, callback_url,
        callback_session_key, notify_route, categories, git_base_commit, git_head_commit,
        started_dirty, skip_grace_period, retry_budget, retry_count, retry_hint,
        last_failure_fingerprint, hung_count, last_hung_reason
      )
      SELECT
        id, project, scope, description, requirement_path, status, priority,
        depends_on, parent_job_id, created_at, started_at, completed_at, error,
        resume_hint, attempts, timeout, delegation_plan, current_step, session_titles,
        model_profile, provider_mode, judge_verdict, actual_models, callback_url,
        callback_session_key, notify_route, categories, git_base_commit, git_head_commit,
        started_dirty, skip_grace_period, retry_budget, retry_count, retry_hint,
        last_failure_fingerprint, hung_count, last_hung_reason
      FROM jobs;

      DROP TABLE jobs;
      ALTER TABLE jobs_review_migration RENAME TO jobs;
    `);
  } finally {
    db.pragma('foreign_keys = on');
  }
}

/**
 * Run ALTER TABLE migrations for new columns.
 * Wraps each in try/catch so already-existing columns don't error.
 */
function migrateSchema(db: DatabaseType): void {
  const migrations = [
    "ALTER TABLE jobs ADD COLUMN model_profile TEXT NOT NULL DEFAULT 'balanced'",
    "ALTER TABLE jobs ADD COLUMN provider_mode TEXT NOT NULL DEFAULT 'claude-only'",
    "ALTER TABLE jobs ADD COLUMN judge_verdict TEXT",
    "ALTER TABLE jobs ADD COLUMN resume_hint TEXT",
    "ALTER TABLE jobs ADD COLUMN actual_models TEXT",
    "ALTER TABLE jobs ADD COLUMN parent_job_id TEXT REFERENCES jobs(id)",
    "ALTER TABLE jobs ADD COLUMN callback_url TEXT DEFAULT NULL",
    "ALTER TABLE jobs ADD COLUMN callback_session_key TEXT DEFAULT NULL",
    "ALTER TABLE jobs ADD COLUMN notify_route TEXT DEFAULT NULL",
    "ALTER TABLE jobs ADD COLUMN categories TEXT DEFAULT NULL",
    "ALTER TABLE jobs ADD COLUMN timeout INTEGER DEFAULT 0",
    'ALTER TABLE jobs ADD COLUMN git_base_commit TEXT',
    'ALTER TABLE jobs ADD COLUMN git_head_commit TEXT',
    'ALTER TABLE jobs ADD COLUMN started_dirty INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN skip_grace_period INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE projects ADD COLUMN notify_openclaw_route TEXT DEFAULT NULL',
    'ALTER TABLE projects ADD COLUMN default_categories TEXT DEFAULT NULL',
    'ALTER TABLE jobs ADD COLUMN retry_budget INTEGER NOT NULL DEFAULT 2',
    'ALTER TABLE jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN retry_hint TEXT DEFAULT NULL',
    'ALTER TABLE jobs ADD COLUMN last_failure_fingerprint TEXT DEFAULT NULL',
    'ALTER TABLE jobs ADD COLUMN hung_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN last_hung_reason TEXT DEFAULT NULL',
    // Phase 73: job_steps append-forward model columns
    "ALTER TABLE job_steps ADD COLUMN source TEXT NOT NULL DEFAULT 'delegation'",
    'ALTER TABLE job_steps ADD COLUMN reason TEXT',
    'ALTER TABLE job_steps ADD COLUMN error TEXT',
    // Phase 83: resumed review_hold pickup marker
    'ALTER TABLE jobs ADD COLUMN resumed_from_hold INTEGER NOT NULL DEFAULT 0',
  ];
  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — ignore
    }
  }
}

/**
 * Seed model_profiles and provider_modes tables from AGENT_MODELS constant.
 * Only seeds when provider_modes table is empty — preserves user customizations.
 */
function seedModelTables(db: DatabaseType): void {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM provider_modes').get() as { cnt: number };
  if (row.cnt > 0) return; // User data exists — preserve customizations

  // Seed built-in provider modes
  const builtinModes: Array<{ name: string; description: string }> = [
    { name: 'claude-only', description: 'Anthropic Claude models only' },
    { name: 'openai-only', description: 'OpenAI models only' },
    { name: 'hybrid', description: 'Claude for build, Codex for check' },
  ];
  const insertMode = db.prepare(
    'INSERT INTO provider_modes (name, description, is_builtin) VALUES (?, ?, 1)',
  );
  for (const mode of builtinModes) {
    insertMode.run(mode.name, mode.description);
  }

  // Seed model_profiles from AGENT_MODELS constant
  const insertProfile = db.prepare(
    'INSERT INTO model_profiles (provider_mode, agent_or_scope, profile, model, variant) VALUES (?, ?, ?, ?, ?)',
  );
  for (const [providerMode, agentMap] of Object.entries(AGENT_MODELS)) {
    for (const [agentOrScope, profileMap] of Object.entries(agentMap)) {
      for (const [profile, entry] of Object.entries(profileMap)) {
        insertProfile.run(providerMode, agentOrScope, profile, entry.model, entry.variant ?? null);
      }
    }
  }
}

function openPilotDb(): DatabaseType {
  if (cachedDb) return cachedDb;

  const config = getConfig();
  mkdirSync(dirname(config.pilotDbPath), { recursive: true });
  cachedDb = new Database(config.pilotDbPath) as DatabaseType;
  cachedDb!.pragma('journal_mode = WAL');
  cachedDb!.pragma('busy_timeout = 5000');
  cachedDb!.exec(CREATE_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_STEPS_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_RETRY_ATTEMPTS_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_RETRY_ATTEMPTS_INDEX_SQL);
  cachedDb!.exec(CREATE_PROJECTS_TABLE_SQL);
  cachedDb!.exec(CREATE_MODEL_PROFILES_TABLE_SQL);
  cachedDb!.exec(CREATE_PROVIDER_MODES_TABLE_SQL);
  migrateSchema(cachedDb!);
  migrateReviewStates(cachedDb!);
  seedModelTables(cachedDb!);

  // Restrict DB file permissions to owner-only (chmod 600)
  try {
    chmodSync(config.pilotDbPath, 0o600);
  } catch {
    // May fail on some systems (e.g., Windows, read-only FS) — non-fatal
  }

  return cachedDb!;
}

/**
 * Return an in-memory DB for testing.
 * Resets the cached connection each call — each test gets a fresh DB.
 * @internal — only for use in tests
 */
function _getTestDb(): DatabaseType {
  if (cachedDb) {
    try { cachedDb.close(); } catch { /* ignore */ }
  }
  cachedDb = new Database(':memory:') as DatabaseType;
  cachedDb!.pragma('journal_mode = WAL');
  cachedDb!.exec(CREATE_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_STEPS_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_RETRY_ATTEMPTS_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_RETRY_ATTEMPTS_INDEX_SQL);
  cachedDb!.exec(CREATE_PROJECTS_TABLE_SQL);
  cachedDb!.exec(CREATE_MODEL_PROFILES_TABLE_SQL);
  cachedDb!.exec(CREATE_PROVIDER_MODES_TABLE_SQL);
  migrateSchema(cachedDb!);
  migrateReviewStates(cachedDb!);
  seedModelTables(cachedDb!);
  return cachedDb!;
}

/**
 * Get the currently active DB connection.
 * Uses cached connection from openPilotDb() or _getTestDb().
 */
function getDb(): DatabaseType {
  if (cachedDb) return cachedDb;
  return openPilotDb();
}

// ── CRUD Operations ───────────────────────────────────────────────────────

/**
 * Add a new job to the queue.
 * Returns the created Job with a generated 4-char alphanumeric ID.
 */
function addJob(
  project: string,
  scope: JobScope,
  description: string,
  requirementPath?: string,
  modelProfile?: ModelProfile,
  providerMode?: string,
  dependsOn?: string,
  parentJobId?: string,
  callbackSessionKey?: string,
  callbackUrl?: string,
  timeout?: number,
  skipGracePeriod?: boolean,
  notifyRoute?: OpenClawDeliverRoute | null,
): Job {
  const db = getDb();
  const id = generateUniqueId(db);
  const defaults = getConfigFileDefaults();
  const profile = modelProfile ?? defaults.modelProfile;
  const provider = providerMode ?? defaults.providerMode;

  db.prepare(`
    INSERT INTO jobs (id, project, scope, description, requirement_path, model_profile, provider_mode, depends_on, parent_job_id, callback_session_key, callback_url, timeout, skip_grace_period, notify_route, retry_budget)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    project,
    scope,
    description,
    requirementPath ?? null,
    profile,
    provider,
    dependsOn ?? null,
    parentJobId ?? null,
    callbackSessionKey ?? null,
    callbackUrl ?? null,
    timeout ?? 0,
    skipGracePeriod ? 1 : 0,
    notifyRoute ? JSON.stringify(notifyRoute) : null,
    0,
  );

  return getJob(id)!;
}

/**
 * Get a job by ID.
 * Returns null if not found.
 */
function getJob(id: string): Job | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Get the next pending job by priority DESC, created_at ASC.
 * Returns null if no pending jobs exist.
 */
function getNextPending(): Job | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM jobs WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1",
  ).get() as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Mark a job as running. Sets started_at and increments attempts.
 */
function markRunning(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'running', started_at = datetime('now'), attempts = attempts + 1
    WHERE id = ?
  `).run(id);
}

/**
 * Mark a job as completed. Sets completed_at.
 */
function markCompleted(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'completed', completed_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

/**
 * Mark a job as completed pending human review.
 * Sets status to 'completed_pending_review' and records completed_at.
 * Stores an optional review checklist in resume_hint for downstream display.
 * Deliberately does NOT call blockProject() — review states must not block the project.
 */
function markCompletedPendingReview(id: string, reviewChecklist?: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'completed_pending_review',
        completed_at = datetime('now'),
        resume_hint = COALESCE(?, resume_hint)
    WHERE id = ?
  `).run(reviewChecklist ?? null, id);
  // NOTE: deliberately does NOT call blockProject()
}

/**
 * Mark a job as held for mid-phase human review.
 * Sets status to 'review_hold' and stores the review reason in resume_hint.
 * Deliberately does NOT call blockProject() — review states must not block the project.
 */
function markReviewHold(id: string, reviewReason: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'review_hold', resume_hint = ?
    WHERE id = ?
  `).run(reviewReason, id);
  // NOTE: deliberately does NOT call blockProject()
}

/**
 * Approve a completed_pending_review job, transitioning to 'completed'.
 * Clears resume_hint. No-op if job is not in completed_pending_review state.
 */
function approveReview(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'completed', resume_hint = NULL
    WHERE id = ? AND status = 'completed_pending_review'
  `).run(id);
}

/**
 * Resume from review_hold — transition back to 'running' for continued execution.
 * Clears resume_hint. Returns the updated Job, or null if not in review_hold.
 */
function resumeFromReviewHold(id: string): Job | null {
  const db = getDb();
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'running', resume_hint = NULL, resumed_from_hold = 1
    WHERE id = ? AND status = 'review_hold'
  `).run(id);
  if (result.changes === 0) return null;
  return getJob(id);
}

/**
 * Get jobs that were resumed from review_hold and need the runner to continue their step loop.
 * These are 'running' jobs with resumed_from_hold=1 — set by resumeFromReviewHold().
 * The runner should detect these on its next poll cycle and launch their step loop continuation.
 */
function getResumedReviewHoldJobs(): Job[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM jobs
    WHERE status = 'running'
      AND resumed_from_hold = 1
    ORDER BY created_at ASC
  `).all() as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Clear the resumed_from_hold flag after the runner picks up the job.
 * Prevents the runner from launching the step loop continuation multiple times.
 */
function clearResumedFlag(id: string): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET resumed_from_hold = 0 WHERE id = ?').run(id);
}

/**
 * Mark a job as failed. Sets completed_at and error message.
 * Also blocks the project so no further jobs run until operator unblocks.
 */
function markFailed(id: string, error: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'failed', completed_at = datetime('now'), error = ?
    WHERE id = ?
  `).run(error, id);

  // Block the project so no further jobs run until operator unblocks
  const job = getJob(id);
  if (job) {
    blockProject(job.project, error);
  }
}

/**
 * Cancel a job. Sets status to cancelled.
 */
function cancel(id: string): void {
  const db = getDb();
  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(id);
}



/**
 * Reset a failed/cancelled job to pending for re-execution.
 * Used by milestone resume to re-queue a failed child phase job.
 * No retry tracking — jobs are disposable; this is a fresh re-queue.
 */
function requeueFailedJob(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'pending', started_at = NULL, completed_at = NULL, error = NULL,
        session_titles = NULL, delegation_plan = NULL, current_step = 0, attempts = 0
    WHERE id = ?
  `).run(id);
  // Clean up step records from previous attempt
  db.prepare('DELETE FROM job_steps WHERE job_id = ?').run(id);
}

/**
 * Get all pending + running + review_hold jobs, ordered by priority DESC, created_at ASC.
 * Includes review_hold because those jobs are mid-execution and still "in progress".
 */
function getQueue(): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('pending', 'running', 'review_hold') ORDER BY priority DESC, created_at ASC",
  ).all() as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Get all currently running jobs for a specific project.
 * Used for same-project serialization: don't launch a new job if one is already running.
 */
function getRunningJobsForProject(project: string): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE project = ? AND status = 'running' ORDER BY started_at ASC",
  ).all(project) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Get all currently running jobs for a specific project.
 * Alias for getRunningJobsForProject — used by the runner's immediate dispatch path.
 */
function getRunningJobsByProject(project: string): Job[] {
  return getRunningJobsForProject(project);
}

/**
 * Atomically claim the next launchable pending job, enforcing project-level serialization.
 *
 * Runs entirely inside a db.transaction():
 *   1. SELECT the next pending job whose project has no currently-running job
 *      (ORDER BY priority DESC, created_at ASC)
 *   2. If found, UPDATE status='running', started_at=now(), attempts+1
 *   3. Return the mapped Job, or null if none available
 *
 * The transaction guarantees that no two callers can claim the same job concurrently,
 * and that a second job for the same project cannot be claimed while one is running.
 */
function claimNextLaunchable(queueGraceSeconds: number = 0): Job | null {
  const db = getDb();

  const claim = db.transaction((): Job | null => {
    const selectNextLaunchable = db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND project NOT IN (
          SELECT DISTINCT project FROM jobs WHERE status = 'running'
        )
        AND project NOT IN (
          SELECT path FROM projects WHERE status = 'blocked'
        )
        AND (depends_on IS NULL OR depends_on IN (SELECT id FROM jobs WHERE status = 'completed'))
        AND (
          skip_grace_period = 1
          OR ? <= 0
          OR (strftime('%s','now') - strftime('%s', created_at)) >= ?
        )
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);

    const markLegacyPendingAsFailed = db.prepare(`
      UPDATE jobs
      SET status = 'failed',
          completed_at = datetime('now'),
          error = ?,
          delegation_plan = NULL
      WHERE id = ? AND status = 'pending'
    `);

    const normalizeDelegationPayload = db.prepare('UPDATE jobs SET delegation_plan = ? WHERE id = ?');

    const markRunningClaim = db.prepare(`
      UPDATE jobs
      SET status = 'running',
          started_at = datetime('now'),
          attempts = attempts + 1
      WHERE id = ?
    `);

    while (true) {
      // Select next pending job where no running job exists for the same project
      const row = selectNextLaunchable.get(queueGraceSeconds, queueGraceSeconds) as JobRow | undefined;
      if (!row) return null;

      const guardedPlan = guardDelegationPayload(row.delegation_plan);
      if (guardedPlan.isLegacy) {
        markLegacyPendingAsFailed.run(LEGACY_DELEGATION_PAYLOAD_BLOCK_REASON, row.id);
        continue;
      }

      if (guardedPlan.normalized !== row.delegation_plan) {
        normalizeDelegationPayload.run(guardedPlan.normalized, row.id);
      }

      // Atomically mark as running within the same transaction
      markRunningClaim.run(row.id);

      // Return the updated row (re-fetch to get new values)
      const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.id) as JobRow;
      return rowToJob(updated);
    }
  });

  return claim();
}

/**
 * Get all jobs currently in 'running' status.
 * Used for reconciliation: compare against known active PIDs/sessions.
 */
function getAllRunningJobs(): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE status = 'running' ORDER BY started_at ASC",
  ).all() as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Reconcile stale-running jobs: reset any 'running' job whose ID is NOT in the
 * provided set of known-active job IDs back to 'pending'.
 *
 * Called on runner startup and periodically during the event loop.
 * Returns the list of job IDs that were reset.
 *
 * @param activeJobIds - Set of job IDs the runner currently tracks as active
 */
function reconcileStaleJobs(activeJobIds: Set<string>): string[] {
  const running = getAllRunningJobs();
  const staleIds: string[] = [];

  for (const job of running) {
    if (!activeJobIds.has(job.id)) {
      // This job is marked running in DB but runner doesn't know about it
      markStale(job.id);
      staleIds.push(job.id);
    }
  }

  return staleIds;
}

/**
 * Mark a running job as 'pending' with a stale termination note.
 * Used when the runner detects a job is running in DB but has no backing session.
 * Resets started_at so it gets a fresh attempt, and records the stale event in error.
 */
function markStale(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        started_at = NULL,
        session_titles = NULL,
        delegation_plan = NULL,
        current_step = 0,
        error = 'Reset from stale-running state by reconciliation (backing session/process gone)'
    WHERE id = ? AND status = 'running'
  `).run(id);
  // Clean up step records from previous attempt
  db.prepare('DELETE FROM job_steps WHERE job_id = ?').run(id);
}

/**
 * Get last N completed/failed/cancelled/completed_pending_review jobs, ordered by completed_at DESC.
 * For cancelled jobs without completed_at, falls back to created_at.
 * Includes completed_pending_review since those jobs are done with autonomous execution.
 */
function getRecent(limit: number = 20): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('completed', 'failed', 'cancelled', 'completed_pending_review') ORDER BY COALESCE(completed_at, created_at) DESC LIMIT ?",
  ).all(limit) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Store a delegation result as JSON string.
 */
function updateDelegationPayload(id: string, plan: DelegationResult): void {
  const db = getDb();
  const guardedPlan = guardDelegationPayload(JSON.stringify(plan));
  if (guardedPlan.isLegacy || !guardedPlan.normalized) {
    throw new Error(LEGACY_DELEGATION_PAYLOAD_BLOCK_REASON);
  }

  db.prepare('UPDATE jobs SET delegation_plan = ? WHERE id = ?').run(
    guardedPlan.normalized,
    id,
  );
}

/**
 * Increment current_step by 1.
 */
function advanceStep(id: string): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET current_step = current_step + 1 WHERE id = ?').run(id);
}

/**
 * Bump a job to the front of the queue by setting its priority to max(priority) + 1.
 */
function bump(id: string): void {
  const db = getDb();
  const maxRow = db.prepare('SELECT MAX(priority) as max_p FROM jobs').get() as { max_p: number | null };
  const newPriority = (maxRow.max_p ?? 0) + 1;
  db.prepare('UPDATE jobs SET priority = ? WHERE id = ?').run(newPriority, id);
}

/**
 * Append session titles to a job's session_titles JSON array.
 * If session_titles is null, creates a new array.
 * Appends to existing array (does not overwrite).
 */
function updateSessionTitles(id: string, titles: string[]): void {
  const db = getDb();
  const job = getJob(id);
  if (!job) return;

  let existing: string[] = [];
  if (job.sessionTitles) {
    try {
      existing = JSON.parse(job.sessionTitles) as string[];
    } catch {
      existing = [];
    }
  }

  const seen = new Set(existing);
  const merged = [...existing];
  for (const t of titles) {
    if (!seen.has(t)) {
      seen.add(t);
      merged.push(t);
    }
  }
  db.prepare('UPDATE jobs SET session_titles = ? WHERE id = ?').run(
    JSON.stringify(merged),
    id,
  );
}

/**
 * Persist attempt-start recovery metadata for a job.
 * Overwrites previous attempt metadata for git_base_commit and started_dirty.
 */
function updateJobRecoveryStart(
  id: string,
  gitBaseCommit: string | null,
  startedDirty: boolean,
): void {
  const db = getDb();
  db.prepare(
    'UPDATE jobs SET git_base_commit = ?, started_dirty = ? WHERE id = ?',
  ).run(gitBaseCommit, startedDirty ? 1 : 0, id);
}

/**
 * Persist attempt-end recovery metadata for a job.
 * Overwrites previous attempt metadata for git_head_commit.
 */
function updateJobRecoveryHead(id: string, gitHeadCommit: string | null): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET git_head_commit = ? WHERE id = ?').run(gitHeadCommit, id);
}

// ── Force Quit ────────────────────────────────────────────────────────

/**
 * Result of a forceQuitJob() call.
 */
export interface ForceQuitResult {
  ok: boolean;
  /** The job as it was after being transitioned to failed (only when ok=true) */
  job?: Job;
  /** Human-readable reason when ok=false */
  reason?: string;
}

/**
 * Forcibly terminate a running job: atomically mark the job and all its
 * currently-running steps as failed, recording operator source metadata.
 *
 * @param id     - Job ID to force-quit
 * @param source - Who triggered the quit ('cli' | 'tui')
 * @param reason - Optional human-readable reason (default: 'Force-quit by operator')
 *
 * Returns {ok:false, reason} when:
 *   - Job does not exist
 *   - Job is not in 'running' status
 *
 * Returns {ok:true, job} on success, where job reflects the failed state.
 */
function forceQuitJob(
  id: string,
  source: 'cli' | 'tui',
  reason?: string,
): ForceQuitResult {
  const db = getDb();

  // Guard: job must exist and be running
  const existing = getJob(id);
  if (!existing) {
    return { ok: false, reason: `Job '${id}' not found` };
  }
  if (existing.status !== 'running') {
    return { ok: false, reason: `Job '${id}' is not running (status: ${existing.status})` };
  }

  const errorMessage = reason ?? 'Force-quit by operator';
  const verdictReason = `${errorMessage} [source: ${source}]`;

  const quit = db.transaction((): Job => {
    // Mark job as failed
    db.prepare(`
      UPDATE jobs
      SET status = 'failed',
          completed_at = datetime('now'),
          error = ?
      WHERE id = ? AND status = 'running'
    `).run(verdictReason, id);

    // Mark all running steps for this job as failed
    db.prepare(`
      UPDATE job_steps
      SET status = 'failed',
          completed_at = datetime('now'),
          verdict_reason = ?
      WHERE job_id = ? AND status = 'running'
    `).run(verdictReason, id);

    const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow;
    return rowToJob(updated);
  });

  const job = quit();
  return { ok: true, job };
}

// ── Job Steps CRUD ────────────────────────────────────────────────────

interface JobStepRow {
  id: number;
  job_id: string;
  step_index: number;
  command: string;
  args: string;
  source: string;
  session_title: string | null;
  session_id: string | null;
  status: string;
  reason: string | null;
  verdict_source: string | null;
  verdict_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  duration_ms: number | null;
}

interface JobRetryAttemptRow {
  id: number;
  job_id: string;
  attempt_number: number;
  session_titles: string | null;
  retry_strategy: string | null;
  retry_hint: string | null;
  failure_fingerprint: string | null;
  archived_at: string;
}

export interface JobRetryAttempt {
  id: number;
  jobId: string;
  attemptNumber: number;
  sessionTitles: string[] | null;
  retryStrategy: string | null;
  retryHint: string | null;
  failureFingerprint: string[] | null;
  archivedAt: string;
}

function parseStringArray(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // Ignore parse errors and treat as missing data.
  }
  return null;
}

function rowToJobStep(row: JobStepRow): JobStep {
  return {
    id: row.id,
    jobId: row.job_id,
    stepIndex: row.step_index,
    command: row.command,
    args: row.args,
    source: (row.source ?? 'delegation') as JobStep['source'],
    status: row.status as JobStep['status'],
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    reason: row.reason ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error ?? null,
    durationMs: row.duration_ms,
    verdictSource: row.verdict_source,
    verdictReason: row.verdict_reason,
  };
}

function rowToJobRetryAttempt(row: JobRetryAttemptRow): JobRetryAttempt {
  return {
    id: row.id,
    jobId: row.job_id,
    attemptNumber: row.attempt_number,
    sessionTitles: parseStringArray(row.session_titles),
    retryStrategy: row.retry_strategy,
    retryHint: row.retry_hint,
    failureFingerprint: parseFailureFingerprint(row.failure_fingerprint),
    archivedAt: row.archived_at,
  };
}

/**
 * Record a new step as 'running'. Returns the auto-increment row ID.
 */
function recordStep(
  jobId: string,
  stepIndex: number,
  command: string,
  args: string,
  sessionTitle?: string,
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO job_steps (job_id, step_index, command, args, session_title)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobId, stepIndex, command, args, sessionTitle ?? null);
  return Number(result.lastInsertRowid);
}

/**
 * Complete a step: update status, set completed_at, compute duration_ms,
 * and optionally set verdict and session ID.
 */
function completeStep(
  id: number,
  status: 'completed' | 'failed' | 'skipped',
  verdictSource?: string | null,
  verdictReason?: string | null,
  sessionId?: string | null,
): void {
  const db = getDb();
  // Compute duration from started_at
  db.prepare(`
    UPDATE job_steps
    SET status = ?,
        completed_at = datetime('now'),
        duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
        verdict_source = ?,
        verdict_reason = ?,
        session_id = ?
    WHERE id = ?
  `).run(status, verdictSource ?? null, verdictReason ?? null, sessionId ?? null, id);
}

/**
 * Get all steps for a job, ordered by step_index ASC.
 */
function getJobSteps(jobId: string): JobStep[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM job_steps WHERE job_id = ? ORDER BY step_index ASC',
  ).all(jobId) as JobStepRow[];
  return rows.map(rowToJobStep);
}

/**
 * Insert rows with status='skipped' for remaining unexecuted steps.
 * Used when the runner is interrupted mid-job.
 */
function skipRemainingSteps(
  jobId: string,
  fromIndex: number,
  reason: string,
): void {
  const db = getDb();
  // Get the delegation plan to know how many total steps exist
  const job = getJob(jobId);
  if (!job?.delegationPlan) return;

  let totalSteps: number;
  try {
    const plan = JSON.parse(job.delegationPlan) as { steps: unknown[] };
    totalSteps = plan.steps.length;
  } catch {
    return;
  }

  for (let i = fromIndex; i < totalSteps; i++) {
    db.prepare(`
      INSERT INTO job_steps (job_id, step_index, command, args, status, verdict_reason, completed_at)
      VALUES (?, ?, '', '', 'skipped', ?, datetime('now'))
    `).run(jobId, i, reason);
  }
}

// ── Step CRUD (Append-Forward Model, Phase 73) ────────────────────────────

/**
 * Create a new step with status='pending'. No started_at.
 * Returns the auto-increment row ID.
 */
function createPendingStep(
  jobId: string,
  stepIndex: number,
  command: string,
  args: string,
  source: StepSource,
  reason?: string,
): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO job_steps (job_id, step_index, command, args, source, status, reason, started_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)
  `).run(jobId, stepIndex, command, args, source, reason ?? null);
  return Number(result.lastInsertRowid);
}

/**
 * Get the next pending step for a job (lowest step_index with status='pending').
 * Returns null if no pending steps remain.
 */
function getNextPendingStep(jobId: string): JobStep | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM job_steps WHERE job_id = ? AND status = 'pending' ORDER BY step_index ASC LIMIT 1",
  ).get(jobId) as JobStepRow | undefined;
  return row ? rowToJobStep(row) : null;
}

/**
 * Mark a pending step as running. Sets started_at to now.
 */
function markStepRunning(stepId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE job_steps
    SET status = 'running', started_at = datetime('now')
    WHERE id = ?
  `).run(stepId);
}

/**
 * Mark a running step as completed. Sets completed_at, computes duration_ms.
 * Optionally records session ID and session title.
 */
function markStepCompleted(
  stepId: number,
  sessionId?: string | null,
  sessionTitle?: string | null,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE job_steps
    SET status = 'completed',
        completed_at = datetime('now'),
        duration_ms = CASE
          WHEN started_at IS NOT NULL THEN CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
          ELSE NULL
        END,
        session_id = COALESCE(?, session_id),
        session_title = COALESCE(?, session_title)
    WHERE id = ?
  `).run(sessionId ?? null, sessionTitle ?? null, stepId);
}

/**
 * Mark a running step as failed. Records error, sets completed_at, computes duration_ms.
 * Optionally records session ID and session title.
 */
function markStepFailed(
  stepId: number,
  error: string,
  sessionId?: string | null,
  sessionTitle?: string | null,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE job_steps
    SET status = 'failed',
        error = ?,
        completed_at = datetime('now'),
        duration_ms = CASE
          WHEN started_at IS NOT NULL THEN CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
          ELSE NULL
        END,
        session_id = COALESCE(?, session_id),
        session_title = COALESCE(?, session_title)
    WHERE id = ?
  `).run(error, sessionId ?? null, sessionTitle ?? null, stepId);
}

/**
 * Get the total number of steps for a job (all statuses).
 */
function getTotalStepCount(jobId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM job_steps WHERE job_id = ?',
  ).get(jobId) as { cnt: number };
  return row.cnt;
}

/**
 * Get the number of pending steps for a job.
 */
function getPendingStepCount(jobId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM job_steps WHERE job_id = ? AND status = 'pending'",
  ).get(jobId) as { cnt: number };
  return row.cnt;
}

/**
 * Bulk-insert pending steps for a job. Auto-computes step_index from MAX(step_index)+1.
 * All steps share the same source and optional reason.
 */
function appendSteps(
  jobId: string,
  steps: Array<{ command: string; args: string }>,
  source: StepSource,
  reason?: string,
): void {
  if (steps.length === 0) return;

  const db = getDb();
  const maxRow = db.prepare(
    'SELECT MAX(step_index) as max_idx FROM job_steps WHERE job_id = ?',
  ).get(jobId) as { max_idx: number | null };
  let nextIndex = (maxRow.max_idx ?? -1) + 1;

  const insert = db.prepare(`
    INSERT INTO job_steps (job_id, step_index, command, args, source, status, reason, started_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)
  `);

  const bulkInsert = db.transaction(() => {
    for (const step of steps) {
      insert.run(jobId, nextIndex, step.command, step.args, source, reason ?? null);
      nextIndex++;
    }
  });

  bulkInsert();
}

// ── Retry Attempt Archive (read-only — used by log --chain) ───────────────

function getRetryAttempts(jobId: string): JobRetryAttempt[] {
  const rows = getDb().prepare(`
    SELECT *
    FROM job_retry_attempts
    WHERE job_id = ?
    ORDER BY attempt_number ASC, id ASC
  `).all(jobId) as JobRetryAttemptRow[];

  return rows.map(rowToJobRetryAttempt);
}



// ── Hung Session Retry Helpers (Phase 67) ─────────────────────────────────

/**
 * Increment the hung_count for a job and record the last_hung_reason.
 * Called when spawnAndWait throws HungSessionError.
 */
function incrementHungCount(jobId: string, hungReason: string): void {
  getDb().prepare(`
    UPDATE jobs SET hung_count = hung_count + 1, last_hung_reason = ?
    WHERE id = ?
  `).run(hungReason, jobId);
}



/**
 * Store judge verdict JSON string on a job.
 */
function updateJudgeVerdict(id: string, verdict: string): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET judge_verdict = ? WHERE id = ?').run(verdict, id);
}

/**
 * Store the actual provider/model strings used by opencode for a job.
 * Models are collected from all session titles recorded for this job.
 * Stored as a JSON array in the actual_models column.
 */
function updateActualModels(id: string, models: string[]): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET actual_models = ? WHERE id = ?').run(JSON.stringify(models), id);
}

/**
 * Update the categories for a job.
 * Categories are stored as a JSON array string, or null for no categories.
 */
function updateJobCategories(id: string, categories: string[] | null): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET categories = ? WHERE id = ?')
    .run(categories ? JSON.stringify(categories) : null, id);
}

/**
 * Find an existing duplicate job for the given project + description/requirementPath.
 *
 * Checks in order:
 *   1. Pending or running jobs with same project AND (same description OR same requirement_path)
 *   2. Recently completed jobs (same criteria, completed within last 10 minutes)
 *
 * The requirement_path check uses `IS NOT NULL AND` to avoid matching when both
 * the existing job and new job have null requirement_path — null means "no file",
 * not a matchable value.
 *
 * Returns the first match found (prefers pending/running over recently completed),
 * or null if no duplicate exists.
 * Used by `pilot add` to prevent queuing the same work twice.
 */
function findDuplicateJob(
  project: string,
  description: string,
  requirementPath?: string,
): Job | null {
  const db = getDb();
  const reqPath = requirementPath ?? null;

  // 1. Check pending/running first (highest priority)
  const activeRow = db.prepare(`
    SELECT * FROM jobs
    WHERE project = ?
      AND status IN ('pending', 'running')
      AND (description = ? OR (requirement_path IS NOT NULL AND requirement_path = ?))
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project, description, reqPath) as JobRow | undefined;

  if (activeRow) return rowToJob(activeRow);

  // 2. Also check recently completed jobs (last 10 minutes) to prevent rapid re-queues
  const recentRow = db.prepare(`
    SELECT * FROM jobs
    WHERE project = ?
      AND status = 'completed'
      AND completed_at > datetime('now', '-10 minutes')
      AND (description = ? OR (requirement_path IS NOT NULL AND requirement_path = ?))
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(project, description, reqPath) as JobRow | undefined;

  if (recentRow) return rowToJob(recentRow);

  return null;
}

// ── Project CRUD ──────────────────────────────────────────────────────────

/**
 * Register a project (INSERT OR IGNORE) and update its owner.
 * If the project already exists, updates the owner.
 * Returns the current project row.
 */
function registerProject(path: string, owner: string): Project {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO projects (path, owner)
    VALUES (?, ?)
  `).run(path, owner);
  db.prepare(`
    UPDATE projects SET owner = ? WHERE path = ?
  `).run(owner, path);
  return getProject(path)!;
}

/**
 * Get a project by path. Returns null if not registered.
 */
function getProject(path: string): Project | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

/**
 * Get all projects, ordered by path ASC.
 */
function getAllProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY path ASC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

/**
 * Update the owner of a project.
 */
function updateProjectOwner(path: string, owner: string): void {
  const db = getDb();
  db.prepare('UPDATE projects SET owner = ? WHERE path = ?').run(owner, path);
}

function updateProjectNotifyOpenClawRoute(path: string, route: OpenClawDeliverRoute | null): void {
  const db = getDb();
  db.prepare('UPDATE projects SET notify_openclaw_route = ? WHERE path = ?').run(
    route ? JSON.stringify(route) : null,
    path,
  );
}

/**
 * Update the default skill categories for a project.
 * Pass null to clear project defaults.
 */
function updateProjectDefaultCategories(path: string, categories: string[] | null): void {
  const db = getDb();
  db.prepare('UPDATE projects SET default_categories = ? WHERE path = ?').run(
    categories ? JSON.stringify(categories) : null,
    path,
  );
}

/**
 * Block a project: set status='blocked', record reason and timestamp.
 */
function blockProject(path: string, reason: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE projects
    SET status = 'blocked', blocked_reason = ?, blocked_at = datetime('now')
    WHERE path = ?
  `).run(reason, path);
}

/**
 * Unblock a project: set status='active', clear blocked_reason and blocked_at.
 */
function unblockProject(path: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE projects
    SET status = 'active', blocked_reason = NULL, blocked_at = NULL
    WHERE path = ?
  `).run(path);
}

/**
 * Remove a project from management (DELETE from projects table).
 * Does NOT delete associated jobs — they remain for historical reference.
 */
function deregisterProject(path: string): void {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE path = ?').run(path);
}

// ── Project Job Counts ────────────────────────────────────────────────────

interface ProjectJobCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/**
 * Get job counts by status for a project path.
 * Returns zeroed counts if the project has no jobs.
 */
function getProjectJobCounts(project: string): ProjectJobCounts {
  const db = getDb();
  const rows = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM jobs WHERE project = ?
    GROUP BY status
  `).all(project) as { status: string; count: number }[];

  const counts: ProjectJobCounts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const r of rows) {
    if (r.status in counts) {
      counts[r.status as keyof ProjectJobCounts] = r.count;
    }
  }
  return counts;
}

// ── Milestone Query Helpers ───────────────────────────────────────────────

/**
 * Get all child jobs of a milestone job, ordered by created_at ASC.
 * Used by milestone status/resume/skip to inspect child phase jobs.
 */
function getChildJobs(parentJobId: string): Job[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM jobs WHERE parent_job_id = ? ORDER BY created_at ASC',
  ).all(parentJobId) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Set a milestone job's status to 'paused'. Sets completed_at.
 * Used when a child phase job fails — milestone pauses until operator intervenes.
 */
function pauseJob(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs SET status = 'paused', completed_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

/**
 * Get counts of child job statuses for a milestone job.
 * Returns { total, completed, failed, pending, running, paused }.
 * Used by milestone status display and the completion check.
 */
function getMilestoneStatus(milestoneJobId: string): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  paused: number;
} {
  const children = getChildJobs(milestoneJobId);
  const counts = { total: children.length, completed: 0, failed: 0, pending: 0, running: 0, paused: 0 };
  for (const job of children) {
    if (job.status === 'completed') counts.completed++;
    else if (job.status === 'failed') counts.failed++;
    else if (job.status === 'pending') counts.pending++;
    else if (job.status === 'running') counts.running++;
    else if (job.status === 'paused') counts.paused++;
  }
  return counts;
}

/**
 * Unpause a milestone job: set status back to 'completed' and clear error.
 * Used by milestone resume/skip to unblock a paused milestone after the
 * failed child is retried or skipped.
 */
function unpauseMilestone(id: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'completed', error = NULL WHERE id = ? AND status = 'paused'",
  ).run(id);
}

/**
 * Clear depends_on for a job (set to NULL).
 * Used by milestone skip: when the failed dependency is cancelled,
 * the next child job's depends_on is cleared so it can be claimed.
 */
function clearDependsOn(id: string): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET depends_on = NULL WHERE id = ?').run(id);
}

// ── Garbage Collection ────────────────────────────────────────────────────

interface GcResult {
  completedDeleted: number;
  failedDeleted: number;
}

/**
 * Delete completed and failed jobs older than the given number of days.
 * Returns counts of deleted rows.
 */
function deleteOldJobs(days: number): GcResult {
  const db = getDb();
  const completedResult = db.prepare(
    `DELETE FROM jobs WHERE status = 'completed' AND completed_at < datetime('now', '-' || ? || ' days')`,
  ).run(days);
  const failedResult = db.prepare(
    `DELETE FROM jobs WHERE status = 'failed' AND completed_at < datetime('now', '-' || ? || ' days')`,
  ).run(days);

  return {
    completedDeleted: completedResult.changes,
    failedDeleted: failedResult.changes,
  };
}

/**
 * Count completed and failed jobs older than the given number of days.
 * Used for --dry-run mode.
 */
function countOldJobs(days: number): GcResult {
  const db = getDb();
  const completed = db.prepare(
    `SELECT COUNT(*) as cnt FROM jobs WHERE status = 'completed' AND completed_at < datetime('now', '-' || ? || ' days')`,
  ).get(days) as { cnt: number };
  const failed = db.prepare(
    `SELECT COUNT(*) as cnt FROM jobs WHERE status = 'failed' AND completed_at < datetime('now', '-' || ? || ' days')`,
  ).get(days) as { cnt: number };

  return {
    completedDeleted: completed.cnt,
    failedDeleted: failed.cnt,
  };
}

/**
 * Vacuum the database to reclaim disk space.
 */
function vacuumDb(): void {
  const db = getDb();
  db.exec('VACUUM');
}

// ── Exports ───────────────────────────────────────────────────────────────

export type { ProjectJobCounts, GcResult };

export {
  _getTestDb,
  getDb,
  seedModelTables,
  registerProject,
  getProject,
  getAllProjects,
  updateProjectOwner,
  updateProjectNotifyOpenClawRoute,
  updateProjectDefaultCategories,
  blockProject,
  unblockProject,
  deregisterProject,
  getProjectJobCounts,
  addJob,
  getJob,
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  cancel,
  requeueFailedJob,
  getQueue,
  getRunningJobsForProject,
  getAllRunningJobs,
  reconcileStaleJobs,
  markStale,
  getRecent,
  updateDelegationPayload,
  advanceStep,
  bump,
  updateSessionTitles,
  updateJobRecoveryStart,
  updateJobRecoveryHead,
  claimNextLaunchable,
  forceQuitJob,
  recordStep,
  completeStep,
  getJobSteps,
  skipRemainingSteps,

  updateJudgeVerdict,
  updateActualModels,
  updateJobCategories,
  findDuplicateJob,
  getChildJobs,
  pauseJob,
  getMilestoneStatus,
  unpauseMilestone,
  clearDependsOn,
  deleteOldJobs,
  countOldJobs,
  vacuumDb,
  // Phase 67: hung session helpers
  incrementHungCount,
  getRetryAttempts,
  // Phase 73: step CRUD for append-forward model
  createPendingStep,
  getNextPendingStep,
  markStepRunning,
  markStepCompleted,
  markStepFailed,
  getTotalStepCount,
  getPendingStepCount,
  appendSteps,
  // Phase 81: review state transitions
  markCompletedPendingReview,
  markReviewHold,
  approveReview,
  resumeFromReviewHold,
  // Phase 83: resumed review_hold pickup
  getResumedReviewHoldJobs,
  clearResumedFlag,
};
