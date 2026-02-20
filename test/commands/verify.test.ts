import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all external dependencies ──────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/test-QUEUE.md',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/test-projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/verify-routing.js', () => ({
  resolveVerifyStrategy: vi.fn(),
}));

vi.mock('../../src/core/verify-strategies.js', () => ({
  runFileContentVerification: vi.fn(),
  runCliVerification: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { access } from 'node:fs/promises';
import { execa } from 'execa';
import { resolveVerifyStrategy } from '../../src/core/verify-routing.js';
import {
  runFileContentVerification,
  runCliVerification,
} from '../../src/core/verify-strategies.js';
import { verifyCommand } from '../../src/commands/verify.js';
import type { VerifyResult } from '../../src/core/types.js';

const mockedAccess = vi.mocked(access);
const mockedExeca = vi.mocked(execa);
const mockedResolveVerifyStrategy = vi.mocked(resolveVerifyStrategy);
const mockedRunFileContentVerification = vi.mocked(runFileContentVerification);
const mockedRunCliVerification = vi.mocked(runCliVerification);

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePassingResult(strategy: 'file-content' | 'cli'): VerifyResult {
  return {
    strategy,
    passed: true,
    totalChecks: 4,
    passedChecks: 4,
    failedChecks: 0,
    issues: [],
    testsRan: true,
    testsPassed: true,
  };
}

function makeFailingResult(strategy: 'file-content' | 'cli'): VerifyResult {
  return {
    strategy,
    passed: false,
    totalChecks: 4,
    passedChecks: 3,
    failedChecks: 1,
    issues: ['no summary files found'],
    testsRan: true,
    testsPassed: true,
  };
}

// ── Test setup ──────────────────────────────────────────────────────────────

let exitCode: number | undefined;
let stderrOutput: string;

beforeEach(() => {
  vi.clearAllMocks();
  exitCode = undefined;
  stderrOutput = '';

  // Mock access to allow project dir check
  mockedAccess.mockResolvedValue(undefined);

  // Capture stderr
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderrOutput += String(chunk);
    return true;
  });

  // Mock process.exit to capture code
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('verifyCommand', () => {
  describe('strategy routing', () => {
    it('calls runFileContentVerification for file-content strategy', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'file-content',
        reason: 'auto-detected',
      });
      mockedRunFileContentVerification.mockResolvedValue(
        makePassingResult('file-content'),
      );

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(mockedRunFileContentVerification).toHaveBeenCalledWith(
        '/tmp/test-projects/myproject',
        3,
      );
      expect(mockedRunCliVerification).not.toHaveBeenCalled();
      expect(mockedExeca).not.toHaveBeenCalled();
      expect(exitCode).toBe(0);
    });

    it('calls runCliVerification for cli strategy', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'cli',
        reason: 'auto-detected',
      });
      mockedRunCliVerification.mockResolvedValue(
        makePassingResult('cli'),
      );

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(mockedRunCliVerification).toHaveBeenCalledWith(
        '/tmp/test-projects/myproject',
        3,
      );
      expect(mockedRunFileContentVerification).not.toHaveBeenCalled();
      expect(mockedExeca).not.toHaveBeenCalled();
      expect(exitCode).toBe(0);
    });

    it('spawns gsd-verify-auto for web strategy', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'web',
        reason: 'auto-detected',
      });
      mockedExeca.mockResolvedValue({
        exitCode: 0,
      } as ReturnType<typeof execa> extends Promise<infer T> ? T : never);

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(mockedExeca).toHaveBeenCalled();
      const execaCall = mockedExeca.mock.calls[0]!;
      expect(execaCall[0]).toBe('opencode');
      expect(execaCall[1]).toEqual(
        expect.arrayContaining(['gsd-verify-auto']),
      );
      expect(mockedRunFileContentVerification).not.toHaveBeenCalled();
      expect(mockedRunCliVerification).not.toHaveBeenCalled();
      expect(exitCode).toBe(0);
    });
  });

  describe('exit codes', () => {
    it('exits 1 when file-content verification fails', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'file-content',
        reason: 'auto-detected',
      });
      mockedRunFileContentVerification.mockResolvedValue(
        makeFailingResult('file-content'),
      );

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(exitCode).toBe(1);
      expect(stderrOutput).toContain('FAIL');
    });

    it('exits 0 when file-content verification passes', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'file-content',
        reason: 'auto-detected',
      });
      mockedRunFileContentVerification.mockResolvedValue(
        makePassingResult('file-content'),
      );

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(exitCode).toBe(0);
      expect(stderrOutput).toContain('PASS');
    });
  });

  describe('stderr logging', () => {
    it('logs resolved strategy and reason', async () => {
      mockedResolveVerifyStrategy.mockResolvedValue({
        strategy: 'file-content',
        reason: 'no web or CLI signals detected',
      });
      mockedRunFileContentVerification.mockResolvedValue(
        makePassingResult('file-content'),
      );

      await expect(
        verifyCommand('myproject', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(stderrOutput).toContain('[verify] Strategy: file-content');
      expect(stderrOutput).toContain('no web or CLI signals detected');
    });
  });

  describe('project directory validation', () => {
    it('exits 1 when project directory does not exist', async () => {
      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(
        verifyCommand('nonexistent', '3', { strategy: 'auto' }),
      ).rejects.toThrow('process.exit');

      expect(exitCode).toBe(1);
      expect(stderrOutput).toContain('Project directory not found');
    });
  });
});
