/**
 * Tests for extended opencode-db.ts v2 queries.
 *
 * Uses an in-memory SQLite database with the same schema as opencode's real DB.
 * Tests cover: getSessionMessages, getLastMessage, isSessionActive,
 * getSessionTokens, getRecentSessions, and error/edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getSessionMessages,
  getLastMessage,
  isSessionActive,
  getSessionTokens,
  getRecentSessions,
  _resetDbCache,
  _setTestDb,
} from '../../src/core/opencode-db.js';

// ── Schema matching opencode's real DB ─────────────────────────────────────

const SCHEMA = `
  CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_id TEXT,
    slug TEXT NOT NULL,
    directory TEXT NOT NULL,
    title TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    share_url TEXT,
    summary_additions INTEGER,
    summary_deletions INTEGER,
    summary_files INTEGER,
    summary_diffs TEXT,
    revert TEXT,
    permission TEXT,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    time_compacting INTEGER,
    time_archived INTEGER,
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
  );

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
  CREATE INDEX part_message_idx ON part (message_id);
  CREATE INDEX part_session_idx ON part (session_id);
`;

// ── Helpers ────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  // Seed a project
  db.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run('proj1', 'test-project');
  return db;
}

function insertSession(
  db: Database.Database,
  id: string,
  title: string,
  timeCreated: number,
  timeUpdated: number,
): void {
  db.prepare(
    `INSERT INTO session (id, project_id, slug, directory, title, time_created, time_updated)
     VALUES (?, 'proj1', ?, '/tmp/test', ?, ?, ?)`,
  ).run(id, title.toLowerCase(), title, timeCreated, timeUpdated);
}

function insertMessage(
  db: Database.Database,
  id: string,
  sessionId: string,
  timeCreated: number,
  data: Record<string, unknown>,
): void {
  db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)',
  ).run(id, sessionId, timeCreated, timeCreated, JSON.stringify(data));
}

function insertPart(
  db: Database.Database,
  id: string,
  messageId: string,
  sessionId: string,
  timeCreated: number,
  data: Record<string, unknown>,
): void {
  db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, messageId, sessionId, timeCreated, timeCreated, JSON.stringify(data));
}

// ── Test setup ─────────────────────────────────────────────────────────────

let db: Database.Database;

beforeEach(() => {
  _resetDbCache();
  db = createTestDb();
  _setTestDb(db);
});

afterEach(() => {
  _resetDbCache();
});

// ── getSessionMessages ─────────────────────────────────────────────────────

describe('getSessionMessages', () => {
  it('returns messages in chronological order with content from part table', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
    insertPart(db, 'part-msg1', 'msg1', 'sess1', 1000, { type: 'text', text: 'Hello' });
    insertMessage(db, 'msg2', 'sess1', 2000, {
      role: 'assistant',
      tokens: { input: 10, output: 20 },
    });
    insertPart(db, 'part-msg2', 'msg2', 'sess1', 2000, { type: 'text', text: 'Hi there' });
    insertMessage(db, 'msg3', 'sess1', 3000, { role: 'user' });
    insertPart(db, 'part-msg3', 'msg3', 'sess1', 3000, { type: 'text', text: 'Thanks' });

    const messages = getSessionMessages('sess1');
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
    expect(messages[0].createdAt).toBe(1000);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Hi there');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('Thanks');
  });

  it('filters messages with since parameter', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 5000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
    insertPart(db, 'part-msg1', 'msg1', 'sess1', 1000, { type: 'text', text: 'First' });
    insertMessage(db, 'msg2', 'sess1', 3000, { role: 'assistant' });
    insertPart(db, 'part-msg2', 'msg2', 'sess1', 3000, { type: 'text', text: 'Second' });
    insertMessage(db, 'msg3', 'sess1', 5000, { role: 'user' });
    insertPart(db, 'part-msg3', 'msg3', 'sess1', 5000, { type: 'text', text: 'Third' });

    const messages = getSessionMessages('sess1', 2000);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Second');
    expect(messages[1].content).toBe('Third');
  });

  it('returns empty array for nonexistent session', () => {
    const messages = getSessionMessages('nonexistent');
    expect(messages).toEqual([]);
  });

  it('returns empty array for session with no messages', () => {
    insertSession(db, 'sess1', 'empty-session', 1000, 1000);
    const messages = getSessionMessages('sess1');
    expect(messages).toEqual([]);
  });

  it('handles messages with no parts gracefully (empty content)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' }); // no parts at all
    insertMessage(db, 'msg2', 'sess1', 2000, { role: 'assistant' }); // no parts at all

    const messages = getSessionMessages('sess1');
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('');
    expect(messages[1].content).toBe('');
  });

  it('concatenates multiple text parts with newlines', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 1000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'part1a', 'msg1', 'sess1', 1000, { type: 'text', text: 'First paragraph' });
    insertPart(db, 'part1b', 'msg1', 'sess1', 1001, { type: 'text', text: 'Second paragraph' });

    const messages = getSessionMessages('sess1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('First paragraph\nSecond paragraph');
  });

  it('ignores non-text parts (tool, step-start)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 1000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'part1a', 'msg1', 'sess1', 1000, { type: 'step-start', text: 'Planning...' });
    insertPart(db, 'part1b', 'msg1', 'sess1', 1001, { type: 'tool', tool: 'bash', state: { status: 'completed' } });

    const messages = getSessionMessages('sess1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('');
  });

  it('includes only text parts when mixed with non-text parts', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 1000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'part1a', 'msg1', 'sess1', 1000, { type: 'text', text: 'Hello world' });
    insertPart(db, 'part1b', 'msg1', 'sess1', 1001, { type: 'tool', tool: 'read', state: { status: 'completed' } });
    insertPart(db, 'part1c', 'msg1', 'sess1', 1002, { type: 'text', text: 'Goodbye world' });

    const messages = getSessionMessages('sess1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello world\nGoodbye world');
  });
});

// ── getLastMessage ─────────────────────────────────────────────────────────

describe('getLastMessage', () => {
  it('returns the most recent message with content from part table', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
    insertPart(db, 'part-msg1', 'msg1', 'sess1', 1000, { type: 'text', text: 'First' });
    insertMessage(db, 'msg2', 'sess1', 2000, { role: 'assistant' });
    insertPart(db, 'part-msg2', 'msg2', 'sess1', 2000, { type: 'text', text: 'Second' });
    insertMessage(db, 'msg3', 'sess1', 3000, { role: 'user' });
    insertPart(db, 'part-msg3', 'msg3', 'sess1', 3000, { type: 'text', text: 'Third' });

    const last = getLastMessage('sess1');
    expect(last).not.toBeNull();
    expect(last!.content).toBe('Third');
    expect(last!.role).toBe('user');
    expect(last!.createdAt).toBe(3000);
  });

  it('returns null for empty session', () => {
    insertSession(db, 'sess1', 'empty-session', 1000, 1000);
    const last = getLastMessage('sess1');
    expect(last).toBeNull();
  });

  it('returns null for nonexistent session', () => {
    const last = getLastMessage('nonexistent');
    expect(last).toBeNull();
  });
});

// ── isSessionActive ────────────────────────────────────────────────────────

describe('isSessionActive', () => {
  it('returns true when running parts exist', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'part1', 'msg1', 'sess1', 2000, {
      type: 'tool',
      tool: 'bash',
      state: { status: 'running' },
    });

    expect(isSessionActive('sess1')).toBe(true);
  });

  it('returns false when all parts completed', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'part1', 'msg1', 'sess1', 1500, {
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed' },
    });
    insertPart(db, 'part2', 'msg1', 'sess1', 2000, {
      type: 'tool',
      tool: 'read',
      state: { status: 'completed' },
    });

    expect(isSessionActive('sess1')).toBe(false);
  });

  it('returns false when session has no parts', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 1000);
    expect(isSessionActive('sess1')).toBe(false);
  });

  it('returns false for nonexistent session', () => {
    expect(isSessionActive('nonexistent')).toBe(false);
  });
});

// ── getSessionTokens ───────────────────────────────────────────────────────

describe('getSessionTokens', () => {
  it('aggregates tokens correctly across messages', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, {
      role: 'assistant',
      tokens: { input: 100, output: 50 },
    });
    insertMessage(db, 'msg2', 'sess1', 2000, {
      role: 'user',
    }); // user messages have no tokens
    insertMessage(db, 'msg3', 'sess1', 3000, {
      role: 'assistant',
      tokens: { input: 200, output: 75 },
    });

    const tokens = getSessionTokens('sess1');
    expect(tokens.input).toBe(300);
    expect(tokens.output).toBe(125);
  });

  it('returns zeros for session with no messages', () => {
    insertSession(db, 'sess1', 'empty-session', 1000, 1000);
    const tokens = getSessionTokens('sess1');
    expect(tokens.input).toBe(0);
    expect(tokens.output).toBe(0);
  });

  it('returns zeros for nonexistent session', () => {
    const tokens = getSessionTokens('nonexistent');
    expect(tokens.input).toBe(0);
    expect(tokens.output).toBe(0);
  });

  it('handles messages with missing or zero tokens', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, {
      role: 'assistant',
      tokens: { input: 0, output: 0 },
    });
    insertMessage(db, 'msg2', 'sess1', 2000, {
      role: 'assistant',
      // no tokens field at all
    });

    const tokens = getSessionTokens('sess1');
    expect(tokens.input).toBe(0);
    expect(tokens.output).toBe(0);
  });
});

// ── getRecentSessions ──────────────────────────────────────────────────────

describe('getRecentSessions', () => {
  it('returns sessions ordered by updated desc', () => {
    insertSession(db, 'sess1', 'oldest-session', 1000, 1000);
    insertSession(db, 'sess2', 'middle-session', 2000, 3000);
    insertSession(db, 'sess3', 'newest-session', 3000, 5000);

    const sessions = getRecentSessions(3);
    expect(sessions).toHaveLength(3);
    expect(sessions[0].title).toBe('newest-session');
    expect(sessions[1].title).toBe('middle-session');
    expect(sessions[2].title).toBe('oldest-session');
  });

  it('respects limit parameter', () => {
    insertSession(db, 'sess1', 'session-1', 1000, 1000);
    insertSession(db, 'sess2', 'session-2', 2000, 2000);
    insertSession(db, 'sess3', 'session-3', 3000, 3000);

    const sessions = getRecentSessions(2);
    expect(sessions).toHaveLength(2);
  });

  it('includes message count', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user', content: 'Hello' });
    insertMessage(db, 'msg2', 'sess1', 2000, { role: 'assistant', content: 'Hi' });
    insertMessage(db, 'msg3', 'sess1', 3000, { role: 'user', content: 'Bye' });

    const sessions = getRecentSessions(10);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].messageCount).toBe(3);
  });

  it('returns empty array when no sessions exist', () => {
    const sessions = getRecentSessions(10);
    expect(sessions).toEqual([]);
  });
});

// ── Safe defaults when DB unavailable ──────────────────────────────────────

describe('safe defaults when DB unavailable', () => {
  beforeEach(() => {
    _resetDbCache();
    _setTestDb(null);
  });

  it('getSessionMessages returns empty array', () => {
    expect(getSessionMessages('any')).toEqual([]);
  });

  it('getLastMessage returns null', () => {
    expect(getLastMessage('any')).toBeNull();
  });

  it('isSessionActive returns false', () => {
    expect(isSessionActive('any')).toBe(false);
  });

  it('getSessionTokens returns zeros', () => {
    const tokens = getSessionTokens('any');
    expect(tokens.input).toBe(0);
    expect(tokens.output).toBe(0);
  });

  it('getRecentSessions returns empty array', () => {
    expect(getRecentSessions(10)).toEqual([]);
  });
});
