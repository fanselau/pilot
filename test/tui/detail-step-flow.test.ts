import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GroupedTimelinePage,
  Job,
  TimelineActivityItem,
  TimelineSection as CoreTimelineSection,
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

function makeSection(overrides: Partial<CoreTimelineSection> = {}): CoreTimelineSection {
  return {
    sessionId: 'root-session',
    parentSessionId: null,
    title: 'root',
    status: 'active',
    models: [],
    durationMs: null,
    depth: 0,
    items: [],
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
    subsessions: [],
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
          source: 'delegation',
          sessionId: 'root-session',
          sections: [
            makeSection({
              items: [
                makeActivity({ partId: 'later', createdAt: 30, text: 'later message' }),
                makeActivity({ partId: 'earlier', createdAt: 10, text: 'earlier message' }),
              ],
            }),
          ],
        },
      ],
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

  it('returns empty groups when no data', () => {
    mocks.getJobTimeline.mockReturnValue({
      groups: [],
      hasMore: false,
      nextCursor: null,
      sessionCount: 0,
      childCount: 0,
    });

    const snapshot = fetchJobTimelineSnapshot({ id: 'job-2' } as Job);
    expect(snapshot.groups).toHaveLength(0);
  });
});

describe('TUI section merge semantics', () => {
  it('merges existing section items with incoming data', () => {
    const existing = [
      makeGroup({
        items: [makeActivity({ partId: 'old', createdAt: 10, text: 'old' })],
      }),
    ];

    const incoming = [
      makeGroup({
        items: [makeActivity({ partId: 'new', createdAt: 20, text: 'new' })],
      }),
    ];

    const merged = mergeTimelineSections(existing, incoming);
    expect(merged).toHaveLength(1);
    // Both items present after merge (keyed by partId)
    expect(merged[0].items).toHaveLength(2);
    expect(merged[0].items.map(i => i.kind === 'activity' ? i.text : '')).toEqual(['old', 'new']);
  });

  it('preserves subsession metadata through merges', () => {
    const existing = [
      makeGroup({
        subsessions: [{ sessionId: 'child-1', parentSessionId: 'root-session', title: 'planner', status: 'active', models: ['m1'], durationMs: null }],
      }),
    ];

    const incoming = [
      makeGroup({
        subsessions: [{ sessionId: 'child-1', parentSessionId: 'root-session', title: 'planner', status: 'done', models: ['m1'], durationMs: 5000 }],
      }),
    ];

    const merged = mergeTimelineSections(existing, incoming);
    expect(merged[0].subsessions).toHaveLength(1);
    expect(merged[0].subsessions[0].status).toBe('done');
    expect(merged[0].subsessions[0].durationMs).toBe(5000);
  });
});
