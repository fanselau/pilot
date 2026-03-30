/**
 * Integration tests for the runner's debug lane (Phase 91, Plan 02).
 *
 * Tests executeDebugFlow, handleDebugOutcome, continueDebugAfterVerify,
 * intentToSteps debug case, and hung session handling through runner.run().
 *
 * Validates against the incident chain failure modes (ovm4/po5n/y6f5):
 *   - Debug jobs must never route into judge/extractPhaseNumberFromSteps
 *   - Debug jobs must never re-delegate on HungSessionError
 *   - Debug jobs must fail cleanly on interactive prompt leaks
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// ── Module-level node:fs mock ────────────────────────────────────────────────
// Intercepts /proc/meminfo (memory check in spawnAndWait).
// All other paths (judge.md, opencode.json, etc.) use the actual filesystem.

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: unknown) => {
      if (filePath === '/proc/meminfo') {
        return 'MemAvailable:   62914560 kB\n'; // 60 GB — always sufficient
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal debug job. All required Job fields populated with safe defaults. */
function makeDebugJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dbg1',
    project: 'test-project',
    scope: 'debug',
    description: 'fix the login bug',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: '[]',
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 2,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

/** Standard debug session content strings for outcome mocking. */
const SESSION_CONTENT = {
  debugComplete: `
## DEBUG COMPLETE

**Root Cause:** null check missing in login handler
**Fix Applied:** added null guard before token validation
**Verification:** all login tests pass, no regressions

**Files Changed:**
- src/auth/login.ts: null guard added

**Commit:** abc1234
`.trim(),

  rootCauseFound: `
## ROOT CAUSE FOUND

**Root Cause:** race condition in session store
**Evidence Summary:**
- Found two concurrent writes to session store
- Confirmed by adding mutex
**Files Involved:**
- src/session/store.ts: concurrent write

**Suggested Fix Direction:** Add write mutex
`.trim(),

  investigationInconclusive: `
## INVESTIGATION INCONCLUSIVE

**What Was Checked:**
- src/auth/login.ts: no issues found
- src/session/store.ts: no issues found

**Hypotheses Eliminated:**
- Race condition: not observed

**Remaining Possibilities:**
- External service issue

**Recommendation:** Manual review by senior engineer needed
`.trim(),

  checkpointHumanVerify: `
## CHECKPOINT REACHED

**Type:** human-verify
**Debug Session:** .planning/debug/fix-the-login-bug.md
**Progress:** Root cause identified, fix applied

### Checkpoint Details

**Verification needed:** confirm the fix resolves the original issue
`.trim(),

  checkpointHumanAction: `
## CHECKPOINT REACHED

**Type:** human-action
**Debug Session:** .planning/debug/fix-the-login-bug.md
**Progress:** 3 hypotheses checked

### Checkpoint Details

**Action needed:** authenticate to external service to retrieve logs
`.trim(),

  checkpointDecision: `
## CHECKPOINT REACHED

**Type:** decision
**Debug Session:** .planning/debug/fix-the-login-bug.md
**Progress:** 2 hypotheses remaining

### Checkpoint Details

**Decision needed:** which code path to investigate next
`.trim(),

  unknownContent: 'Some unstructured session output with no recognized header.',
};

// ── Environment builder ──────────────────────────────────────────────────────

interface DebugEnvOpts {
  /** Session export content per spawnAndWait call (cycling). Default: DEBUG COMPLETE */
  sessionContents?: string[];
  /** If true, getSessionState returns hung-on-prompt for the first call (triggers HungSessionError) */
  firstSpawnHung?: boolean;
  /** Job field overrides (e.g., to test scope: 'debug' with non-debug intent) */
  jobOverrides?: Record<string, unknown>;
  /** Intent type returned by delegate mock (default: 'debug') */
  intentType?: 'debug' | 'quick' | 'noop';
}

/**
 * Build a complete runner test environment for debug lane tests.
 *
 * Uses vi.resetModules() + vi.doMock() to create isolated module instances.
 * Returns mock functions and a createRunner factory.
 */
async function buildDebugEnv(opts: DebugEnvOpts = {}) {
  vi.resetModules();

  const job = makeDebugJob(opts.jobOverrides ?? {});

  // Create temp project dir with opencode.json (required by validateProjectConfig)
  const projectDir = path.join(tmpdir(), `pilot-dbg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify({ permission: 'allow' }));
  const pilotDir = path.join(projectDir, '.pilot');
  mkdirSync(pilotDir, { recursive: true });
  writeFileSync(path.join(pilotDir, 'pilot.db'), '');

  // ── DB mock ────────────────────────────────────────────────────────────────
  const mockMarkCompleted = vi.fn();
  const mockMarkFailed = vi.fn();
  const mockMarkCompletedPendingReview = vi.fn();
  const mockMarkReviewHold = vi.fn();
  const mockCreatePendingStep = vi.fn();

  let pendingStepCallCount = 0;
  const mockGetNextPendingStep = vi.fn(() => {
    pendingStepCallCount++;
    // Return mock step for first two calls (initial debug step + continuation step)
    if (pendingStepCallCount <= 2) {
      return {
        id: `step${pendingStepCallCount}`,
        stepIndex: pendingStepCallCount - 1,
        command: 'debugger',
        args: job.description,
        source: 'delegation',
      };
    }
    return null;
  });

  const mockDbMarkStepRunning = vi.fn();
  const mockDbMarkStepCompleted = vi.fn();
  const mockDbMarkStepFailed = vi.fn();
  const mockGetTotalStepCount = vi.fn(() => 1);
  const mockGetPendingStepCount = vi.fn(() => 0);
  const mockGetJob = vi.fn(() => ({ ...job, status: 'running' }));
  const mockUpdateSessionTitles = vi.fn();
  const mockUpdateJobRecoveryHead = vi.fn();
  const mockUpdateJobRecoveryStart = vi.fn();
  const mockGetJobSteps = vi.fn(() => []);
  const mockIncrementHungCount = vi.fn();

  vi.doMock('proper-lockfile', () => ({
    default: {
      lock: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    },
  }));

  vi.doMock('../../src/core/db.js', () => ({
    markCompleted: mockMarkCompleted,
    markFailed: mockMarkFailed,
    markStale: vi.fn(),
    markCompletedPendingReview: mockMarkCompletedPendingReview,
    markReviewHold: mockMarkReviewHold,
    updateDelegationPayload: vi.fn(),
    advanceStep: vi.fn(),
    getJob: mockGetJob,
    updateSessionTitles: mockUpdateSessionTitles,
    claimNextLaunchable: vi.fn()
      .mockReturnValueOnce(job)   // First call: return the test job
      .mockReturnValue(null),     // Subsequent calls: no more jobs
    getAllRunningJobs: vi.fn(() => []),
    updateJudgeVerdict: vi.fn(),
    updateActualModels: vi.fn(),
    getProject: vi.fn(() => null),
    updateJobRecoveryStart: mockUpdateJobRecoveryStart,
    updateJobRecoveryHead: mockUpdateJobRecoveryHead,
    incrementHungCount: mockIncrementHungCount,
    getJobSteps: mockGetJobSteps,
    createPendingStep: mockCreatePendingStep,
    getNextPendingStep: mockGetNextPendingStep,
    markStepRunning: mockDbMarkStepRunning,
    markStepCompleted: mockDbMarkStepCompleted,
    markStepSkipped: vi.fn(),
    markStepFailed: mockDbMarkStepFailed,
    cancelPendingSteps: vi.fn(() => 0),
    getTotalStepCount: mockGetTotalStepCount,
    getPendingStepCount: mockGetPendingStepCount,
    appendSteps: vi.fn(),
    resumeFromReviewHold: vi.fn(),
    getResumedReviewHoldJobs: vi.fn(() => []),
    clearResumedFlag: vi.fn(),
    updateJobRuntimeSkillSnapshot: vi.fn(),
    _getTestDb: vi.fn(() => null),
  }));

  // ── Delegate mock ──────────────────────────────────────────────────────────
  const mockReDelegateForContinuation = vi.fn();
  const intentType = opts.intentType ?? 'debug';

  vi.doMock('../../src/core/delegate.js', () => ({
    delegate: vi.fn().mockResolvedValue({
      intent: {
        type: intentType,
        description: job.description,
        symptoms: undefined,
        flags: [],
      },
      _sessionTitle: 'test-delegation-session',
    }),
    resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
    buildNewProjectArgs: vi.fn((j: { description: string }) => j.description),
    buildQuickArgs: vi.fn((j: { description: string }) => j.description),
    getNextPhaseNumber: vi.fn(() => 1),
    reDelegateForContinuation: mockReDelegateForContinuation,
  }));

  // ── Git/skills/callback mocks ──────────────────────────────────────────────
  vi.doMock('../../src/core/git-recovery.js', () => ({
    isGitWorktree: vi.fn(async () => true),
    isWorktreeDirty: vi.fn(async () => false),
    resolveCommitOrNull: vi.fn(async () => null),
    detectGitConflictState: vi.fn(async () => ({ hasConflictState: false })),
  }));

  vi.doMock('../../src/core/skills.js', () => ({
    installSkillsForJob: vi.fn(async () => []),
    cleanupInstalledSkills: vi.fn(),
  }));

  vi.doMock('../../src/core/runtime-agent-skills.js', () => ({
    applyRuntimeAgentSkillsPatch: vi.fn(async () => ({ configPath: '/tmp/test-config.json', snapshotPath: null, snapshot: { categories: [], selectedSkills: [], invalidSkills: [], agentSkills: {}, mergePolicy: 'append-user-then-pilot', applied: false, restoreStatus: 'skipped', restoreError: null }, applied: false, previousAgentSkills: null, hadAgentSkillsKey: false })),
    restoreRuntimeAgentSkillsPatch: vi.fn(async () => ({ categories: [], selectedSkills: [], invalidSkills: [], agentSkills: {}, mergePolicy: 'append-user-then-pilot', applied: false, restoreStatus: 'skipped', restoreError: null })),
  }));

  vi.doMock('../../src/core/callback.js', () => ({
    notifyJobCompletion: vi.fn(async () => {}),
  }));

  vi.doMock('../../src/core/gsd-config.js', () => ({
    ensureAutonomousGsdConfig: vi.fn(async () => {}),
  }));

  // ── Config mock ────────────────────────────────────────────────────────────
  vi.doMock('../../src/core/config.js', () => ({
    getConfig: vi.fn(() => ({
      pilotDir,
      pilotDbPath: path.join(pilotDir, 'pilot.db'),
      projectDir,
      maxParallel: 1,
      queueGraceSeconds: 0,
      sessionMemoryMaxMb: 8192,
      reservedMemoryMb: 4096,
      memoryKillThresholdMb: 2048,
      logLevel: 'INFO',
      noColor: false,
      defaultNotifySessionKey: null,
      telegramBotToken: null,
      telegramChatId: null,
      openclawHooksUrl: null,
      openclawHooksToken: null,
    })),
    resolveProjectDir: vi.fn(() => projectDir),
    getConfigFileDefaults: vi.fn(() => ({
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      scope: null,
    })),
  }));

  vi.doMock('../../src/core/providers.js', () => ({
    checkProviderAvailability: vi.fn(async () => ({ available: true, warning: null })),
  }));

  const mockResolveTopLevelModel = vi.fn(() => ({ model: 'anthropic/claude-sonnet-4-5' }));

  vi.doMock('../../src/core/models.js', () => ({
    patchAgentFrontmatter: vi.fn(),
    resolveAllAgentModels: vi.fn(() => ({})),
    resolveTopLevelModel: mockResolveTopLevelModel,
  }));

  // ── opencode-db mock ───────────────────────────────────────────────────────
  const sessionContents = opts.sessionContents ?? [SESSION_CONTENT.debugComplete];
  let exportCallCount = 0;

  // For hung session test: getSessionState returns hung-on-prompt on first call
  let sessionStateCallCount = 0;
  const mockGetSessionState = vi.fn(() => {
    sessionStateCallCount++;
    if (opts.firstSpawnHung && sessionStateCallCount === 1) {
      return { state: 'hung-on-prompt' as const, pendingToolName: 'question' };
    }
    return { state: 'done' as const };
  });

  const mockFindSessionByTitle = vi.fn(() => 'test-session-id');
  const mockExportSessionFromDb = vi.fn(() => {
    const content = sessionContents[exportCallCount % sessionContents.length];
    exportCallCount++;
    return { messages: [{ role: 'assistant', content }] };
  });

  vi.doMock('../../src/core/opencode-db.js', () => ({
    openDb: vi.fn(() => null),
    findSessionByTitle: mockFindSessionByTitle,
    exportSessionFromDb: mockExportSessionFromDb,
    getLastMessage: vi.fn(() => null),
    getSessionState: mockGetSessionState,
    getSessionModels: vi.fn(() => []),
    getSessionModelsRecursive: vi.fn(() => []),
    getAssistantMessageCount: vi.fn(() => 1),
  }));

  // ── execa mock ─────────────────────────────────────────────────────────────
  // Return a promise-like object with pid = undefined (keeps pidAlive = true,
  // avoids WAL flush race code path, simplifies poll loop).
  const mockExecaFn = vi.fn(() => {
    const p = Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    (p as unknown as Record<string, unknown>).pid = undefined;
    (p as unknown as Record<string, unknown>).catch = vi.fn();
    (p as unknown as Record<string, unknown>).unref = vi.fn();
    return p;
  });

  vi.doMock('execa', () => ({ execa: mockExecaFn }));

  // ── Import runner after all mocks are in place ─────────────────────────────
  const { createRunner } = await import('../../src/core/runner.js');

  return {
    createRunner,
    projectDir,
    job,
    mockMarkCompleted,
    mockMarkFailed,
    mockMarkCompletedPendingReview,
    mockMarkReviewHold,
    mockCreatePendingStep,
    mockReDelegateForContinuation,
    mockExecaFn,
    mockGetNextPendingStep,
    mockDbMarkStepCompleted,
    mockDbMarkStepFailed,
    mockResolveTopLevelModel,
    cleanup: () => {
      try {
        rmSync(projectDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Runner Debug Lane', () => {

  afterEach(() => {
    vi.resetModules();
  });

  // ── intentToSteps — debug case ──────────────────────────────────────────────

  describe('intentToSteps — debug case', () => {
    it('returns empty array for debug intent (no debug command step)', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // intentToSteps('debug') returns [] — so no createPendingStep calls from the
      // intent-to-steps loop. Only one call expected: from executeDebugFlow with 'debugger'.
      const calls = env.mockCreatePendingStep.mock.calls as unknown[][];
      const commands = calls.map(c => c[2] as string); // 3rd arg is command
      expect(commands).not.toContain('debug');
      expect(commands).toContain('debugger');

      env.cleanup();
    }, 10000);

    it('does NOT return command: debug (old gsd-debug routing)', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // Old routing would create a step with command='debug' via intentToSteps.
      // New routing: intentToSteps returns [] and executeDebugFlow is called directly.
      const debugCommandCalls = (env.mockCreatePendingStep.mock.calls as unknown[][]).filter(c => c[2] === 'debug');
      expect(debugCommandCalls).toHaveLength(0);

      env.cleanup();
    }, 10000);
  });

  // ── executeDebugFlow ─────────────────────────────────────────────────────────

  describe('executeDebugFlow', () => {
    it('creates debugger step record for observability', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // executeDebugFlow calls createPendingStep with command='debugger'
      expect(env.mockCreatePendingStep).toHaveBeenCalledWith(
        env.job.id,
        0,
        'debugger',
        env.job.description,
        'delegation',
        'direct gsd-debugger spawn',
      );

      env.cleanup();
    }, 10000);

    it('spawns session with inline prompt containing symptoms_prefilled', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // spawnAndWait called with inlinePrompt — opencode gets 'run' + the inline prompt string
      // (not '--command gsd-debugger')
      const execaCalls = env.mockExecaFn.mock.calls as unknown[][];
      const opencodeCalls = execaCalls.filter(call => {
        const args = call[1] as string[] | undefined;
        return args && args.includes('run');
      });

      // At least one opencode spawn with inline prompt (contains 'symptoms_prefilled')
      const hasInlinePrompt = opencodeCalls.some(call => {
        const args = call[1] as string[] | undefined;
        return args && args.some(a => typeof a === 'string' && a.includes('symptoms_prefilled'));
      });
      expect(hasInlinePrompt).toBe(true);

      // Verify it does NOT use --command flag for the debug session
      const hasCommandFlag = opencodeCalls.some(call => {
        const args = call[1] as string[] | undefined;
        return args && args.includes('--command') && args.some(a => a.includes('gsd-debugger'));
      });
      expect(hasCommandFlag).toBe(false);

      env.cleanup();
    }, 10000);

    it('handles DEBUG COMPLETE → markCompleted', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.debugComplete],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      expect(env.mockMarkCompleted).toHaveBeenCalledWith(env.job.id);
      expect(env.mockMarkFailed).not.toHaveBeenCalled();
      expect(env.mockMarkCompletedPendingReview).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles ROOT CAUSE FOUND → markCompletedPendingReview', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.rootCauseFound],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      expect(env.mockMarkCompletedPendingReview).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('Root cause'),
      );
      expect(env.mockMarkCompleted).not.toHaveBeenCalled();
      expect(env.mockMarkFailed).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles INVESTIGATION INCONCLUSIVE → markFailed', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.investigationInconclusive],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      expect(env.mockMarkFailed).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('inconclusive'),
      );
      expect(env.mockMarkCompleted).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles CHECKPOINT human-verify → autonomous continuation (two spawns, final markCompleted)', async () => {
      const env = await buildDebugEnv({
        sessionContents: [
          SESSION_CONTENT.checkpointHumanVerify, // First session: checkpoint
          SESSION_CONTENT.debugComplete,         // Continuation session: complete
        ],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // Initial step + continuation step both created
      expect(env.mockCreatePendingStep).toHaveBeenCalledTimes(2);
      const commands = env.mockCreatePendingStep.mock.calls.map(c => c[2]);
      expect(commands).toContain('debugger');
      expect(commands).toContain('debugger-continue');

      // Final outcome: markCompleted (continuation returned DEBUG COMPLETE)
      expect(env.mockMarkCompleted).toHaveBeenCalledWith(env.job.id);
      expect(env.mockMarkFailed).not.toHaveBeenCalled();
      expect(env.mockMarkReviewHold).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles CHECKPOINT human-action → markReviewHold (not markFailed)', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.checkpointHumanAction],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      expect(env.mockMarkReviewHold).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('human-action'),
      );
      expect(env.mockMarkFailed).not.toHaveBeenCalled();
      expect(env.mockMarkCompleted).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles CHECKPOINT decision → markReviewHold', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.checkpointDecision],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      expect(env.mockMarkReviewHold).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('decision'),
      );
      expect(env.mockMarkFailed).not.toHaveBeenCalled();
      expect(env.mockMarkCompleted).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handles unknown outcome → markCompleted (treat as success)', async () => {
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.unknownContent],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // Unknown outcome: session completed without structured output → treat as success
      expect(env.mockMarkCompleted).toHaveBeenCalledWith(env.job.id);
      expect(env.mockMarkFailed).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);
  });

  // ── Hung session handling ────────────────────────────────────────────────────

  describe('hung session handling', () => {
    it('HungSessionError marks failed with diagnostic, no re-delegation', async () => {
      const env = await buildDebugEnv({ firstSpawnHung: true });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // HungSessionError caught in executeDebugFlow → markFailed with explicit message
      expect(env.mockMarkFailed).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('interactive prompt'),
      );

      // reDelegateForContinuation must NOT be called for debug jobs
      expect(env.mockReDelegateForContinuation).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('handleHungContinuation returns early for debug scope (safety guard)', async () => {
      // This tests the guard in handleHungContinuation for debug-scoped jobs
      // that somehow end up in executeCommandStep (edge case safety net).
      // We simulate by giving a debug-scoped job a 'quick' intent (bypasses executeDebugFlow),
      // then making the quick step hang.
      const env = await buildDebugEnv({
        jobOverrides: { scope: 'debug' },
        intentType: 'quick',     // Non-debug intent → goes through step loop
        firstSpawnHung: true,    // Quick step hangs → HungSessionError in executeCommandStep
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // handleHungContinuation with job.scope === 'debug' must markFailed with "do not re-delegate"
      expect(env.mockMarkFailed).toHaveBeenCalledWith(
        env.job.id,
        expect.stringMatching(/Debug session hung.*do not re-delegate/),
      );

      // Safety guard: reDelegateForContinuation must NOT be called
      expect(env.mockReDelegateForContinuation).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);
  });

  // ── Debug jobs never touch judge ──────────────────────────────────────────

  describe('debug jobs never touch judge', () => {
    it('no step with command judge is created for debug intent', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // createPendingStep must never be called with 'judge'
      const judgeCalls = (env.mockCreatePendingStep.mock.calls as unknown[][]).filter(c => c[2] === 'judge');
      expect(judgeCalls).toHaveLength(0);

      env.cleanup();
    }, 10000);

    it('executeJudgeStep is never called for debug intent (no gsd-judge command)', async () => {
      const env = await buildDebugEnv();
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // If executeJudgeStep were called, it would spawn opencode with --command gsd-judge.
      // Verify no execa call has '--command' followed by 'gsd-judge'.
      const execaCalls = env.mockExecaFn.mock.calls as unknown[][];
      const hasJudgeCommand = execaCalls.some(call => {
        const args = call[1] as string[] | undefined;
        if (!args) return false;
        const cmdIdx = args.indexOf('--command');
        return cmdIdx >= 0 && args[cmdIdx + 1] === 'gsd-judge';
      });
      expect(hasJudgeCommand).toBe(false);

      env.cleanup();
    }, 10000);
  });

  // ── Debug scope model selection (not judge) ───────────────────────────────

  describe('debug scope model selection', () => {
    it('debug sessions resolve debug scope for model selection (not judge)', async () => {
      // Regression test for: spawnAndWait hardcoded scope='judge' for all inline-prompt
      // sessions. Debug sessions use inline prompts and should resolve to 'debug' scope
      // (which maps to _top:quick in resolveTopLevelModel), not 'judge' scope.
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.debugComplete],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // Inspect all scope arguments passed to resolveTopLevelModel
      const scopeCalls = (env.mockResolveTopLevelModel.mock.calls as unknown[][]).map(
        c => c[0] as string,
      );

      // Debug session spawn must use 'debug' scope (fixed behavior)
      expect(scopeCalls).toContain('debug');

      // Judge scope must NOT be used for this debug-only session
      // (Before the fix, inlinePrompt !== undefined forced scope='judge' for ALL inline sessions)
      expect(scopeCalls).not.toContain('judge');

      env.cleanup();
    }, 10000);
  });

  // ── Incident chain validation (ovm4/po5n/y6f5) ───────────────────────────

  describe('incident chain validation (ovm4/po5n/y6f5)', () => {
    it('debug job does not hang on interactive question prompt — fails cleanly', async () => {
      // Incident ovm4/po5n/y6f5: gsd-debugger tried to use an interactive tool.
      // The runner must detect this (HungSessionError) and fail cleanly with a clear reason.
      const env = await buildDebugEnv({ firstSpawnHung: true });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // Must fail with explicit reason (use toHaveBeenCalledWith for type-safe assertion)
      expect(env.mockMarkFailed).toHaveBeenCalledWith(
        env.job.id,
        expect.stringContaining('interactive prompt'),
      );

      // Must NOT have attempted phase routing (no judge, no re-delegation)
      expect(env.mockReDelegateForContinuation).not.toHaveBeenCalled();

      env.cleanup();
    }, 10000);

    it('debug job does not fail with unknown phase number — no extractPhaseNumberFromSteps', async () => {
      // Incident: debug jobs were failing because judge step couldn't extract
      // phase number (no plan-phase/execute-phase steps exist for debug jobs).
      // Verify: no judge step exists, so extractPhaseNumberFromSteps is never needed.
      const env = await buildDebugEnv({
        sessionContents: [SESSION_CONTENT.debugComplete],
      });
      const runner = env.createRunner({ once: true, pollInterval: 0.01 });
      await runner.run();

      // No judge step: all steps are 'debugger' commands
      const allStepCommands = (env.mockCreatePendingStep.mock.calls as unknown[][]).map(c => c[2] as string);
      expect(allStepCommands.every(cmd => cmd.startsWith('debugger'))).toBe(true);

      // Job completed without needing phase number
      expect(env.mockMarkCompleted).toHaveBeenCalledWith(env.job.id);

      env.cleanup();
    }, 10000);
  });
});
