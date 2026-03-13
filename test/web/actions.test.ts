import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock the server-fns module that actions.ts imports via ~/lib/server-fns.
// We need to mock the exact specifier used in the source file.
vi.mock('~/lib/server-fns', () => ({
  retryJobFn: vi.fn(),
  cancelJobFn: vi.fn(),
  forceQuitJobFn: vi.fn(),
  unblockProjectFn: vi.fn(),
}));

import {
  resolveActions,
  ACTION_REGISTRY,
  type ActionContext,
  type ResolvedAction,
} from '../../web/src/lib/actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Build a minimal ActionContext for testing availability predicates. */
function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    job: null,
    projectPath: null,
    navigate: vi.fn(),
    queryClient: { invalidateQueries: vi.fn() } as unknown as ActionContext['queryClient'],
    ...overrides,
  };
}

function findAction(actions: ResolvedAction[], id: string): ResolvedAction | undefined {
  return actions.find((a) => a.definition.id === id);
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ACTION_REGISTRY', () => {
  it('contains exactly 7 action definitions', () => {
    expect(ACTION_REGISTRY).toHaveLength(7);
  });

  it('has unique IDs for all actions', () => {
    const ids = ACTION_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all expected action IDs', () => {
    const ids = ACTION_REGISTRY.map((a) => a.id);
    expect(ids).toContain('retry-job');
    expect(ids).toContain('cancel-job');
    expect(ids).toContain('force-quit-job');
    expect(ids).toContain('unblock-project');
    expect(ids).toContain('view-job-detail');
    expect(ids).toContain('back-to-dashboard');
    expect(ids).toContain('refresh');
  });
});

describe('retry-job availability', () => {
  it('is enabled when job status is failed', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'failed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const retry = findAction(actions, 'retry-job')!;

    expect(retry.enabled).toBe(true);
    expect(retry.disabledReason).toBeNull();
  });

  it('is disabled when job status is running', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const retry = findAction(actions, 'retry-job')!;

    expect(retry.enabled).toBe(false);
    expect(retry.disabledReason).toBe('Job is not in failed state');
  });

  it('is disabled when job status is completed', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'completed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const retry = findAction(actions, 'retry-job')!;

    expect(retry.enabled).toBe(false);
    expect(retry.disabledReason).toBe('Job is not in failed state');
  });

  it('is disabled when no job selected', () => {
    const ctx = makeContext({ job: null });
    const actions = resolveActions(ctx);
    const retry = findAction(actions, 'retry-job')!;

    expect(retry.enabled).toBe(false);
    expect(retry.disabledReason).toBe('No job selected');
  });

  it('is disabled when job status is paused', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'paused', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const retry = findAction(actions, 'retry-job')!;

    expect(retry.enabled).toBe(false);
    expect(retry.disabledReason).toBe('Job is not in failed state');
  });
});

describe('cancel-job availability', () => {
  it('is enabled when job status is running', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const cancel = findAction(actions, 'cancel-job')!;

    expect(cancel.enabled).toBe(true);
    expect(cancel.disabledReason).toBeNull();
  });

  it('is enabled when job status is pending', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'pending', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const cancel = findAction(actions, 'cancel-job')!;

    expect(cancel.enabled).toBe(true);
    expect(cancel.disabledReason).toBeNull();
  });

  it('is disabled when job status is completed', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'completed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const cancel = findAction(actions, 'cancel-job')!;

    expect(cancel.enabled).toBe(false);
    expect(cancel.disabledReason).toBe('Job is not active');
  });

  it('is disabled when job status is failed', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'failed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const cancel = findAction(actions, 'cancel-job')!;

    expect(cancel.enabled).toBe(false);
    expect(cancel.disabledReason).toBe('Job is not active');
  });

  it('is disabled when job status is paused', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'paused', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const cancel = findAction(actions, 'cancel-job')!;

    expect(cancel.enabled).toBe(false);
    expect(cancel.disabledReason).toBe('Job is not active');
  });
});

describe('force-quit-job availability', () => {
  it('is enabled when job status is running', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(true);
    expect(fq.disabledReason).toBeNull();
  });

  it('is disabled for pending status', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'pending', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(false);
    expect(fq.disabledReason).toBe('Job is not running');
  });

  it('is disabled for completed status', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'completed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(false);
    expect(fq.disabledReason).toBe('Job is not running');
  });

  it('is disabled for failed status', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'failed', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(false);
    expect(fq.disabledReason).toBe('Job is not running');
  });

  it('is disabled for cancelled status', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'cancelled', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(false);
    expect(fq.disabledReason).toBe('Job is not running');
  });

  it('is disabled for paused status', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'paused', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const fq = findAction(actions, 'force-quit-job')!;

    expect(fq.enabled).toBe(false);
    expect(fq.disabledReason).toBe('Job is not running');
  });
});

describe('unblock-project availability', () => {
  it('is enabled when projectPath is provided', () => {
    const ctx = makeContext({
      projectPath: '/test/project',
    });
    const actions = resolveActions(ctx);
    const unblock = findAction(actions, 'unblock-project')!;

    expect(unblock.enabled).toBe(true);
    expect(unblock.disabledReason).toBeNull();
  });

  it('is enabled when job.project is provided (no explicit projectPath)', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test/project' },
      projectPath: null,
    });
    const actions = resolveActions(ctx);
    const unblock = findAction(actions, 'unblock-project')!;

    expect(unblock.enabled).toBe(true);
    expect(unblock.disabledReason).toBeNull();
  });

  it('is disabled when no project context at all', () => {
    const ctx = makeContext({
      job: null,
      projectPath: null,
    });
    const actions = resolveActions(ctx);
    const unblock = findAction(actions, 'unblock-project')!;

    expect(unblock.enabled).toBe(false);
    expect(unblock.disabledReason).toBe('No project in context');
  });
});

describe('navigation actions availability', () => {
  it('view-job-detail is enabled when a job is selected', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test' },
    });
    const actions = resolveActions(ctx);
    const viewDetail = findAction(actions, 'view-job-detail')!;

    expect(viewDetail.enabled).toBe(true);
    expect(viewDetail.disabledReason).toBeNull();
  });

  it('view-job-detail is disabled when no job selected', () => {
    const ctx = makeContext({ job: null });
    const actions = resolveActions(ctx);
    const viewDetail = findAction(actions, 'view-job-detail')!;

    expect(viewDetail.enabled).toBe(false);
    expect(viewDetail.disabledReason).toBe('No job selected');
  });

  it('back-to-dashboard is always enabled', () => {
    const ctx = makeContext({ job: null, projectPath: null });
    const actions = resolveActions(ctx);
    const back = findAction(actions, 'back-to-dashboard')!;

    expect(back.enabled).toBe(true);
    expect(back.disabledReason).toBeNull();
  });

  it('refresh is always enabled', () => {
    const ctx = makeContext({ job: null, projectPath: null });
    const actions = resolveActions(ctx);
    const refresh = findAction(actions, 'refresh')!;

    expect(refresh.enabled).toBe(true);
    expect(refresh.disabledReason).toBeNull();
  });
});

describe('resolveActions integration', () => {
  it('returns all 7 actions with correct availability for full context', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'running', project: '/test/project' },
      projectPath: '/test/project',
    });

    const actions = resolveActions(ctx);

    expect(actions).toHaveLength(7);

    // Job actions
    const retry = findAction(actions, 'retry-job')!;
    expect(retry.enabled).toBe(false); // running ≠ failed
    expect(retry.disabledReason).toBe('Job is not in failed state');

    const cancel = findAction(actions, 'cancel-job')!;
    expect(cancel.enabled).toBe(true); // running is active

    const forceQuit = findAction(actions, 'force-quit-job')!;
    expect(forceQuit.enabled).toBe(true); // running

    // Project actions
    const unblock = findAction(actions, 'unblock-project')!;
    expect(unblock.enabled).toBe(true); // has project

    // Navigation actions
    const viewDetail = findAction(actions, 'view-job-detail')!;
    expect(viewDetail.enabled).toBe(true); // has job

    const backDash = findAction(actions, 'back-to-dashboard')!;
    expect(backDash.enabled).toBe(true); // always

    const refresh = findAction(actions, 'refresh')!;
    expect(refresh.enabled).toBe(true); // always
  });

  it('returns all job-specific actions disabled when no job context', () => {
    const ctx = makeContext({
      job: null,
      projectPath: null,
    });

    const actions = resolveActions(ctx);

    expect(actions).toHaveLength(7);

    // All job-specific actions should be disabled
    const retry = findAction(actions, 'retry-job')!;
    expect(retry.enabled).toBe(false);

    const cancel = findAction(actions, 'cancel-job')!;
    expect(cancel.enabled).toBe(false);

    const forceQuit = findAction(actions, 'force-quit-job')!;
    expect(forceQuit.enabled).toBe(false);

    const unblock = findAction(actions, 'unblock-project')!;
    expect(unblock.enabled).toBe(false);

    const viewDetail = findAction(actions, 'view-job-detail')!;
    expect(viewDetail.enabled).toBe(false);

    // Navigation actions still available
    const backDash = findAction(actions, 'back-to-dashboard')!;
    expect(backDash.enabled).toBe(true);

    const refresh = findAction(actions, 'refresh')!;
    expect(refresh.enabled).toBe(true);
  });

  it('returns correct availability for paused job state', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'paused', project: '/test/project' },
      projectPath: '/test/project',
    });

    const actions = resolveActions(ctx);

    // Job actions — all disabled for paused
    const retry = findAction(actions, 'retry-job')!;
    expect(retry.enabled).toBe(false);
    expect(retry.disabledReason).toBe('Job is not in failed state');

    const cancel = findAction(actions, 'cancel-job')!;
    expect(cancel.enabled).toBe(false);
    expect(cancel.disabledReason).toBe('Job is not active');

    const forceQuit = findAction(actions, 'force-quit-job')!;
    expect(forceQuit.enabled).toBe(false);
    expect(forceQuit.disabledReason).toBe('Job is not running');

    // Project action — enabled (has project)
    const unblock = findAction(actions, 'unblock-project')!;
    expect(unblock.enabled).toBe(true);

    // Navigation actions — enabled
    const viewDetail = findAction(actions, 'view-job-detail')!;
    expect(viewDetail.enabled).toBe(true);

    const backDash = findAction(actions, 'back-to-dashboard')!;
    expect(backDash.enabled).toBe(true);

    const refresh = findAction(actions, 'refresh')!;
    expect(refresh.enabled).toBe(true);
  });

  it('returns correct ResolvedAction shape for each action', () => {
    const ctx = makeContext({
      job: { id: 'j1', status: 'failed', project: '/test' },
    });

    const actions = resolveActions(ctx);

    for (const action of actions) {
      // Every resolved action has the expected shape
      expect(action).toHaveProperty('definition');
      expect(action).toHaveProperty('enabled');
      expect(action).toHaveProperty('disabledReason');
      expect(typeof action.definition.id).toBe('string');
      expect(typeof action.definition.label).toBe('string');
      expect(typeof action.definition.description).toBe('string');
      expect(['job', 'project', 'navigation']).toContain(action.definition.group);
      expect(typeof action.enabled).toBe('boolean');
      if (!action.enabled) {
        expect(typeof action.disabledReason).toBe('string');
      } else {
        expect(action.disabledReason).toBeNull();
      }
    }
  });
});
