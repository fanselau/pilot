import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfig = vi.fn();
const mockGetPilotRuntimeGsdVersion = vi.fn();
const mockSetApprovedGsdVersion = vi.fn();

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock('../../src/core/managed-gsd.js', () => ({
  getPilotRuntimeGsdVersion: (...args: unknown[]) => mockGetPilotRuntimeGsdVersion(...args),
  setApprovedGsdVersion: (...args: unknown[]) => mockSetApprovedGsdVersion(...args),
}));

let mockJsonMode = false;
const mockOutputHuman = vi.fn();
const mockOutputJson = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  isJsonMode: () => mockJsonMode,
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
}));

import { gsdVersionSetCommand, gsdVersionShowCommand } from '../../src/commands/gsd-version.js';

let stderrSpy: any;
let exitSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockGetConfig.mockReturnValue({ approvedGsdVersion: '1.24.0' });
  mockGetPilotRuntimeGsdVersion.mockResolvedValue('1.24.0');
  mockSetApprovedGsdVersion.mockImplementation(async (version: string) => version);

  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
});

afterEach(() => {
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('gsdVersionShowCommand', () => {
  it('shows the approved and runtime versions in human output', async () => {
    await gsdVersionShowCommand();

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(output).toContain('approved version');
    expect(output).toContain('1.24.0');
    expect(output).toContain('runtime version');
    expect(output).toContain('Newer versions: not supported in this rollout');
  });

  it('emits machine-readable approved/runtime state in JSON mode', async () => {
    mockJsonMode = true;
    mockGetConfig.mockReturnValue({ approvedGsdVersion: '1.25.0' });
    mockGetPilotRuntimeGsdVersion.mockResolvedValue('1.24.0');

    await gsdVersionShowCommand();

    expect(mockOutputJson).toHaveBeenCalledWith({
      approvedVersion: '1.25.0',
      runtimeVersion: '1.24.0',
      discoverySupported: false,
    });
  });
});

describe('gsdVersionSetCommand', () => {
  it('persists a valid approved version and tells the operator to run pilot update', async () => {
    await gsdVersionSetCommand('1.25.0');

    expect(mockSetApprovedGsdVersion).toHaveBeenCalledWith('1.25.0');
    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(output).toContain('1.25.0');
    expect(output).toContain('Run: pilot update');
  });

  it('fails with usage output on invalid versions and does not write config', async () => {
    mockSetApprovedGsdVersion.mockRejectedValue(new Error('Approved GSD version must use exact x.y.z format, got "latest"'));

    await expect(gsdVersionSetCommand('latest')).rejects.toThrow('process.exit called');

    expect(mockSetApprovedGsdVersion).toHaveBeenCalledWith('latest');
    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('');
    expect(stderr).toContain('exact x.y.z format');
  });

  it('emits machine-readable set results in JSON mode', async () => {
    mockJsonMode = true;

    await gsdVersionSetCommand('1.25.0');

    expect(mockOutputJson).toHaveBeenCalledWith({
      approvedVersion: '1.25.0',
      updated: true,
      nextStep: 'Run: pilot update',
    });
  });
});
