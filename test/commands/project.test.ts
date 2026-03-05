/**
 * Tests for `pilot project <path>` and enhanced `pilot projects` commands.
 *
 * Covers: info display, --block, --unblock, --owner, --blocked filter,
 * job counts, human and JSON output modes, error paths.
 *
 * Mocks: db.ts, output.ts, colors.ts, config.ts.
 * Uses vi.spyOn for process.stderr.write and process.exit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '../../src/core/types.js';
import type { ProjectJobCounts } from '../../src/core/db.js';

// ── Mock data ──────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    path: '/test/project',
    owner: 'agent:main:main',
    status: 'active' as const,
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-05T10:00:00',
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

const mockGetProject = vi.fn();
const mockBlockProject = vi.fn();
const mockUnblockProject = vi.fn();
const mockUpdateProjectOwner = vi.fn();
const mockGetProjectJobCounts = vi.fn();
const mockGetAllProjects = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getProject: (path: string) => mockGetProject(path),
  blockProject: (path: string, reason: string) => mockBlockProject(path, reason),
  unblockProject: (path: string) => mockUnblockProject(path),
  updateProjectOwner: (path: string, owner: string) => mockUpdateProjectOwner(path, owner),
  getProjectJobCounts: (path: string) => mockGetProjectJobCounts(path),
  getAllProjects: () => mockGetAllProjects(),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Test 1: Not registered — exits 1
  it('exits 1 when project not registered', async () => {
    mockProject = null;

    await expect(projectCommand('/test/project', {})).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain('not registered');
    expect(stderr).toContain('/test/project');
  });

  // Test 2: Default (info) — human output
  it('shows project info with job counts in human mode', async () => {
    mockProject = makeProject({ status: 'active' });
    mockCounts = makeCounts({ pending: 2, running: 1, completed: 5, failed: 0 });

    await projectCommand('/test/project', {});

    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('agent:main:main');
    expect(output).toContain('active');
    expect(output).toContain('2 pending');
    expect(output).toContain('1 running');
    expect(output).toContain('5 done');
  });

  // Test 3: Default (info) — JSON output
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
    expect(proj.owner).toBe('agent:main:main');
    expect(proj.status).toBe('active');
    expect(proj.jobs).toEqual(mockCounts);
  });

  // Test 4: --block blocks project (human)
  it('blocks a project with human output', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { block: 'broken tests' });

    expect(mockBlockProject).toHaveBeenCalledWith('/test/project', 'broken tests');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Blocked');
    expect(output).toContain('broken tests');
  });

  // Test 5: --block JSON mode
  it('outputs JSON when blocking in JSON mode', async () => {
    mockJsonMode = true;
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { block: 'broken tests' });

    expect(mockBlockProject).toHaveBeenCalledWith('/test/project', 'broken tests');
    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    expect(payload.blocked).toBe(true);
    expect(payload.project).toBe('/test/project');
    expect(payload.reason).toBe('broken tests');
  });

  // Test 6: --unblock unblocks project
  it('unblocks a blocked project', async () => {
    mockProject = makeProject({ status: 'blocked', blockedReason: 'tests broken' });

    await projectCommand('/test/project', { unblock: true });

    expect(mockUnblockProject).toHaveBeenCalledWith('/test/project');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Unblocked');
  });

  // Test 7: --unblock already active
  it('does not unblock an already active project', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { unblock: true });

    expect(mockUnblockProject).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('already active');
  });

  // Test 7b: --unblock already active — JSON
  it('outputs JSON with unblocked:false when already active', async () => {
    mockJsonMode = true;
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { unblock: true });

    expect(mockUnblockProject).not.toHaveBeenCalled();
    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    expect(payload.unblocked).toBe(false);
    expect(payload.reason).toBe('already active');
  });

  // Test 8: --owner changes owner (human)
  it('changes project owner with human output', async () => {
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { owner: 'agent:new:owner' });

    expect(mockUpdateProjectOwner).toHaveBeenCalledWith('/test/project', 'agent:new:owner');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Updated owner');
    expect(output).toContain('agent:new:owner');
  });

  // Test 9: --owner JSON mode
  it('outputs JSON when changing owner in JSON mode', async () => {
    mockJsonMode = true;
    mockProject = makeProject({ status: 'active' });

    await projectCommand('/test/project', { owner: 'agent:new:owner' });

    expect(mockUpdateProjectOwner).toHaveBeenCalledWith('/test/project', 'agent:new:owner');
    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    expect(payload.updated).toBe(true);
    expect(payload.owner).toBe('agent:new:owner');
  });

  // Test: info shows blocked reason for blocked projects
  it('shows blocked reason for blocked project in human mode', async () => {
    mockProject = makeProject({ status: 'blocked', blockedReason: 'tests failing', blockedAt: '2026-03-05T10:00:00' });

    await projectCommand('/test/project', {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('BLOCKED');
    expect(output).toContain('tests failing');
    expect(output).toContain('--unblock');
  });
});

// ── projectsCommand (enhanced) ─────────────────────────────────────────────

describe('projectsCommand', () => {
  const activeProject = makeProject({ path: '/test/active', status: 'active' });
  const blockedProject = makeProject({ path: '/test/blocked', status: 'blocked', blockedReason: 'broken' });

  // Test 10: --blocked filter
  it('filters to only blocked projects with --blocked', async () => {
    mockAllProjects = [activeProject, blockedProject];

    await projectsCommand({ blocked: true });

    // Only blocked project appears in output
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('/test/blocked');
    expect(output).not.toContain('/test/active');
  });

  // Test 11: --blocked with JSON
  it('outputs only blocked projects in JSON mode with --blocked', async () => {
    mockJsonMode = true;
    mockAllProjects = [activeProject, blockedProject];

    await projectsCommand({ blocked: true });

    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    const projects = payload.projects as Array<{ path: string }>;
    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe('/test/blocked');
  });

  // Test 12: Job counts in listing
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

  // Test: Job counts in JSON output
  it('includes job counts per project in JSON output', async () => {
    mockJsonMode = true;
    mockAllProjects = [activeProject];
    mockCounts = makeCounts({ pending: 3, running: 2, failed: 1 });

    await projectsCommand({});

    expect(mockOutputJson).toHaveBeenCalledOnce();
    const [payload] = mockOutputJson.mock.calls[0] as [Record<string, unknown>];
    const projects = payload.projects as Array<{ path: string; jobs: ProjectJobCounts }>;
    expect(projects).toHaveLength(1);
    expect(projects[0].jobs).toEqual(mockCounts);
  });

  // Test: empty state without --blocked
  it('shows no projects message when empty', async () => {
    mockAllProjects = [];

    await projectsCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No registered projects');
  });

  // Test: empty state with --blocked
  it('shows no blocked projects message when empty with --blocked', async () => {
    mockAllProjects = [activeProject]; // only active projects

    await projectsCommand({ blocked: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No blocked projects');
  });

  // Test: human listing without --blocked shows all projects
  it('shows all projects without --blocked filter', async () => {
    mockAllProjects = [activeProject, blockedProject];

    await projectsCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('/test/active');
    expect(output).toContain('/test/blocked');
  });
});
