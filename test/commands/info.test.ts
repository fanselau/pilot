import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStep, ModelEntry } from '../../src/core/types.js';

const mockGetJob = vi.fn();
const mockGetJobSteps = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
}));

const mockResolveProjectDir = vi.fn((project: string) => `/resolved/${project}`);

vi.mock('../../src/core/config.js', () => ({
  resolveProjectDir: (project: string) => mockResolveProjectDir(project),
}));

const mockIsGitWorktree = vi.fn();
const mockIsWorktreeDirty = vi.fn();
const mockResolveCommitOrNull = vi.fn();
const mockClassifyHeadRelation = vi.fn();

vi.mock('../../src/core/git-recovery.js', () => ({
  isGitWorktree: (...args: unknown[]) => mockIsGitWorktree(...args),
  isWorktreeDirty: (...args: unknown[]) => mockIsWorktreeDirty(...args),
  resolveCommitOrNull: (...args: unknown[]) => mockResolveCommitOrNull(...args),
  classifyHeadRelation: (...args: unknown[]) => mockClassifyHeadRelation(...args),
}));

const mockFindSessionByTitle = vi.fn();
const mockGetSessionTokens = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  getSessionTokens: (...args: unknown[]) => mockGetSessionTokens(...args),
}));

const mockResolveAllAgentModels = vi.fn();

vi.mock('../../src/core/models.js', () => ({
  resolveAllAgentModels: (...args: unknown[]) => mockResolveAllAgentModels(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  isJsonMode: () => mockJsonMode,
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
}));

vi.mock('../../src/util/colors.js', () => ({
  bold: (s: string) => s,
  dim: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
}));

import { infoCommand } from '../../src/commands/info.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'quick',
    description: 'test job',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-07T00:00:00Z',
    startedAt: '2026-03-07T00:01:00Z',
    completedAt: '2026-03-07T00:10:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    allowDirtyStart: false,
    startedDirty: false,
    ...overrides,
  };
}

const emptySteps: JobStep[] = [];
const resolvedModels: Record<string, ModelEntry> = {
  'gsd-executor': { model: 'anthropic/claude-sonnet-4-20250514' },
  'gsd-orchestrator': { model: 'anthropic/claude-opus-4-6' },
};

describe('infoCommand recovery visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue(emptySteps);

    mockFindSessionByTitle.mockReturnValue(null);
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });

    mockResolveAllAgentModels.mockReturnValue(resolvedModels);
    mockIsGitWorktree.mockResolvedValue(true);
    mockIsWorktreeDirty.mockResolvedValue(false);
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockResolveCommitOrNull.mockImplementation((_cwd: string, rev: string) => {
      if (rev === 'HEAD') return Promise.resolve('3333333333333333333333333333333333333333');
      if (rev === '1111111111111111111111111111111111111111') {
        return Promise.resolve('1111111111111111111111111111111111111111');
      }
      if (rev === '2222222222222222222222222222222222222222') {
        return Promise.resolve('2222222222222222222222222222222222222222');
      }
      return Promise.resolve(null);
    });
  });

  it('renders a Recovery block with safe undo metadata', async () => {
    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Recovery');
    expect(output).toContain('undo:safe');
    expect(output).toContain('Base:');
    expect(output).toContain('111111111111');
    expect(output).toContain('Head:');
    expect(output).toContain('222222222222');
    expect(output).toContain('Guidance:');
    expect(output).toContain('pilot undo <id> --dry-run');
  });

  it('returns recovery object in JSON output with newer-work guard state', async () => {
    mockJsonMode = true;
    mockClassifyHeadRelation.mockResolvedValue('newer-work-exists');

    await infoCommand('ab12', { json: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const payload = mockOutputJson.mock.calls[0][0];
    expect(payload).toHaveProperty('job');
    expect(payload).toHaveProperty('steps');
    expect(payload).toHaveProperty('sessions');
    expect(payload).toHaveProperty('tokenUsage');
    expect(payload).toHaveProperty('recovery');
    expect(payload.recovery).toMatchObject({
      state: 'guarded',
      tag: 'undo:guarded-newer-work',
      relation: 'newer-work-exists',
      blockedByNewerWork: true,
    });
    expect(payload.recovery.guidance).toContain('Undo blocked by newer work');
  });

  it('marks recovery unavailable when checkpoint metadata is missing', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: null, gitHeadCommit: null }));

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('undo:unavailable');
    expect(output).toContain('no recorded base/head checkpoints');
  });
});
