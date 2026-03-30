/**
 * Tests for `pilot project <path>` and `pilot projects` commands.
 *
 * Covers: info display, --block, --unblock, --notify-* route management,
 * --clear-notify, --blocked filter, job counts, human/JSON output.
 *
 * Mocks: db.ts, output.ts, colors.ts, config.ts, managed-gsd.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '../../src/core/types.js';
import type { ProjectJobCounts } from '../../src/core/db.js';

// ── Mock data ──────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    path: '/test/project',
    owner: null,
    notifyRoutes: null,
    status: 'active' as const,
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-05T10:00:00',
    defaultCategories: null,
    approvedGsdVersion: null,
    installedGsdVersion: null,
    gsdDriftStatus: null,
    gsdVersionCheckedAt: null,
    gsdVersionError: null,
    ...overrides,
  };
}

function makeCounts(overrides: Partial<ProjectJobCounts> = {}): ProjectJobCounts {
  return {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockProject: Project | null = null;
let mockAllProjects: Project[] = [];
let mockCounts: ProjectJobCounts = makeCounts();
const mockInspectProjectGsdState = vi.fn();

const mockGetProject = vi.fn();
const mockBlockProject = vi.fn();
const mockUnblockProject = vi.fn();
const mockUpdateProjectNotifyRoutes = vi.fn();
const mockGetProjectJobCounts = vi.fn();
const mockGetAllProjects = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getProject: (path: string) => mockGetProject(path),
  blockProject: (path: string, reason: string) => mockBlockProject(path, reason),
  unblockProject: (path: string) => mockUnblockProject(path),
  updateProjectNotifyRoutes: (path: string, routes: unknown) => mockUpdateProjectNotifyRoutes(path, routes),
  getProjectJobCounts: (path: string) => mockGetProjectJobCounts(path),
  getAllProjects: () => mockGetAllProjects(),
}));

vi.mock('../../src/core/managed-gsd.js', () => ({
  inspectProjectGsdState: (...args: unknown[]) => mockInspectProjectGsdState(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  isJsonMode: () => mockJsonMode,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
}));

vi.mock('../../src/core/config.js', () => ({
  resolveProjectDir: (s: string) => s,
}));

import { projectCommand } from '../../src/commands/project.js';
import { projectsCommand } from '../../src/commands/projects.js';

// ── Setup / Teardown ──────────────────────────────────────────────────────

let stderrSpy: any;
let exitSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockProject = null;
  mockAllProjects = [];
  mockCounts = makeCounts();

  mockGetProject.mockImplementation(() => mockProject);
  mockGetProjectJobCounts.mockImplementation(() => mockCounts);
  mockGetAllProjects.mockImplementation(() => mockAllProjects);
  mockInspectProjectGsdState.mockResolvedValue({
    approvedVersion: '1.24.0',
    installedVersion: '1.24.0',
    driftStatus: 'matches',
    checkedAt: '2026-03-26T12:00:00Z',
    error: null,
  });

  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
});

afterEach(() => {
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

// ── projectCommand ─────────────────────────────────────────────────────────

describe('projectCommand', () => {
  it('exits 1 when project not registered', async () => {
    mockProject = null;

    await expect(projectCommand('/test/project', {})).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain('not registered');
  });

  it('shows project info with job counts in human mode', async () => {
    mockProject = makeProject({ status: 'active' });
    mockCounts = makeCounts({ pending: 2, running: 1, completed: 5, failed: 0 });

    await projectCommand('/test/project', {});

    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('active');
    expect(output).toContain('2 pending');
    expect(output).toContain('1 running');
    expect(output).toContain('5 done');
  });

  it('outputs project JSON with jobs counts in JSON mode', async () => {
    mockJsonMode = true;
    mockProject = makeProject({ status: 'active' });
    mockCounts = makeCounts({ pending: 2, running: 1, completed: 5, failed: 0 });

    await projectCommand('/test/project', {});

    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toHaveProperty('project');
    const proj = payload['project'] as Record<string, unknown>;
    expect(proj.path).toBe('/test/project');
    expect(proj.notifyRoutes).toEqual([]);
    expect(proj.status).toBe('active');
    expect(proj.jobs).toEqual(mockCounts);
  });

  it('blocks a project with human output', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { block: 'broken tests' });

    expect(mockBlockProject).toHaveBeenCalledWith('/test/project', 'broken tests');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Blocked');
    expect(output).toContain('broken tests');
  });

  it('unblocks a blocked project', async () => {
    mockProject = makeProject({ status: 'blocked', blockedReason: 'tests broken' });

    await projectCommand('/test/project', { unblock: true });

    expect(mockUnblockProject).toHaveBeenCalledWith('/test/project');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Unblocked');
  });

  it('does not unblock an already active project', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { unblock: true });

    expect(mockUnblockProject).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('already active');
  });

  it('sets kimaki channel route with --notify-kimaki-channel', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { notifyKimakiChannel: 'ch_123' });

    expect(mockUpdateProjectNotifyRoutes).toHaveBeenCalledWith(
      '/test/project',
      [{ kind: 'kimaki', channelId: 'ch_123' }],
    );
  });

  it('sets webhook route with --notify-webhook', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { notifyWebhook: 'https://example.com/hook' });

    expect(mockUpdateProjectNotifyRoutes).toHaveBeenCalledWith(
      '/test/project',
      [{ kind: 'webhook', url: 'https://example.com/hook' }],
    );
  });

  it('sets telegram route with --notify-telegram', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { notifyTelegram: '-518192' });

    expect(mockUpdateProjectNotifyRoutes).toHaveBeenCalledWith(
      '/test/project',
      [{ kind: 'telegram', chatId: '-518192' }],
    );
  });

  it('clears all routes with --clear-notify', async () => {
    mockProject = makeProject({
      status: 'active',
      notifyRoutes: [{ kind: 'kimaki', channelId: 'ch_123' }],
    });

    await projectCommand('/test/project', { clearNotify: true });

    expect(mockUpdateProjectNotifyRoutes).toHaveBeenCalledWith('/test/project', []);
  });

  it('shows route display in project info', async () => {
    mockProject = makeProject({
      status: 'active',
      notifyRoutes: [
        { kind: 'kimaki', channelId: 'ch_abc' },
        { kind: 'webhook', url: 'https://hooks.example.com/pilot' },
      ],
    });

    await projectCommand('/test/project', {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('kimaki');
    expect(output).toContain('webhook');
  });

  it('includes notifyRoutes in JSON output when configured', async () => {
    mockJsonMode = true;
    mockProject = makeProject({
      status: 'active',
      notifyRoutes: [
        { kind: 'kimaki', channelId: 'ch_abc' },
      ],
    });

    await projectCommand('/test/project', {});

    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    const proj = payload['project'] as Record<string, unknown>;
    expect(proj.notifyRoutes).toEqual([
      { kind: 'kimaki', channelId: 'ch_abc' },
    ]);
  });

  it('shows blocked reason for blocked project in human mode', async () => {
    mockProject = makeProject({ status: 'blocked', blockedReason: 'tests failing', blockedAt: '2026-03-05T10:00:00' });

    await projectCommand('/test/project', {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('BLOCKED');
    expect(output).toContain('tests failing');
    expect(output).toContain('--unblock');
  });

  it('shows GSD version details in human mode', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('approved gsd:');
    expect(output).toContain('installed gsd:');
    expect(output).toContain('drift:');
  });
});

// ── projectsCommand (enhanced) ─────────────────────────────────────────────

describe('projectsCommand', () => {
  const activeProject = makeProject({ path: '/test/active', status: 'active' });
  const blockedProject = makeProject({ path: '/test/blocked', status: 'blocked', blockedReason: 'broken' });

  it('filters to only blocked projects with --blocked', async () => {
    mockAllProjects = [activeProject, blockedProject];

    await projectsCommand({ blocked: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('/test/blocked');
    expect(output).not.toContain('/test/active');
  });

  it('shows job counts for each project', async () => {
    mockAllProjects = [activeProject];
    mockCounts = makeCounts({ pending: 3, running: 2, failed: 1 });

    await projectsCommand({});

    expect(mockGetProjectJobCounts).toHaveBeenCalledWith('/test/active');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('3 pending');
    expect(output).toContain('2 running');
    expect(output).toContain('1 failed');
  });

  it('shows no projects message when empty', async () => {
    mockAllProjects = [];

    await projectsCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No registered projects');
  });
});
