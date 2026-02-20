import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock fns ─────────────────────────────────────────────────────

const {
  mockGetPhaseState,
  mockWritePhaseState,
  mockFindPhaseDir,
  mockCountSummaryFiles,
  mockCountNonGapPlanFiles,
  mockGetLastPhase,
  mockDetectProjectType,
  mockDetectVerifyNotApplicable,
  mockRunFileContentVerification,
  mockRunCliVerification,
} = vi.hoisted(() => ({
  mockGetPhaseState: vi.fn(),
  mockWritePhaseState: vi.fn().mockResolvedValue(undefined),
  mockFindPhaseDir: vi.fn().mockResolvedValue(null),
  mockCountSummaryFiles: vi.fn().mockResolvedValue(0),
  mockCountNonGapPlanFiles: vi.fn().mockResolvedValue(0),
  mockGetLastPhase: vi.fn().mockResolvedValue(0),
  mockDetectProjectType: vi.fn(),
  mockDetectVerifyNotApplicable: vi.fn().mockReturnValue(false),
  mockRunFileContentVerification: vi.fn(),
  mockRunCliVerification: vi.fn(),
}));

// ── Mock modules ─────────────────────────────────────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

vi.mock('../../src/core/spawn.js', () => ({
  truncateTitle: vi.fn((...args: string[]) => args.join('-')),
  getResolvedBinary: vi.fn(() => '/usr/bin/opencode'),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    logDir: '/tmp',
    projectDir: '/tmp/test-projects',
    queueFile: '/tmp/QUEUE.md',
    stuckThreshold: 90,
    gsdDir: '/tmp/gsd',
    noColor: false,
  })),
}));

vi.mock('../../src/core/phase-state.js', () => ({
  getPhaseState: mockGetPhaseState,
  writePhaseState: mockWritePhaseState,
  findPhaseDir: mockFindPhaseDir,
  getLastPhase: mockGetLastPhase,
  countSummaryFiles: mockCountSummaryFiles,
  countNonGapPlanFiles: mockCountNonGapPlanFiles,
}));

vi.mock('../../src/core/verify-routing.js', () => ({
  detectProjectType: mockDetectProjectType,
  detectVerifyNotApplicable: mockDetectVerifyNotApplicable,
}));

vi.mock('../../src/core/verify-strategies.js', () => ({
  runFileContentVerification: mockRunFileContentVerification,
  runCliVerification: mockRunCliVerification,
}));

// ── Import SUT after mocks ───────────────────────────────────────────────

import { runPhaseCycle } from '../../src/core/lifecycle.js';

// ── Helpers ──────────────────────────────────────────────────────────────

const failingVerifyResult = {
  passed: false,
  failedChecks: 2,
  totalChecks: 8,
  passedChecks: 6,
  issues: ['test failure', 'missing coverage'],
  strategy: 'file-content' as const,
  testsRan: true,
  testsPassed: false,
};

const passingVerifyResult = {
  passed: true,
  failedChecks: 0,
  totalChecks: 8,
  passedChecks: 8,
  issues: [],
  strategy: 'file-content' as const,
  testsRan: true,
  testsPassed: true,
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('lifecycle verify auto-skip', () => {
  const projectDir = '/tmp/test-projects/my-project';
  const phase = 3;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset defaults after clearAllMocks
    mockWritePhaseState.mockResolvedValue(undefined);
    mockFindPhaseDir.mockResolvedValue(null);
    // Suppress stderr output in tests
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('auto-skips verify after MAX_VERIFY_ATTEMPTS failures (file-content)', async () => {
    // Simulate: needs-verify × 3 → auto-skip → done
    // The mock ignores writePhaseState calls, so getPhaseState returns our sequence.
    mockGetPhaseState
      .mockResolvedValueOnce('needs-verify')  // iteration 1: fail, attempts=1
      .mockResolvedValueOnce('needs-verify')  // iteration 2: fail, attempts=2
      .mockResolvedValueOnce('needs-verify')  // iteration 3: fail, attempts=3 → auto-skip
      .mockResolvedValueOnce('done');          // iteration 4: exits loop

    mockDetectProjectType.mockResolvedValue('file-content');
    mockRunFileContentVerification.mockResolvedValue(failingVerifyResult);

    await runPhaseCycle(projectDir, phase);

    // runFileContentVerification called 3 times (once per needs-verify iteration)
    expect(mockRunFileContentVerification).toHaveBeenCalledTimes(3);

    // writePhaseState was called with 'verified' for the auto-skip
    const verifiedCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'verified',
    );
    expect(verifiedCalls.length).toBeGreaterThanOrEqual(1);
    expect(verifiedCalls[verifiedCalls.length - 1]).toEqual([projectDir, phase, 'verified']);
  });

  it('does not auto-skip when verify passes on first attempt', async () => {
    mockGetPhaseState
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('done');

    mockDetectProjectType.mockResolvedValue('file-content');
    mockRunFileContentVerification.mockResolvedValue(passingVerifyResult);

    await runPhaseCycle(projectDir, phase);

    // Called only once — passed on first try
    expect(mockRunFileContentVerification).toHaveBeenCalledTimes(1);

    // Normal 'verified' call (not auto-skip)
    const verifiedCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'verified',
    );
    expect(verifiedCalls).toHaveLength(1);

    // No needs-gaps calls (verify passed immediately)
    const needsGapsCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'needs-gaps',
    );
    expect(needsGapsCalls).toHaveLength(0);
  });

  it('counts verify attempts across loop iterations (cli path)', async () => {
    mockGetPhaseState
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('needs-verify')  // auto-skip on 3rd
      .mockResolvedValueOnce('done');

    mockDetectProjectType.mockResolvedValue('cli');
    mockRunCliVerification.mockResolvedValue(failingVerifyResult);

    await runPhaseCycle(projectDir, phase);

    expect(mockRunCliVerification).toHaveBeenCalledTimes(3);

    // Auto-skip triggered
    const verifiedCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'verified',
    );
    expect(verifiedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not auto-skip after fewer than 3 failures if 3rd passes', async () => {
    mockGetPhaseState
      .mockResolvedValueOnce('needs-verify')  // fail 1
      .mockResolvedValueOnce('needs-verify')  // fail 2
      .mockResolvedValueOnce('needs-verify')  // pass on 3rd try
      .mockResolvedValueOnce('done');

    mockDetectProjectType.mockResolvedValue('file-content');
    mockRunFileContentVerification
      .mockResolvedValueOnce(failingVerifyResult)
      .mockResolvedValueOnce(failingVerifyResult)
      .mockResolvedValueOnce(passingVerifyResult);  // passes on 3rd

    await runPhaseCycle(projectDir, phase);

    expect(mockRunFileContentVerification).toHaveBeenCalledTimes(3);

    // 2 needs-gaps calls from failures, then 1 verified from pass
    const needsGapsCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'needs-gaps',
    );
    expect(needsGapsCalls).toHaveLength(2);

    const verifiedCalls = mockWritePhaseState.mock.calls.filter(
      (call: unknown[]) => call[2] === 'verified',
    );
    expect(verifiedCalls).toHaveLength(1);
  });

  it('logs auto-skip message to stderr', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    mockGetPhaseState
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('needs-verify')
      .mockResolvedValueOnce('done');

    mockDetectProjectType.mockResolvedValue('file-content');
    mockRunFileContentVerification.mockResolvedValue(failingVerifyResult);

    await runPhaseCycle(projectDir, phase);

    // Check that auto-skip log message was written
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    const autoSkipMsg = stderrCalls.find((msg) =>
      msg.includes('Auto-skipping') && msg.includes('verified-manually'),
    );
    expect(autoSkipMsg).toBeDefined();
  });
});
