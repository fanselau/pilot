/**
 * Integration test for the Dashboard component.
 *
 * Mocks ALL core/ imports to return static data (prevents real CLI calls).
 * Verifies the full layout renders with all panel titles and header.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// ── Mocks (before imports) ─────────────────────────────────────────────────

vi.mock('../../src/core/sessions.js', () => ({
  listSessions: vi.fn().mockResolvedValue([
    {
      id: 's1',
      title: 'test-project-execute-phase-1',
      updated: Date.now(),
      created: Date.now() - 3_600_000,
      message_count: 10,
    },
    {
      id: 's2',
      title: 'other-project-plan-phase-2',
      updated: Date.now() - 60_000,
      created: Date.now() - 7_200_000,
      message_count: 5,
    },
  ]),
  findSession: vi.fn(),
  exportSession: vi.fn(),
  getSessionMessageCount: vi.fn(),
  clearSessionCache: vi.fn(),
}));

vi.mock('../../src/core/queue-parser.js', () => ({
  parseQueueFile: vi.fn().mockResolvedValue([
    {
      lineNum: 1,
      project: 'queued-project',
      mode: 'continue',
      args: '',
      status: 'pending' as const,
    },
  ]),
  parseQueue: vi.fn(),
  markEntry: vi.fn(),
}));

vi.mock('../../src/core/process.js', () => ({
  scanPidFiles: vi.fn().mockResolvedValue([]),
  readPidFile: vi.fn().mockResolvedValue(null),
  isProcessAlive: vi.fn().mockReturnValue(false),
  getProcessRuntime: vi.fn().mockResolvedValue(null),
  writePidFile: vi.fn(),
  removePidFile: vi.fn(),
}));

vi.mock('../../src/core/stuck.js', () => ({
  scoreFromSignals: vi.fn().mockReturnValue({
    score: 0,
    verdict: 'healthy' as const,
    signals: [],
  }),
  getLogStaleness: vi.fn().mockResolvedValue(0),
  sampleCpu: vi.fn().mockResolvedValue([]),
  getProcessRss: vi.fn().mockResolvedValue(0),
  getSystemFreeMem: vi.fn().mockResolvedValue(8000),
  computeStuckScore: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    logDir: '/tmp',
    queueFile: '/tmp/QUEUE.md',
    stuckThreshold: 90,
    projectDir: '/home/test',
    gsdDir: '/home/test/pilot-gsd',
    noColor: false,
  }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
  ),
  stat: vi.fn().mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
  ),
}));

// ── Import Dashboard after mocks ───────────────────────────────────────────

import { Dashboard } from '../../src/tui/Dashboard.js';

// ── Helpers ────────────────────────────────────────────────────────────────

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

function renderDashboard() {
  const instance = render(<Dashboard intervalMs={60_000} />);
  cleanup = instance.unmount;
  return instance;
}

async function waitForRender(): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Dashboard', () => {
  it('renders header with "Pilot Dashboard"', async () => {
    const { lastFrame } = renderDashboard();
    await waitForRender();
    expect(lastFrame()).toContain('Pilot Dashboard');
  });

  it('renders Running panel title', async () => {
    const { lastFrame } = renderDashboard();
    await waitForRender();
    expect(lastFrame()).toContain('Running');
  });

  it('renders Queue panel title', async () => {
    const { lastFrame } = renderDashboard();
    await waitForRender();
    expect(lastFrame()).toContain('Queue');
  });

  it('renders Completed panel title', async () => {
    const { lastFrame } = renderDashboard();
    await waitForRender();
    expect(lastFrame()).toContain('Completed');
  });

  it('renders Log panel', async () => {
    const { lastFrame } = renderDashboard();
    await waitForRender();
    const frame = lastFrame()!;
    expect(frame).toMatch(/Log|select a session/);
  });
});
