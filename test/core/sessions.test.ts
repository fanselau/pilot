import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock execa before importing sessions module
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import {
  listSessions,
  findSession,
  exportSession,
  getSessionMessageCount,
  clearSessionCache,
} from '../../src/core/sessions.js';
import type { SessionInfo } from '../../src/core/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures');

const sessionsFixture = readFileSync(
  path.join(fixturesDir, 'sessions.json'),
  'utf8',
);
const exportFixture = readFileSync(
  path.join(fixturesDir, 'export.json'),
  'utf8',
);

const mockedExeca = vi.mocked(execa);

describe('sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearSessionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listSessions', () => {
    it('returns parsed SessionInfo[] from claude CLI output', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: sessionsFixture,
      } as never);

      const sessions = await listSessions();

      expect(sessions).toHaveLength(5);
      expect(sessions[0]).toEqual({
        id: 'sess-001',
        title: 'resume-roast-execute-phase-3',
        updated: 1708436400000,
        created: 1708432800000,
        message_count: 42,
      } satisfies SessionInfo);
    });

    it('calls claude with correct arguments', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: '[]',
      } as never);

      await listSessions();

      expect(mockedExeca).toHaveBeenCalledWith('claude', [
        'session',
        'list',
        '--format',
        'json',
      ]);
    });

    it('returns empty array when claude binary not found', async () => {
      mockedExeca.mockRejectedValueOnce(
        new Error('ENOENT: claude not found'),
      );

      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it('returns empty array on invalid JSON output', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: 'not json',
      } as never);

      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when output is not an array', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: '{"not": "an array"}',
      } as never);

      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it('filters out malformed session entries', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: JSON.stringify([
          { id: 'valid', title: 'test', updated: 100, created: 50, message_count: 5 },
          { id: 'missing-title', updated: 100, created: 50, message_count: 5 },
          { id: 'wrong-type', title: 123, updated: 100, created: 50, message_count: 5 },
          null,
          'not an object',
        ]),
      } as never);

      const sessions = await listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid');
    });
  });

  describe('findSession', () => {
    beforeEach(() => {
      mockedExeca.mockResolvedValue({
        stdout: sessionsFixture,
      } as never);
    });

    it('returns exact title match (case-sensitive)', async () => {
      const result = await findSession('resume-roast-execute-phase-3');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-001');
    });

    it('returns contains match when no exact match', async () => {
      const result = await findSession('resume-roast');

      expect(result).not.toBeNull();
      // Should be sess-001 as it has the most recent updated timestamp
      expect(result!.id).toBe('sess-001');
    });

    it('picks most recently updated on multiple contains matches', async () => {
      // "resume-roast" matches sess-001 (updated: 1708436400000) and
      // sess-004 (updated: 1708430000000). Should pick sess-001.
      const result = await findSession('resume-roast');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-001');
      expect(result!.updated).toBe(1708436400000);
    });

    it('performs case-insensitive contains matching', async () => {
      const result = await findSession('RESUME-ROAST');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-001');
    });

    it('returns null when no match found', async () => {
      const result = await findSession('nonexistent-session');

      expect(result).toBeNull();
    });

    it('returns null when sessions list is empty', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: '[]',
      } as never);

      const result = await findSession('anything');
      expect(result).toBeNull();
    });

    it('prefers exact match over contains match', async () => {
      // "pet-portraits-new-project" is an exact match for sess-005
      const result = await findSession('pet-portraits-new-project');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-005');
    });
  });

  describe('exportSession', () => {
    it('returns parsed export data', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: exportFixture,
      } as never);

      const result = await exportSession('sess-001');

      expect(result).toEqual(JSON.parse(exportFixture));
    });

    it('calls claude with correct arguments', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: exportFixture,
      } as never);

      await exportSession('sess-001');

      expect(mockedExeca).toHaveBeenCalledWith('claude', [
        'export',
        'sess-001',
      ]);
    });

    it('throws descriptive error on failure', async () => {
      mockedExeca.mockRejectedValueOnce(
        new Error('Command failed'),
      );

      await expect(exportSession('sess-999')).rejects.toThrow(
        'Failed to export session: sess-999: Command failed',
      );
    });
  });

  describe('getSessionMessageCount', () => {
    it('returns message count from exported session', async () => {
      // First call: listSessions for findSession
      mockedExeca.mockResolvedValueOnce({
        stdout: sessionsFixture,
      } as never);
      // Second call: exportSession
      mockedExeca.mockResolvedValueOnce({
        stdout: exportFixture,
      } as never);

      const count = await getSessionMessageCount(
        'resume-roast-execute-phase-3',
      );
      expect(count).toBe(4); // 4 messages in export fixture
    });

    it('returns cached result within TTL', async () => {
      // First call
      mockedExeca.mockResolvedValueOnce({
        stdout: sessionsFixture,
      } as never);
      mockedExeca.mockResolvedValueOnce({
        stdout: exportFixture,
      } as never);

      const count1 = await getSessionMessageCount(
        'resume-roast-execute-phase-3',
      );

      // Second call — should use cache, no additional execa calls
      const count2 = await getSessionMessageCount(
        'resume-roast-execute-phase-3',
      );

      expect(count1).toBe(4);
      expect(count2).toBe(4);
      // execa should have been called exactly twice (listSessions + exportSession)
      expect(mockedExeca).toHaveBeenCalledTimes(2);
    });

    it('returns null when session not found', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: sessionsFixture,
      } as never);

      const count = await getSessionMessageCount('nonexistent');
      expect(count).toBeNull();
    });

    it('returns null when export fails', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: sessionsFixture,
      } as never);
      mockedExeca.mockRejectedValueOnce(new Error('Export failed'));

      const count = await getSessionMessageCount(
        'resume-roast-execute-phase-3',
      );
      expect(count).toBeNull();
    });
  });
});
