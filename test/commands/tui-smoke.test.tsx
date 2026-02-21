/**
 * TUI smoke tests — verifies the TUI module loads and renders
 * without crashing, including the App root component and empty data edge cases.
 *
 * These complement test/tui/Dashboard.test.tsx (which tests panel rendering)
 * by testing the entry-point App component and the dynamic import path
 * that `pilot tui` uses.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// ── Mocks (before imports) ─────────────────────────────────────────────────

vi.mock('../../src/core/sessions.js', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  findSession: vi.fn(),
  exportSession: vi.fn(),
  getSessionMessageCount: vi.fn(),
  clearSessionCache: vi.fn(),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  getItems: vi.fn().mockResolvedValue([]),
  getHistory: vi.fn().mockResolvedValue([]),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  markRunning: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  markQueued: vi.fn(),
  findLaunchable: vi.fn(),
  getItemById: vi.fn(),
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

// ── Import components after mocks ──────────────────────────────────────────

import { App } from '../../src/tui/App.js';
import { Dashboard } from '../../src/tui/Dashboard.js';

// ── Helpers ────────────────────────────────────────────────────────────────

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

async function waitForRender(): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TUI smoke tests', () => {
  it('App component loads and renders without crash', async () => {
    const instance = render(<App interval={60} />);
    cleanup = instance.unmount;
    await waitForRender();

    const frame = instance.lastFrame();
    expect(frame).toBeDefined();
    expect(frame!.length).toBeGreaterThan(0);
    // App wraps Dashboard which shows panel titles
    expect(frame).toContain('Pilot Dashboard');
  });

  it('Dashboard renders with empty data (no running, no queue, no completed)', async () => {
    const instance = render(<Dashboard intervalMs={60_000} />);
    cleanup = instance.unmount;
    await waitForRender();

    const frame = instance.lastFrame();
    expect(frame).toBeDefined();
    expect(frame!.length).toBeGreaterThan(0);
    // Should render all panel sections even with empty data
    expect(frame).toContain('Running');
    expect(frame).toContain('Queue');
    expect(frame).toContain('Completed');
    // Empty state messages
    expect(frame).toContain('No active sessions');
  });

  it('Dashboard renders expected panel structure', async () => {
    const instance = render(<Dashboard intervalMs={60_000} />);
    cleanup = instance.unmount;
    await waitForRender();

    const frame = instance.lastFrame()!;
    // Header present
    expect(frame).toContain('Pilot Dashboard');
    // All four panel areas present
    expect(frame).toMatch(/Running/);
    expect(frame).toMatch(/Queue/);
    expect(frame).toMatch(/Completed/);
    expect(frame).toMatch(/Log|select a session/);
  });

  it('TUI module dynamically imports without error', async () => {
    // This simulates what `pilot tui` does — dynamic import of the module
    const module = await import('../../src/tui/App.js');
    expect(module.App).toBeDefined();
    expect(typeof module.App).toBe('function');
  });
});
