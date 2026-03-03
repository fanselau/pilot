/**
 * Tests for detail view header data logic.
 *
 * We test the pure helper functions exported from detail.tsx without
 * rendering any SolidJS/OpenTUI components. This validates header field
 * composition at two terminal widths (100 and 160) and edge cases for
 * parseStepInfo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// ── Mocks for SolidJS and OpenTUI (must be before imports) ────────────────

// detail.tsx imports SolidJS and @opentui/solid — mock them so vitest
// doesn't try to resolve the TUI runtime.
vi.mock('solid-js', () => ({
  createSignal: vi.fn(() => [() => null, vi.fn()]),
  createEffect: vi.fn(),
  createMemo: vi.fn(() => () => null),
  on: vi.fn((_deps: unknown, fn: unknown) => fn),
  onMount: vi.fn(),
  onCleanup: vi.fn(),
  For: vi.fn(),
  Show: vi.fn(),
}));

vi.mock('@opentui/solid', () => ({}));

vi.mock('../../src/tui/data/poller.js', () => ({
  createPoller: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../../src/tui/data/opencode-db.js', () => ({
  fetchJobParts: vi.fn(() => []),
  fetchSessionEnrichment: vi.fn(() => ({ tokens: new Map() })),
}));

vi.mock('../../src/tui/widgets/scrollable.js', () => ({
  Scrollable: vi.fn(),
}));

vi.mock('../../src/tui/components/running-panel.js', () => ({
  formatTokens: (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`,
}));

// ── Import helpers after mocks are registered ─────────────────────────────

import { parseStepInfo, formatElapsed, formatTime, buildHeaderLines, truncate } from '../../src/tui/views/detail.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'resume-roast',
    scope: 'phase',
    description: 'Execute phase 3 - AI roast generation with advanced prompt engineering',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    createdAt: '2026-03-03T10:00:00Z',
    startedAt: '2026-03-03T10:05:00Z',
    completedAt: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    delegationPlan: JSON.stringify({
      steps: [
        { command: 'plan-phase', args: '3' },
        { command: 'execute-phase', args: '3' },
        { command: 'verify-phase', args: '3' },
      ],
      reasoning: 'Standard phase cycle',
    }),
    currentStep: 1,
    sessionTitles: '["resume-roast-execute-phase-3"]',
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    ...overrides,
  };
}

const mockRunningJob: Job = makeJob();

// ── parseStepInfo tests ───────────────────────────────────────────────────

describe('parseStepInfo', () => {
  it('returns label and index for valid delegationPlan at currentStep=1', () => {
    const result = parseStepInfo(mockRunningJob);
    expect(result.label).toContain('execute-phase');
    expect(result.label).toContain('"3"');
    expect(result.index).toBe('2/3');
  });

  it('returns label and index with 5 steps at currentStep=1', () => {
    const job = makeJob({
      delegationPlan: JSON.stringify({
        steps: [
          { command: 'plan-phase', args: '3' },
          { command: 'execute-phase', args: '3' },
          { command: 'verify-phase', args: '3' },
          { command: 'plan-phase', args: '4' },
          { command: 'execute-phase', args: '4' },
        ],
        reasoning: 'Extended cycle',
      }),
      currentStep: 1,
    });
    const result = parseStepInfo(job);
    expect(result.label).toContain('execute-phase');
    expect(result.index).toBe('2/5');
  });

  it('returns dashes when delegationPlan is null', () => {
    const job = makeJob({ delegationPlan: null });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('returns dashes when delegationPlan is malformed JSON', () => {
    const job = makeJob({ delegationPlan: '{ not valid json' });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('returns dash label but valid index when currentStep is beyond bounds', () => {
    const job = makeJob({
      delegationPlan: JSON.stringify({
        steps: [
          { command: 'plan-phase', args: '3' },
          { command: 'execute-phase', args: '3' },
          { command: 'verify-phase', args: '3' },
        ],
        reasoning: 'Standard',
      }),
      currentStep: 3, // beyond the 3 steps (indices 0,1,2)
    });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('4/3');
  });

  it('truncates long args to 20 chars with ellipsis', () => {
    const job = makeJob({
      delegationPlan: JSON.stringify({
        steps: [
          { command: 'execute-phase', args: 'this is a very long argument string that exceeds 20 chars' },
        ],
        reasoning: 'test',
      }),
      currentStep: 0,
    });
    const result = parseStepInfo(job);
    // args truncated to 20 chars (19 + ellipsis)
    expect(result.label.length).toBeLessThan(
      'execute-phase "this is a very long argument string that exceeds 20 chars"'.length,
    );
  });
});

// ── formatElapsed tests ───────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('returns 0s for null startedAt', () => {
    expect(formatElapsed(null)).toBe('0s');
  });

  it('returns seconds format for short durations', () => {
    const start = new Date(Date.now() - 30_000).toISOString();
    const result = formatElapsed(start);
    expect(result).toMatch(/^\d+s$/);
  });

  it('returns minutes format for durations over 60s', () => {
    const start = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = formatElapsed(start);
    expect(result).toMatch(/^\d+m\d{2}s$/);
  });

  it('returns hours format for durations over 60m', () => {
    const start = new Date(Date.now() - 90 * 60_000).toISOString();
    const result = formatElapsed(start);
    expect(result).toMatch(/^\d+h\d{2}m$/);
  });
});

// ── formatTime tests ──────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns HH:MM:SS format string', () => {
    // Use a fixed epoch time for a deterministic check
    const result = formatTime(0); // epoch
    // Should be HH:MM:SS format (exact value depends on local TZ, but format is fixed)
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

// ── truncate tests ────────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns string unchanged when within maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when over maxLen', () => {
    const result = truncate('hello world', 8);
    expect(result).toHaveLength(8);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns string unchanged when exactly maxLen', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

// ── buildHeaderLines tests — width-sensitive header composition ────────────

describe('buildHeaderLines at narrow width (100)', () => {
  const job = mockRunningJob;
  let lines: string[];

  beforeEach(() => {
    lines = buildHeaderLines(job, 100);
  });

  it('produces at least 5 header lines', () => {
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it('line 1 contains id, project, scope, and status', () => {
    const l1 = lines[0];
    expect(l1).toContain(`#${job.id}`);
    expect(l1).toContain(job.project);
    expect(l1).toContain(job.scope);
    expect(l1).toContain(job.status);
  });

  it('line 2 contains description (possibly truncated)', () => {
    const l2 = lines[1];
    expect(l2).toContain('"');
    // The description content should start in the line
    expect(l2.length).toBeGreaterThan(2);
  });

  it('line 3 is the separator', () => {
    expect(lines[2]).toBe('separator');
  });

  it('line 4 contains elapsed, step index, and step label', () => {
    const l4 = lines[3];
    expect(l4).toContain('⏱');
    expect(l4).toContain('Step');
    expect(l4).toContain('2/3'); // currentStep=1 → 2/3
    expect(l4).toContain('execute-phase');
  });

  it('line 5 contains model, attempts, and started time', () => {
    const l5 = lines[4];
    expect(l5).toContain('Model:');
    expect(l5).toContain('balanced/hybrid');
    expect(l5).toContain('Attempts:');
    expect(l5).toContain('1/3');
    expect(l5).toContain('Started:');
  });

  it('description is truncated to fit narrow width (≤ 100 chars in description)', () => {
    // At cols=100, descWidth = max(20, 100-4) = 96
    const l2 = lines[1];
    const descContent = l2.slice(1, -1); // strip quotes
    expect(descContent.length).toBeLessThanOrEqual(96);
  });
});

describe('buildHeaderLines at wide width (160)', () => {
  const job = mockRunningJob;
  let lines: string[];

  beforeEach(() => {
    lines = buildHeaderLines(job, 160);
  });

  it('produces at least 5 header lines', () => {
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it('all required fields present: id, project, scope, status', () => {
    const l1 = lines[0];
    expect(l1).toContain(`#${job.id}`);
    expect(l1).toContain(job.project);
    expect(l1).toContain(job.scope);
    expect(l1).toContain(job.status);
  });

  it('description can show more text at wide width', () => {
    // At cols=160, descWidth = max(20, 160-4) = 156
    const l2 = lines[1];
    const descContent = l2.slice(1, -1); // strip quotes
    // The full description is 66 chars, well within 156 — no truncation needed
    expect(descContent).toBe(job.description);
  });

  it('step info present', () => {
    expect(lines[3]).toContain('Step');
    expect(lines[3]).toContain('2/3');
  });

  it('model/attempts/started present', () => {
    expect(lines[4]).toContain('Model:');
    expect(lines[4]).toContain('Attempts:');
    expect(lines[4]).toContain('Started:');
  });
});

describe('buildHeaderLines with null delegationPlan', () => {
  it('shows dash for step index and label', () => {
    const job = makeJob({ delegationPlan: null, currentStep: 0 });
    const lines = buildHeaderLines(job, 100);
    const stepLine = lines[3];
    // When delegationPlan is null, parseStepInfo returns { index: '—', label: '—' }
    expect(stepLine).toContain('Step —: —');
  });
});

describe('buildHeaderLines with null startedAt', () => {
  it('shows dash for started time', () => {
    const job = makeJob({ startedAt: null });
    const lines = buildHeaderLines(job, 100);
    const metaLine = lines[4];
    expect(metaLine).toContain('Started: —');
  });
});
