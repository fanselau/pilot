/**
 * Tests for `pilot add` command — scope detection, file/dir handling, --as override.
 *
 * Mocks: db.ts (addJob), output.ts (outputJson/outputHuman/isJsonMode),
 *        node:fs (accessSync/statSync/readFileSync).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the db module
vi.mock('../../src/core/db.js', () => ({
  addJob: vi.fn((_proj: string, _scope: string, _desc: string, _reqPath?: string) => ({
    id: 'ab12',
    project: _proj,
    scope: _scope,
    description: _desc,
    requirementPath: _reqPath ?? null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
  })),
}));

// Mock output utilities
let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  isJsonMode: () => mockJsonMode,
}));

// Mock colors to identity functions for test readability
vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
}));

import { addCommand, detectScope } from '../../src/commands/add.js';
import { addJob } from '../../src/core/db.js';
import type { JobScope } from '../../src/core/types.js';

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
});

// ── detectScope ────────────────────────────────────────────────────────────

describe('detectScope', () => {
  it('returns quick for a plain string requirement', () => {
    // A non-existent path = short string → quick
    const scope = detectScope('fix the navbar z-index');
    expect(scope).toBe('quick');
  });

  it('returns phase for an existing file path', () => {
    // Use a file that definitely exists
    const scope = detectScope('package.json');
    expect(scope).toBe('phase');
  });

  it('returns milestone for an existing directory path', () => {
    // Use a directory that definitely exists
    const scope = detectScope('src');
    expect(scope).toBe('milestone');
  });
});

// ── addCommand ─────────────────────────────────────────────────────────────

describe('addCommand', () => {
  it('queues a string requirement as quick scope', async () => {
    await addCommand('my-project', 'fix the navbar', {});

    expect(addJob).toHaveBeenCalledWith('my-project', 'quick', 'fix the navbar', undefined);
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Queued');
    expect(output).toContain('my-project');
  });

  it('--as overrides auto-detected scope', async () => {
    await addCommand('my-project', 'fix the navbar', { as: 'phase' as JobScope });

    expect(addJob).toHaveBeenCalledWith('my-project', 'phase', 'fix the navbar', undefined);
  });

  it('detects file path and uses phase scope with title extraction', async () => {
    // package.json exists and is a file; title won't be found via markdown heading
    // so it falls back to basename
    await addCommand('my-project', 'package.json', {});

    expect(addJob).toHaveBeenCalledWith(
      'my-project',
      'phase',
      expect.any(String),
      expect.stringContaining('package.json'),
    );
  });

  it('quick scope with file passes full content as description', async () => {
    // Force quick scope via --as, but provide a file that exists
    await addCommand('my-project', 'package.json', { as: 'quick' as JobScope });

    // When scope=quick and file exists, the full content is passed as description
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const description = callArgs[2];
    // Should contain actual file content (package.json has at least a name field)
    expect(description.length).toBeGreaterThan(10);
    expect(description).toContain('"name"');
  });

  it('outputs JSON when json mode is active', async () => {
    mockJsonMode = true;

    await addCommand('my-project', 'fix stuff', {});

    expect(mockOutputJson).toHaveBeenCalledWith({ job: expect.objectContaining({ id: 'ab12' }) });
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('truncates long descriptions in human output', async () => {
    const longDesc = 'a'.repeat(100);
    await addCommand('my-project', longDesc, {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('…');
  });
});
