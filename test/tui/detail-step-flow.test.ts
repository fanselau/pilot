import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BranchLifecycleItem,
  GroupedTimelinePage,
  Job,
  StepTimelineItem,
  TimelineActivityItem,
} from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  getJobTimeline: vi.fn<(jobId: string, options?: { cursor?: string; limit?: number }) => GroupedTimelinePage | null>(() => null),
}));

vi.mock('../../src/core/job-detail-query.js', () => ({
  getJobTimeline: mocks.getJobTimeline,
}));

import { fetchJobTimelineSnapshot } from '../../src/tui/data/opencode-db.js';
import type { TimelineSection } from '../../src/tui/data/opencode-db.js';
import { formatStepSectionHeader, mergeTimelineSections } from '../../src/tui/views/detail.js';

function makeActivity(overrides: Partial<TimelineActivityItem> = {}): TimelineActivityItem {
  return {
    kind: 'activity',
    sessionId: 'root-session',
    partId: 'part-1',
    role: 'assistant',
    createdAt: 10,
    text: 'activity',
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchLifecycleItem> = {}): BranchLifecycleItem {
  return {
    kind: 'fork-card',
    sessionId: 'child-session',
    parentSessionId: 'root-session',
    title: 'gsd-executor',
    createdAt: 20,
    updatedAt: 20,
    completedAt: null,
    status: 'active',
    messageCount: 1,
    tokenTotal: 50,
    models: ['openai/gpt-5.4'],
    latestMessagePreview: 'working',
    finalMessagePreview: null,
    childCount: 0,
    durationMs: 1000,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<TimelineSection> = {}): TimelineSection {
  return {
    key: 'step:0:root-session',
    stepIndex: 0,
    command: 'execute-phase',
    status: 'running',
    sessionId: 'root-session',
    items: [],
    ...overrides,
  };
}

describe('TUI step timeline adapter', () => {
  beforeEach(() => {
    mocks.getJobTimeline.mockReset();
  });

  it('keeps explicit step boundaries and chronological ordering inside each group', () => {
    mocks.getJobTimeline.mockReturnValue({
      groups: [
        {
          stepIndex: 0,
          command: 'execute-phase',
          status: 'running',
          sessionId: 'root-session',
          items: [
            makeActivity({ partId: 'later', createdAt: 30, text: 'later message' }),
            makeActivity({ partId: 'earlier', createdAt: 10, text: 'earlier message' }),
          ],
        },
      ],
      items: [],
      hasMore: false,
      nextCursor: null,
      sessionCount: 1,
      childCount: 0,
    });

    const snapshot = fetchJobTimelineSnapshot({ id: 'job-1' } as Job);
    expect(snapshot.groups).toHaveLength(1);
    expect(formatStepSectionHeader(snapshot.groups[0])).toBe('  ── Step 1: execute-phase [running] ──');
    expect(snapshot.groups[0].items.map((item) => item.createdAt)).toEqual([10, 30]);
  });

  it('falls back to an unattributed step section when grouped data is missing', () => {
    const orphan = makeActivity({ partId: 'orphan', createdAt: 42, text: 'orphan activity' });
    mocks.getJobTimeline.mockReturnValue({
      groups: [],
      items: [orphan],
      hasMore: false,
      nextCursor: null,
      sessionCount: 1,
      childCount: 0,
    });

    const snapshot = fetchJobTimelineSnapshot({ id: 'job-2' } as Job);
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0].stepIndex).toBeNull();
    expect(snapshot.groups[0].command).toBe('unattributed');
    expect(snapshot.groups[0].items).toEqual([orphan]);
  });
});

describe('TUI lifecycle merge semantics', () => {
  it('maintains one branch lifecycle object per child session across updates', () => {
    const existing = [
      makeGroup({
        items: [makeBranch({ sessionId: 'child-1', status: 'active', latestMessagePreview: 'working' })],
      }),
    ];

    const incoming = [
      makeGroup({
        items: [makeBranch({ sessionId: 'child-1', status: 'done', finalMessagePreview: 'finished' })],
      }),
    ];

    const merged = mergeTimelineSections(existing, incoming);
    const branches = merged[0].items.filter((item): item is BranchLifecycleItem => item.kind === 'fork-card');

    expect(branches).toHaveLength(1);
    expect(branches[0].sessionId).toBe('child-1');
    expect(branches[0].status).toBe('done');
    expect(branches[0].finalMessagePreview).toBe('finished');
  });

  it('uses immutable session IDs for updates even when titles collide', () => {
    const existingBranches: StepTimelineItem[] = [
      makeBranch({ sessionId: 'child-A', title: 'executor', status: 'active', latestMessagePreview: 'A working' }),
      makeBranch({ sessionId: 'child-B', title: 'executor', status: 'active', latestMessagePreview: 'B working' }),
    ];

    const incomingBranches: StepTimelineItem[] = [
      makeBranch({ sessionId: 'child-B', title: 'executor', status: 'done', finalMessagePreview: 'B done' }),
    ];

    const merged = mergeTimelineSections(
      [makeGroup({ items: existingBranches })],
      [makeGroup({ items: incomingBranches })],
    );

    const branchA = merged[0].items.find(
      (item): item is BranchLifecycleItem => item.kind === 'fork-card' && item.sessionId === 'child-A',
    );
    const branchB = merged[0].items.find(
      (item): item is BranchLifecycleItem => item.kind === 'fork-card' && item.sessionId === 'child-B',
    );

    expect(branchA?.status).toBe('active');
    expect(branchA?.finalMessagePreview).toBeNull();
    expect(branchB?.status).toBe('done');
    expect(branchB?.finalMessagePreview).toBe('B done');
  });
});
