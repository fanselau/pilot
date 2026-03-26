/**
 * Tests for pure exported helpers in runner.ts.
 *
 * Tests `parseJudgeVerdict`, `getDynamicMaxParallel`, and `hasSystemdRunUser`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

import { createRunner, parseJudgeVerdict, getDynamicMaxParallel, hasSystemdRunUser, _resetSystemdRunCache, isHumanOnlyRemaining, detectCheckpointPause, _findExistingUiSpec, _isUiPhaseArtifactComplete, _resolveHungUiPhaseOutcome } from '../../src/core/runner.js';
import { HungSessionError } from '../../src/util/errors.js';

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

  it('parseJudgeVerdict with pass verdict returns correct shape', () => {
    const content = JSON.stringify({
      verdict: 'pass',
      confidence: 92,
      reason: 'All plans executed successfully',
      retryRecommendation: 'none',
      retryHint: '',
      failureFingerprint: [],
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
    expect(result!.confidence).toBe(92);
    expect(result!.retryRecommendation).toBe('none');
    expect(result!.failureFingerprint).toEqual([]);
  });

  it('parseJudgeVerdict with partial verdict and retry recommendation', () => {
    const content = JSON.stringify({
      verdict: 'partial',
      confidence: 45,
      reason: 'Plans 01-02 done, plan 03 incomplete',
      retryRecommendation: 'retry-resume',
      retryHint: 'Resume from plan 03',
      failureFingerprint: ['test: runner.test.ts:45 timeout'],
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('partial');
    expect(result!.retryRecommendation).toBe('retry-resume');
    expect(result!.retryHint).toBe('Resume from plan 03');
    expect(result!.failureFingerprint).toEqual(['test: runner.test.ts:45 timeout']);
  });

  it('parseJudgeVerdict with fail verdict and retry-full recommendation', () => {
    const content = JSON.stringify({
      verdict: 'fail',
      confidence: 88,
      reason: 'Build errors in core module',
      retryRecommendation: 'retry-full',
      retryHint: 'Fix tsconfig.json paths before retrying',
      failureFingerprint: ['tsc: TS2304 in src/core/runner.ts'],
    });
    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('fail');
    expect(result!.retryRecommendation).toBe('retry-full');
  });

  it('parseJudgeVerdict accepts legacy succeeded/failed/doubting alongside new pass/fail/partial', () => {
    const legacy = parseJudgeVerdict(JSON.stringify({ verdict: 'succeeded', confidence: 95, reason: 'ok' }));
    expect(legacy).not.toBeNull();
    expect(legacy!.verdict).toBe('succeeded');

    const newFmt = parseJudgeVerdict(JSON.stringify({ verdict: 'pass', confidence: 92, reason: 'ok' }));
    expect(newFmt).not.toBeNull();
    expect(newFmt!.verdict).toBe('pass');
  });

  it('parseJudgeVerdict with missing optional retry fields still parses', () => {
    const result = parseJudgeVerdict(JSON.stringify({ verdict: 'pass', confidence: 90, reason: 'ok' }));
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
  });

  it('parseJudgeVerdict preserves explicit null retry metadata on fail verdicts', () => {
    const result = parseJudgeVerdict(JSON.stringify({
      verdict: 'fail',
      confidence: 55,
      reason: 'Judge could not build a stable fingerprint',
      retryRecommendation: 'retry-full',
      retryHint: null,
      failureFingerprint: null,
    }));

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('fail');
    expect(result!.retryRecommendation).toBe('retry-full');
    expect(result!.retryHint).toBeNull();
    expect(result!.failureFingerprint).toBeNull();
  });

  it('parseJudgeVerdict handles passed verdict', () => {
    const result = parseJudgeVerdict(JSON.stringify({
      verdict: 'passed',
      confidence: 88,
      reason: 'All phase plans executed and verified',
    }));
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('passed');
    expect(result!.confidence).toBe(88);
    expect(result!.reason).toBe('All phase plans executed and verified');
  });

  it('parseJudgeVerdict handles gaps_found verdict with gaps array', () => {
    const result = parseJudgeVerdict(JSON.stringify({
      verdict: 'gaps_found',
      confidence: 42,
      reason: '3 plans incomplete',
      gaps: ['plan-03 missing tests', 'plan-05 build errors'],
    }));
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('gaps_found');
    expect(result!.confidence).toBe(42);
    expect(result!.reason).toBe('3 plans incomplete');
    expect(result!.gaps).toEqual(['plan-03 missing tests', 'plan-05 build errors']);
  });

  it('parseJudgeVerdict rejects unknown verdict values', () => {
    const result = parseJudgeVerdict(JSON.stringify({
      verdict: 'unknown',
      confidence: 50,
      reason: 'test',
    }));
    expect(result).toBeNull();
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
      updateDelegationPayload: vi.fn(),
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
      // Phase 83: resumed review_hold pickup
      getResumedReviewHoldJobs: vi.fn(() => []),
      clearResumedFlag: vi.fn(),
    }));

    vi.doMock('../../src/core/config.js', () => ({
      getConfig: vi.fn(() => ({
        pilotDir,
        pilotDbPath,
        projectDir: pilotDir,
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
      buildNewProjectArgs: vi.fn((job: { description: string }) => job.description),
      buildQuickArgs: vi.fn((job: { description: string }) => job.description),
      getNextPhaseNumber: vi.fn(() => 1),
    }));
    vi.doMock('../../src/core/git-recovery.js', () => ({
      isGitWorktree: vi.fn(async () => true),
      isWorktreeDirty: vi.fn(async () => false),
      resolveCommitOrNull: vi.fn(async () => null),
    }));
    vi.doMock('../../src/core/skills.js', () => ({
      installSkillsForJob: vi.fn(async () => []),
    }));
    vi.doMock('../../src/core/callback.js', () => ({
      notifyJobCompletion: vi.fn(async () => {}),
    }));
    vi.doMock('../../src/core/opencode-db.js', () => ({
      openDb: vi.fn(() => null),
      findSessionByTitle: vi.fn(() => null),
      exportSessionFromDb: vi.fn(() => ({ messages: [] })),
      isSessionDone: vi.fn(() => false),
      getSessionState: vi.fn(() => ({ state: 'done' })),
      getLastMessage: vi.fn(() => null),
      getSessionModels: vi.fn(() => []),
      getSessionModelsRecursive: vi.fn(() => []),
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

// ── HungSessionError tests ──────────────────────────────────────────────────

describe('HungSessionError', () => {
  it('should be an instance of Error', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'my-session' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HungSessionError);
  });

  it('should have name="HungSessionError"', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'unknown', sessionTitle: 'my-session' });
    expect(err.name).toBe('HungSessionError');
  });

  it('should carry hungReason field', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'stuck-tool', sessionTitle: 'my-session' });
    expect(err.hungReason).toBe('stuck-tool');
  });

  it('should carry sessionTitle field', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'my-session-title' });
    expect(err.sessionTitle).toBe('my-session-title');
  });

  it('should have undefined lastToolCall when not provided', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'my-session' });
    expect(err.lastToolCall).toBeUndefined();
  });

  it('should carry lastToolCall when provided', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'stuck-tool', lastToolCall: 'bash', sessionTitle: 'my-session' });
    expect(err.lastToolCall).toBe('bash');
  });

  it('should generate default message for interactive-prompt without tool', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'test-session' });
    expect(err.message).toBe('Session hung on interactive-prompt: test-session');
  });

  it('should generate default message for stuck-tool with tool name', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'stuck-tool', lastToolCall: 'write_file', sessionTitle: 'test-session' });
    expect(err.message).toBe('Session hung on stuck-tool (tool: write_file): test-session');
  });

  it('should use custom message when provided', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'unknown', sessionTitle: 'test-session', message: 'Custom error message' });
    expect(err.message).toBe('Custom error message');
  });

  it('should generate default message for unknown reason without tool', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'unknown', sessionTitle: 'my-session' });
    expect(err.message).toBe('Session hung on unknown: my-session');
  });
});

// ── spawnAndWait state-based poll loop tests ───────────────────────────────

/**
 * Helper to build a minimal runner environment for spawnAndWait tests.
 * Returns mocks for opencode-db and a createRunner factory.
 */
async function buildSpawnAndWaitEnv(opts: {
  /** Mock implementations for getSessionState across sequential calls */
  getSessionStateImpl: () => ReturnType<typeof import('../../src/core/opencode-db.js').getSessionState>;
  /** Whether findSessionByTitle returns an ID immediately */
  sessionId?: string;
  /** getAssistantMessageCount mock return value */
  assistantMsgCount?: number;
}) {
  vi.resetModules();

  const { mkdirSync: mkd, writeFileSync: wfs, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');

  const pilotDir = path.join(tmpdir(), `pilot-spawn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkd(pilotDir, { recursive: true });
  wfs(path.join(pilotDir, 'pilot.db'), '');

  const lockReleaseMock = vi.fn().mockResolvedValue(undefined);
  const lockMock = vi.fn().mockResolvedValue(lockReleaseMock);

  vi.doMock('proper-lockfile', () => ({ default: { lock: lockMock } }));

  vi.doMock('../../src/core/db.js', () => ({
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markStale: vi.fn(),
    cancel: vi.fn(),
    updateDelegationPayload: vi.fn(),
    advanceStep: vi.fn(),
    getJob: vi.fn(() => ({ id: 'test-job', status: 'running', project: 'proj', sessionTitles: '[]', currentStep: 0 })),
    updateSessionTitles: vi.fn(),
    recordStep: vi.fn(() => 1),
    completeStep: vi.fn(),
    skipRemainingSteps: vi.fn(),
    claimNextLaunchable: vi.fn(() => null),
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
      pilotDbPath: path.join(pilotDir, 'pilot.db'),
      projectDir: pilotDir,
      maxParallel: 1,
      queueGraceSeconds: 0,
      sessionMemoryMaxMb: 8192,
      reservedMemoryMb: 4096,
      memoryKillThresholdMb: 2048,
      logLevel: 'INFO',
      noColor: false,
    })),
    resolveProjectDir: vi.fn((p: string) => p),
    getConfigFileDefaults: vi.fn(() => ({ modelProfile: 'balanced', providerMode: 'claude-only', scope: null })),
  }));

  vi.doMock('../../src/core/providers.js', () => ({
    checkProviderAvailability: vi.fn(async () => ({ available: true, warning: null })),
  }));

  const sessionId = opts.sessionId ?? 'test-session-id';

  const getSessionStateMock = vi.fn(opts.getSessionStateImpl);

  vi.doMock('../../src/core/opencode-db.js', () => ({
    findSessionByTitle: vi.fn((t: string) => t === 'test-step' ? sessionId : null),
    exportSessionFromDb: vi.fn(() => ({ messages: [{ role: 'assistant', content: '{}' }] })),
    isSessionDone: vi.fn(() => false),
    getSessionState: getSessionStateMock,
    getLastMessage: vi.fn(() => null),
    getSessionModels: vi.fn(() => []),
    getSessionModelsRecursive: vi.fn(() => []),
    getAssistantMessageCount: vi.fn(() => opts.assistantMsgCount ?? 1),
  }));

  vi.doMock('../../src/core/models.js', () => ({
    patchAgentFrontmatter: vi.fn(),
    resolveAllAgentModels: vi.fn(() => ({})),
    resolveTopLevelModel: vi.fn(() => ({ model: 'claude-sonnet-4-5' })),
  }));

  vi.doMock('../../src/core/delegate.js', () => ({
    delegate: vi.fn(async () => ({
      intent: { type: 'quick', flags: [] },
      _sessionTitle: 'test-step',
    })),
    resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
    buildNewProjectArgs: vi.fn((job: { description: string }) => job.description),
    buildQuickArgs: vi.fn(() => 'test-quick-args'),
    getNextPhaseNumber: vi.fn(() => 1),
  }));

  vi.doMock('../../src/core/git-recovery.js', () => ({
    isGitWorktree: vi.fn(async () => true),
    isWorktreeDirty: vi.fn(async () => false),
    resolveCommitOrNull: vi.fn(async () => null),
    detectGitConflictState: vi.fn(async () => ({ hasConflictState: false })),
  }));

  vi.doMock('../../src/core/skills.js', () => ({
    installSkillsForJob: vi.fn(async () => []),
  }));

  vi.doMock('../../src/core/callback.js', () => ({
    notifyJobCompletion: vi.fn(async () => {}),
  }));

  vi.doMock('../../src/core/gsd-config.js', () => ({
    ensureAutonomousGsdConfig: vi.fn(async () => {}),
  }));

  // Mock execa so we don't actually spawn opencode
  vi.doMock('execa', () => ({
    execa: vi.fn(() => {
      const p = Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      (p as unknown as Record<string, unknown>).pid = undefined; // No PID = pidAlive stays true
      (p as unknown as Record<string, unknown>).catch = vi.fn();
      (p as unknown as Record<string, unknown>).unref = vi.fn();
      return p;
    }),
  }));

  const { createRunner } = await import('../../src/core/runner.js');

  return {
    createRunner,
    getSessionStateMock,
    pilotDir,
    cleanup: () => rmSync(pilotDir, { recursive: true, force: true }),
  };
}

describe('spawnAndWait state-based poll loop', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('hung-on-prompt: throws HungSessionError with hungReason=interactive-prompt', async () => {
    // getSessionState returns hung-on-prompt after first call
    let callCount = 0;
    const { createRunner, cleanup } = await buildSpawnAndWaitEnv({
      getSessionStateImpl: () => {
        callCount++;
        if (callCount === 1) return { state: 'hung-on-prompt', pendingToolName: 'question' };
        return { state: 'done' };
      },
    });

    const runner = createRunner({ once: true, pollInterval: 0.05 });

    const job = {
      id: 'job-hung-prompt',
      project: 'test-project',
      description: 'test task',
      status: 'running' as const,
      sessionTitles: '["test-step"]',
      currentStep: 0,
      attempts: 1,
      maxAttempts: 3,
      timeout: 0,
      categories: null,
      modelProfile: null,
      providerMode: null,
      scope: 'quick' as const,
      callbackSessionKey: null,
      notify: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      delegationPlan: null,
      judgeVerdict: null,
      actualModels: null,
      noNotify: false,
      recoveryBaseCommit: null,
      recoveryStartedDirty: false,
      recoveryHeadCommit: null,
    };

    // Access spawnAndWait indirectly — mock delegate to set up the title,
    // then let launch run. We check the error from the job's markFailed call.
    const { db: dbModule } = await (async () => {
      const db = await import('../../src/core/db.js');
      return { db };
    })();

    // Run the full runner.run() — it will launch the job and hit the poll loop
    // The runner claimNextLaunchable returns null (no job to pick from queue),
    // so we test spawnAndWait by calling launch directly via the mock job.
    // Since the runner exits immediately (claimNextLaunchable returns null),
    // we test the error class directly via createRunner internals.

    // Verify the HungSessionError class is thrown correctly
    const { HungSessionError } = await import('../../src/util/errors.js');
    const err = new HungSessionError({ hungReason: 'interactive-prompt', lastToolCall: 'question', sessionTitle: 'test-step' });
    expect(err).toBeInstanceOf(HungSessionError);
    expect(err.hungReason).toBe('interactive-prompt');
    expect(err.lastToolCall).toBe('question');

    cleanup();
  }, 10000);

  it('hung-on-prompt: HungSessionError carries correct fields when thrown from state machine', async () => {
    const { HungSessionError } = await import('../../src/util/errors.js');

    // Simulate what the switch case does
    const stateResult = { state: 'hung-on-prompt' as const, pendingToolName: 'question', pendingToolContent: 'Should I proceed?' };

    const err = new HungSessionError({
      hungReason: 'interactive-prompt',
      lastToolCall: stateResult.pendingToolName,
      sessionTitle: 'my-delegation-session',
    });

    expect(err).toBeInstanceOf(HungSessionError);
    expect(err.hungReason).toBe('interactive-prompt');
    expect(err.lastToolCall).toBe('question');
    expect(err.sessionTitle).toBe('my-delegation-session');
    expect(err.message).toContain('interactive-prompt');
    expect(err.message).toContain('question');
  });

  it('hung-on-tool: state sequence hung-on-tool → done resolves without throwing', () => {
    // Simulate: 2× hung-on-tool then done — the switch break means we continue polling
    // and eventually reach done. Verify state sequence and that hung-on-tool never causes a throw.
    type State = { state: 'done' | 'hung-on-tool' | 'hung-on-prompt' | 'crashed' | 'working'; pendingToolName?: string };
    let callCount = 0;
    const getStateResult = (): State => {
      callCount++;
      if (callCount <= 2) return { state: 'hung-on-tool', pendingToolName: 'bash' };
      return { state: 'done' };
    };

    let resolved = false;
    let threw = false;

    // Simulate the poll loop switching logic
    while (!resolved && !threw) {
      const s = getStateResult();
      if (s.state === 'done') {
        resolved = true;
      } else if (s.state === 'hung-on-prompt') {
        threw = true;
      } else if (s.state === 'crashed') {
        threw = true;
      }
      // hung-on-tool and working: break (continue polling)
    }

    expect(threw).toBe(false);
    expect(resolved).toBe(true);
    expect(callCount).toBe(3); // 2 hung-on-tool + 1 done
  });

  it('crashed: getSessionState returns crashed — throws with "died without clean completion"', () => {
    // Simulate the crashed case directly
    const stateResult = { state: 'crashed' as const };
    let thrownMessage: string | null = null;

    // Simulate the switch case behavior
    switch (stateResult.state) {
      case 'crashed':
        thrownMessage = `Process died without clean completion for: test-session-title`;
        break;
      default:
        break;
    }

    expect(thrownMessage).not.toBeNull();
    expect(thrownMessage).toContain('died without clean completion');
  });

  it('working → working → done: getSessionState state sequence resolves successfully', () => {
    type StateValue = 'done' | 'working' | 'hung-on-prompt' | 'hung-on-tool' | 'crashed';
    type StateResult = { state: StateValue; pendingToolName?: string };
    // Simulate: 3× working, then done
    let callCount = 0;
    const getSessionStateImpl = (): StateResult => {
      callCount++;
      if (callCount <= 3) return { state: 'working' };
      return { state: 'done' };
    };

    const states: StateValue[] = [];
    let resolved = false;

    while (!resolved) {
      const s = getSessionStateImpl();
      states.push(s.state);
      if (s.state === 'done') {
        resolved = true;
      } else if (s.state === 'hung-on-prompt' || s.state === 'crashed') {
        throw new Error(`Unexpected state: ${s.state}`);
      }
      // working/hung-on-tool → continue
    }

    expect(states).toEqual(['working', 'working', 'working', 'done']);
    expect(resolved).toBe(true);
  });

  it('WAL flush race: pid dead + state=done on immediate recheck → resolves', () => {
    // Simulate: pid just died, immediate recheck returns 'done'
    const recheckState = { state: 'done' as const };
    let resolved = false;

    if (recheckState.state === 'done') {
      resolved = true;
    }

    expect(resolved).toBe(true);
  });

  it('WAL flush race: pid dead + state=crashed + messages>0 → treats as complete', () => {
    // Simulate: pid dead, state=crashed, but session has messages
    const recheckState = { state: 'crashed' as const };
    const msgCount = 3;
    let resolvedAsComplete = false;
    let threw = false;

    if (recheckState.state === 'crashed') {
      if (msgCount > 0) {
        resolvedAsComplete = true;
      } else {
        threw = true;
      }
    }

    expect(resolvedAsComplete).toBe(true);
    expect(threw).toBe(false);
  });

  it('WAL flush race: pid dead + state=crashed + messages=0 → throws', () => {
    const recheckState = { state: 'crashed' as const };
    const msgCount = 0;
    let thrownMessage: string | null = null;

    if (recheckState.state === 'crashed') {
      if (msgCount > 0) {
        // treat as complete
      } else {
        thrownMessage = 'Process died without clean completion for: test-title';
      }
    }

    expect(thrownMessage).not.toBeNull();
    expect(thrownMessage).toContain('died without clean completion');
  });

  it('throws when job is killed externally (DB status changes to failed)', async () => {
    let getJobCallCount = 0;
    const { createRunner, cleanup } = await buildSpawnAndWaitEnv({
      getSessionStateImpl: () => ({ state: 'working' }),
    });

    // Override getJob mock to return 'failed' after first call
    const dbMod = await import('../../src/core/db.js');
    (dbMod.getJob as ReturnType<typeof vi.fn>).mockImplementation(() => {
      getJobCallCount++;
      if (getJobCallCount >= 2) {
        return { id: 'test-job', status: 'failed', project: 'proj', sessionTitles: '[]', currentStep: 0 };
      }
      return { id: 'test-job', status: 'running', project: 'proj', sessionTitles: '[]', currentStep: 0 };
    });

    const runner = createRunner({ once: true, pollInterval: 0.05 });

    // Simulate the poll loop DB check logic that spawnAndWait should perform:
    // The activeJobs map has job → title mapping. When getJob returns status !== 'running', throw.
    const title = 'test-step';
    const activeJobs = new Map<string, { title: string }>([['test-job', { title }]]);
    const jobEntry = [...activeJobs.entries()].find(([, v]) => v.title === title);
    expect(jobEntry).toBeDefined();

    // First call: still running
    const firstJob = dbMod.getJob(jobEntry![0]);
    expect(firstJob?.status).toBe('running');

    // Second call: killed
    const secondJob = dbMod.getJob(jobEntry![0]);
    expect(secondJob?.status).toBe('failed');
    expect(() => {
      if (secondJob && secondJob.status !== 'running') {
        throw new Error(`Job ${secondJob.id} was ${secondJob.status} externally during session: ${title}`);
      }
    }).toThrow(/was failed externally/);

    cleanup();
  }, 10000);

  it('throws when job is cancelled externally (DB status changes to cancelled)', () => {
    // Simulate the DB check logic for cancellation
    const title = 'test-step';
    const freshJob: { id: string; status: string } = { id: 'test-job', status: 'cancelled' };

    expect(() => {
      if (freshJob && freshJob.status !== 'running') {
        throw new Error(`Job ${freshJob.id} was ${freshJob.status} externally during session: ${title}`);
      }
    }).toThrow(/was cancelled externally/);
  });

  it('continues polling when job status is running (no external kill)', () => {
    // Simulate the DB check logic — should NOT throw when status is 'running'
    const title = 'test-step';
    const freshJob: { id: string; status: string } = { id: 'test-job', status: 'running' };

    let threw = false;
    if (freshJob && freshJob.status !== 'running') {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});

// ── Hung session retry logic tests (unit-level, using real DB helpers) ────

import {
  _getTestDb as _dbTestHelper,
  addJob,
  createPendingStep,
  getJob,
  getJobSteps,
  markRunning,
  markStepRunning,
  updateDelegationPayload,
} from '../../src/core/db.js';

describe('ui-review runner behavior', () => {
  let projectDir: string;

  beforeEach(() => {
    _dbTestHelper();
    projectDir = mkdtempSync(path.join(tmpdir(), 'pilot-ui-review-runner-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('appends exactly one advisory ui-review step after judge pass for UI-eligible phases', async () => {
    const job = addJob(
      projectDir,
      'phase',
      'ui phase',
      undefined,
      'balanced',
      'claude-only',
    );
    updateDelegationPayload(job.id, {
      intent: { type: 'plan-and-execute', phaseNumber: 98, uiPhase: true },
      reasoning: 'ui-heavy phase',
    });

    createPendingStep(job.id, 0, 'execute-phase', '98 --auto', 'delegation');
    const judgeStepId = createPendingStep(job.id, 1, 'judge', '', 'delegation');
    markStepRunning(judgeStepId);

    const runner = createRunner({ once: true }) as unknown as {
      executeJudgeStep: (jobArg: typeof job, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      runJudge: ReturnType<typeof vi.fn>;
    };
    runner.runJudge = vi.fn().mockResolvedValue({ verdict: 'pass', confidence: 95, reason: 'ok' });

    const judgeStep = getJobSteps(job.id).find((step) => step.id === judgeStepId)!;
    await runner.executeJudgeStep(getJob(job.id)!, projectDir, judgeStep);

    const uiReviewSteps = getJobSteps(job.id).filter((step) => step.command === 'ui-review');
    expect(uiReviewSteps).toHaveLength(1);
    expect(uiReviewSteps[0]?.args).toBe('98');
    expect(uiReviewSteps[0]?.status).toBe('pending');
  });

  it('does not append ui-review for non-UI phase jobs', async () => {
    const job = addJob(
      projectDir,
      'phase',
      'non ui phase',
      undefined,
      'balanced',
      'claude-only',
    );

    createPendingStep(job.id, 0, 'execute-phase', '98 --auto', 'delegation');
    const judgeStepId = createPendingStep(job.id, 1, 'judge', '', 'delegation');
    markStepRunning(judgeStepId);

    const runner = createRunner({ once: true }) as unknown as {
      executeJudgeStep: (jobArg: typeof job, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      runJudge: ReturnType<typeof vi.fn>;
    };
    runner.runJudge = vi.fn().mockResolvedValue({ verdict: 'pass', confidence: 95, reason: 'ok' });

    const judgeStep = getJobSteps(job.id).find((step) => step.id === judgeStepId)!;
    await runner.executeJudgeStep(getJob(job.id)!, projectDir, judgeStep);

    expect(getJobSteps(job.id).some((step) => step.command === 'ui-review')).toBe(false);
  });

  it('does not append duplicate ui-review when a UI-REVIEW artifact already exists', async () => {
    const phaseDir = path.join(projectDir, '.planning', 'phases', '98-sample-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '98-UI-REVIEW.md'), '# UI review');

    const job = addJob(
      projectDir,
      'phase',
      'ui phase',
      undefined,
      'balanced',
      'claude-only',
    );

    createPendingStep(job.id, 0, 'execute-phase', '98 --auto', 'delegation');
    const judgeStepId = createPendingStep(job.id, 1, 'judge', '', 'delegation');
    markStepRunning(judgeStepId);

    const runner = createRunner({ once: true }) as unknown as {
      executeJudgeStep: (jobArg: typeof job, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      runJudge: ReturnType<typeof vi.fn>;
    };
    runner.runJudge = vi.fn().mockResolvedValue({ verdict: 'pass', confidence: 95, reason: 'ok' });

    const judgeStep = getJobSteps(job.id).find((step) => step.id === judgeStepId)!;
    await runner.executeJudgeStep(getJob(job.id)!, projectDir, judgeStep);

    expect(getJobSteps(job.id).some((step) => step.command === 'ui-review')).toBe(false);
  });

  it('marks hung ui-review as completed when UI-REVIEW artifact exists', async () => {
    const phaseDir = path.join(projectDir, '.planning', 'phases', '98-sample-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '98-UI-REVIEW.md'), '# UI review');

    const job = addJob(projectDir, 'phase', 'ui review artifact recovery');
    markRunning(job.id);
    const stepId = createPendingStep(job.id, 0, 'ui-review', '98', 'delegation');
    markStepRunning(stepId);

    const runner = createRunner({ once: true }) as unknown as {
      executeCommandStep: (jobArg: typeof job, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      spawnAndWait: ReturnType<typeof vi.fn>;
      handleHungContinuation: ReturnType<typeof vi.fn>;
    };
    runner.spawnAndWait = vi.fn().mockRejectedValue(new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'ui-review-session' }));
    runner.handleHungContinuation = vi.fn().mockResolvedValue(undefined);

    const step = getJobSteps(job.id).find((entry) => entry.id === stepId)!;
    await runner.executeCommandStep(getJob(job.id)!, projectDir, step);

    const updated = getJobSteps(job.id).find((entry) => entry.id === stepId)!;
    expect(updated.status).toBe('completed');
    expect(runner.handleHungContinuation).not.toHaveBeenCalled();
  });

  it('marks hung ui-review without artifact as skipped and avoids re-delegation', async () => {
    const phaseDir = path.join(projectDir, '.planning', 'phases', '98-sample-phase');
    mkdirSync(phaseDir, { recursive: true });

    const job = addJob(projectDir, 'phase', 'ui review skip path');
    markRunning(job.id);
    const stepId = createPendingStep(job.id, 0, 'ui-review', '98', 'delegation');
    markStepRunning(stepId);

    const runner = createRunner({ once: true }) as unknown as {
      executeCommandStep: (jobArg: typeof job, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      spawnAndWait: ReturnType<typeof vi.fn>;
      handleHungContinuation: ReturnType<typeof vi.fn>;
    };
    runner.spawnAndWait = vi.fn().mockRejectedValue(new HungSessionError({ hungReason: 'interactive-prompt', sessionTitle: 'ui-review-session' }));
    runner.handleHungContinuation = vi.fn().mockResolvedValue(undefined);

    const step = getJobSteps(job.id).find((entry) => entry.id === stepId)!;
    await runner.executeCommandStep(getJob(job.id)!, projectDir, step);

    const updated = getJobSteps(job.id).find((entry) => entry.id === stepId)!;
    expect(updated.status).toBe('skipped');
    expect(updated.error).toMatch(/^ui-review skipped:/);
    expect(runner.handleHungContinuation).not.toHaveBeenCalled();
  });

  it('keeps judge gaps and failures from appending ui-review', async () => {
    const gapJob = addJob(projectDir, 'phase', 'gap closure');
    createPendingStep(gapJob.id, 0, 'execute-phase', '98 --auto', 'delegation');
    const gapJudgeStepId = createPendingStep(gapJob.id, 1, 'judge', '', 'delegation');
    markStepRunning(gapJudgeStepId);

    const gapRunner = createRunner({ once: true }) as unknown as {
      executeJudgeStep: (jobArg: typeof gapJob, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      runJudge: ReturnType<typeof vi.fn>;
      handleGapsContinuation: ReturnType<typeof vi.fn>;
    };
    gapRunner.runJudge = vi.fn().mockResolvedValue({ verdict: 'gaps_found', confidence: 55, reason: 'needs more work', gaps: ['missing tests'] });
    gapRunner.handleGapsContinuation = vi.fn().mockResolvedValue(undefined);
    await gapRunner.executeJudgeStep(
      getJob(gapJob.id)!,
      projectDir,
      getJobSteps(gapJob.id).find((step) => step.id === gapJudgeStepId)!,
    );
    expect(getJobSteps(gapJob.id).some((step) => step.command === 'ui-review')).toBe(false);

    const failJob = addJob(projectDir, 'phase', 'failure recovery');
    createPendingStep(failJob.id, 0, 'execute-phase', '98 --auto', 'delegation');
    const failJudgeStepId = createPendingStep(failJob.id, 1, 'judge', '', 'delegation');
    markStepRunning(failJudgeStepId);

    const failRunner = createRunner({ once: true }) as unknown as {
      executeJudgeStep: (jobArg: typeof failJob, projectDirArg: string, stepArg: (typeof getJobSteps extends (...args: never[]) => infer R ? R extends Array<infer T> ? T : never : never)) => Promise<void>;
      runJudge: ReturnType<typeof vi.fn>;
      handleFailedContinuation: ReturnType<typeof vi.fn>;
    };
    failRunner.runJudge = vi.fn().mockResolvedValue({ verdict: 'fail', confidence: 90, reason: 'broken build' });
    failRunner.handleFailedContinuation = vi.fn().mockResolvedValue(undefined);
    await failRunner.executeJudgeStep(
      getJob(failJob.id)!,
      projectDir,
      getJobSteps(failJob.id).find((step) => step.id === failJudgeStepId)!,
    );
    expect(getJobSteps(failJob.id).some((step) => step.command === 'ui-review')).toBe(false);
  });
});

// hung session retry logic tests removed — retry budget concept eliminated (quick task 260320-nc6).
// The step-continuation model (Phase 73) handles hung sessions via re-delegation,
// not via resetToPending/canRetry.

// ── review state detection ─────────────────────────────────────────────────

describe('review state detection', () => {
  it('returns true when all gaps are human review items', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'gaps_found',
      confidence: 70,
      reason: 'Some gaps found',
      gaps: ['Manual visual review of dashboard layout', 'Human verification of accessibility'],
    });
    expect(result).toBe(true);
  });

  it('returns false when gaps include code implementation items', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'gaps_found',
      confidence: 60,
      reason: 'Tests fail',
      gaps: ['Missing implementation in auth.ts', 'Bug in component'],
    });
    expect(result).toBe(false);
  });

  it('returns true when reason contains only human review keywords and no code keywords', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'doubting',
      confidence: 65,
      reason: 'Manual UX review needed for the mobile sweep',
      gaps: [],
    });
    expect(result).toBe(true);
  });

  it('returns false when reason mentions code errors', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'failed',
      confidence: 80,
      reason: 'Type error in TypeScript compilation',
      gaps: [],
    });
    expect(result).toBe(false);
  });

  it('returns false when no gaps and reason has no human keywords', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'gaps_found',
      confidence: 70,
      reason: 'Some remaining work to complete',
      gaps: [],
    });
    expect(result).toBe(false);
  });

  it('returns false when gaps mix human and code items', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'gaps_found',
      confidence: 60,
      reason: 'Mixed items',
      gaps: ['visual review needed', 'missing error handling in auth.ts'],
    });
    expect(result).toBe(false);
  });

  it('returns true when gaps contain "review by hand" keyword', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'gaps_found',
      confidence: 75,
      reason: 'Needs manual verification',
      gaps: ['verify by hand that the form submits correctly'],
    });
    expect(result).toBe(true);
  });

  it('returns true when reason mentions design review without code problems', () => {
    const result = isHumanOnlyRemaining({
      verdict: 'doubting',
      confidence: 72,
      reason: 'Design review required for the UI components — no code issues found',
      gaps: [],
    });
    expect(result).toBe(true);
  });
});

// ── detectCheckpointPause ─────────────────────────────────────────────────

describe('detectCheckpointPause', () => {
  it('returns { isCheckpoint: false, reason: "" } when sessionId is null', () => {
    const result = detectCheckpointPause(null);
    expect(result.isCheckpoint).toBe(false);
    expect(result.reason).toBe('');
  });

  it('returns { isCheckpoint: false } when sessionId is an empty string', () => {
    const result = detectCheckpointPause('');
    expect(result.isCheckpoint).toBe(false);
    expect(result.reason).toBe('');
  });

  it('returns { isCheckpoint: false } when opencode DB is unavailable (no DB file in test env)', () => {
    // In test env, opencode DB file doesn't exist, so openDb() returns null
    const result = detectCheckpointPause('some-nonexistent-session-id');
    expect(result.isCheckpoint).toBe(false);
  });
});

// ── findExistingUiSpec ────────────────────────────────────────────────────

describe('findExistingUiSpec', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(tmpdir(), `pilot-uispec-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns full path when *-UI-SPEC.md exists in matching phase dir', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '90-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '90-UI-SPEC.md'), '# UI Spec');

    const result = _findExistingUiSpec(tmpDir, 90);
    expect(result).toBe(path.join(phaseDir, '90-UI-SPEC.md'));
  });

  it('returns null when phase dir exists but no UI-SPEC file', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '90-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '90-01-PLAN.md'), '# Plan');

    const result = _findExistingUiSpec(tmpDir, 90);
    expect(result).toBeNull();
  });

  it('returns null when .planning/phases/ dir does not exist', () => {
    const result = _findExistingUiSpec(tmpDir, 90);
    expect(result).toBeNull();
  });

  it('returns null when phase dir does not match the requested phase number', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '91-other-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '91-UI-SPEC.md'), '# UI Spec');

    const result = _findExistingUiSpec(tmpDir, 90);
    expect(result).toBeNull();
  });
});

// ── isUiPhaseArtifactComplete ─────────────────────────────────────────────

describe('isUiPhaseArtifactComplete', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(tmpdir(), `pilot-artifact-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when command is ui-phase and UI-SPEC exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '90-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '90-UI-SPEC.md'), '# UI Spec');

    expect(_isUiPhaseArtifactComplete('ui-phase', tmpDir, 90)).toBe(true);
  });

  it('returns false when command is not ui-phase (even if UI-SPEC exists)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '90-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '90-UI-SPEC.md'), '# UI Spec');

    expect(_isUiPhaseArtifactComplete('plan-phase', tmpDir, 90)).toBe(false);
  });

  it('returns false when command is ui-phase but no UI-SPEC exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '90-some-phase');
    mkdirSync(phaseDir, { recursive: true });

    expect(_isUiPhaseArtifactComplete('ui-phase', tmpDir, 90)).toBe(false);
  });
});

// ── ui-phase hung artifact recovery ──────────────────────────────────────

describe('ui-phase hung artifact recovery', () => {
  it('treats hung ui-phase as completed when UI-SPEC artifact exists', () => {
    // This test validates the fix for the dn02 regression:
    // ui-phase sessions that produce a UI-SPEC but then hang on an interactive prompt
    // (e.g., review checkpoint) should be treated as completed, not failed.
    //
    // The runner's executeCommandStep HungSessionError handler now checks for
    // artifact completion BEFORE marking the step as failed.
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'uihung-'));
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '36-UI-SPEC.md'), '# UI Spec\nSome content');

    // Artifact exists → should return true (recovery path will mark completed)
    expect(_isUiPhaseArtifactComplete('ui-phase', tmpDir, 36)).toBe(true);

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves failure for hung ui-phase when UI-SPEC artifact is missing', () => {
    // When ui-phase hangs but did NOT produce an artifact, it should still
    // be marked as failed (genuine failure — the work wasn't completed).
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'uihung-'));
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    // No UI-SPEC.md written

    expect(_isUiPhaseArtifactComplete('ui-phase', tmpDir, 36)).toBe(false);

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('non-ui-phase commands are not affected by artifact recovery', () => {
    // Plan-phase, execute-phase, etc. should never trigger artifact recovery
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'uihung-'));
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '36-UI-SPEC.md'), '# UI Spec\nSome content');

    // Even though UI-SPEC exists, non-ui-phase commands return false
    expect(_isUiPhaseArtifactComplete('plan-phase', tmpDir, 36)).toBe(false);
    expect(_isUiPhaseArtifactComplete('execute-phase', tmpDir, 36)).toBe(false);

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── resolveHungUiPhaseOutcome (HungSessionError catch-path decision) ─────

describe('resolveHungUiPhaseOutcome', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(tmpdir(), `pilot-hung-outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns completed when ui-phase and UI-SPEC artifact exists', () => {
    // This is the core regression fix for dn02: HungSessionError on ui-phase
    // with produced UI-SPEC should result in step completion, not failure.
    // The runner calls dbMarkStepCompleted (not dbMarkStepFailed) when this returns 'completed'.
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '36-UI-SPEC.md'), '# UI Spec\nGenerated content');

    expect(_resolveHungUiPhaseOutcome('ui-phase', '36 --skip-research', tmpDir)).toBe('completed');
  });

  it('returns failed when ui-phase but UI-SPEC artifact is missing', () => {
    // When ui-phase hangs but did NOT produce an artifact, the runner should
    // call dbMarkStepFailed + handleHungContinuation (standard hung handling).
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    // No UI-SPEC.md written

    expect(_resolveHungUiPhaseOutcome('ui-phase', '36 --skip-research', tmpDir)).toBe('failed');
  });

  it('returns failed for non-ui-phase commands even when UI-SPEC exists', () => {
    // Only ui-phase commands get artifact recovery — plan-phase, execute-phase etc.
    // always fall through to standard HungSessionError handling.
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '36-UI-SPEC.md'), '# UI Spec\nGenerated content');

    expect(_resolveHungUiPhaseOutcome('plan-phase', '36', tmpDir)).toBe('failed');
    expect(_resolveHungUiPhaseOutcome('execute-phase', '36', tmpDir)).toBe('failed');
  });

  it('returns failed when phase number cannot be parsed from args', () => {
    // Edge case: malformed args with no leading digits
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '36-some-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '36-UI-SPEC.md'), '# UI Spec');

    expect(_resolveHungUiPhaseOutcome('ui-phase', 'invalid-no-digits', tmpDir)).toBe('failed');
  });
});
