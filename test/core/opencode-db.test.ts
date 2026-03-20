/**
 * Tests for extended opencode-db.ts v2 queries.
 *
 * Uses an in-memory SQLite database with the same schema as opencode's real DB.
 * Tests cover: getSessionMessages, getSessionParts, getLastMessage, isSessionDone,
 * getSessionTokens, and error/edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getSessionMessages,
  getSessionParts,
  getLastMessage,
  isSessionDone,
  getSessionTokens,
  getSessionTokensRecursive,
  getSessionTokenUsageByModel,
  getSessionTokenUsageByModelRecursive,
  getSessionModels,
  getSessionModelsById,
  getSessionModelsRecursive,
  getAssistantMessageCount,
  getSessionState,
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
  parentId: string | null = null,
): void {
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, slug, directory, title, time_created, time_updated)
     VALUES (?, 'proj1', ?, ?, '/tmp/test', ?, ?, ?)`,
  ).run(id, parentId, title.toLowerCase(), title, timeCreated, timeUpdated);
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

// ── getSessionParts ────────────────────────────────────────────────────────

describe('getSessionParts', () => {
  it('returns parts in chronological order with correct types', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 5000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'text', text: 'Hello' });
    insertMessage(db, 'msg2', 'sess1', 2000, { role: 'assistant' });
    insertPart(db, 'p2', 'msg2', 'sess1', 2000, { type: 'text', text: 'Starting work...' });
    insertPart(db, 'p3', 'msg2', 'sess1', 3000, {
      type: 'tool', tool: 'bash',
      state: { status: 'completed', input: { command: 'ls -la' }, output: 'file1\nfile2\nfile3' },
    });
    insertPart(db, 'p4', 'msg2', 'sess1', 4000, { type: 'text', text: 'Done!' });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(4);
    expect(parts[0].type).toBe('text');
    expect(parts[0].role).toBe('user');
    expect(parts[0].createdAt).toBe(1000);
    expect(parts[1].type).toBe('text');
    expect(parts[1].role).toBe('assistant');
    expect(parts[2].type).toBe('tool');
    expect(parts[2].role).toBe('assistant');
    expect(parts[3].type).toBe('text');
    expect(parts[3].createdAt).toBe(4000);
  });

  it('extracts tool name, input summary, and output summary', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, {
      type: 'tool', tool: 'grep',
      state: { status: 'completed', input: { pattern: 'TODO', include: '*.ts' }, output: 'src/main.ts:10: // TODO fix this' },
    });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(1);
    expect(parts[0].tool).toBe('grep');
    expect(parts[0].toolStatus).toBe('completed');
    expect(parts[0].toolInput).toContain('TODO');
    expect(parts[0].toolOutput).toContain('src/main.ts');
  });

  it('extracts bash command and first 2 lines of output', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, {
      type: 'tool', tool: 'bash',
      state: {
        status: 'completed',
        input: { command: 'npm test', description: 'Run tests' },
        output: 'PASS src/test.ts\nAll tests passed\nDone in 3.2s',
      },
    });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(1);
    expect(parts[0].tool).toBe('bash');
    expect(parts[0].toolInput).toBe('npm test');
    // First 2 lines only
    expect(parts[0].toolOutput).toBe('PASS src/test.ts\nAll tests passed');
  });

  it('extracts file path from read/write/edit tool parts', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 4000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, {
      type: 'tool', tool: 'read',
      state: { status: 'completed', input: { filePath: '/home/user/project/src/main.ts' }, output: 'file contents...' },
    });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, {
      type: 'tool', tool: 'write',
      state: { status: 'completed', input: { filePath: '/home/user/project/src/new.ts' }, output: 'written' },
    });
    insertPart(db, 'p3', 'msg1', 'sess1', 3000, {
      type: 'tool', tool: 'edit',
      state: { status: 'completed', input: { filePath: '/home/user/project/src/edit.ts', oldString: 'a', newString: 'b' }, output: 'edited' },
    });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(3);
    expect(parts[0].tool).toBe('read');
    expect(parts[0].toolInput).toBe('/home/user/project/src/main.ts');
    expect(parts[1].tool).toBe('write');
    expect(parts[1].toolInput).toBe('/home/user/project/src/new.ts');
    expect(parts[2].tool).toBe('edit');
    expect(parts[2].toolInput).toBe('/home/user/project/src/edit.ts');
  });

  it('extracts filenames from patch operations', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, {
      type: 'patch',
      operations: [
        { path: 'src/main.ts', content: 'diff content...' },
        { path: 'src/util.ts', content: 'more diff...' },
      ],
    });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('patch');
    expect(parts[0].patchFiles).toEqual(['src/main.ts', 'src/util.ts']);
  });

  it('extracts text content from text and reasoning parts', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'text', text: 'Hello world' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'reasoning', text: 'Let me think about this...' });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toBe('Hello world');
    expect(parts[1].type).toBe('reasoning');
    expect(parts[1].text).toBe('Let me think about this...');
  });

  it('filters correctly with since parameter', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 5000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'text', text: 'First' });
    insertMessage(db, 'msg2', 'sess1', 3000, { role: 'assistant' });
    insertPart(db, 'p2', 'msg2', 'sess1', 3000, { type: 'text', text: 'Second' });
    insertPart(db, 'p3', 'msg2', 'sess1', 5000, { type: 'text', text: 'Third' });

    const parts = getSessionParts('sess1', 2000);
    expect(parts).toHaveLength(2);
    expect(parts[0].text).toBe('Second');
    expect(parts[1].text).toBe('Third');
  });

  it('returns empty array for empty/nonexistent session', () => {
    expect(getSessionParts('nonexistent')).toEqual([]);

    insertSession(db, 'sess1', 'empty-session', 1000, 1000);
    expect(getSessionParts('sess1')).toEqual([]);
  });

  it('handles step-start and step-finish types', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start', snapshot: 'abc123' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'text', text: 'Working...' });
    insertPart(db, 'p3', 'msg1', 'sess1', 3000, { type: 'step-finish' });

    const parts = getSessionParts('sess1');
    expect(parts).toHaveLength(3);
    expect(parts[0].type).toBe('step-start');
    expect(parts[1].type).toBe('text');
    expect(parts[2].type).toBe('step-finish');
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

// ── isSessionDone ──────────────────────────────────────────────────────────

describe('isSessionDone', () => {
  it('returns true when most recent step-finish has reason=stop', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'text', text: 'Working...' });
    insertPart(db, 'p3', 'msg1', 'sess1', 3000, { type: 'step-finish', reason: 'stop' });

    expect(isSessionDone('sess1')).toBe(true);
  });

  it('returns false when most recent step-finish has reason=tool-calls (still working)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'step-finish', reason: 'tool-calls' });

    expect(isSessionDone('sess1')).toBe(false);
  });

  it('returns true when most recent step-finish has reason=length (token limit)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'step-finish', reason: 'length' });

    expect(isSessionDone('sess1')).toBe(true);
  });

  it('returns false when no step-finish parts exist (session just started)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 1000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });

    expect(isSessionDone('sess1')).toBe(false);
  });

  it('returns false for nonexistent session', () => {
    expect(isSessionDone('nonexistent')).toBe(false);
  });

  it('returns false when DB unavailable', () => {
    _resetDbCache();
    _setTestDb(null);
    expect(isSessionDone('any')).toBe(false);
    // Restore test DB for cleanup
    _resetDbCache();
    _setTestDb(db);
  });

  it('uses most recent step-finish when multiple exist (tool-calls then stop = done)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 4000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    // First step ends with tool-calls (not done)
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'step-finish', reason: 'tool-calls' });
    // Second step ends with stop (done)
    insertPart(db, 'p3', 'msg1', 'sess1', 3000, { type: 'step-start' });
    insertPart(db, 'p4', 'msg1', 'sess1', 4000, { type: 'step-finish', reason: 'stop' });

    expect(isSessionDone('sess1')).toBe(true);
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

// ── getSessionTokenUsageByModel / getSessionTokenUsageByModelRecursive ─────

describe('per-model token usage queries', () => {
  it('aggregates one session into per-model token buckets', () => {
    insertSession(db, 'sess1', 'root-session', 1000, 3000);
    insertMessage(db, 'm1', 'sess1', 1100, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
      tokens: { input: 100, output: 40, reasoning: 7, cache_read: 3, cache_write: 2 },
    });
    insertMessage(db, 'm2', 'sess1', 1200, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
      tokens: { input: 10, output: 5, reasoning: 1, cache_read: 0, cache_write: 0 },
    });
    insertMessage(db, 'm3', 'sess1', 1300, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { input: 25, output: 50, reasoning: 0, cache_read: 4, cache_write: 1 },
    });

    expect(getSessionTokenUsageByModel('sess1')).toEqual({
      'anthropic/claude-sonnet-4-5': {
        input: 110,
        output: 45,
        reasoning: 8,
        cacheRead: 3,
        cacheWrite: 2,
      },
      'openai/gpt-5': {
        input: 25,
        output: 50,
        reasoning: 0,
        cacheRead: 4,
        cacheWrite: 1,
      },
    });
  });

  it('rolls up per-model token buckets recursively across child sessions', () => {
    insertSession(db, 'root', 'root', 1000, 4000);
    insertSession(db, 'child', 'child', 2000, 3500, 'root');

    insertMessage(db, 'm-root', 'root', 1100, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { input: 60, output: 30, reasoning: 2, cache_read: 1, cache_write: 0 },
    });
    insertMessage(db, 'm-child', 'child', 2100, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { input: 40, output: 10, reasoning: 3, cache_read: 2, cache_write: 1 },
    });
    insertMessage(db, 'm-child-2', 'child', 2200, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-haiku-4-5',
      tokens: { input: 20, output: 15, reasoning: 5, cache_read: 0, cache_write: 0 },
    });

    expect(getSessionTokenUsageByModelRecursive('root')).toEqual({
      'openai/gpt-5': {
        input: 100,
        output: 40,
        reasoning: 5,
        cacheRead: 3,
        cacheWrite: 1,
      },
      'anthropic/claude-haiku-4-5': {
        input: 20,
        output: 15,
        reasoning: 5,
        cacheRead: 0,
        cacheWrite: 0,
      },
    });
  });

  it('degrades safely for missing token fields and missing model identity', () => {
    insertSession(db, 'sess1', 'root', 1000, 3000);

    insertMessage(db, 'm-no-model', 'sess1', 1100, {
      role: 'assistant',
      tokens: { input: 500, output: 300 },
    });
    insertMessage(db, 'm-partial', 'sess1', 1200, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { output: 20 },
    });
    insertMessage(db, 'm-empty', 'sess1', 1300, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });

    expect(getSessionTokenUsageByModel('sess1')).toEqual({
      'openai/gpt-5': {
        input: 0,
        output: 20,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    });
  });

  it('does not double count recursive buckets when parent links form a cycle', () => {
    insertSession(db, 'sess-a', 'session-a', 1000, 2000, 'sess-b');
    insertSession(db, 'sess-b', 'session-b', 1100, 2100, 'sess-a');

    insertMessage(db, 'm-a', 'sess-a', 1200, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { input: 10, output: 2, reasoning: 1, cache_read: 0, cache_write: 0 },
    });
    insertMessage(db, 'm-b', 'sess-b', 1300, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      tokens: { input: 5, output: 3, reasoning: 2, cache_read: 1, cache_write: 1 },
    });

    expect(getSessionTokenUsageByModelRecursive('sess-a')).toEqual({
      'openai/gpt-5': {
        input: 15,
        output: 5,
        reasoning: 3,
        cacheRead: 1,
        cacheWrite: 1,
      },
    });
  });
});

// ── getSessionModels / getSessionModelsById / getSessionModelsRecursive ────

describe('model usage queries', () => {
  it('collects normalized distinct models by session ID', () => {
    insertSession(db, 'sess1', 'root-session', 1000, 2000);
    insertMessage(db, 'msg1', 'sess1', 1100, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    });
    insertMessage(db, 'msg2', 'sess1', 1200, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });
    insertMessage(db, 'msg3', 'sess1', 1300, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });

    expect(getSessionModelsById('sess1')).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
    ]);
  });

  it('recursively collects models across parent and child sessions', () => {
    insertSession(db, 'root', 'root-session', 1000, 5000);
    insertSession(db, 'child-a', 'child-a', 2000, 4000, 'root');
    insertSession(db, 'child-b', 'child-b', 3000, 4500, 'root');

    insertMessage(db, 'm-root', 'root', 1100, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    });
    insertMessage(db, 'm-a', 'child-a', 2100, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });
    insertMessage(db, 'm-b', 'child-b', 3100, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-haiku-4-5',
    });

    expect(getSessionModelsRecursive('root')).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
      'anthropic/claude-haiku-4-5',
    ]);
  });

  it('filters malformed provider/model combinations and falls back safely', () => {
    insertSession(db, 'sess1', 'root-session', 1000, 2000);
    insertMessage(db, 'valid', 'sess1', 1100, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });
    insertMessage(db, 'missing-provider', 'sess1', 1200, {
      role: 'assistant',
      modelID: 'gpt-5',
    });
    insertMessage(db, 'missing-model', 'sess1', 1300, {
      role: 'assistant',
      providerID: 'anthropic',
    });
    insertMessage(db, 'whitespace-model', 'sess1', 1400, {
      role: 'assistant',
      providerID: 'openai',
      modelID: '   ',
    });

    expect(getSessionModelsById('sess1')).toEqual(['openai/gpt-5']);
  });

  it('guards recursion with visited tracking on cyclic parent relationships', () => {
    insertSession(db, 'sess-a', 'session-a', 1000, 2000, 'sess-b');
    insertSession(db, 'sess-b', 'session-b', 1100, 2100, 'sess-a');

    insertMessage(db, 'm-a', 'sess-a', 1200, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    });
    insertMessage(db, 'm-b', 'sess-b', 1300, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });

    expect(getSessionModelsRecursive('sess-a')).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
    ]);
  });

  it('enforces recursion depth guard for very deep session trees', () => {
    const ids = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'];
    for (let i = 0; i < ids.length; i += 1) {
      const parentId = i === 0 ? null : ids[i - 1];
      insertSession(db, ids[i], `session-${i}`, 1000 + i, 2000 + i, parentId);
      insertMessage(db, `m-${i}`, ids[i], 3000 + i, {
        role: 'assistant',
        providerID: 'openai',
        modelID: `gpt-${i}`,
      });
    }

    expect(getSessionModelsRecursive('s0')).toEqual([
      'openai/gpt-0',
      'openai/gpt-1',
      'openai/gpt-2',
      'openai/gpt-3',
      'openai/gpt-4',
      'openai/gpt-5',
      'openai/gpt-6',
      'openai/gpt-7',
      'openai/gpt-8',
    ]);
  });

  it('keeps title-based helper backward compatible via latest matching session', () => {
    insertSession(db, 'root', 'job-session', 1000, 4000);
    insertSession(db, 'child', 'job-session-child', 2000, 3000, 'root');
    insertMessage(db, 'm-root', 'root', 1100, {
      role: 'assistant',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    });
    insertMessage(db, 'm-child', 'child', 2100, {
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
    });

    expect(getSessionModels('job-session')).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
    ]);
  });
});

// ── recursive observability edge contracts ──────────────────────────────────

describe('recursive observability edge contracts', () => {
  it('avoids duplicate total-token aggregation on cyclic parent links', () => {
    insertSession(db, 'sess-a', 'session-a', 1000, 2000, 'sess-b');
    insertSession(db, 'sess-b', 'session-b', 1100, 2100, 'sess-a');

    insertMessage(db, 'm-a', 'sess-a', 1200, {
      role: 'assistant',
      tokens: { input: 10, output: 1, reasoning: 2, cache_read: 1, cache_write: 0 },
    });
    insertMessage(db, 'm-b', 'sess-b', 1300, {
      role: 'assistant',
      tokens: { input: 5, output: 3, reasoning: 4, cache_read: 0, cache_write: 1 },
    });

    expect(getSessionTokensRecursive('sess-a')).toEqual({
      input: 15,
      output: 4,
      reasoning: 6,
      cacheRead: 1,
      cacheWrite: 1,
    });
  });
});

// ── getAssistantMessageCount ───────────────────────────────────────────────

describe('getAssistantMessageCount', () => {
  it('returns count of assistant messages only (ignores user messages)', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 5000);
    // 2 user messages
    insertMessage(db, 'umsg1', 'sess1', 1000, { role: 'user' });
    insertMessage(db, 'umsg2', 'sess1', 2000, { role: 'user' });
    // 3 assistant messages
    insertMessage(db, 'amsg1', 'sess1', 3000, { role: 'assistant', tokens: { input: 10, output: 20 } });
    insertMessage(db, 'amsg2', 'sess1', 4000, { role: 'assistant', tokens: { input: 15, output: 30 } });
    insertMessage(db, 'amsg3', 'sess1', 5000, { role: 'assistant', tokens: { input: 5, output: 10 } });

    expect(getAssistantMessageCount('sess1')).toBe(3);
  });

  it('returns 0 for session with no assistant messages', () => {
    insertSession(db, 'sess1', 'test-session', 1000, 2000);
    insertMessage(db, 'umsg1', 'sess1', 1000, { role: 'user' });
    insertMessage(db, 'umsg2', 'sess1', 2000, { role: 'user' });

    expect(getAssistantMessageCount('sess1')).toBe(0);
  });

  it('returns 0 for session with no messages at all', () => {
    insertSession(db, 'sess1', 'empty-session', 1000, 1000);

    expect(getAssistantMessageCount('sess1')).toBe(0);
  });

  it('returns 0 for nonexistent session', () => {
    expect(getAssistantMessageCount('nonexistent-session-id')).toBe(0);
  });

  it('returns 0 when DB unavailable', () => {
    _resetDbCache();
    _setTestDb(null);
    expect(getAssistantMessageCount('any')).toBe(0);
    // Restore test DB for cleanup
    _resetDbCache();
    _setTestDb(db);
  });
});

// ── getSessionState ────────────────────────────────────────────────────────

describe('getSessionState', () => {
  it("returns 'done' when step-finish has reason='stop'", () => {
    insertSession(db, 'sess1', 'done-stop-session', 1000, 3000);
    insertMessage(db, 'msg1', 'sess1', 1000, { role: 'assistant' });
    insertPart(db, 'p1', 'msg1', 'sess1', 1000, { type: 'step-start' });
    insertPart(db, 'p2', 'msg1', 'sess1', 2000, { type: 'text', text: 'Done!' });
    insertPart(db, 'p3', 'msg1', 'sess1', 3000, { type: 'step-finish', reason: 'stop' });

    const result = getSessionState('sess1');
    expect(result.state).toBe('done');
  });

  it("returns 'done' when step-finish has reason='length'", () => {
    insertSession(db, 'sess2', 'done-length-session', 1000, 2000);
    insertMessage(db, 'msg2', 'sess2', 1000, { role: 'assistant' });
    insertPart(db, 'p4', 'msg2', 'sess2', 1000, { type: 'step-start' });
    insertPart(db, 'p5', 'msg2', 'sess2', 2000, { type: 'step-finish', reason: 'length' });

    const result = getSessionState('sess2');
    expect(result.state).toBe('done');
  });

  it("returns 'hung-on-prompt' when question tool has no result", () => {
    insertSession(db, 'sess3', 'hung-prompt-session', 1000, 2000);
    insertMessage(db, 'msg3', 'sess3', 1000, { role: 'assistant' });
    insertPart(db, 'p6', 'msg3', 'sess3', 1000, { type: 'step-start' });
    insertPart(db, 'p7', 'msg3', 'sess3', 2000, {
      type: 'tool',
      tool: 'question',
      state: { status: 'running', input: { question: 'What should I do next?' } },
    });

    const result = getSessionState('sess3');
    expect(result.state).toBe('hung-on-prompt');
    expect(result.pendingToolName).toBe('question');
    expect(result.pendingToolContent).toContain('What should I do next?');
  });

  it("returns 'hung-on-tool' when non-question tool has no result", () => {
    insertSession(db, 'sess4', 'hung-tool-session', 1000, 2000);
    insertMessage(db, 'msg4', 'sess4', 1000, { role: 'assistant' });
    insertPart(db, 'p8', 'msg4', 'sess4', 1000, { type: 'step-start' });
    insertPart(db, 'p9', 'msg4', 'sess4', 2000, {
      type: 'tool',
      tool: 'bash',
      state: { status: 'running', input: { command: 'npm run build' } },
    });

    const result = getSessionState('sess4');
    expect(result.state).toBe('hung-on-tool');
    expect(result.pendingToolName).toBe('bash');
  });

  it("returns 'working' when tool call is completed and no step-finish", () => {
    insertSession(db, 'sess5', 'working-session', 1000, 2000);
    insertMessage(db, 'msg5', 'sess5', 1000, { role: 'assistant' });
    insertPart(db, 'p10', 'msg5', 'sess5', 1000, { type: 'step-start' });
    insertPart(db, 'p11', 'msg5', 'sess5', 2000, {
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'ls' }, output: 'file1\nfile2' },
    });

    const result = getSessionState('sess5');
    expect(result.state).toBe('working');
  });

  it("returns 'working' when step-finish has reason='tool-calls' and there's a completed tool", () => {
    insertSession(db, 'sess6', 'working-toolcalls-session', 1000, 3000);
    insertMessage(db, 'msg6', 'sess6', 1000, { role: 'assistant' });
    insertPart(db, 'p12', 'msg6', 'sess6', 1000, { type: 'step-start' });
    insertPart(db, 'p13', 'msg6', 'sess6', 2000, {
      type: 'tool',
      tool: 'read',
      state: { status: 'completed', input: { filePath: '/tmp/foo' }, output: 'content' },
    });
    insertPart(db, 'p14', 'msg6', 'sess6', 3000, { type: 'step-finish', reason: 'tool-calls' });

    const result = getSessionState('sess6');
    expect(result.state).toBe('working');
  });

  it("returns 'crashed' when PID is dead and no step-finish exists", () => {
    insertSession(db, 'sess7', 'crashed-session', 1000, 2000);
    insertMessage(db, 'msg7', 'sess7', 1000, { role: 'user' });
    insertPart(db, 'p15', 'msg7', 'sess7', 1000, { type: 'text', text: 'Hello' });
    insertMessage(db, 'msg8', 'sess7', 2000, { role: 'assistant' });
    insertPart(db, 'p16', 'msg8', 'sess7', 2000, { type: 'text', text: 'Working on it...' });
    // No step-finish — simulate PID dead

    const result = getSessionState('sess7', false); // pidAlive: false
    expect(result.state).toBe('crashed');
  });

  it("returns 'working' with no step-finish but PID alive", () => {
    insertSession(db, 'sess8', 'working-alive-session', 1000, 2000);
    insertMessage(db, 'msg9', 'sess8', 1000, { role: 'assistant' });
    insertPart(db, 'p17', 'msg9', 'sess8', 1000, { type: 'text', text: 'Computing...' });
    // No step-finish, PID is alive

    const result = getSessionState('sess8', true); // pidAlive: true (default)
    expect(result.state).toBe('working');
  });

  it("returns 'done' for nonexistent session (safe default)", () => {
    const result = getSessionState('nonexistent-session-id');
    expect(result.state).toBe('done');
  });

  it("returns 'done' when parent is done and child session has no activity for 5+ minutes (stale child)", () => {
    const now = Date.now();
    const sixMinutesAgo = now - 6 * 60 * 1000;

    // Parent session with step-finish reason='stop'
    insertSession(db, 'sess-parent-stale', 'parent-stale-test', 1000, now);
    insertMessage(db, 'msg-parent-stale', 'sess-parent-stale', 1000, { role: 'assistant' });
    insertPart(db, 'p-parent-stale-start', 'msg-parent-stale', 'sess-parent-stale', 1000, { type: 'step-start' });
    insertPart(db, 'p-parent-stale-finish', 'msg-parent-stale', 'sess-parent-stale', 2000, { type: 'step-finish', reason: 'stop' });

    // Child session (no step-finish) with only old activity (6 minutes ago)
    insertSession(db, 'sess-child-stale', 'child-stale-test', sixMinutesAgo, sixMinutesAgo, 'sess-parent-stale');
    insertMessage(db, 'msg-child-stale', 'sess-child-stale', sixMinutesAgo, { role: 'assistant' });
    insertPart(db, 'p-child-stale', 'msg-child-stale', 'sess-child-stale', sixMinutesAgo, { type: 'text', text: 'Working...' });

    const result = getSessionState('sess-parent-stale');
    expect(result.state).toBe('done');
  });

  it("returns 'working' when parent is done and child session has recent activity (< 5 min)", () => {
    const now = Date.now();
    const oneMinuteAgo = now - 1 * 60 * 1000;

    // Parent session with step-finish reason='stop'
    insertSession(db, 'sess-parent-active', 'parent-active-test', 1000, now);
    insertMessage(db, 'msg-parent-active', 'sess-parent-active', 1000, { role: 'assistant' });
    insertPart(db, 'p-parent-active-start', 'msg-parent-active', 'sess-parent-active', 1000, { type: 'step-start' });
    insertPart(db, 'p-parent-active-finish', 'msg-parent-active', 'sess-parent-active', 2000, { type: 'step-finish', reason: 'stop' });

    // Child session (no step-finish) with recent activity (1 minute ago)
    insertSession(db, 'sess-child-active', 'child-active-test', oneMinuteAgo, oneMinuteAgo, 'sess-parent-active');
    insertMessage(db, 'msg-child-active', 'sess-child-active', oneMinuteAgo, { role: 'assistant' });
    insertPart(db, 'p-child-active', 'msg-child-active', 'sess-child-active', oneMinuteAgo, { type: 'text', text: 'Still working...' });

    const result = getSessionState('sess-parent-active');
    expect(result.state).toBe('working');
  });

  it('picks latest pending tool, not older completed tools', () => {
    insertSession(db, 'sess9', 'latest-pending-session', 1000, 3000);
    insertMessage(db, 'msg10', 'sess9', 1000, { role: 'assistant' });
    insertPart(db, 'p18', 'msg10', 'sess9', 1000, { type: 'step-start' });
    // Older completed bash tool
    insertPart(db, 'p19', 'msg10', 'sess9', 2000, {
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'ls' }, output: 'files' },
    });
    // Newer pending question tool
    insertPart(db, 'p20', 'msg10', 'sess9', 3000, {
      type: 'tool',
      tool: 'question',
      state: { status: 'running', input: { question: 'Confirm?' } },
    });

    const result = getSessionState('sess9');
    expect(result.state).toBe('hung-on-prompt');
    expect(result.pendingToolName).toBe('question');
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

  it('getSessionParts returns empty array', () => {
    expect(getSessionParts('any')).toEqual([]);
  });

  it('getLastMessage returns null', () => {
    expect(getLastMessage('any')).toBeNull();
  });

  it('isSessionDone returns false', () => {
    expect(isSessionDone('any')).toBe(false);
  });

  it('getSessionTokens returns zeros', () => {
    const tokens = getSessionTokens('any');
    expect(tokens.input).toBe(0);
    expect(tokens.output).toBe(0);
  });

  it('getSessionTokenUsageByModel returns empty object', () => {
    expect(getSessionTokenUsageByModel('any')).toEqual({});
  });

  it('getSessionTokenUsageByModelRecursive returns empty object', () => {
    expect(getSessionTokenUsageByModelRecursive('any')).toEqual({});
  });

  it('getSessionModelsById returns empty array', () => {
    expect(getSessionModelsById('any')).toEqual([]);
  });

  it('getSessionModelsRecursive returns empty array', () => {
    expect(getSessionModelsRecursive('any')).toEqual([]);
  });

  it('getAssistantMessageCount returns 0', () => {
    expect(getAssistantMessageCount('any')).toBe(0);
  });
});
