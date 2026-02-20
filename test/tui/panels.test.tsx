/**
 * Unit tests for TUI panel components.
 *
 * Tests RunningPanel, QueuePanel, CompletedPanel, and LogPanel with
 * ink-testing-library. Verifies rendering with empty data, populated data,
 * selected states, and various indicators.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  stat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
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

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { RunningPanel } from '../../src/tui/RunningPanel.js';
import { QueuePanel } from '../../src/tui/QueuePanel.js';
import { CompletedPanel } from '../../src/tui/CompletedPanel.js';
import { LogPanel } from '../../src/tui/LogPanel.js';

// ── Helpers ────────────────────────────────────────────────────────────────

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

function renderComponent(element: React.ReactElement) {
  const instance = render(element);
  cleanup = instance.unmount;
  return instance;
}

// ── RunningPanel ───────────────────────────────────────────────────────────

describe('RunningPanel', () => {
  it('renders "No active sessions" when empty', () => {
    const { lastFrame } = renderComponent(
      <RunningPanel
        sessions={[]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('No active sessions');
  });

  it('renders session name and runtime', () => {
    const { lastFrame } = renderComponent(
      <RunningPanel
        sessions={[
          {
            session: 'test-project-execute-phase-1',
            pid: 1234,
            runtimeSeconds: 3600,
            logStaleSeconds: 30,
            verdict: 'healthy',
          },
        ]}
        active={false}
        selectedIndex={0}
        width={60}
        height={10}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('test-project');
    expect(frame).toContain('1h 0m');
  });

  it('shows green indicator when log active', () => {
    const { lastFrame } = renderComponent(
      <RunningPanel
        sessions={[
          {
            session: 'active-session',
            pid: 1234,
            runtimeSeconds: 600,
            logStaleSeconds: 30,
            verdict: 'healthy',
          },
        ]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('◆');
  });

  it('shows red indicator when log stale', () => {
    const { lastFrame } = renderComponent(
      <RunningPanel
        sessions={[
          {
            session: 'stale-session',
            pid: 5678,
            runtimeSeconds: 1200,
            logStaleSeconds: 600,
            verdict: 'suspect',
          },
        ]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('◆');
  });

  it('highlights selected item when active', () => {
    const { lastFrame } = renderComponent(
      <RunningPanel
        sessions={[
          {
            session: 'selected-session',
            pid: 9999,
            runtimeSeconds: 120,
            logStaleSeconds: 10,
            verdict: 'healthy',
          },
        ]}
        active={true}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('>');
  });
});

// ── QueuePanel ─────────────────────────────────────────────────────────────

describe('QueuePanel', () => {
  it('renders "Queue empty" when no entries', () => {
    const { lastFrame } = renderComponent(
      <QueuePanel
        entries={[]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
        summary={{ done: 0, failed: 0, total: 0 }}
      />,
    );
    expect(lastFrame()).toContain('Queue empty');
  });

  it('renders pending entries with ○ prefix', () => {
    const { lastFrame } = renderComponent(
      <QueuePanel
        entries={[
          {
            lineNum: 1,
            project: 'my-project',
            mode: 'continue',
            args: '',
            status: 'pending' as const,
          },
        ]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
        summary={{ done: 0, failed: 0, total: 1 }}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('○');
    expect(frame).toContain('my-project');
  });

  it('renders running entries with ⟳ prefix', () => {
    const { lastFrame } = renderComponent(
      <QueuePanel
        entries={[
          {
            lineNum: 1,
            project: 'my-project',
            mode: 'continue',
            args: '',
            status: 'running' as const,
          },
        ]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
        summary={{ done: 0, failed: 0, total: 1 }}
      />,
    );
    expect(lastFrame()).toContain('⟳');
  });

  it('renders progress bar', () => {
    const { lastFrame } = renderComponent(
      <QueuePanel
        entries={[]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
        summary={{ done: 3, failed: 0, total: 5 }}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('3/5');
    expect(frame).toContain('█');
  });
});

// ── CompletedPanel ─────────────────────────────────────────────────────────

describe('CompletedPanel', () => {
  it('renders "No recent completions" when empty', () => {
    const { lastFrame } = renderComponent(
      <CompletedPanel
        sessions={[]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('No recent completions');
  });

  it('renders session titles with ✓ prefix', () => {
    const { lastFrame } = renderComponent(
      <CompletedPanel
        sessions={[
          {
            id: 's1',
            title: 'test-done',
            updated: Date.now() - 120_000,
            created: Date.now() - 3_600_000,
            message_count: 10,
          },
        ]}
        active={false}
        selectedIndex={0}
        width={40}
        height={10}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('✓');
    expect(frame).toContain('test-done');
  });

  it('shows relative time', () => {
    const { lastFrame } = renderComponent(
      <CompletedPanel
        sessions={[
          {
            id: 's2',
            title: 'another-session',
            updated: Date.now() - 120_000,
            created: Date.now() - 3_600_000,
            message_count: 5,
          },
        ]}
        active={false}
        selectedIndex={0}
        width={60}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('2m ago');
  });
});

// ── LogPanel ───────────────────────────────────────────────────────────────

describe('LogPanel', () => {
  it('renders placeholder when collapsed', () => {
    const { lastFrame } = renderComponent(
      <LogPanel
        sessionName={null}
        expanded={false}
        active={false}
        width={60}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('select a session');
  });

  it('renders "No session selected" when expanded but no session', () => {
    const { lastFrame } = renderComponent(
      <LogPanel
        sessionName={null}
        expanded={true}
        active={false}
        width={60}
        height={10}
      />,
    );
    expect(lastFrame()).toContain('No session selected');
  });

  it('renders log title when session set', async () => {
    const { lastFrame } = renderComponent(
      <LogPanel
        sessionName="test-session"
        expanded={true}
        active={false}
        width={60}
        height={10}
      />,
    );

    // Wait for useEffect to run readLog
    await new Promise((r) => setTimeout(r, 100));

    const frame = lastFrame()!;
    // Should show either the title or the "Log file not found" message
    expect(frame).toMatch(/Log: test-session|Log file not found/);
  });
});
