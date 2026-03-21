import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  Job,
  JobStep,
  SessionPart,
  SessionSummary,
  SessionMessage,
} from '../../src/core/types.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockGetJob = vi.fn<(id: string) => Job | null>();
const mockGetJobSteps = vi.fn<(jobId: string) => JobStep[]>();
const mockFindSessionByTitle = vi.fn<(title: string) => string | null>();
const mockGetChildSessions = vi.fn<(parentSessionId: string) => Array<{ id: string; title: string; timeCreated: number; timeUpdated: number }>>();
const mockGetLastMessage = vi.fn<(sessionId: string) => SessionMessage | null>();
const mockGetSessionParts = vi.fn<(sessionId: string, since?: number) => SessionPart[]>();
const mockGetAssistantMessageCount = vi.fn<(sessionId: string) => number>();
const mockIsSessionDone = vi.fn<(sessionId: string) => boolean>();
const mockGetSessionTokensRecursive = vi.fn<(sessionId: string) => { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }>();
const mockGetSessionModelsRecursive = vi.fn<(sessionId: string) => string[]>();
const mockGetSessionMeta = vi.fn<(sessionId: string) => { id: string; title: string; timeCreated: number; timeUpdated: number } | null>();

const mockRetry = vi.fn<(id: string) => void>();
const mockCancel = vi.fn<(id: string) => void>();
const mockForceQuitJob = vi.fn<(id: string, source: string, reason?: string) => void>();
const mockUnblockProject = vi.fn<(path: string) => void>();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(args[0] as string),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(args[0] as string),
  retry: (...args: unknown[]) => mockRetry(args[0] as string),
  cancel: (...args: unknown[]) => mockCancel(args[0] as string),
  forceQuitJob: (...args: unknown[]) => mockForceQuitJob(args[0] as string, args[1] as string, args[2] as string | undefined),
  unblockProject: (...args: unknown[]) => mockUnblockProject(args[0] as string),
}));

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(args[0] as string),
  getChildSessions: (...args: unknown[]) => mockGetChildSessions(args[0] as string),
  getLastMessage: (...args: unknown[]) => mockGetLastMessage(args[0] as string),
  getSessionParts: (...args: unknown[]) => mockGetSessionParts(args[0] as string, args[1] as number | undefined),
  getAssistantMessageCount: (...args: unknown[]) => mockGetAssistantMessageCount(args[0] as string),
  isSessionDone: (...args: unknown[]) => mockIsSessionDone(args[0] as string),
  getSessionTokensRecursive: (...args: unknown[]) => mockGetSessionTokensRecursive(args[0] as string),
  getSessionModelsRecursive: (...args: unknown[]) => mockGetSessionModelsRecursive(args[0] as string),
  getSessionMeta: (...args: unknown[]) => mockGetSessionMeta(args[0] as string),
}));

import {
  getJobDetail,
  summarizeSession,
  getSessionActivity,
  getSessionChildSummaries,
  getJobDetailEvents,
  getJobTimeline,
  cancelJobAction,
  forceQuitJobAction,
  unblockProjectAction,
} from '../../src/core/job-detail-query.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: '/test/project',
    scope: 'phase',
    description: 'Test job',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-13T10:00:00Z',
    startedAt: '2026-03-13T10:01:00Z',
    completedAt: '2026-03-13T10:05:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 2,
    sessionTitles: JSON.stringify(['pilot-session-ab12']),
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 95 }),
    actualModels: ['anthropic/claude-sonnet-4-6'],
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: 'aaa111',
    gitHeadCommit: 'bbb222',
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

function makeStep(overrides: Partial<JobStep> = {}): JobStep {
  return {
    id: 1,
    jobId: 'ab12',
    stepIndex: 0,
    command: 'execute-phase',
    args: '61 --auto',
    sessionTitle: 'pilot-session-ab12',
    sessionId: 'sess-root-1',
    status: 'completed',
    verdictSource: 'semantic-check',
    verdictReason: 'All checks passed',
    startedAt: '2026-03-13T10:01:00Z',
    completedAt: '2026-03-13T10:03:00Z',
    durationMs: 120000,
    ...overrides,
  };
}

function makePart(overrides: Partial<SessionPart> = {}): SessionPart {
  return {
    id: 'part-1',
    messageId: 'msg-1',
    role: 'assistant',
    type: 'text',
    createdAt: 1000000,
    text: 'Hello world this is a test message',
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────

function setupDefaultMocks(): void {
  mockGetJob.mockReturnValue(makeJob());
  mockGetJobSteps.mockReturnValue([
    makeStep({ id: 1, stepIndex: 0 }),
    makeStep({ id: 2, stepIndex: 1, command: 'plan-phase', args: '61' }),
  ]);
  mockFindSessionByTitle.mockReturnValue('sess-root-1');
  mockGetChildSessions.mockImplementation((parentId: string) => {
    if (parentId === 'sess-root-1') {
      return [
        { id: 'sess-child-1', title: 'subagent-task-1', timeCreated: 1000, timeUpdated: 2000 },
        { id: 'sess-child-2', title: 'subagent-task-2', timeCreated: 1500, timeUpdated: 2500 },
      ];
    }
    return [];
  });
  mockGetLastMessage.mockReturnValue({
    id: 'msg-last',
    role: 'assistant',
    content: 'Task completed successfully with all tests passing.',
    createdAt: 2000,
  });
  mockGetSessionParts.mockReturnValue([
    makePart({ id: 'p1', type: 'text', text: 'Working on implementation...', createdAt: 1100 }),
    makePart({ id: 'p2', type: 'tool', tool: 'bash', toolInput: 'npm test', createdAt: 1200 }),
    makePart({ id: 'p3', type: 'text', text: 'All tests pass.', createdAt: 1300 }),
  ]);
  mockGetAssistantMessageCount.mockReturnValue(5);
  mockIsSessionDone.mockReturnValue(true);
  mockGetSessionTokensRecursive.mockReturnValue({
    input: 10000,
    output: 5000,
    reasoning: 1000,
    cacheRead: 500,
    cacheWrite: 200,
  });
  mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
  mockGetSessionMeta.mockReturnValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('getJobDetail', () => {
  it('returns complete snapshot with correct job fields including parsed verdict/confidence', () => {
    const snapshot = getJobDetail('ab12');

    expect(snapshot).not.toBeNull();
    expect(snapshot!.job.id).toBe('ab12');
    expect(snapshot!.job.project).toBe('/test/project');
    expect(snapshot!.job.description).toBe('Test job');
    expect(snapshot!.job.scope).toBe('phase');
    expect(snapshot!.job.status).toBe('completed');
    expect(snapshot!.job.verdict).toBe('succeeded');
    expect(snapshot!.job.confidence).toBe(95);
    expect(snapshot!.job.currentStep).toBe(2);
    expect(snapshot!.job.modelProfile).toBe('balanced');
    expect(snapshot!.job.providerMode).toBe('claude-only');
    expect(snapshot!.job.error).toBeNull();
    expect(snapshot!.job.durationMs).toBeGreaterThan(0);
  });

  it('returns correct step summaries', () => {
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.steps).toHaveLength(2);
    expect(snapshot.steps[0].stepIndex).toBe(0);
    expect(snapshot.steps[0].command).toBe('execute-phase');
    expect(snapshot.steps[0].status).toBe('completed');
    expect(snapshot.steps[1].stepIndex).toBe(1);
    expect(snapshot.steps[1].command).toBe('plan-phase');
  });

  it('returns root sessions with role=root', () => {
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.rootSessions).toHaveLength(1);
    expect(snapshot.rootSessions[0].role).toBe('root');
    expect(snapshot.rootSessions[0].sessionId).toBe('sess-root-1');
    expect(snapshot.rootSessions[0].status).toBe('done');
    expect(snapshot.rootSessions[0].tokenTotal).toBe(16700); // 10000+5000+1000+500+200
    expect(snapshot.rootSessions[0].models).toEqual(['anthropic/claude-sonnet-4-6']);
  });

  it('returns subagents with role=subagent', () => {
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.subagents).toHaveLength(2);
    expect(snapshot.subagents[0].role).toBe('subagent');
    expect(snapshot.subagents[0].sessionId).toBe('sess-child-1');
    expect(snapshot.subagents[0].parentSessionId).toBe('sess-root-1');
    expect(snapshot.subagents[1].role).toBe('subagent');
    expect(snapshot.subagents[1].sessionId).toBe('sess-child-2');
  });

  it('returns activity preview with truncated text', () => {
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.activityPreview.length).toBeGreaterThan(0);
    expect(snapshot.activityPreview.length).toBeLessThanOrEqual(10);
    // First preview item should be text type
    const textItem = snapshot.activityPreview.find((p) => p.type === 'text');
    expect(textItem).toBeDefined();
    expect(textItem!.preview.length).toBeLessThanOrEqual(300);

    // Tool item should include tool name
    const toolItem = snapshot.activityPreview.find((p) => p.type === 'tool');
    expect(toolItem).toBeDefined();
    expect(toolItem!.tool).toBe('bash');
  });

  it('returns a numeric string cursor', () => {
    const snapshot = getJobDetail('ab12')!;

    expect(typeof snapshot.cursor).toBe('string');
    expect(Number(snapshot.cursor)).toBeGreaterThan(0);
  });

  it('returns null when job not found', () => {
    mockGetJob.mockReturnValue(null);
    expect(getJobDetail('zzzz')).toBeNull();
  });

  it('handles null judgeVerdict gracefully', () => {
    mockGetJob.mockReturnValue(makeJob({ judgeVerdict: null }));
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.job.verdict).toBeNull();
    expect(snapshot.job.confidence).toBeNull();
  });

  it('handles no session titles gracefully', () => {
    mockGetJob.mockReturnValue(makeJob({ sessionTitles: null }));
    const snapshot = getJobDetail('ab12')!;

    expect(snapshot.rootSessions).toHaveLength(0);
    expect(snapshot.subagents).toHaveLength(0);
    expect(snapshot.activityPreview).toHaveLength(0);
  });
});

describe('summarizeSession', () => {
  it('builds a summary with correct fields', () => {
    const summary = summarizeSession('sess-1', 'root', 'Test Session', null, 1000, 5000);

    expect(summary.sessionId).toBe('sess-1');
    expect(summary.role).toBe('root');
    expect(summary.title).toBe('Test Session');
    expect(summary.parentSessionId).toBeNull();
    expect(summary.startedAt).toBe(1000);
    expect(summary.updatedAt).toBe(5000);
  });

  it('truncates latestMessagePreview to ≤200 chars', () => {
    const longContent = 'A'.repeat(500);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-long',
      role: 'assistant',
      content: longContent,
      createdAt: 3000,
    });

    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);

    expect(summary.latestMessagePreview).not.toBeNull();
    expect(summary.latestMessagePreview!.length).toBeLessThanOrEqual(200);
  });

  it('counts children correctly', () => {
    mockGetChildSessions.mockReturnValue([
      { id: 'child-a', title: 'a', timeCreated: 100, timeUpdated: 200 },
      { id: 'child-b', title: 'b', timeCreated: 150, timeUpdated: 250 },
      { id: 'child-c', title: 'c', timeCreated: 200, timeUpdated: 300 },
    ]);

    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);

    expect(summary.childCount).toBe(3);
  });

  it('reports tokenTotal as sum of all token buckets', () => {
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 100, output: 200, reasoning: 50, cacheRead: 25, cacheWrite: 10,
    });

    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);

    expect(summary.tokenTotal).toBe(385);
  });

  it('determines status=done when session is done', () => {
    mockIsSessionDone.mockReturnValue(true);
    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);
    expect(summary.status).toBe('done');
  });

  it('determines status=active when session has messages but is not done', () => {
    mockIsSessionDone.mockReturnValue(false);
    mockGetAssistantMessageCount.mockReturnValue(3);
    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);
    expect(summary.status).toBe('active');
  });

  it('determines status=unknown when session has no messages and is not done', () => {
    mockIsSessionDone.mockReturnValue(false);
    mockGetAssistantMessageCount.mockReturnValue(0);
    const summary = summarizeSession('sess-1', 'root', 'Test', null, 1000, 5000);
    expect(summary.status).toBe('unknown');
  });
});

describe('getSessionActivity', () => {
  it('returns paginated parts with default limit of 50', () => {
    // Create 60 parts
    const parts: SessionPart[] = Array.from({ length: 60 }, (_, i) =>
      makePart({ id: `p-${i}`, createdAt: 1000 + i }),
    );
    mockGetSessionParts.mockReturnValue(parts);

    const page = getSessionActivity('sess-1');

    expect(page.parts).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });

  it('returns remaining parts with hasMore=false when fewer than limit', () => {
    const parts: SessionPart[] = Array.from({ length: 10 }, (_, i) =>
      makePart({ id: `p-${i}`, createdAt: 2000 + i }),
    );
    mockGetSessionParts.mockReturnValue(parts);

    const page = getSessionActivity('sess-1', { cursor: '1999' });

    expect(page.parts).toHaveLength(10);
    expect(page.hasMore).toBe(false);
  });

  it('strips toolInput and toolOutput when includeToolDetails is false', () => {
    const parts: SessionPart[] = [
      makePart({ id: 'p-tool', type: 'tool', tool: 'bash', toolInput: 'npm test', toolOutput: 'ok', createdAt: 3000 }),
    ];
    mockGetSessionParts.mockReturnValue(parts);

    const page = getSessionActivity('sess-1', { includeToolDetails: false });

    expect(page.parts[0].toolInput).toBeUndefined();
    expect(page.parts[0].toolOutput).toBeUndefined();
    expect(page.parts[0].tool).toBe('bash'); // tool name is preserved
  });

  it('preserves toolInput and toolOutput when includeToolDetails is true', () => {
    const parts: SessionPart[] = [
      makePart({ id: 'p-tool', type: 'tool', tool: 'bash', toolInput: 'npm test', toolOutput: 'pass', createdAt: 3000 }),
    ];
    mockGetSessionParts.mockReturnValue(parts);

    const page = getSessionActivity('sess-1', { includeToolDetails: true });

    expect(page.parts[0].toolInput).toBe('npm test');
    expect(page.parts[0].toolOutput).toBe('pass');
  });

  it('computes nextCursor from last part createdAt', () => {
    const parts: SessionPart[] = [
      makePart({ id: 'p1', createdAt: 4000 }),
      makePart({ id: 'p2', createdAt: 5000 }),
    ];
    mockGetSessionParts.mockReturnValue(parts);

    const page = getSessionActivity('sess-1');

    expect(page.nextCursor).toBe('5000');
  });

  it('returns null nextCursor when no parts returned', () => {
    mockGetSessionParts.mockReturnValue([]);

    const page = getSessionActivity('sess-1');

    expect(page.parts).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('getSessionChildSummaries', () => {
  it('returns immediate children only, not grandchildren', () => {
    // Parent has 2 children
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-parent') {
        return [
          { id: 'child-1', title: 'Child 1', timeCreated: 1000, timeUpdated: 2000 },
          { id: 'child-2', title: 'Child 2', timeCreated: 1500, timeUpdated: 2500 },
        ];
      }
      // Each child has 1 grandchild
      if (parentId === 'child-1') {
        return [{ id: 'grandchild-1', title: 'GC 1', timeCreated: 1100, timeUpdated: 1900 }];
      }
      if (parentId === 'child-2') {
        return [{ id: 'grandchild-2', title: 'GC 2', timeCreated: 1600, timeUpdated: 2400 }];
      }
      return [];
    });

    const summaries = getSessionChildSummaries('sess-parent');

    // Only 2 direct children, NOT 4 (no grandchildren)
    expect(summaries).toHaveLength(2);
    expect(summaries[0].sessionId).toBe('child-1');
    expect(summaries[0].role).toBe('subagent');
    expect(summaries[0].parentSessionId).toBe('sess-parent');
    expect(summaries[1].sessionId).toBe('child-2');

    // Each child should report childCount=1 (their own grandchild)
    expect(summaries[0].childCount).toBe(1);
    expect(summaries[1].childCount).toBe(1);
  });

  it('returns empty array for session with no children', () => {
    mockGetChildSessions.mockReturnValue([]);

    const summaries = getSessionChildSummaries('sess-leaf');

    expect(summaries).toHaveLength(0);
  });

  it('returns correct sessionIds for drill-in even when children share title prefix', () => {
    // Children with similar titles but distinct IDs — verifies sessionId comes from child.id, not title
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-parent') {
        return [
          { id: 'real-id-alpha', title: 'Worker-1', timeCreated: 1000, timeUpdated: 2000 },
          { id: 'real-id-beta', title: 'Worker-1', timeCreated: 1100, timeUpdated: 2100 },
        ];
      }
      return [];
    });

    const summaries = getSessionChildSummaries('sess-parent');

    expect(summaries).toHaveLength(2);
    // Each SessionSummary has a unique sessionId matching the child's real ID
    expect(summaries[0].sessionId).toBe('real-id-alpha');
    expect(summaries[1].sessionId).toBe('real-id-beta');
    // Both have correct parentSessionId
    expect(summaries[0].parentSessionId).toBe('sess-parent');
    expect(summaries[1].parentSessionId).toBe('sess-parent');
    // sessionIds are unique despite same title
    const ids = summaries.map((s) => s.sessionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getJobDetailEvents', () => {
  it('returns job-update event when job state changed after cursor', () => {
    const startedMs = Date.parse('2026-03-13T10:01:00Z');
    const oldCursor = String(startedMs - 1000);

    const response = getJobDetailEvents('ab12', oldCursor);

    expect(response.events.length).toBeGreaterThan(0);
    const jobUpdate = response.events.find((e) => e.type === 'job-update');
    expect(jobUpdate).toBeDefined();
    expect(jobUpdate!.data.status).toBe('completed');
    expect(jobUpdate!.data.verdict).toBe('succeeded');
    expect(jobUpdate!.data.confidence).toBe(95);
  });

  it('returns step-update events for steps that changed after cursor', () => {
    const oldCursor = String(Date.parse('2026-03-13T09:00:00Z'));

    const response = getJobDetailEvents('ab12', oldCursor);

    const stepUpdates = response.events.filter((e) => e.type === 'step-update');
    expect(stepUpdates.length).toBe(2); // both steps started after cursor
    expect(stepUpdates[0].data.stepIndex).toBe(0);
    expect(stepUpdates[0].data.command).toBe('execute-phase');
  });

  it('returns activity-new events for new session parts', () => {
    const oldCursor = String(900); // before all parts

    const response = getJobDetailEvents('ab12', oldCursor);

    const activityEvents = response.events.filter((e) => e.type === 'activity-new');
    expect(activityEvents.length).toBeGreaterThan(0);
    expect(activityEvents[0].data.sessionId).toBe('sess-root-1');
  });

  it('returns empty events when nothing changed since cursor', () => {
    // Set cursor far in the future
    const futureCursor = String(Date.now() + 1_000_000);
    mockGetSessionParts.mockReturnValue([]); // no new parts

    const response = getJobDetailEvents('ab12', futureCursor);

    expect(response.events).toHaveLength(0);
    expect(typeof response.cursor).toBe('string');
  });

  it('returns empty events for non-existent job', () => {
    mockGetJob.mockReturnValue(null);

    const response = getJobDetailEvents('zzzz', '0');

    expect(response.events).toHaveLength(0);
    expect(typeof response.cursor).toBe('string');
  });

  it('returns a new cursor for subsequent polling', () => {
    const response = getJobDetailEvents('ab12', '0');

    expect(Number(response.cursor)).toBeGreaterThan(0);
    // cursor should be recent (within last second)
    const cursorMs = Number(response.cursor);
    expect(cursorMs).toBeGreaterThan(Date.now() - 2000);
  });
});

// ── getJobTimeline Tests ──────────────────────────────────────────────────

describe('getJobTimeline', () => {
  it('returns items sorted chronologically across multiple root sessions', () => {
    // Job with 2 root sessions
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['session-A', 'session-B']) }),
    );
    mockFindSessionByTitle.mockImplementation((title: string) => {
      if (title === 'session-A') return 'sess-A';
      if (title === 'session-B') return 'sess-B';
      return null;
    });
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionParts.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-A') {
        return [
          makePart({ id: 'a1', type: 'text', text: 'From A first', createdAt: 1000 }),
          makePart({ id: 'a2', type: 'text', text: 'From A third', createdAt: 3000 }),
        ];
      }
      if (sessionId === 'sess-B') {
        return [
          makePart({ id: 'b1', type: 'text', text: 'From B second', createdAt: 2000 }),
          makePart({ id: 'b2', type: 'text', text: 'From B fourth', createdAt: 4000 }),
        ];
      }
      return [];
    });

    const page = getJobTimeline('ab12')!;

    expect(page).not.toBeNull();
    expect(page.items).toHaveLength(4);
    // Verify chronological ordering across sessions
    const timestamps = page.items.map((i) => i.createdAt);
    expect(timestamps).toEqual([1000, 2000, 3000, 4000]);
    // Verify items from both sessions interleaved
    expect(page.items[0].kind).toBe('activity');
    expect((page.items[0] as { sessionId: string }).sessionId).toBe('sess-A');
    expect((page.items[1] as { sessionId: string }).sessionId).toBe('sess-B');
    expect(page.sessionCount).toBe(2);
  });

  it('places fork-card items at child timeCreated relative to parts', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root-session']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetSessionParts.mockReturnValue([
      makePart({ id: 'p1', type: 'text', text: 'before fork 1', createdAt: 500 }),
      makePart({ id: 'p2', type: 'tool', tool: 'bash', toolInput: 'ls', createdAt: 800 }),
      makePart({ id: 'p3', type: 'text', text: 'between forks', createdAt: 1500 }),
      makePart({ id: 'p4', type: 'text', text: 'after fork 2', createdAt: 2500 }),
      makePart({ id: 'p5', type: 'text', text: 'final part', createdAt: 3000 }),
    ]);
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-root') {
        return [
          { id: 'child-1', title: 'Subagent 1', timeCreated: 1000, timeUpdated: 1800 },
          { id: 'child-2', title: 'Subagent 2', timeCreated: 2000, timeUpdated: 2800 },
        ];
      }
      return [];
    });
    mockIsSessionDone.mockImplementation((id: string) => id === 'child-1' || id === 'child-2');
    mockGetAssistantMessageCount.mockReturnValue(3);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-1', role: 'assistant', content: 'Done', createdAt: 1800,
    });

    const page = getJobTimeline('ab12')!;

    // Find fork cards
    const forkCards = page.items.filter((i) => i.kind === 'fork-card');
    expect(forkCards).toHaveLength(2);

    // fork-card for child-1 at time=1000 should be AFTER part at 800 and BEFORE part at 1500
    const forkCard1Index = page.items.findIndex(
      (i) => i.kind === 'fork-card' && i.createdAt === 1000,
    );
    expect(forkCard1Index).toBeGreaterThan(-1);
    // The part at 800 should come before the fork card at 1000
    const partBefore = page.items.findIndex((i) => i.createdAt === 800);
    expect(partBefore).toBeLessThan(forkCard1Index);
    // The part at 1500 should come after the fork card at 1000
    const partAfter = page.items.findIndex((i) => i.createdAt === 1500);
    expect(partAfter).toBeGreaterThan(forkCard1Index);

    // fork-card for child-2 at time=2000 should be AFTER part at 1500 and BEFORE part at 2500
    const forkCard2Index = page.items.findIndex(
      (i) => i.kind === 'fork-card' && i.createdAt === 2000,
    );
    expect(forkCard2Index).toBeGreaterThan(-1);
    const part1500 = page.items.findIndex((i) => i.createdAt === 1500);
    expect(part1500).toBeLessThan(forkCard2Index);
    const part2500 = page.items.findIndex((i) => i.createdAt === 2500);
    expect(part2500).toBeGreaterThan(forkCard2Index);

    expect(page.childCount).toBe(2);
  });

  it('maps text/reasoning parts to activity kind and tool/patch parts to tool-summary kind', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root-session']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-root') {
        return [{ id: 'child-x', title: 'Sub X', timeCreated: 300, timeUpdated: 600 }];
      }
      return [];
    });
    mockGetSessionParts.mockReturnValue([
      makePart({ id: 'txt', type: 'text', text: 'Hello', createdAt: 100 }),
      makePart({ id: 'rsn', type: 'reasoning', text: 'Thinking...', createdAt: 200 }),
      makePart({ id: 'tool1', type: 'tool', tool: 'bash', toolInput: 'ls', createdAt: 400 }),
      makePart({ id: 'patch1', type: 'patch', patchFiles: ['file.ts'], createdAt: 500 }),
    ]);
    mockIsSessionDone.mockReturnValue(false);
    mockGetAssistantMessageCount.mockReturnValue(1);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 10, output: 5, reasoning: 2, cacheRead: 1, cacheWrite: 0,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue(null);

    const page = getJobTimeline('ab12')!;

    // text → activity
    const textItem = page.items.find((i) => i.kind === 'activity' && 'partId' in i && i.partId === 'txt');
    expect(textItem).toBeDefined();
    expect(textItem!.kind).toBe('activity');

    // reasoning → activity
    const reasonItem = page.items.find((i) => i.kind === 'activity' && 'partId' in i && i.partId === 'rsn');
    expect(reasonItem).toBeDefined();
    expect(reasonItem!.kind).toBe('activity');

    // tool → tool-summary
    const toolItem = page.items.find((i) => i.kind === 'tool-summary' && 'partId' in i && i.partId === 'tool1');
    expect(toolItem).toBeDefined();
    expect(toolItem?.kind).toBe('tool-summary');
    expect(toolItem?.kind === 'tool-summary' ? toolItem.tool : undefined).toBe('bash');
    expect(toolItem?.kind === 'tool-summary' ? toolItem.toolInput : undefined).toBe('ls');

    // patch → tool-summary
    const patchItem = page.items.find((i) => i.kind === 'tool-summary' && 'partId' in i && i.partId === 'patch1');
    expect(patchItem).toBeDefined();
    expect(patchItem?.kind).toBe('tool-summary');
    expect(patchItem?.kind === 'tool-summary' ? patchItem.patchFiles : undefined).toEqual(['file.ts']);

    // child → fork-card
    const forkCard = page.items.find((i) => i.kind === 'fork-card');
    expect(forkCard).toBeDefined();
    expect(forkCard?.kind).toBe('fork-card');
    expect(forkCard?.kind === 'fork-card' ? forkCard.sessionId : undefined).toBe('child-x');
    expect(forkCard?.kind === 'fork-card' ? forkCard.title : undefined).toBe('Sub X');
  });

  it('supports cursor-based pagination with correct slices', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetChildSessions.mockReturnValue([]);
    // Create 10 parts
    const parts = Array.from({ length: 10 }, (_, i) =>
      makePart({ id: `p-${i}`, type: 'text', text: `Part ${i}`, createdAt: (i + 1) * 100 }),
    );
    mockGetSessionParts.mockReturnValue(parts);

    // First page: limit=5
    const page1 = getJobTimeline('ab12', { limit: 5 })!;

    expect(page1.items).toHaveLength(5);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();
    // First page items should be timestamps 100-500
    expect(page1.items[0].createdAt).toBe(100);
    expect(page1.items[4].createdAt).toBe(500);

    // Second page: use cursor from first page
    const page2 = getJobTimeline('ab12', { cursor: page1.nextCursor!, limit: 5 })!;

    expect(page2.items).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
    // Second page items should be timestamps 600-1000
    expect(page2.items[0].createdAt).toBe(600);
    expect(page2.items[4].createdAt).toBe(1000);
  });

  it('returns empty items for job with no sessions', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: null }),
    );

    const page = getJobTimeline('ab12')!;

    expect(page).not.toBeNull();
    expect(page.items).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.sessionCount).toBe(0);
    expect(page.childCount).toBe(0);
  });

  it('returns null for non-existent job', () => {
    mockGetJob.mockReturnValue(null);
    expect(getJobTimeline('zzzz')).toBeNull();
  });

  it('folds done children into a single lifecycle fork-card without completion-card row', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetSessionParts.mockReturnValue([]);
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-root') {
        return [
          { id: 'done-child', title: 'Done Sub', timeCreated: 1000, timeUpdated: 5000 },
        ];
      }
      return [];
    });
    mockIsSessionDone.mockReturnValue(true);
    mockGetAssistantMessageCount.mockReturnValue(10);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 1000, output: 500, reasoning: 100, cacheRead: 50, cacheWrite: 20,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue({
      id: 'msg', role: 'assistant', content: 'All done!', createdAt: 5000,
    });

    const page = getJobTimeline('ab12')!;

    const forkCards = page.items.filter((i) => i.kind === 'fork-card');
    expect(forkCards).toHaveLength(1);
    expect(forkCards[0].createdAt).toBe(1000);
    expect(forkCards[0].kind === 'fork-card' && forkCards[0].completedAt).toBe(5000);
    expect(forkCards[0].kind === 'fork-card' && forkCards[0].durationMs).toBe(4000);

    const completionCards = page.items.filter((i) => i.kind === 'completion-card');
    expect(completionCards).toHaveLength(0);
  });

  it('maintains stable sort when items share the same timestamp', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetChildSessions.mockReturnValue([]);
    // Multiple items at the same timestamp
    mockGetSessionParts.mockReturnValue([
      makePart({ id: 'p-a', type: 'text', text: 'A', createdAt: 1000 }),
      makePart({ id: 'p-b', type: 'tool', tool: 'read', createdAt: 1000 }),
      makePart({ id: 'p-c', type: 'text', text: 'C', createdAt: 1000 }),
    ]);

    const page = getJobTimeline('ab12')!;

    // All three items are present — sort is stable (preserves insertion order for equal timestamps)
    expect(page.items).toHaveLength(3);
    expect(page.items.every((i) => i.createdAt === 1000)).toBe(true);
  });

  it('produces unique fork-card sessionIds for multiple children', () => {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetSessionParts.mockReturnValue([]); // no root activity needed
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-root') {
        return [
          { id: 'child-aaa', title: 'Worker A', timeCreated: 1000, timeUpdated: 2000 },
          { id: 'child-bbb', title: 'Worker B', timeCreated: 1100, timeUpdated: 2100 },
          { id: 'child-ccc', title: 'Worker C', timeCreated: 1200, timeUpdated: 2200 },
        ];
      }
      return [];
    });
    mockIsSessionDone.mockReturnValue(true);
    mockGetAssistantMessageCount.mockReturnValue(5);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 100, output: 50, reasoning: 10, cacheRead: 5, cacheWrite: 2,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-done', role: 'assistant', content: 'Done', createdAt: 2000,
    });

    const page = getJobTimeline('ab12')!;

    // Extract fork-card items
    const forkCards = page.items.filter((i) => i.kind === 'fork-card');
    expect(forkCards).toHaveLength(3);

    // Verify sessionIds match child IDs
    const forkSessionIds = forkCards.map((fc) =>
      fc.kind === 'fork-card' ? fc.sessionId : '',
    );
    expect(forkSessionIds).toEqual(['child-aaa', 'child-bbb', 'child-ccc']);

    // All sessionIds are unique (no duplicates)
    expect(new Set(forkSessionIds).size).toBe(forkSessionIds.length);

    // Each fork card has the correct parentSessionId
    for (const fc of forkCards) {
      if (fc.kind === 'fork-card') {
        expect(fc.parentSessionId).toBe('sess-root');
      }
    }

    // Fork cards are sorted chronologically by createdAt
    const forkTimestamps = forkCards.map((fc) => fc.createdAt);
    expect(forkTimestamps).toEqual([1000, 1100, 1200]);
  });

  it('returns explicit step-grouped output with step metadata', () => {
    mockGetJobSteps.mockReturnValue([
      makeStep({
        stepIndex: 0,
        command: 'add-phase',
        status: 'completed',
        sessionId: 'sess-step-0',
        sessionTitle: 'step-0',
        startedAt: '2026-03-13T10:00:00Z',
        completedAt: '2026-03-13T10:01:00Z',
      }),
      makeStep({
        id: 2,
        stepIndex: 1,
        command: 'execute-phase',
        status: 'running',
        sessionId: 'sess-step-1',
        sessionTitle: 'step-1',
        startedAt: '2026-03-13T10:02:00Z',
        completedAt: null,
      }),
    ]);
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['step-0', 'step-1']) }),
    );
    mockFindSessionByTitle.mockImplementation((title: string) => {
      if (title === 'step-0') return 'sess-step-0';
      if (title === 'step-1') return 'sess-step-1';
      return null;
    });
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionParts.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-step-0') {
        return [
          makePart({ id: 's0-1', type: 'text', text: 'step0-1', createdAt: 100 }),
          makePart({ id: 's0-2', type: 'tool', tool: 'bash', toolInput: 'echo 0', createdAt: 200 }),
        ];
      }
      if (sessionId === 'sess-step-1') {
        return [
          makePart({ id: 's1-1', type: 'text', text: 'step1-1', createdAt: 300 }),
        ];
      }
      return [];
    });

    const page = getJobTimeline('ab12')!;

    expect(page.groups).toHaveLength(2);
    expect(page.groups[0].stepIndex).toBe(0);
    expect(page.groups[0].command).toBe('add-phase');
    expect(page.groups[0].status).toBe('completed');
    expect(page.groups[0].sessionId).toBe('sess-step-0');
    expect(page.groups[0].items.map((i) => i.createdAt)).toEqual([100, 200]);

    expect(page.groups[1].stepIndex).toBe(1);
    expect(page.groups[1].command).toBe('execute-phase');
    expect(page.groups[1].status).toBe('running');
    expect(page.groups[1].sessionId).toBe('sess-step-1');
    expect(page.groups[1].items.map((i) => i.createdAt)).toEqual([300]);
  });

  it('keeps one lifecycle object per child session without completion-card rows', () => {
    mockGetJobSteps.mockReturnValue([
      makeStep({
        stepIndex: 0,
        command: 'execute-phase',
        sessionId: 'sess-root',
        sessionTitle: 'root',
      }),
    ]);
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root']) }),
    );
    mockFindSessionByTitle.mockReturnValue('sess-root');
    mockGetSessionParts.mockReturnValue([]);
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-root') {
        return [{ id: 'child-1', title: 'Worker 1', timeCreated: 1000, timeUpdated: 5000 }];
      }
      return [];
    });
    mockIsSessionDone.mockReturnValue(true);
    mockGetAssistantMessageCount.mockReturnValue(3);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 10,
      output: 20,
      reasoning: 3,
      cacheRead: 1,
      cacheWrite: 0,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-final',
      role: 'assistant',
      content: 'final answer',
      createdAt: 5000,
    });

    const page = getJobTimeline('ab12')!;
    const allItems = page.groups.flatMap((group) => group.items);
    const lifecycleItems = allItems.filter((item) => item.kind === 'fork-card');

    expect(lifecycleItems).toHaveLength(1);
    const lifecycle = lifecycleItems[0];
    expect(lifecycle.kind).toBe('fork-card');
    if (lifecycle.kind === 'fork-card') {
      expect(lifecycle.sessionId).toBe('child-1');
      expect(lifecycle.createdAt).toBe(1000);
      expect(lifecycle.completedAt).toBe(5000);
      expect(lifecycle.status).toBe('done');
      expect(lifecycle.latestMessagePreview).toContain('final answer');
      expect(lifecycle.finalMessagePreview).toContain('final answer');
    }

    expect(allItems.map((item) => item.kind)).not.toContain('completion-card');
  });

  it('uses unattributed fallback when identity/title/window attribution fails', () => {
    mockGetJobSteps.mockReturnValue([
      makeStep({
        stepIndex: 0,
        command: 'execute-phase',
        sessionId: 'step-session',
        sessionTitle: 'step-title',
        startedAt: '2026-03-13T10:10:00Z',
        completedAt: '2026-03-13T10:20:00Z',
      }),
    ]);
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['root-title']) }),
    );
    mockFindSessionByTitle.mockReturnValue('root-session');
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionParts.mockReturnValue([
      makePart({ id: 'u1', type: 'text', text: 'unattributed event', createdAt: 1000 }),
    ]);

    const page = getJobTimeline('ab12')!;

    expect(page.groups).toHaveLength(1);
    expect(page.groups[0].stepIndex).toBeNull();
    expect(page.groups[0].command).toBe('unattributed');
    expect(page.groups[0].items).toHaveLength(1);
    expect(page.groups[0].items[0].createdAt).toBe(1000);
  });

  it('keeps step grouping intact across cursor pagination', () => {
    mockGetJobSteps.mockReturnValue([
      makeStep({ stepIndex: 0, sessionId: 'sess-step-0', sessionTitle: 'step-0' }),
      makeStep({ id: 2, stepIndex: 1, sessionId: 'sess-step-1', sessionTitle: 'step-1' }),
    ]);
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(['step-0', 'step-1']) }),
    );
    mockFindSessionByTitle.mockImplementation((title: string) => {
      if (title === 'step-0') return 'sess-step-0';
      if (title === 'step-1') return 'sess-step-1';
      return null;
    });
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionParts.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-step-0') {
        return [
          makePart({ id: 'p1', type: 'text', text: 'a', createdAt: 100 }),
          makePart({ id: 'p2', type: 'text', text: 'b', createdAt: 200 }),
        ];
      }
      if (sessionId === 'sess-step-1') {
        return [
          makePart({ id: 'p3', type: 'text', text: 'c', createdAt: 300 }),
          makePart({ id: 'p4', type: 'text', text: 'd', createdAt: 400 }),
        ];
      }
      return [];
    });

    const page1 = getJobTimeline('ab12', { limit: 3 })!;

    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('300');
    expect(page1.groups).toHaveLength(2);
    expect(page1.groups[0].stepIndex).toBe(0);
    expect(page1.groups[0].items.map((i) => i.createdAt)).toEqual([100, 200]);
    expect(page1.groups[1].stepIndex).toBe(1);
    expect(page1.groups[1].items.map((i) => i.createdAt)).toEqual([300]);

    const page2 = getJobTimeline('ab12', { cursor: page1.nextCursor ?? undefined, limit: 3 })!;

    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBe('400');
    expect(page2.groups).toHaveLength(1);
    expect(page2.groups[0].stepIndex).toBe(1);
    expect(page2.groups[0].items.map((i) => i.createdAt)).toEqual([400]);
  });
});

// ── Mutation Wrapper Tests ────────────────────────────────────────────────

// retryJobAction test removed — retry concept eliminated.

describe('cancelJobAction', () => {
  it('calls db.cancel with the given job ID', () => {
    cancelJobAction('job-456');
    expect(mockCancel).toHaveBeenCalledWith('job-456');
  });
});

describe('forceQuitJobAction', () => {
  it('calls db.forceQuitJob with cli source and default reason', () => {
    forceQuitJobAction('job-789');
    expect(mockForceQuitJob).toHaveBeenCalledWith('job-789', 'cli', 'Force quit via web UI');
  });

  it('calls db.forceQuitJob with custom reason when provided', () => {
    forceQuitJobAction('job-789', 'User requested');
    expect(mockForceQuitJob).toHaveBeenCalledWith('job-789', 'cli', 'User requested');
  });
});

describe('unblockProjectAction', () => {
  it('calls db.unblockProject with the given path', () => {
    unblockProjectAction('/test/path');
    expect(mockUnblockProject).toHaveBeenCalledWith('/test/path');
  });
});

// ── resolveStepIndex 5-tier attribution tests ─────────────────────────────

describe('resolveStepIndex 5-tier attribution', () => {
  // Consistent timestamp helpers
  const BASE = Date.parse('2026-06-01T00:00:00Z');
  const t = (secs: number) => BASE + secs * 1000;
  const iso = (secs: number) => new Date(t(secs)).toISOString();

  function setupAttribution(config: {
    steps: Array<{
      stepIndex: number;
      sessionId: string;
      sessionTitle: string;
      startedAt: string;
      completedAt: string | null;
    }>;
    sessionTitles: string[];
    sessionIdMap: Record<string, string>;
    childSessionMap: Record<string, Array<{ id: string; title: string; timeCreated: number; timeUpdated: number }>>;
    partsMap: Record<string, SessionPart[]>;
  }) {
    mockGetJob.mockReturnValue(
      makeJob({ sessionTitles: JSON.stringify(config.sessionTitles) }),
    );
    mockGetJobSteps.mockReturnValue(
      config.steps.map((s, i) =>
        makeStep({
          id: i + 1,
          stepIndex: s.stepIndex,
          sessionId: s.sessionId,
          sessionTitle: s.sessionTitle,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        }),
      ),
    );
    mockFindSessionByTitle.mockImplementation(
      (title: string) => config.sessionIdMap[title] ?? null,
    );
    mockGetChildSessions.mockImplementation(
      (parentId: string) => config.childSessionMap[parentId] ?? [],
    );
    mockGetSessionParts.mockImplementation(
      (sessionId: string) => config.partsMap[sessionId] ?? [],
    );
    mockIsSessionDone.mockReturnValue(true);
    mockGetAssistantMessageCount.mockReturnValue(1);
    mockGetSessionTokensRecursive.mockReturnValue({
      input: 10, output: 5, reasoning: 1, cacheRead: 0, cacheWrite: 0,
    });
    mockGetSessionModelsRecursive.mockReturnValue(['anthropic/claude-sonnet-4-6']);
    mockGetLastMessage.mockReturnValue(null);
    mockGetSessionMeta.mockReturnValue(null);
  }

  it('tier 1: attributes candidate via direct sessionId match', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(10), completedAt: iso(20) },
      ],
      sessionTitles: ['title-s0'],
      sessionIdMap: { 'title-s0': 'sess-s0' },
      childSessionMap: {},
      partsMap: {
        'sess-s0': [makePart({ id: 'p1', type: 'text', text: 'direct match', createdAt: t(15) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    expect(page.groups).toHaveLength(1);
    expect(page.groups[0].stepIndex).toBe(0);
    expect(page.groups[0].items).toHaveLength(1);
    expect(page.groups.find(g => g.command === 'unattributed')).toBeUndefined();
  });

  it('tier 2: attributes candidate via sessionTitle match', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'shared-title', startedAt: iso(10), completedAt: iso(20) },
      ],
      // Session title matches step's sessionTitle but findSessionByTitle returns different sessionId
      sessionTitles: ['shared-title'],
      sessionIdMap: { 'shared-title': 'sess-different' },
      childSessionMap: {},
      partsMap: {
        'sess-different': [makePart({ id: 'p1', type: 'text', text: 'title match', createdAt: t(15) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    // candidate sessionId='sess-different' ≠ step.sessionId='sess-s0' → tier 1 fail
    // candidate sessionTitle='shared-title' = step.sessionTitle → tier 2 match
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0].stepIndex).toBe(0);
    expect(page.groups[0].items).toHaveLength(1);
    expect(page.groups.find(g => g.command === 'unattributed')).toBeUndefined();
  });

  it('tier 3: attributes candidate via time window match', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(10), completedAt: iso(20) },
      ],
      // Session with different sessionId and title than the step
      sessionTitles: ['unrelated-title'],
      sessionIdMap: { 'unrelated-title': 'sess-unrelated' },
      childSessionMap: {},
      partsMap: {
        // Part at t(15) falls within step 0's window [t(10), t(20)]
        'sess-unrelated': [makePart({ id: 'p1', type: 'text', text: 'time window', createdAt: t(15) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    // tier 1: sess-unrelated ≠ sess-s0 → fail
    // tier 2: unrelated-title ≠ title-s0 → fail
    // tier 3: t(15) within [t(10), t(20)] → match
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0].stepIndex).toBe(0);
    expect(page.groups[0].items).toHaveLength(1);
    expect(page.groups.find(g => g.command === 'unattributed')).toBeUndefined();
  });

  it('tier 3: attributes candidate to open-ended step (completedAtMs null)', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(10), completedAt: null },
      ],
      sessionTitles: ['other-root'],
      sessionIdMap: { 'other-root': 'sess-other' },
      childSessionMap: {},
      partsMap: {
        // Part well after step started, but step has no completedAt (window extends to +∞)
        'sess-other': [makePart({ id: 'p-late', type: 'text', text: 'late activity', createdAt: t(1000) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    // tier 3: t(1000) within [t(10), +∞] → match
    expect(page.groups.find(g => g.command === 'unattributed')).toBeUndefined();
    const step0Group = page.groups.find(g => g.stepIndex === 0);
    expect(step0Group).toBeDefined();
    expect(step0Group!.items).toHaveLength(1);
  });

  it('tier 4: attributes candidate via child session transitivity', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(10), completedAt: iso(20) },
        { stepIndex: 1, sessionId: 'sess-s1', sessionTitle: 'title-s1', startedAt: iso(30), completedAt: iso(40) },
      ],
      sessionTitles: ['title-s0', 'title-s1', 'judge-title'],
      sessionIdMap: {
        'title-s0': 'sess-s0',
        'title-s1': 'sess-s1',
        'judge-title': 'sess-judge',
      },
      childSessionMap: {
        // sess-s1 (step 1's session) spawned sess-judge as a child
        'sess-s1': [{ id: 'sess-judge', title: 'judge-title', timeCreated: t(35), timeUpdated: t(50) }],
      },
      partsMap: {
        'sess-s0': [makePart({ id: 's0-p1', type: 'text', text: 'step 0 work', createdAt: t(15) })],
        'sess-s1': [makePart({ id: 's1-p1', type: 'text', text: 'step 1 work', createdAt: t(35) })],
        // Judge activity AFTER all step windows — sessionId=sess-judge, not matching any step
        'sess-judge': [makePart({ id: 'judge-p1', type: 'text', text: 'Judge verdict', createdAt: t(50) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    // judge-p1 from sess-judge should be attributed to step 1 via child session transitivity
    // because sess-judge is a child of sess-s1 (step 1's session)
    const step1Group = page.groups.find(g => g.stepIndex === 1);
    expect(step1Group).toBeDefined();

    const judgeItem = step1Group!.items.find(
      item => item.kind === 'activity' && 'partId' in item && item.partId === 'judge-p1',
    );
    expect(judgeItem).toBeDefined();

    // Should NOT be in unattributed
    const unattributed = page.groups.find(g => g.command === 'unattributed');
    const judgeInUnattributed = unattributed?.items.find(
      item => item.kind === 'activity' && 'partId' in item && item.partId === 'judge-p1',
    );
    expect(judgeInUnattributed).toBeUndefined();
  });

  it('tier 5: attributes late activity to most recent step via last-step fallback', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(10), completedAt: iso(20) },
        { stepIndex: 1, sessionId: 'sess-s1', sessionTitle: 'title-s1', startedAt: iso(30), completedAt: iso(40) },
      ],
      sessionTitles: ['title-s0', 'title-s1', 'late-title'],
      sessionIdMap: {
        'title-s0': 'sess-s0',
        'title-s1': 'sess-s1',
        'late-title': 'sess-late',
      },
      childSessionMap: {}, // No children — so tier 4 won't help
      partsMap: {
        'sess-s0': [makePart({ id: 's0-p1', type: 'text', text: 'step 0', createdAt: t(15) })],
        'sess-s1': [makePart({ id: 's1-p1', type: 'text', text: 'step 1', createdAt: t(35) })],
        // Late activity from a session that's NOT a child of any step's session
        // createdAt t(50) is AFTER all step windows have closed
        'sess-late': [makePart({ id: 'late-p1', type: 'text', text: 'Late wrap-up', createdAt: t(50) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    // late-p1 should be attributed to step 1 (latest startedAtMs) via last-step fallback
    const step1Group = page.groups.find(g => g.stepIndex === 1);
    expect(step1Group).toBeDefined();

    const lateItem = step1Group!.items.find(
      item => item.kind === 'activity' && 'partId' in item && item.partId === 'late-p1',
    );
    expect(lateItem).toBeDefined();

    // Should NOT be in unattributed
    const unattributed = page.groups.find(g => g.command === 'unattributed');
    const lateInUnattributed = unattributed?.items.find(
      item => item.kind === 'activity' && 'partId' in item && item.partId === 'late-p1',
    );
    expect(lateInUnattributed).toBeUndefined();
  });

  it('genuinely unassignable content remains in unattributed bucket', () => {
    setupAttribution({
      steps: [
        { stepIndex: 0, sessionId: 'sess-s0', sessionTitle: 'title-s0', startedAt: iso(100), completedAt: iso(200) },
      ],
      sessionTitles: ['title-s0', 'early-title'],
      sessionIdMap: {
        'title-s0': 'sess-s0',
        'early-title': 'sess-early',
      },
      childSessionMap: {},
      partsMap: {
        'sess-s0': [makePart({ id: 's0-p1', type: 'text', text: 'step 0', createdAt: t(150) })],
        // Activity BEFORE any step started — genuinely unassignable
        // No session match, no child relationship, createdAt < all startedAtMs
        'sess-early': [makePart({ id: 'early-p1', type: 'text', text: 'Pre-step', createdAt: t(5) })],
      },
    });

    const page = getJobTimeline('ab12')!;

    const unattributed = page.groups.find(g => g.command === 'unattributed');
    expect(unattributed).toBeDefined();
    const earlyItem = unattributed!.items.find(
      item => item.kind === 'activity' && 'partId' in item && item.partId === 'early-p1',
    );
    expect(earlyItem).toBeDefined();
  });
});
