import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  listSessionsFromDb,
  findSessionFromDb,
  exportSessionFromDb,
  getSessionMessageCountFromDb,
  findSessionByTitle,
  isStuck,
  _resetDbCache,
  _setTestDb,
} from '../../src/core/opencode-db.js';
import type { IsStuckResult } from '../../src/core/opencode-db.js';

// ── Test DB Setup ──────────────────────────────────────────────────────────

/**
 * Create an in-memory SQLite DB with the opencode schema.
 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      slug TEXT NOT NULL DEFAULT '',
      directory TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
    );
    CREATE INDEX session_parent_idx ON session (parent_id);

    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
    );
    CREATE INDEX message_session_idx ON message (session_id);

    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE
    );
    CREATE INDEX part_session_idx ON part (session_id);
  `);

  // Insert a default project
  db.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run('proj-1', 'test-project');

  return db;
}

/**
 * Insert a session into the test DB.
 */
function insertSession(
  db: Database.Database,
  id: string,
  title: string,
  opts?: {
    parentId?: string | null;
    timeCreated?: number;
    timeUpdated?: number;
  },
): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    'proj-1',
    opts?.parentId ?? null,
    '',
    '/test',
    title,
    '1.0',
    opts?.timeCreated ?? now,
    opts?.timeUpdated ?? now,
  );
}

/**
 * Insert a message into the test DB.
 */
function insertMessage(
  db: Database.Database,
  id: string,
  sessionId: string,
  data: Record<string, unknown>,
  opts?: { timeCreated?: number; timeUpdated?: number },
): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
  ).run(
    id,
    sessionId,
    opts?.timeCreated ?? now,
    opts?.timeUpdated ?? now,
    JSON.stringify(data),
  );
}

/**
 * Insert a part into the test DB.
 */
function insertPart(
  db: Database.Database,
  id: string,
  messageId: string,
  sessionId: string,
  tool: string,
  status: string,
  opts?: { timeCreated?: number; timeUpdated?: number },
): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    messageId,
    sessionId,
    opts?.timeCreated ?? now,
    opts?.timeUpdated ?? now,
    JSON.stringify({
      type: 'tool',
      tool,
      state: { status },
    }),
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  _setTestDb(db);
});

afterEach(() => {
  _resetDbCache();
});

// ── listSessionsFromDb ─────────────────────────────────────────────────────

describe('listSessionsFromDb', () => {
  it('returns empty array when no sessions', () => {
    const sessions = listSessionsFromDb();
    expect(sessions).toEqual([]);
  });

  it('returns sessions ordered by time_updated DESC', () => {
    insertSession(db, 'ses-1', 'first', { timeCreated: 1000, timeUpdated: 2000 });
    insertSession(db, 'ses-2', 'second', { timeCreated: 1500, timeUpdated: 3000 });
    insertSession(db, 'ses-3', 'third', { timeCreated: 2000, timeUpdated: 1000 });

    const sessions = listSessionsFromDb();
    expect(sessions).toHaveLength(3);
    expect(sessions[0]!.id).toBe('ses-2'); // most recently updated
    expect(sessions[1]!.id).toBe('ses-1');
    expect(sessions[2]!.id).toBe('ses-3');
  });

  it('returns correct SessionInfo shape', () => {
    insertSession(db, 'ses-1', 'test-session', {
      timeCreated: 1708432800000,
      timeUpdated: 1708436400000,
    });

    const sessions = listSessionsFromDb();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      id: 'ses-1',
      title: 'test-session',
      created: 1708432800000,
      updated: 1708436400000,
    });
  });
});

// ── findSessionFromDb ──────────────────────────────────────────────────────

describe('findSessionFromDb', () => {
  beforeEach(() => {
    insertSession(db, 'ses-1', 'resume-roast-execute-phase-3', {
      timeCreated: 1000, timeUpdated: 5000,
    });
    insertSession(db, 'ses-2', 'pet-portraits-plan-phase-2', {
      timeCreated: 2000, timeUpdated: 4000,
    });
    insertSession(db, 'ses-3', 'resume-roast-plan-phase-3', {
      timeCreated: 3000, timeUpdated: 3000,
    });
  });

  it('returns exact title match', () => {
    const result = findSessionFromDb('resume-roast-execute-phase-3');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ses-1');
  });

  it('returns LIKE match when no exact match', () => {
    const result = findSessionFromDb('resume-roast');
    expect(result).not.toBeNull();
    // ses-1 has the highest time_updated (5000) among matches
    expect(result!.id).toBe('ses-1');
  });

  it('returns null when no match', () => {
    const result = findSessionFromDb('nonexistent');
    expect(result).toBeNull();
  });

  it('prefers exact match over LIKE match', () => {
    const result = findSessionFromDb('pet-portraits-plan-phase-2');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('ses-2');
  });
});

// ── exportSessionFromDb ────────────────────────────────────────────────────

describe('exportSessionFromDb', () => {
  it('returns messages in correct format', () => {
    insertSession(db, 'ses-1', 'test-session');
    insertMessage(db, 'msg-1', 'ses-1', { role: 'user', content: 'Hello' }, { timeCreated: 1000 });
    insertMessage(db, 'msg-2', 'ses-1', { role: 'assistant', content: 'Hi there' }, { timeCreated: 2000 });

    const result = exportSessionFromDb('ses-1') as { messages: Array<Record<string, unknown>> };
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.role).toBe('user');
    expect(result.messages[0]!.content).toBe('Hello');
    expect(result.messages[1]!.role).toBe('assistant');
  });

  it('returns empty messages array for session with no messages', () => {
    insertSession(db, 'ses-1', 'test-session');

    const result = exportSessionFromDb('ses-1') as { messages: unknown[] };
    expect(result.messages).toEqual([]);
  });

  it('throws when DB is not available', () => {
    _resetDbCache();
    _setTestDb(null as unknown as Database.Database);
    // Force null DB
    expect(() => exportSessionFromDb('ses-1')).toThrow('DB not available');
  });
});

// ── getSessionMessageCountFromDb ───────────────────────────────────────────

describe('getSessionMessageCountFromDb', () => {
  it('returns correct message count', () => {
    insertSession(db, 'ses-1', 'test-session');
    insertMessage(db, 'msg-1', 'ses-1', { role: 'user' });
    insertMessage(db, 'msg-2', 'ses-1', { role: 'assistant' });
    insertMessage(db, 'msg-3', 'ses-1', { role: 'user' });

    expect(getSessionMessageCountFromDb('ses-1')).toBe(3);
  });

  it('returns 0 for session with no messages', () => {
    insertSession(db, 'ses-1', 'test-session');
    expect(getSessionMessageCountFromDb('ses-1')).toBe(0);
  });

  it('returns 0 for nonexistent session', () => {
    expect(getSessionMessageCountFromDb('nonexistent')).toBe(0);
  });
});

// ── findSessionByTitle ─────────────────────────────────────────────────────

describe('findSessionByTitle', () => {
  it('returns session ID for exact title match', () => {
    insertSession(db, 'ses-1', 'my-session', { timeCreated: 1000 });

    expect(findSessionByTitle('my-session')).toBe('ses-1');
  });

  it('returns most recent session when multiple have same title', () => {
    insertSession(db, 'ses-1', 'my-session', { timeCreated: 1000 });
    insertSession(db, 'ses-2', 'my-session', { timeCreated: 2000 });

    expect(findSessionByTitle('my-session')).toBe('ses-2');
  });

  it('returns null when title not found', () => {
    expect(findSessionByTitle('nonexistent')).toBeNull();
  });
});

// ── isStuck ────────────────────────────────────────────────────────────────

describe('isStuck', () => {
  describe('question + running → stuck', () => {
    it('returns stuck with waiting_for_user_input reason', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'question', 'running');

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(true);
      expect(result.reason).toBe('waiting_for_user_input');
      expect(result.detail).toContain('waiting for user input');
    });
  });

  describe('task + running with stuck child → stuck', () => {
    it('returns stuck with child_stuck reason', () => {
      // Parent session with task running
      insertSession(db, 'ses-parent', 'parent-session');
      insertMessage(db, 'msg-p1', 'ses-parent', { role: 'assistant' });
      insertPart(db, 'prt-p1', 'msg-p1', 'ses-parent', 'task', 'running');

      // Child session stuck on question
      insertSession(db, 'ses-child', 'child-session', { parentId: 'ses-parent' });
      insertMessage(db, 'msg-c1', 'ses-child', { role: 'assistant' });
      insertPart(db, 'prt-c1', 'msg-c1', 'ses-child', 'question', 'running');

      const result = isStuck('ses-parent');
      expect(result.stuck).toBe(true);
      expect(result.reason).toBe('child_stuck');
      expect(result.detail).toContain('Child session stuck');
    });
  });

  describe('task + running with healthy child → not stuck', () => {
    it('returns not stuck', () => {
      // Parent session with task running
      insertSession(db, 'ses-parent', 'parent-session');
      insertMessage(db, 'msg-p1', 'ses-parent', { role: 'assistant' });
      insertPart(db, 'prt-p1', 'msg-p1', 'ses-parent', 'task', 'running');

      // Child session actively working (bash completed recently)
      insertSession(db, 'ses-child', 'child-session', { parentId: 'ses-parent' });
      insertMessage(db, 'msg-c1', 'ses-child', { role: 'assistant' });
      insertPart(db, 'prt-c1', 'msg-c1', 'ses-child', 'bash', 'completed');

      const result = isStuck('ses-parent');
      expect(result.stuck).toBe(false);
      expect(result.reason).toBe('not_stuck');
    });
  });

  describe('bash + running under threshold → not stuck', () => {
    it('returns not stuck for recently started bash command', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });

      // Part updated just now (within threshold)
      const now = Date.now();
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'bash', 'running', {
        timeCreated: now - 60_000, // 1 min ago
        timeUpdated: now - 60_000,
      });

      const result = isStuck('ses-1', 30); // 30 min threshold
      expect(result.stuck).toBe(false);
      expect(result.reason).toBe('not_stuck');
    });
  });

  describe('bash + running over threshold → stuck', () => {
    it('returns stuck with long_running_command reason', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });

      // Part updated 35 minutes ago (over 30 min threshold)
      const now = Date.now();
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'bash', 'running', {
        timeCreated: now - 35 * 60_000,
        timeUpdated: now - 35 * 60_000,
      });

      const result = isStuck('ses-1', 30);
      expect(result.stuck).toBe(true);
      expect(result.reason).toBe('long_running_command');
      expect(result.detail).toContain('bash');
      expect(result.detail).toContain('35m');
    });
  });

  describe('completed status → not stuck', () => {
    it('returns not stuck for completed tool', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'bash', 'completed');

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(false);
      expect(result.reason).toBe('not_stuck');
    });

    it('returns not stuck for error status', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'bash', 'error');

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(false);
    });
  });

  describe('no parts → not stuck', () => {
    it('returns not stuck when session has no parts', () => {
      insertSession(db, 'ses-1', 'test-session');

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(false);
      expect(result.reason).toBe('not_stuck');
    });
  });

  describe('other tool + running → threshold check', () => {
    it('returns stuck for read tool running over threshold', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });

      const now = Date.now();
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'read', 'running', {
        timeCreated: now - 35 * 60_000,
        timeUpdated: now - 35 * 60_000,
      });

      const result = isStuck('ses-1', 30);
      expect(result.stuck).toBe(true);
      expect(result.reason).toBe('long_running_command');
    });

    it('returns not stuck for read tool running under threshold', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });

      const now = Date.now();
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'read', 'running', {
        timeCreated: now - 5 * 60_000,
        timeUpdated: now - 5 * 60_000,
      });

      const result = isStuck('ses-1', 30);
      expect(result.stuck).toBe(false);
    });
  });

  describe('deep recursion protection', () => {
    it('returns not stuck at depth limit', () => {
      // Create a chain of 15 sessions each with task running
      for (let i = 0; i < 15; i++) {
        const parentId = i > 0 ? `ses-${i - 1}` : null;
        insertSession(db, `ses-${i}`, `session-${i}`, { parentId });
        insertMessage(db, `msg-${i}`, `ses-${i}`, { role: 'assistant' });
        insertPart(db, `prt-${i}`, `msg-${i}`, `ses-${i}`, 'task', 'running');
      }

      // Root session should not crash from deep recursion
      const result = isStuck('ses-0');
      expect(result.stuck).toBe(false);
    });
  });

  describe('graceful fallback with null DB', () => {
    it('returns not stuck when DB is unavailable', () => {
      _resetDbCache();
      // Don't set any test DB — openDb will return null

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(false);
      expect(result.reason).toBe('not_stuck');
    });
  });

  describe('uses latest part by time_created', () => {
    it('checks the most recent part not the first one', () => {
      insertSession(db, 'ses-1', 'test-session');
      insertMessage(db, 'msg-1', 'ses-1', { role: 'assistant' });

      // Old part: question running (stuck)
      insertPart(db, 'prt-1', 'msg-1', 'ses-1', 'question', 'running', {
        timeCreated: 1000,
        timeUpdated: 1000,
      });

      // New part: bash completed (not stuck)
      insertPart(db, 'prt-2', 'msg-1', 'ses-1', 'bash', 'completed', {
        timeCreated: 2000,
        timeUpdated: 2000,
      });

      const result = isStuck('ses-1');
      expect(result.stuck).toBe(false);
    });
  });
});
