import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all external dependencies ──────────────────────────────────────────

vi.mock('../../src/core/queue-store.js', () => ({
  moveItem: vi.fn(),
}));

import { moveItem } from '../../src/core/queue-store.js';
import { setJsonMode } from '../../src/util/output.js';
import { moveCommand } from '../../src/commands/move.js';

const mockedMoveItem = vi.mocked(moveItem);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('moveCommand', () => {
  let output: string;
  let stderrOutput: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stderrOutput = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderrOutput += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as typeof process.exit);
    setJsonMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    setJsonMode(false);
  });

  it('moveCommand with --next calls moveItem with next: true', async () => {
    mockedMoveItem.mockResolvedValue(undefined);

    await moveCommand('ab12', { next: true });

    expect(mockedMoveItem).toHaveBeenCalledWith('ab12', {
      next: true,
      before: undefined,
      after: undefined,
    });
    expect(output).toContain('Moved ab12 to front');
  });

  it('moveCommand with --before calls moveItem with before id', async () => {
    mockedMoveItem.mockResolvedValue(undefined);

    await moveCommand('ab12', { before: 'cd34' });

    expect(mockedMoveItem).toHaveBeenCalledWith('ab12', {
      next: undefined,
      before: 'cd34',
      after: undefined,
    });
    expect(output).toContain('Moved ab12 before cd34');
  });

  it('moveCommand with --after calls moveItem with after id', async () => {
    mockedMoveItem.mockResolvedValue(undefined);

    await moveCommand('ab12', { after: 'ef56' });

    expect(mockedMoveItem).toHaveBeenCalledWith('ab12', {
      next: undefined,
      before: undefined,
      after: 'ef56',
    });
    expect(output).toContain('Moved ab12 after ef56');
  });

  it('moveCommand without position flag exits with code 2', async () => {
    await expect(moveCommand('ab12', {})).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderrOutput).toContain('Specify --next, --before <id>, or --after <id>');
  });

  it('moveCommand with error from moveItem exits with code 1', async () => {
    mockedMoveItem.mockRejectedValue(new Error('Item not found: ab12'));

    await expect(moveCommand('ab12', { next: true })).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput).toContain('Item not found: ab12');
  });

  it('moveCommand --json outputs JSON on success', async () => {
    setJsonMode(true);
    mockedMoveItem.mockResolvedValue(undefined);

    await moveCommand('ab12', { next: true });

    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      timestamp: expect.any(String),
      action: 'move',
      id: 'ab12',
      success: true,
      position: 'next',
    });
  });

  it('moveCommand --json outputs JSON on error', async () => {
    setJsonMode(true);
    mockedMoveItem.mockRejectedValue(new Error('Cannot move running item'));

    await expect(moveCommand('ab12', { next: true })).rejects.toThrow('process.exit called');

    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      timestamp: expect.any(String),
      action: 'move',
      success: false,
      error: 'Cannot move running item',
    });
  });
});
