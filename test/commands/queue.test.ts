import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock core modules used by queue command ─────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/queue-parser.js', () => ({
  parseQueueFile: vi.fn(),
}));

import { parseQueueFile } from '../../src/core/queue-parser.js';
import { setJsonMode } from '../../src/util/output.js';
import { queueCommand } from '../../src/commands/queue.js';
import type { QueueEntry } from '../../src/core/types.js';

const mockedParseQueueFile = vi.mocked(parseQueueFile);

describe('queueCommand', () => {
  let output: string;
  let stderrOutput: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stderrOutput = '';
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderrOutput += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  });

  it('outputs entries with correct fields in JSON mode', async () => {
    const entries: QueueEntry[] = [
      { lineNum: 1, project: 'baby-predictor', mode: 'build-full', args: 'AI baby face predictor tool', status: 'done', description: 'Created in 2h 15m, 10 phases complete' },
      { lineNum: 6, project: 'resume-roast', mode: 'continue-all', args: '', status: 'running', description: 'Running Phase 3 execute' },
      { lineNum: 12, project: 'hub', mode: 'continue', args: '', status: 'pending', dependsOn: ['registry'] },
      { lineNum: 15, project: 'registry', mode: 'add-and-build', args: 'add caching per requirements/cache.md', status: 'pending', timeout: 120 },
      { lineNum: 18, project: 'caricature', mode: 'build-full', args: 'Caricature studio', status: 'failed', description: 'Failed: OOM after 3 retries' },
    ];
    mockedParseQueueFile.mockResolvedValue(entries);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);

    // Has timestamp
    expect(typeof parsed.timestamp).toBe('string');

    // Has queue array
    expect(Array.isArray(parsed.queue)).toBe(true);
    expect(parsed.queue).toHaveLength(5);

    // Each entry has required fields
    for (const item of parsed.queue) {
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('project');
      expect(item).toHaveProperty('mode');
      expect(item).toHaveProperty('args');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('line_num');
      expect(typeof item.status).toBe('string');
      expect(typeof item.project).toBe('string');
      expect(typeof item.mode).toBe('string');
      expect(typeof item.args).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.line_num).toBe('number');
    }

    // Verify specific entries
    expect(parsed.queue[0].project).toBe('baby-predictor');
    expect(parsed.queue[0].status).toBe('done');
    expect(parsed.queue[0].line_num).toBe(1);

    expect(parsed.queue[2].project).toBe('hub');
    expect(parsed.queue[2].status).toBe('pending');
  });

  it('exits 1 with error when queue file not found', async () => {
    const enoentError = new Error('ENOENT: no such file or directory');
    (enoentError as NodeJS.ErrnoException).code = 'ENOENT';
    mockedParseQueueFile.mockRejectedValue(enoentError);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    setJsonMode(false);
    await expect(queueCommand({ json: false })).rejects.toThrow('process.exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput).toContain('Error: Queue file not found:');

    exitSpy.mockRestore();
  });

  it('includes all entries regardless of status in JSON', async () => {
    const entries: QueueEntry[] = [
      { lineNum: 1, project: 'done-proj', mode: 'build-full', args: '', status: 'done' },
      { lineNum: 5, project: 'running-proj', mode: 'continue', args: '', status: 'running' },
      { lineNum: 10, project: 'pending-proj', mode: 'continue-all', args: '', status: 'pending' },
      { lineNum: 15, project: 'failed-proj', mode: 'build-full', args: '', status: 'failed' },
    ];
    mockedParseQueueFile.mockResolvedValue(entries);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);

    // All 4 entries present
    expect(parsed.queue).toHaveLength(4);

    const statuses = parsed.queue.map((e: { status: string }) => e.status);
    expect(statuses).toContain('done');
    expect(statuses).toContain('running');
    expect(statuses).toContain('pending');
    expect(statuses).toContain('failed');
  });

  it('calculates active_count as running + pending', async () => {
    const entries: QueueEntry[] = [
      { lineNum: 1, project: 'done-proj', mode: 'build-full', args: '', status: 'done' },
      { lineNum: 5, project: 'running-1', mode: 'continue', args: '', status: 'running' },
      { lineNum: 10, project: 'running-2', mode: 'continue', args: '', status: 'running' },
      { lineNum: 15, project: 'pending-1', mode: 'continue-all', args: '', status: 'pending' },
      { lineNum: 20, project: 'failed-proj', mode: 'build-full', args: '', status: 'failed' },
    ];
    mockedParseQueueFile.mockResolvedValue(entries);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);

    // 2 running + 1 pending = 3 active
    expect(parsed.active_count).toBe(3);
  });

  it('handles empty queue file gracefully', async () => {
    mockedParseQueueFile.mockResolvedValue([]);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);

    expect(parsed.queue).toEqual([]);
    expect(parsed.active_count).toBe(0);
  });
});
