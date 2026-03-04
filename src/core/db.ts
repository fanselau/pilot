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
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from './config.js';
import type { Job, JobStep, JobScope, ModelProfile, ProviderMode, DelegationPlan } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 4;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone')),
  description TEXT NOT NULL,
  requirement_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
  priority INTEGER DEFAULT 0,
  depends_on TEXT REFERENCES jobs(id),
  parent_job_id TEXT REFERENCES jobs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  delegation_plan TEXT,
  current_step INTEGER DEFAULT 0,
  session_titles TEXT,
  model_profile TEXT NOT NULL DEFAULT 'balanced',
  provider_mode TEXT NOT NULL DEFAULT 'claude-only'
);
`;

const CREATE_JOB_STEPS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS job_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  step_index INTEGER NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '',
  session_title TEXT,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'skipped')),
  verdict_source TEXT,
  verdict_reason TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER
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
  max_attempts: number;
  delegation_plan: string | null;
  current_step: number;
  session_titles: string | null;
  model_profile: string;
  provider_mode: string;
  judge_verdict: string | null;
  actual_models: string | null;
}

function rowToJob(row: JobRow): Job {
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
    maxAttempts: row.max_attempts,
    delegationPlan: row.delegation_plan,
    currentStep: row.current_step,
    sessionTitles: row.session_titles,
    modelProfile: (row.model_profile ?? 'balanced') as Job['modelProfile'],
    providerMode: (row.provider_mode ?? 'claude-only') as Job['providerMode'],
    judgeVerdict: row.judge_verdict ?? null,
    actualModels: (() => {
      if (!row.actual_models) return null;
      try { return JSON.parse(row.actual_models) as string[]; } catch { return null; }
    })(),
  };
}

// ── DB Access ─────────────────────────────────────────────────────────────

/**
 * Open (or return cached) pilot.db.
 * Auto-creates ~/.pilot/ directory and the jobs table on first access.
 */
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
  ];
  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — ignore
    }
  }
}

function openPilotDb(): DatabaseType {
  if (cachedDb) return cachedDb;

  const config = getConfig();
  mkdirSync(dirname(config.pilotDbPath), { recursive: true });
  cachedDb = new Database(config.pilotDbPath) as DatabaseType;
  cachedDb!.pragma('journal_mode = WAL');
  cachedDb!.exec(CREATE_TABLE_SQL);
  cachedDb!.exec(CREATE_JOB_STEPS_TABLE_SQL);
  migrateSchema(cachedDb!);
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
  migrateSchema(cachedDb!);
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
  providerMode?: ProviderMode,
  dependsOn?: string,
  parentJobId?: string,
): Job {
  const db = getDb();
  const id = generateUniqueId(db);
  const profile = modelProfile ?? 'balanced';
  const provider = providerMode ?? 'claude-only';

  db.prepare(`
    INSERT INTO jobs (id, project, scope, description, requirement_path, model_profile, provider_mode, depends_on, parent_job_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project, scope, description, requirementPath ?? null, profile, provider, dependsOn ?? null, parentJobId ?? null);

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
 * Mark a job as failed. Sets completed_at and error message.
 */
function markFailed(id: string, error: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'failed', completed_at = datetime('now'), error = ?
    WHERE id = ?
  `).run(error, id);
}

/**
 * Cancel a job. Sets status to cancelled.
 */
function cancel(id: string): void {
  const db = getDb();
  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(id);
}

/**
 * Retry a failed job. Resets to pending, clears started_at/completed_at/error.
 */
function retry(id: string): void {
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
 * Get all pending + running jobs, ordered by priority DESC, created_at ASC.
 */
function getQueue(): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('pending', 'running') ORDER BY priority DESC, created_at ASC",
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
function claimNextLaunchable(): Job | null {
  const db = getDb();

  const claim = db.transaction((): Job | null => {
    // Select next pending job where no running job exists for the same project
    const row = db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND project NOT IN (
          SELECT DISTINCT project FROM jobs WHERE status = 'running'
        )
        AND (depends_on IS NULL OR depends_on IN (SELECT id FROM jobs WHERE status = 'completed'))
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get() as JobRow | undefined;

    if (!row) return null;

    // Atomically mark as running within the same transaction
    db.prepare(`
      UPDATE jobs
      SET status = 'running',
          started_at = datetime('now'),
          attempts = attempts + 1
      WHERE id = ?
    `).run(row.id);

    // Return the updated row (re-fetch to get new values)
    const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.id) as JobRow;
    return rowToJob(updated);
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
 * Get last N completed/failed/cancelled jobs, ordered by completed_at DESC.
 * For cancelled jobs without completed_at, falls back to created_at.
 */
function getRecent(limit: number = 20): Job[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs WHERE status IN ('completed', 'failed', 'cancelled') ORDER BY COALESCE(completed_at, created_at) DESC LIMIT ?",
  ).all(limit) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Store a delegation plan as JSON string.
 */
function updateDelegationPlan(id: string, plan: DelegationPlan): void {
  const db = getDb();
  db.prepare('UPDATE jobs SET delegation_plan = ? WHERE id = ?').run(
    JSON.stringify(plan),
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
  session_title: string | null;
  session_id: string | null;
  status: string;
  verdict_source: string | null;
  verdict_reason: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

function rowToJobStep(row: JobStepRow): JobStep {
  return {
    id: row.id,
    jobId: row.job_id,
    stepIndex: row.step_index,
    command: row.command,
    args: row.args,
    sessionTitle: row.session_title,
    sessionId: row.session_id,
    status: row.status as JobStep['status'],
    verdictSource: row.verdict_source,
    verdictReason: row.verdict_reason,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
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

// ── Reset to Pending ──────────────────────────────────────────────────

/**
 * Reset a job back to pending status for retry.
 * Used by the judge-based evaluation when a retryable failure is detected.
 * Clears started_at for fresh timing on next attempt.
 * Clears session_titles to prevent stale titles matching in reconciler pgrep.
 * Stores resumeHint in the dedicated resume_hint column (NOT in error field).
 * Deletes all job_steps for the job to prevent stale steps appearing in TUI.
 */
function resetToPending(id: string, resumeHint?: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        started_at = NULL,
        error = NULL,
        current_step = 0,
        session_titles = NULL,
        resume_hint = ?
    WHERE id = ?
  `).run(resumeHint ?? null, id);
  // Clean up step records from previous attempt
  db.prepare('DELETE FROM job_steps WHERE job_id = ?').run(id);
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

// ── Exports ───────────────────────────────────────────────────────────────

export {
  openPilotDb,
  _getTestDb,
  addJob,
  getJob,
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  cancel,
  retry,
  getQueue,
  getRunningJobsForProject,
  getRunningJobsByProject,
  getAllRunningJobs,
  reconcileStaleJobs,
  markStale,
  getRecent,
  updateDelegationPlan,
  advanceStep,
  bump,
  updateSessionTitles,
  claimNextLaunchable,
  forceQuitJob,
  recordStep,
  completeStep,
  getJobSteps,
  skipRemainingSteps,
  resetToPending,
  updateJudgeVerdict,
  updateActualModels,
  findDuplicateJob,
  getChildJobs,
  pauseJob,
  getMilestoneStatus,
  unpauseMilestone,
  clearDependsOn,
};
