/**
 * SQLite queue database (pilot.db) — persistence layer for the v2 queue system.
 *
 * Wraps better-sqlite3 for pilot.db at ~/.pilot/pilot.db.
 * All functions are synchronous (better-sqlite3 is sync).
 * Auto-creates DB + table on first access.
 *
 * Pure core module — no UI dependencies.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from './config.js';
import type { Job, JobScope, DelegationPlan } from './types.js';

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
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER DEFAULT 0,
  depends_on TEXT REFERENCES jobs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  delegation_plan TEXT,
  current_step INTEGER DEFAULT 0,
  session_titles TEXT
);
`;

// ── Module-level cached DB connection ─────────────────────────────────────

let cachedDb: Database.Database | null = null;

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
function generateUniqueId(db: Database.Database): string {
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
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  delegation_plan: string | null;
  current_step: number;
  session_titles: string | null;
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
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    delegationPlan: row.delegation_plan,
    currentStep: row.current_step,
    sessionTitles: row.session_titles,
  };
}

// ── DB Access ─────────────────────────────────────────────────────────────

/**
 * Open (or return cached) pilot.db.
 * Auto-creates ~/.pilot/ directory and the jobs table on first access.
 */
function openPilotDb(): Database.Database {
  if (cachedDb) return cachedDb;

  const config = getConfig();
  mkdirSync(dirname(config.pilotDbPath), { recursive: true });
  cachedDb = new Database(config.pilotDbPath);
  cachedDb.pragma('journal_mode = WAL');
  cachedDb.exec(CREATE_TABLE_SQL);
  return cachedDb;
}

/**
 * Return an in-memory DB for testing.
 * Resets the cached connection each call — each test gets a fresh DB.
 * @internal — only for use in tests
 */
function _getTestDb(): Database.Database {
  if (cachedDb) {
    try { cachedDb.close(); } catch { /* ignore */ }
  }
  cachedDb = new Database(':memory:');
  cachedDb.pragma('journal_mode = WAL');
  cachedDb.exec(CREATE_TABLE_SQL);
  return cachedDb;
}

/**
 * Get the currently active DB connection.
 * Uses cached connection from openPilotDb() or _getTestDb().
 */
function getDb(): Database.Database {
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
): Job {
  const db = getDb();
  const id = generateUniqueId(db);

  db.prepare(`
    INSERT INTO jobs (id, project, scope, description, requirement_path)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, project, scope, description, requirementPath ?? null);

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
    SET status = 'pending', started_at = NULL, completed_at = NULL, error = NULL
    WHERE id = ?
  `).run(id);
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

  const merged = [...existing, ...titles];
  db.prepare('UPDATE jobs SET session_titles = ? WHERE id = ?').run(
    JSON.stringify(merged),
    id,
  );
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
  getRecent,
  updateDelegationPlan,
  advanceStep,
  bump,
  updateSessionTitles,
};
