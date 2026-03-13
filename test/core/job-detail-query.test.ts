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

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(args[0] as string),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(args[0] as string),
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
}));

import {
  getJobDetail,
  summarizeSession,
  getSessionActivity,
  getSessionChildSummaries,
  getJobDetailEvents,
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
