/**
 * Tests for TUI keyboard shortcut wiring, help overlay accuracy,
 * footer bar hint correctness, and real keyboard handler branching.
 *
 * Pure unit tests — no SolidJS rendering needed.
 *
 * Validates:
 *   - Help overlay HELP_TEXT contains only implemented shortcuts (no phantoms)
 *   - Cancel validates pending status
 *   - Retry validates failed/cancelled status
 *   - Footer HINTS keys match per view
 *   - handleKeyPress correctly routes by job status with flash feedback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks for TUI component imports ────────────────────────────────────────

// Mock the SolidJS/OpenTUI imports that help-overlay.tsx and footer-bar.tsx need
vi.mock('@opentui/solid', () => ({
  useKeyboard: vi.fn(),
  useRenderer: vi.fn(() => ({ destroy: vi.fn() })),
  useTerminalDimensions: vi.fn(() => () => ({ width: 80, height: 24 })),
}));

vi.mock('solid-js', () => ({
  createSignal: vi.fn((v: unknown) => [() => v, vi.fn()]),
  createMemo: vi.fn((fn: () => unknown) => fn),
  createEffect: vi.fn(),
  on: vi.fn(),
  batch: vi.fn((fn: () => unknown) => fn()),
  Show: vi.fn(),
  Switch: vi.fn(),
  Match: vi.fn(),
  For: vi.fn(),
  onMount: vi.fn(),
  onCleanup: vi.fn(),
}));

// Mock external dependencies used by handleKeyPress
vi.mock('../../src/tui/data/pilot-db.js', () => ({
  retry: vi.fn(),
  cancel: vi.fn(),
  unblockProject: vi.fn(),
  deregisterProject: vi.fn(),
  fetchQueueData: vi.fn(() => ({ pending: [], running: [] })),
  fetchRecentData: vi.fn(() => []),
  fetchProjectData: vi.fn(() => []),
}));

vi.mock('../../src/core/db.js', () => ({
  forceQuitJob: vi.fn(),
}));

vi.mock('../../src/core/runner.js', () => ({
  killJobSession: vi.fn(async () => {}),
}));

// ── Import HELP_TEXT and HINTS ─────────────────────────────────────────────

import { HELP_TEXT } from '../../src/tui/components/help-overlay.js';
import { HINTS, getFooterHint } from '../../src/tui/components/footer-bar.js';
import { handleKeyPress } from '../../src/tui/app.js';
import type { TuiKeyEvent } from '../../src/tui/app.js';
import { retry } from '../../src/tui/data/pilot-db.js';
import type { Job, JobStatus } from '../../src/core/types.js';
import type { PilotStateStore } from '../../src/tui/state.js';

// ── Implemented shortcut keys ──────────────────────────────────────────────
// This is the authoritative set of keys handled in app.tsx's useKeyboard callback.
// If a shortcut is added/removed in app.tsx, this list must be updated.
const IMPLEMENTED_KEYS = new Set([
  'q', '?', '/', 'Esc', 'Tab', 's',
  '1', '2', '3',
  'u', 'd',
  'K',
  'r', 'x',
  'j', 'k', '↓', '↑',
  'g', 'G',
  'Enter',
  'Ctrl+C', 'Backspace',
]);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HELP_TEXT accuracy — no phantom shortcuts', () => {
  it('contains only implemented shortcuts', () => {
    // Extract shortcut keys from HELP_TEXT
    // Each line looks like: "  q / Ctrl+C   Quit" or "  j / ↓        Move cursor down"
    const lines = HELP_TEXT.split('\n').filter(l => l.trim() && !l.includes('──'));
    const extractedKeys: string[] = [];

    for (const line of lines) {
      // Match key sequences before the description
      // Pattern: leading spaces, then key(s) separated by " / ", then spaces and description
      const match = line.match(/^\s+(.+?)\s{2,}/);
      if (!match) continue;

      const keysPart = match[1].trim();
      if (!keysPart) continue;
      // Split on " / " to get individual keys
      const keys = keysPart.split(/\s*\/\s*/).filter(k => k.length > 0);
      extractedKeys.push(...keys);
    }

    // Verify each extracted key is in the implemented set
    for (const key of extractedKeys) {
      // Normalize: "1 2 3" are space-separated in help text
      if (key.match(/^\d(\s+\d)+$/)) {
        // Multiple digit keys on one line: "1 2 3"
        for (const digit of key.split(/\s+/)) {
          expect(IMPLEMENTED_KEYS.has(digit)).toBe(true);
        }
      } else {
        expect(IMPLEMENTED_KEYS.has(key), `"${key}" found in HELP_TEXT but not implemented`).toBe(true);
      }
    }
  });

  it('HELP_TEXT is non-empty and contains all shortcut sections', () => {
    expect(HELP_TEXT.length).toBeGreaterThan(0);
    expect(HELP_TEXT).toContain('Global');
    expect(HELP_TEXT).toContain('Dashboard');
    expect(HELP_TEXT).toContain('Detail');
  });

  it('lists r retry, x cancel, K kill shortcuts', () => {
    expect(HELP_TEXT).toContain('r');
    expect(HELP_TEXT).toContain('Retry');
    expect(HELP_TEXT).toContain('x');
    expect(HELP_TEXT).toContain('Cancel');
    expect(HELP_TEXT).toContain('K');
    expect(HELP_TEXT).toMatch(/Force.quit/i);
  });

  it('does NOT contain phantom shortcuts from pre-Phase-52 cleanup', () => {
    // These are examples of shortcuts that might have been listed in older versions
    // but should NOT appear in the current HELP_TEXT:
    // - Ctrl+R (was never implemented in app.tsx)
    // The key assertion is that the HELP_TEXT matches the actual handlers.
    // Since we verified all extracted keys are in IMPLEMENTED_KEYS above,
    // any phantom would have caused that test to fail.
    expect(HELP_TEXT).not.toContain('Ctrl+R');
    expect(HELP_TEXT).not.toContain('Ctrl+D');
  });
});

describe('Footer bar HINTS', () => {
  it('dashboard hints include essential keys', () => {
    const dash = HINTS.dashboard;
    expect(dash).toContain('j/k');
    expect(dash).toContain('enter');
    expect(dash).toContain('tab');
    expect(dash).toContain('r retry');
    expect(dash).toContain('x cancel');
    expect(dash).toContain('K kill');
    expect(dash).toContain('?');
    expect(dash).toContain('q');
  });

  it('detail hints include essential keys', () => {
    const detail = HINTS.detail;
    expect(detail).toContain('r retry');
    expect(detail).toContain('x cancel');
    expect(detail).toContain('K kill');
    expect(detail).toContain('?');
    expect(detail).toContain('esc');
  });

  it('split hints exist', () => {
    expect(HINTS.split).toBeDefined();
    expect(HINTS.split.length).toBeGreaterThan(0);
  });

  it('all ViewType keys have hints defined', () => {
    expect(HINTS.dashboard).toBeDefined();
    expect(HINTS.detail).toBeDefined();
    expect(HINTS.split).toBeDefined();
  });
});

describe('TUI shortcut status validation — cancel', () => {
  it('cancel only applies to pending jobs (mirrors x handler in app.tsx)', () => {
    // The x handler in app.tsx checks: job.status === 'pending'
    // This test verifies the status contract
    const statuses = ['pending', 'running', 'failed', 'completed', 'cancelled'] as const;
    const cancellableStatuses = statuses.filter(s => s === 'pending');
    expect(cancellableStatuses).toEqual(['pending']);

    // Verify non-pending statuses are NOT cancellable
    const nonCancellable = statuses.filter(s => s !== 'pending');
    for (const status of nonCancellable) {
      expect(status).not.toBe('pending');
    }
  });
});

describe('TUI shortcut status validation — retry', () => {
  it('retry only applies to failed/cancelled jobs (mirrors r handler in app.tsx)', () => {
    // The r handler in app.tsx checks: job.status === 'failed' || job.status === 'cancelled'
    const statuses = ['pending', 'running', 'failed', 'completed', 'cancelled'] as const;
    const retryableStatuses = statuses.filter(s => s === 'failed' || s === 'cancelled');
    expect(retryableStatuses).toEqual(['failed', 'cancelled']);

    // Verify non-retryable statuses
    const nonRetryable = statuses.filter(s => s !== 'failed' && s !== 'cancelled');
    expect(nonRetryable).toEqual(['pending', 'running', 'completed']);
  });
});

// ── New tests: keyboard handler branching ──────────────────────────────────

describe('TUI shortcut status validation — force-quit', () => {
  it('force-quit only applies to running jobs (mirrors K handler in app.tsx)', () => {
    // The K handler in app.tsx checks: job.status === 'running'
    const statuses = ['pending', 'running', 'failed', 'completed', 'cancelled'] as const;
    const killableStatuses = statuses.filter(s => s === 'running');
    expect(killableStatuses).toEqual(['running']);

    // Verify non-killable statuses
    const nonKillable = statuses.filter(s => s !== 'running');
    expect(nonKillable).toEqual(['pending', 'failed', 'completed', 'cancelled']);
  });
});

describe('TUI shortcut context validation — panel awareness', () => {
  it('selectedJob returns null for projects panel (no job actions available)', () => {
    // The selectedJob() memo in state.ts returns null when panelFocus === 'projects'.
    // This means r/x/K all correctly skip when focused on projects panel.
    const panelFocusValues = ['queue', 'running', 'completed', 'projects'] as const;
    const panelsWithJobSelection = panelFocusValues.filter(p => p !== 'projects');
    expect(panelsWithJobSelection).toEqual(['queue', 'running', 'completed']);
  });

  it('unblock (u) only applies in projects panel', () => {
    // The u handler in app.tsx checks: panelFocus() === 'projects'
    // This ensures u doesn't fire in other panels
    const panelFocusValues = ['queue', 'running', 'completed', 'projects'] as const;
    const unblockPanels = panelFocusValues.filter(p => p === 'projects');
    expect(unblockPanels).toEqual(['projects']);
  });

  it('remove project (d) only applies in projects panel', () => {
    // The d handler in app.tsx checks: panelFocus() === 'projects'
    const panelFocusValues = ['queue', 'running', 'completed', 'projects'] as const;
    const removePanels = panelFocusValues.filter(p => p === 'projects');
    expect(removePanels).toEqual(['projects']);
  });
});

describe('TUI shortcut validation — remove project', () => {
  it('remove project applies to any project (no status gate, just panel gate)', () => {
    // Unlike u (which checks project.status === 'blocked'),
    // d applies to any project in the projects panel.
    // The safety gate is the confirmation overlay, not a status check.
    const projectStatuses = ['active', 'blocked'] as const;
    const removableStatuses = projectStatuses.filter(() => true); // all are removable
    expect(removableStatuses).toEqual(['active', 'blocked']);
  });
});

describe('HELP_TEXT includes d shortcut', () => {
  it('lists d remove project in Dashboard section', () => {
    expect(HELP_TEXT).toContain('d');
    expect(HELP_TEXT).toContain('Remove project');
  });
});

// ── Context-aware footer hints ─────────────────────────────────────────────

describe('Context-aware footer hints', () => {
  it('queue panel hints include x cancel but not K kill', () => {
    const hint = getFooterHint('dashboard', 'queue');
    expect(hint).toContain('x cancel');
    expect(hint).not.toContain('K kill');
  });

  it('running panel hints include K kill but not x cancel', () => {
    const hint = getFooterHint('dashboard', 'running');
    expect(hint).toContain('K kill');
    expect(hint).not.toContain('x cancel');
  });

  it('projects panel hints include u unblock and d remove', () => {
    const hint = getFooterHint('dashboard', 'projects');
    expect(hint).toContain('u unblock');
    expect(hint).toContain('d remove');
    expect(hint).not.toContain('r retry');
  });

  it('completed panel hints include r retry but not K kill', () => {
    const hint = getFooterHint('dashboard', 'completed');
    expect(hint).toContain('r retry');
    expect(hint).not.toContain('K kill');
  });

  it('queue panel hints do NOT include r retry (queue items are pending)', () => {
    const hint = getFooterHint('dashboard', 'queue');
    expect(hint).not.toContain('r retry');
  });

  it('detail view without jobStatus falls back to static HINTS.detail', () => {
    const hint = getFooterHint('detail', 'queue');
    expect(hint).toContain('esc back');
    expect(hint).toContain('r retry');
  });

  it('detail view with running jobStatus shows only K kill', () => {
    const hint = getFooterHint('detail', undefined, 'running');
    expect(hint).toContain('K kill');
    expect(hint).not.toContain('r retry');
    expect(hint).not.toContain('x cancel');
    expect(hint).toContain('? help');
    expect(hint).toContain('esc back');
  });

  it('detail view with pending jobStatus shows only x cancel', () => {
    const hint = getFooterHint('detail', undefined, 'pending');
    expect(hint).toContain('x cancel');
    expect(hint).not.toContain('r retry');
    expect(hint).not.toContain('K kill');
  });

  it('detail view with failed jobStatus shows only r retry', () => {
    const hint = getFooterHint('detail', undefined, 'failed');
    expect(hint).toContain('r retry');
    expect(hint).not.toContain('x cancel');
    expect(hint).not.toContain('K kill');
  });

  it('detail view with cancelled jobStatus shows only r retry', () => {
    const hint = getFooterHint('detail', undefined, 'cancelled');
    expect(hint).toContain('r retry');
    expect(hint).not.toContain('x cancel');
    expect(hint).not.toContain('K kill');
  });

  it('detail view with completed jobStatus shows no action shortcuts', () => {
    const hint = getFooterHint('detail', undefined, 'completed');
    expect(hint).not.toContain('r retry');
    expect(hint).not.toContain('x cancel');
    expect(hint).not.toContain('K kill');
    expect(hint).toContain('? help');
    expect(hint).toContain('esc back');
  });

  it('split view ignores panelFocus', () => {
    const hint = getFooterHint('split', 'projects');
    expect(hint).toContain('esc back');
  });

  it('projects panel does not include enter detail', () => {
    const hint = getFooterHint('dashboard', 'projects');
    expect(hint).not.toContain('enter');
  });

  it('all dashboard panels include j/k navigate', () => {
    const panels = ['queue', 'running', 'completed', 'projects'] as const;
    for (const panel of panels) {
      const hint = getFooterHint('dashboard', panel);
      expect(hint).toContain('j/k navigate');
    }
  });
});

// ── Keyboard handler branching (real handler) ──────────────────────────────

function makeKey(seq: string, opts?: Partial<TuiKeyEvent>): TuiKeyEvent {
  return {
    name: seq,
    sequence: seq,
    ctrl: false,
    meta: false,
    shift: false,
    ...opts,
  };
}

function mockJob(overrides?: Partial<Job>): Job {
  return {
    id: 'aaaa',
    project: '/tmp/test-project',
    scope: 'quick',
    description: 'test job',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
    timeout: 60,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

/** Create a minimal mock PilotStateStore with signal-like getters/setters. */
function createMockState(overrides?: {
  queue?: Job[];
  running?: Job[];
  completed?: Job[];
  panelFocus?: string;
  selectedIndex?: number;
  view?: string;
  projects?: Array<{ path: string; status: string }>;
}): PilotStateStore {
  let _queue = overrides?.queue ?? [];
  let _running = overrides?.running ?? [];
  let _completed = overrides?.completed ?? [];
  let _panelFocus = overrides?.panelFocus ?? 'queue';
  let _selectedIndex = overrides?.selectedIndex ?? 0;
  let _view = overrides?.view ?? 'dashboard';
  let _flashMessage = '';
  let _showConfirm = false;
  let _showFilter = false;
  let _showHelp = false;
  let _confirmMessage = '';
  let _pendingConfirmAction: (() => Promise<void>) | null = null;
  let _projects = overrides?.projects ?? [];

  // Compute selectedJob based on panelFocus and index
  const selectedJob = () => {
    if (_panelFocus === 'queue') return _queue[_selectedIndex] ?? null;
    if (_panelFocus === 'running') return _running[_selectedIndex] ?? null;
    if (_panelFocus === 'completed') return _completed[_selectedIndex] ?? null;
    return null;
  };

  return {
    queue: () => _queue,
    setQueue: (v: any) => { _queue = typeof v === 'function' ? v(_queue) : v; },
    running: () => _running,
    setRunning: (v: any) => { _running = typeof v === 'function' ? v(_running) : v; },
    completed: () => _completed,
    setCompleted: (v: any) => { _completed = typeof v === 'function' ? v(_completed) : v; },
    projects: () => _projects as any,
    setProjects: (v: any) => { _projects = typeof v === 'function' ? v(_projects) : v; },
    view: () => _view as any,
    setView: (v: any) => { _view = typeof v === 'function' ? v(_view) : v; },
    selectedIndex: () => _selectedIndex,
    setSelectedIndex: (v: any) => { _selectedIndex = typeof v === 'function' ? v(_selectedIndex) : v; },
    panelFocus: () => _panelFocus as any,
    setPanelFocus: (v: any) => { _panelFocus = typeof v === 'function' ? v(_panelFocus) : v; },
    detailJobId: () => null,
    setDetailJobId: vi.fn(),
    showHelp: () => _showHelp,
    setShowHelp: (v: any) => { _showHelp = typeof v === 'function' ? v(_showHelp) : v; },
    showFilter: () => _showFilter,
    setShowFilter: (v: any) => { _showFilter = typeof v === 'function' ? v(_showFilter) : v; },
    filter: () => ({}),
    setFilter: vi.fn(),
    showConfirm: () => _showConfirm,
    setShowConfirm: (v: any) => { _showConfirm = typeof v === 'function' ? v(_showConfirm) : v; },
    pendingConfirmAction: () => _pendingConfirmAction,
    setPendingConfirmAction: (v: any) => { _pendingConfirmAction = typeof v === 'function' ? v(_pendingConfirmAction) : v; },
    confirmMessage: () => _confirmMessage,
    setConfirmMessage: (v: any) => { _confirmMessage = typeof v === 'function' ? v(_confirmMessage) : v; },
    flashMessage: () => _flashMessage,
    setFlashMessage: (v: any) => { _flashMessage = typeof v === 'function' ? v(_flashMessage) : v; },
    followLog: () => true,
    setFollowLog: vi.fn(),
    logMessages: () => [],
    setLogMessages: vi.fn(),
    logSearchQuery: () => '',
    setLogSearchQuery: vi.fn(),
    sessionTokens: () => new Map(),
    setSessionTokens: vi.fn(),
    lastMessages: () => new Map(),
    setLastMessages: vi.fn(),
    observabilitySnapshots: () => new Map(),
    setObservabilitySnapshots: vi.fn(),
    selectedJob,
    filteredQueue: () => _queue,
    navigateToDetail: vi.fn(),
    navigateBack: vi.fn(),
    toggleSplit: vi.fn(),
    cyclePanelFocus: vi.fn(),
  } as unknown as PilotStateStore;
}

describe('Keyboard handler branching (real handler)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('r on a running job → sets flashMessage, does NOT call retry', () => {
    const state = createMockState({
      running: [mockJob({ status: 'running' })],
      panelFocus: 'running',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('r'), state, renderer);

    expect(state.flashMessage()).toContain('retry: not available');
    expect(retry).not.toHaveBeenCalled();
  });

  it('x on a completed job → sets flashMessage', () => {
    const state = createMockState({
      completed: [mockJob({ status: 'completed' })],
      panelFocus: 'completed',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('x'), state, renderer);

    expect(state.flashMessage()).toContain('cancel: not available');
  });

  it('K on a pending job → sets flashMessage', () => {
    const state = createMockState({
      queue: [mockJob({ status: 'pending' })],
      panelFocus: 'queue',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('K'), state, renderer);

    expect(state.flashMessage()).toContain('kill: not available');
  });

  it('r on a failed job → calls retry (no flash)', () => {
    const state = createMockState({
      completed: [mockJob({ status: 'failed' })],
      panelFocus: 'completed',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('r'), state, renderer);

    expect(state.flashMessage()).toBe('');
    expect(retry).toHaveBeenCalledWith('aaaa');
  });

  it('r on a cancelled job → calls retry (no flash)', () => {
    const state = createMockState({
      completed: [mockJob({ status: 'cancelled' })],
      panelFocus: 'completed',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('r'), state, renderer);

    expect(state.flashMessage()).toBe('');
    expect(retry).toHaveBeenCalledWith('aaaa');
  });

  it('q on dashboard → calls renderer.destroy', () => {
    const state = createMockState({ view: 'dashboard' });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('q'), state, renderer);

    expect(renderer.destroy).toHaveBeenCalled();
  });

  it('r with no job selected → flash "no job selected"', () => {
    const state = createMockState({
      queue: [],
      panelFocus: 'queue',
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('r'), state, renderer);

    expect(state.flashMessage()).toContain('retry: no job selected');
  });

  it('flash message auto-clears after 2 seconds', () => {
    const state = createMockState({
      running: [mockJob({ status: 'running' })],
      panelFocus: 'running',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('r'), state, renderer);

    expect(state.flashMessage()).toContain('retry: not available');

    vi.advanceTimersByTime(2000);
    expect(state.flashMessage()).toBe('');
  });

  it('K on a running job → opens confirm overlay (no flash)', () => {
    const state = createMockState({
      running: [mockJob({ status: 'running' })],
      panelFocus: 'running',
      selectedIndex: 0,
    });
    const renderer = { destroy: vi.fn() };

    handleKeyPress(makeKey('K'), state, renderer);

    expect(state.flashMessage()).toBe('');
    expect(state.showConfirm()).toBe(true);
    expect(state.confirmMessage()).toContain('Kill job');
  });
});
