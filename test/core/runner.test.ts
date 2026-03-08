/**
 * Tests for pure exported helpers in runner.ts.
 *
 * Tests `parseJudgeVerdict`, `getDynamicMaxParallel`, and `hasSystemdRunUser`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Mock node:fs so we can control /proc/meminfo content for getDynamicMaxParallel tests
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: unknown) => {
      if (filePath === '/proc/meminfo') {
        return _mockMeminfoContent;
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
  };
});

// Module-level variable to control mock /proc/meminfo content.
// Updated per-test before the module reads it.
let _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB default

import { parseJudgeVerdict, getDynamicMaxParallel, hasSystemdRunUser, _resetSystemdRunCache } from '../../src/core/runner.js';

// ── parseJudgeVerdict ──────────────────────────────────────────────────────

describe('parseJudgeVerdict', () => {
  it('parses verdict from fenced ```json block', () => {
    const content = [
      "Here's my verdict:",
      '```json',
      '{"verdict":"succeeded","confidence":95,"reason":"All good"}',
      '```',
      'End.',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('succeeded');
    expect(result!.confidence).toBe(95);
    expect(result!.reason).toBe('All good');
  });

  it('parses verdict from raw JSON (entire content is JSON)', () => {
    const content = '{"verdict":"failed","confidence":80,"reason":"Missing tests"}';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('failed');
    expect(result!.confidence).toBe(80);
    expect(result!.reason).toBe('Missing tests');
  });

  it('parses verdict from text-wrapped JSON (extracts first {...} block)', () => {
    const content = 'After careful analysis, I believe {"verdict":"doubting","confidence":60,"reason":"Partial success"} is my assessment.';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('doubting');
    expect(result!.confidence).toBe(60);
    expect(result!.reason).toBe('Partial success');
  });

  it('returns null when no JSON found in content', () => {
    const content = "I couldn't evaluate this session properly.";

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for invalid verdict field', () => {
    const content = '{"verdict":"unknown","confidence":50,"reason":"test"}';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON in fenced block', () => {
    const content = '```json\n{broken json}\n```';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('handles whitespace in fenced JSON blocks', () => {
    const content = [
      'My evaluation:',
      '```json',
      '',
      '  {',
      '    "verdict": "succeeded",',
      '    "confidence": 90,',
      '    "reason": "Looks great"',
      '  }',
      '',
      '```',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('succeeded');
    expect(result!.confidence).toBe(90);
    expect(result!.reason).toBe('Looks great');
  });

  it('parses doubting verdict with confidence', () => {
    const content = JSON.stringify({
      verdict: 'doubting',
      confidence: 45,
      reason: 'Tests pass but coverage is low',
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('doubting');
    expect(result!.confidence).toBe(45);
    expect(result!.reason).toBe('Tests pass but coverage is low');
  });
});

// ── getDynamicMaxParallel ─────────────────────────────────────────────────

describe('getDynamicMaxParallel', () => {
  it('caps at configuredMax when plenty of memory available (60GB, 8GB per session, 4GB reserved)', () => {
    // 60GB available - 4GB reserved = 56GB usable, 56GB / 8GB = 7 slots → capped at configuredMax=4
    _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(4); // configuredMax wins
  });

  it('returns memory-limited slot count when less than configuredMax (32GB available, 8GB per session, 4GB reserved)', () => {
    // 32GB available - 4GB reserved = 28GB usable, 28GB / 8GB = 3 slots → 3 < configuredMax=5
    _mockMeminfoContent = 'MemAvailable:   33554432 kB\n'; // 32 GB
    const result = getDynamicMaxParallel(5, 8192, 4096);
    expect(result).toBe(3); // memory-limited
  });

  it('returns 0 when available memory is less than reserved (3GB available, 4GB reserved)', () => {
    // 3GB available - 4GB reserved = negative → clamped to 0 usable → 0 slots
    _mockMeminfoContent = 'MemAvailable:   3145728 kB\n'; // 3 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(0);
  });

  it('returns configuredMax on non-Linux (ENOENT → Infinity)', async () => {
    // Simulate non-Linux: readFileSync throws ENOENT → getAvailableMemoryMb returns Infinity
    _mockMeminfoContent = ''; // Won't be reached — mock throws instead
    const { readFileSync } = vi.mocked(await import('node:fs'));
    const saved = readFileSync.getMockImplementation();
    readFileSync.mockImplementationOnce((path: unknown) => {
      if (path === '/proc/meminfo') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw new Error('unexpected call');
    });

    const result = getDynamicMaxParallel(3, 8192, 4096);
    expect(result).toBe(3); // configuredMax returned on Infinity

    // Restore
    if (saved) readFileSync.mockImplementation(saved as Parameters<typeof readFileSync.mockImplementation>[0]);
    else readFileSync.mockRestore();
  });
});

// ── hasSystemdRunUser ─────────────────────────────────────────────────────

describe('hasSystemdRunUser', () => {
  beforeEach(() => {
    _resetSystemdRunCache();
  });

  afterEach(() => {
    _resetSystemdRunCache();
  });

  it('returns a boolean', async () => {
    const result = await hasSystemdRunUser();
    expect(typeof result).toBe('boolean');
  });

  it('caches its result after first call (returns same value on second call)', async () => {
    const first = await hasSystemdRunUser();
    const second = await hasSystemdRunUser();
    expect(first).toBe(second);
  });
});

// ── judge verdict edge cases ──────────────────────────────────────────────

describe('judge verdict edge cases', () => {
  it('parseJudgeVerdict with failed verdict returns correct shape', () => {
    const content = JSON.stringify({
      verdict: 'failed',
      confidence: 90,
      reason: 'Build error: type mismatch',
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('failed');
    expect(result!.reason).toBe('Build error: type mismatch');
  });

  it('parseJudgeVerdict with doubting verdict and low confidence returns correct shape', () => {
    const content = JSON.stringify({
      verdict: 'doubting',
      confidence: 30,
      reason: 'Incomplete implementation',
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('doubting');
    expect(result!.confidence).toBe(30);
    expect(result!.reason).toBe('Incomplete implementation');
  });
});

// ── runner dispatch wiring ─────────────────────────────────────────────────

describe('runner dispatch wiring', () => {
  it('passes queueGraceSeconds into claimNextLaunchable', async () => {
    vi.resetModules();

    const claimNextLaunchableMock = vi.fn(() => null);
    const lockReleaseMock = vi.fn().mockResolvedValue(undefined);
    const lockMock = vi.fn().mockResolvedValue(lockReleaseMock);
    const pilotDir = path.join(tmpdir(), `pilot-runner-grace-${Date.now()}`);
    mkdirSync(pilotDir, { recursive: true });
    const pilotDbPath = path.join(pilotDir, 'pilot.db');
    writeFileSync(pilotDbPath, '');

    vi.doMock('proper-lockfile', () => ({
      default: {
        lock: lockMock,
      },
    }));

    vi.doMock('../../src/core/db.js', () => ({
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markStale: vi.fn(),
      cancel: vi.fn(),
      updateDelegationPlan: vi.fn(),
      advanceStep: vi.fn(),
      getJob: vi.fn(() => null),
      updateSessionTitles: vi.fn(),
      recordStep: vi.fn(() => 1),
      completeStep: vi.fn(),
      skipRemainingSteps: vi.fn(),
      claimNextLaunchable: claimNextLaunchableMock,
      getAllRunningJobs: vi.fn(() => []),
      getRunningJobsForProject: vi.fn(() => []),
      resetToPending: vi.fn(),
      updateJudgeVerdict: vi.fn(),
      updateActualModels: vi.fn(),
      getProject: vi.fn(() => null),
      updateJobRecoveryStart: vi.fn(),
      updateJobRecoveryHead: vi.fn(),
    }));

    vi.doMock('../../src/core/config.js', () => ({
      getConfig: vi.fn(() => ({
        pilotDir,
        pilotDbPath,
        projectDir: pilotDir,
        gsdDir: pilotDir,
        maxParallel: 1,
        queueGraceSeconds: 42,
        sessionMemoryMaxMb: 8192,
        reservedMemoryMb: 4096,
        memoryKillThresholdMb: 2048,
        logLevel: 'INFO',
        noColor: false,
      })),
      resolveProjectDir: vi.fn((p: string) => p),
      getConfigFileDefaults: vi.fn(() => ({
        modelProfile: 'balanced',
        providerMode: 'claude-only',
        scope: null,
      })),
    }));

    vi.doMock('../../src/core/providers.js', () => ({
      checkProviderAvailability: vi.fn(async () => ({ available: true, warning: null })),
    }));

    vi.doMock('../../src/core/delegate.js', () => ({
      delegate: vi.fn(),
      resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
    }));
    vi.doMock('../../src/core/git-recovery.js', () => ({
      isGitWorktree: vi.fn(async () => true),
      isWorktreeDirty: vi.fn(async () => false),
      resolveCommitOrNull: vi.fn(async () => null),
    }));
    vi.doMock('../../src/core/skills.js', () => ({
      resolveSkillsForJob: vi.fn(() => []),
      injectSkills: vi.fn(() => []),
      cleanupInjectedSkills: vi.fn(),
    }));
    vi.doMock('../../src/core/callback.js', () => ({
      notifyJobCompletion: vi.fn(async () => {}),
    }));
    vi.doMock('../../src/core/opencode-db.js', () => ({
      findSessionByTitle: vi.fn(() => null),
      exportSessionFromDb: vi.fn(() => ({ messages: [] })),
      isSessionDone: vi.fn(() => false),
      getLastMessage: vi.fn(() => null),
      getSessionModels: vi.fn(() => []),
      getAssistantMessageCount: vi.fn(() => 0),
    }));
    vi.doMock('../../src/core/models.js', () => ({
      patchAgentFrontmatter: vi.fn(),
      resolveAllAgentModels: vi.fn(() => ({})),
      resolveTopLevelModel: vi.fn(() => ({ model: 'claude-sonnet-4-5' })),
    }));

    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    expect(claimNextLaunchableMock).toHaveBeenCalledWith(42);

    rmSync(pilotDir, { recursive: true, force: true });
  });
});
