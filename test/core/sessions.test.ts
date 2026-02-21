import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// Mock opencode-db before importing sessions module
vi.mock('../../src/core/opencode-db.js', () => ({
  listSessionsFromDb: vi.fn(),
  findSessionFromDb: vi.fn(),
  exportSessionFromDb: vi.fn(),
  getSessionMessageCountFromDb: vi.fn(),
}));

import {
  listSessionsFromDb,
  findSessionFromDb,
  exportSessionFromDb,
  getSessionMessageCountFromDb,
} from '../../src/core/opencode-db.js';
import {
  listSessions,
  findSession,
  exportSession,
  getSessionMessageCount,
  clearSessionCache,
} from '../../src/core/sessions.js';
import type { SessionInfo } from '../../src/core/types.js';

const mockedListSessions = vi.mocked(listSessionsFromDb);
const mockedFindSession = vi.mocked(findSessionFromDb);
const mockedExportSession = vi.mocked(exportSessionFromDb);
const mockedGetMessageCount = vi.mocked(getSessionMessageCountFromDb);

// Sample test data
const sampleSessions: SessionInfo[] = [
  { id: 'sess-001', title: 'resume-roast-execute-phase-3', updated: 1708436400000, created: 1708432800000 },
  { id: 'sess-002', title: 'pet-portraits-plan-phase-2', updated: 1708435500000, created: 1708432200000 },
  { id: 'sess-003', title: 'baby-predictor-verify-auto-1', updated: 1708434000000, created: 1708431600000 },
  { id: 'sess-004', title: 'resume-roast-plan-phase-3', updated: 1708430000000, created: 1708428000000 },
  { id: 'sess-005', title: 'pet-portraits-new-project', updated: 1708425000000, created: 1708423000000 },
];

describe('sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearSessionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listSessions', () => {
    it('returns SessionInfo[] from DB', async () => {
      mockedListSessions.mockReturnValue(sampleSessions);

      const sessions = await listSessions();

      expect(sessions).toHaveLength(5);
      expect(sessions[0]).toEqual({
        id: 'sess-001',
        title: 'resume-roast-execute-phase-3',
        updated: 1708436400000,
        created: 1708432800000,
      } satisfies SessionInfo);
    });

    it('delegates to listSessionsFromDb', async () => {
      mockedListSessions.mockReturnValue([]);

      await listSessions();

      expect(mockedListSessions).toHaveBeenCalledOnce();
    });

    it('returns empty array when DB returns empty', async () => {
      mockedListSessions.mockReturnValue([]);

      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('findSession', () => {
    it('delegates to findSessionFromDb', async () => {
      mockedFindSession.mockReturnValue(sampleSessions[0]!);

      const result = await findSession('resume-roast-execute-phase-3');

      expect(mockedFindSession).toHaveBeenCalledWith('resume-roast-execute-phase-3');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-001');
    });

    it('returns null when no match found', async () => {
      mockedFindSession.mockReturnValue(null);

      const result = await findSession('nonexistent-session');
      expect(result).toBeNull();
    });
  });

  describe('exportSession', () => {
    it('returns parsed export data from DB', async () => {
      const exportData = { messages: [{ role: 'user', content: 'Hello' }] };
      mockedExportSession.mockReturnValue(exportData);

      const result = await exportSession('sess-001');

      expect(result).toEqual(exportData);
      expect(mockedExportSession).toHaveBeenCalledWith('sess-001');
    });

    it('throws descriptive error on failure', async () => {
      mockedExportSession.mockImplementation(() => {
        throw new Error('Failed to export session: sess-999: DB not available');
      });

      await expect(exportSession('sess-999')).rejects.toThrow(
        'Failed to export session: sess-999',
      );
    });
  });

  describe('getSessionMessageCount', () => {
    it('returns message count from DB', async () => {
      mockedFindSession.mockReturnValue(sampleSessions[0]!);
      mockedGetMessageCount.mockReturnValue(4);

      const count = await getSessionMessageCount(
        'resume-roast-execute-phase-3',
      );
      expect(count).toBe(4);
    });

    it('does not use caching (direct DB query each time)', async () => {
      mockedFindSession.mockReturnValue(sampleSessions[0]!);
      mockedGetMessageCount.mockReturnValue(4);

      const count1 = await getSessionMessageCount('resume-roast-execute-phase-3');
      const count2 = await getSessionMessageCount('resume-roast-execute-phase-3');

      expect(count1).toBe(4);
      expect(count2).toBe(4);
      // Should call findSessionFromDb each time (no caching)
      expect(mockedFindSession).toHaveBeenCalledTimes(2);
    });

    it('returns null when session not found', async () => {
      mockedFindSession.mockReturnValue(null);

      const count = await getSessionMessageCount('nonexistent');
      expect(count).toBeNull();
    });
  });
});
