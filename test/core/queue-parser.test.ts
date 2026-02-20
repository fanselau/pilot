import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseQueue, parseQueueFile, markEntry } from '../../src/core/queue-parser.js';
import type { QueueEntry } from '../../src/core/types.js';

// ── Fixture path ───────────────────────────────────────────────────────────

const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'queue-v5-sample.md');

// ── parseQueue: Status detection ───────────────────────────────────────────

describe('parseQueue', () => {
  describe('status detection', () => {
    it('parses a simple pending entry', () => {
      const entries = parseQueue('## hub | continue\n');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        lineNum: 1,
        project: 'hub',
        mode: 'continue',
        args: '',
        status: 'pending',
      });
    });

    it('parses a running entry with 🔨 prefix', () => {
      const entries = parseQueue('## 🔨 resume-roast | continue-all\n');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        lineNum: 1,
        project: 'resume-roast',
        mode: 'continue-all',
        args: '',
        status: 'running',
      });
    });

    it('parses a done entry with ✅ DONE: prefix', () => {
      const entries = parseQueue('## ✅ DONE: baby-predictor | build-full | AI baby face predictor tool\n');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        lineNum: 1,
        project: 'baby-predictor',
        mode: 'build-full',
        args: 'AI baby face predictor tool',
        status: 'done',
      });
    });

    it('parses a failed entry with ❌ FAIL: prefix', () => {
      const entries = parseQueue('## ❌ FAIL: caricature | build-full | Caricature studio\n');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        lineNum: 1,
        project: 'caricature',
        mode: 'build-full',
        args: 'Caricature studio',
        status: 'failed',
      });
    });
  });

  // ── Field extraction ───────────────────────────────────────────────────

  describe('field extraction', () => {
    it('extracts project, mode, and args from pipe-delimited header', () => {
      const entries = parseQueue('## registry | add-and-build | add caching per requirements/cache.md\n');
      expect(entries[0]).toMatchObject({
        project: 'registry',
        mode: 'add-and-build',
        args: 'add caching per requirements/cache.md',
      });
    });

    it('handles empty args (only project and mode)', () => {
      const entries = parseQueue('## hub | continue\n');
      expect(entries[0]!.args).toBe('');
    });

    it('trims whitespace from all fields', () => {
      const entries = parseQueue('##   hub   |   continue   |   some args   \n');
      expect(entries[0]).toMatchObject({
        project: 'hub',
        mode: 'continue',
        args: 'some args',
      });
    });

    it('handles args with multiple pipes by joining remaining segments', () => {
      const entries = parseQueue('## proj | mode | arg1 | arg2 | arg3\n');
      expect(entries[0]).toMatchObject({
        project: 'proj',
        mode: 'mode',
        args: 'arg1 | arg2 | arg3',
      });
    });
  });

  // ── Description lines ──────────────────────────────────────────────────

  describe('description lines', () => {
    it('captures description lines after header', () => {
      const content = '## ✅ DONE: baby-predictor | build-full | AI baby face predictor tool\nCreated in 2h 15m, 10 phases complete\n';
      const entries = parseQueue(content);
      expect(entries[0]!.description).toBe('Created in 2h 15m, 10 phases complete');
    });

    it('captures multi-line description', () => {
      const content = '## proj | mode\nLine one\nLine two\n';
      const entries = parseQueue(content);
      expect(entries[0]!.description).toBe('Line one\nLine two');
    });

    it('does not include metadata lines in description', () => {
      const content = '## hub | continue\ndepends-on: registry\nSome description\n';
      const entries = parseQueue(content);
      expect(entries[0]!.description).toBe('Some description');
    });

    it('sets description to undefined when no description lines exist', () => {
      const entries = parseQueue('## hub | continue\n');
      expect(entries[0]!.description).toBeUndefined();
    });
  });

  // ── Metadata extraction ────────────────────────────────────────────────

  describe('metadata extraction', () => {
    it('extracts depends-on as string array', () => {
      const content = '## hub | continue\ndepends-on: registry\n';
      const entries = parseQueue(content);
      expect(entries[0]!.dependsOn).toEqual(['registry']);
    });

    it('extracts depends-on with multiple projects', () => {
      const content = '## hub | continue\ndepends-on: registry, auth-service\n';
      const entries = parseQueue(content);
      expect(entries[0]!.dependsOn).toEqual(['registry', 'auth-service']);
    });

    it('extracts timeout as number', () => {
      const content = '## registry | add-and-build | add caching\ntimeout: 120\n';
      const entries = parseQueue(content);
      expect(entries[0]!.timeout).toBe(120);
    });

    it('handles both depends-on and timeout together', () => {
      const content = '## hub | continue\ndepends-on: registry\ntimeout: 60\n';
      const entries = parseQueue(content);
      expect(entries[0]!.dependsOn).toEqual(['registry']);
      expect(entries[0]!.timeout).toBe(60);
    });

    it('leaves dependsOn undefined when not present', () => {
      const entries = parseQueue('## hub | continue\n');
      expect(entries[0]!.dependsOn).toBeUndefined();
    });

    it('leaves timeout undefined when not present', () => {
      const entries = parseQueue('## hub | continue\n');
      expect(entries[0]!.timeout).toBeUndefined();
    });
  });

  // ── Line numbers ───────────────────────────────────────────────────────

  describe('line numbers', () => {
    it('assigns correct 1-indexed line numbers', () => {
      const content = '## proj-a | mode-a\n\n## proj-b | mode-b\n';
      const entries = parseQueue(content);
      expect(entries[0]!.lineNum).toBe(1);
      expect(entries[1]!.lineNum).toBe(3);
    });

    it('assigns correct line numbers with description and metadata lines', () => {
      const content = '## proj-a | mode-a\nSome description\ndepends-on: x\n\n## proj-b | mode-b\n';
      const entries = parseQueue(content);
      expect(entries[0]!.lineNum).toBe(1);
      expect(entries[1]!.lineNum).toBe(5);
    });
  });

  // ── Full fixture parsing ───────────────────────────────────────────────

  describe('full fixture parsing', () => {
    it('parses the full queue-v5-sample.md fixture with 7 entries', () => {
      const content = readFileSync(FIXTURE_PATH, 'utf8');
      const entries = parseQueue(content);
      expect(entries).toHaveLength(7);
    });

    it('detects all 4 status types in fixture', () => {
      const content = readFileSync(FIXTURE_PATH, 'utf8');
      const entries = parseQueue(content);
      const statuses = new Set(entries.map((e) => e.status));
      expect(statuses).toEqual(new Set(['pending', 'running', 'done', 'failed']));
    });

    it('parses fixture entries in correct order', () => {
      const content = readFileSync(FIXTURE_PATH, 'utf8');
      const entries = parseQueue(content);
      expect(entries.map((e) => e.project)).toEqual([
        'baby-predictor',
        'resume-roast',
        'resume-roast',
        'pet-portraits',
        'hub',
        'registry',
        'caricature',
      ]);
    });

    it('extracts metadata from fixture entries', () => {
      const content = readFileSync(FIXTURE_PATH, 'utf8');
      const entries = parseQueue(content);

      // hub entry has depends-on
      const hub = entries.find((e) => e.project === 'hub' && e.status === 'pending');
      expect(hub!.dependsOn).toEqual(['registry']);

      // registry entry has timeout
      const registry = entries.find((e) => e.project === 'registry');
      expect(registry!.timeout).toBe(120);
    });

    it('captures descriptions from fixture entries', () => {
      const content = readFileSync(FIXTURE_PATH, 'utf8');
      const entries = parseQueue(content);

      // baby-predictor done entry has description
      const baby = entries.find((e) => e.project === 'baby-predictor');
      expect(baby!.description).toBe('Created in 2h 15m, 10 phases complete');

      // caricature failed entry has description
      const caricature = entries.find((e) => e.project === 'caricature');
      expect(caricature!.description).toBe('Failed: OOM after 3 retries');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(parseQueue('')).toEqual([]);
    });

    it('returns empty array for whitespace-only content', () => {
      expect(parseQueue('   \n\n   \n')).toEqual([]);
    });

    it('returns empty array for content with no ## headers', () => {
      expect(parseQueue('# Title\nSome text\nMore text\n')).toEqual([]);
    });

    it('ignores ## headers without pipe delimiter', () => {
      expect(parseQueue('## Just a heading\n')).toEqual([]);
    });

    it('handles entries without trailing newline', () => {
      const entries = parseQueue('## hub | continue');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.project).toBe('hub');
    });
  });
});

// ── parseQueueFile ─────────────────────────────────────────────────────────

describe('parseQueueFile', () => {
  it('reads and parses a file', async () => {
    const entries = await parseQueueFile(FIXTURE_PATH);
    expect(entries).toHaveLength(7);
    expect(entries[0]!.status).toBe('done');
  });

  it('rejects with error for non-existent file', async () => {
    await expect(parseQueueFile('/nonexistent/QUEUE.md')).rejects.toThrow();
  });
});

// ── markEntry ──────────────────────────────────────────────────────────────

describe('markEntry', () => {
  const tmpDir = join(import.meta.dirname, '..', 'fixtures', '.tmp-mark-test');
  const tmpFile = join(tmpDir, 'QUEUE.md');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('marks a pending entry as running', async () => {
    writeFileSync(tmpFile, '## hub | continue\n');
    await markEntry(tmpFile, 1, 'running');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## 🔨 hub | continue\n');
  });

  it('marks a pending entry as done', async () => {
    writeFileSync(tmpFile, '## hub | continue\n');
    await markEntry(tmpFile, 1, 'done');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## ✅ DONE: hub | continue\n');
  });

  it('marks a pending entry as failed', async () => {
    writeFileSync(tmpFile, '## hub | continue\n');
    await markEntry(tmpFile, 1, 'failed');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## ❌ FAIL: hub | continue\n');
  });

  it('marks a running entry as done (replaces prefix)', async () => {
    writeFileSync(tmpFile, '## 🔨 resume-roast | continue-all\n');
    await markEntry(tmpFile, 1, 'done');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## ✅ DONE: resume-roast | continue-all\n');
  });

  it('marks a running entry as failed (replaces prefix)', async () => {
    writeFileSync(tmpFile, '## 🔨 resume-roast | continue-all\n');
    await markEntry(tmpFile, 1, 'failed');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## ❌ FAIL: resume-roast | continue-all\n');
  });

  it('does not corrupt other lines', async () => {
    const content = '## proj-a | mode-a\nDescription A\n\n## proj-b | mode-b\nDescription B\n';
    writeFileSync(tmpFile, content);
    await markEntry(tmpFile, 1, 'running');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## 🔨 proj-a | mode-a\nDescription A\n\n## proj-b | mode-b\nDescription B\n');
  });

  it('marks the correct entry by line number in multi-entry file', async () => {
    const content = '## proj-a | mode-a\n\n## proj-b | mode-b\n';
    writeFileSync(tmpFile, content);
    await markEntry(tmpFile, 3, 'done');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## proj-a | mode-a\n\n## ✅ DONE: proj-b | mode-b\n');
  });

  it('handles marking entry with args', async () => {
    writeFileSync(tmpFile, '## registry | add-and-build | add caching\n');
    await markEntry(tmpFile, 1, 'running');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## 🔨 registry | add-and-build | add caching\n');
  });

  it('preserves metadata and description after marking', async () => {
    const content = '## hub | continue\ndepends-on: registry\ntimeout: 120\nSome description\n';
    writeFileSync(tmpFile, content);
    await markEntry(tmpFile, 1, 'running');
    const result = readFileSync(tmpFile, 'utf8');
    expect(result).toBe('## 🔨 hub | continue\ndepends-on: registry\ntimeout: 120\nSome description\n');
  });
});
