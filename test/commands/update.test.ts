/**
 * Tests for `pilot update` — npm package update + per-project installer re-run.
 *
 * Covers:
 *   - Happy path: bun update + per-project installer success
 *   - No registered projects: just package update
 *   - Individual project failure: continues to next project
 *   - Blocked projects skipped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock state ──────────────────────────────────────────────────────────────

let mockProjects: Array<{ path: string; status: string; owner?: string | null; notifyOpenClawRoute?: unknown }> = [];
const mockEnsureApprovedGsdPackage = vi.fn();
const mockInspectProjectGsdState = vi.fn();
const mockUpdateProjectGsdState = vi.fn();

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../../src/core/db.js', () => ({
  getAllProjects: () => mockProjects,
  updateProjectGsdState: (...args: unknown[]) => mockUpdateProjectGsdState(...args),
}));

vi.mock('../../src/core/managed-gsd.js', () => ({
  ensureApprovedGsdPackage: (...args: unknown[]) => mockEnsureApprovedGsdPackage(...args),
  inspectProjectGsdState: (...args: unknown[]) => mockInspectProjectGsdState(...args),
}));

vi.mock('../../src/core/openclaw-skill.js', () => ({
  installOpenClawSkill: () => ({ installed: false }),
}));

const mockOutputHuman = vi.fn();
const mockOutputJson = vi.fn();
let mockJsonMode = false;

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  isJsonMode: () => mockJsonMode,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import { execa } from 'execa';
import { updateCommand } from '../../src/commands/update.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExeca = execa as any as ReturnType<typeof vi.fn>;

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockProjects = [];
  mockJsonMode = false;
  mockEnsureApprovedGsdPackage.mockResolvedValue({ changed: false, runtimeVersion: '1.24.0' });
  mockInspectProjectGsdState.mockResolvedValue({
    approvedVersion: '1.24.0',
    installedVersion: '1.24.0',
    driftStatus: 'matches',
    checkedAt: '2026-03-26T00:00:00.000Z',
    error: null,
  });

  // Default: bun update succeeds, installer succeeds for any project
  mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
    if (Array.isArray(args) && args.includes('update')) {
      return { exitCode: 0, stdout: 'Updated get-shit-done-cc', stderr: '' };
    }
    if (Array.isArray(args) && args.includes('--opencode')) {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('updateCommand — happy path', () => {
  it('calls bun update for get-shit-done-cc package', async () => {
    await updateCommand();

    const updateCall = mockExeca.mock.calls.find(([cmd, args]) => cmd === 'bun' && Array.isArray(args) && args.includes('update'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('get-shit-done-cc');
  });

  it('runs get-shit-done-cc --opencode --local for each registered project', async () => {
    mockProjects = [
      { path: '/project/a', status: 'active', owner: null },
      { path: '/project/b', status: 'active', owner: null },
    ];

    await updateCommand();

    const installerCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCalls).toHaveLength(2);

    // Both projects should be called with --opencode --local
    expect(installerCalls[0][1]).toEqual(['--opencode', '--local']);
    expect(installerCalls[1][1]).toEqual(['--opencode', '--local']);
  });

  it('passes correct cwd for each project installer call', async () => {
    mockProjects = [
      { path: '/project/myapp', status: 'active', owner: null },
    ];

    await updateCommand();

    const installerCall = mockExeca.mock.calls.find(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCall).toBeDefined();
    const opts = installerCall![2] as { cwd?: string };
    expect(opts.cwd).toBe('/project/myapp');
  });

  it('reports success in human output for each project', async () => {
    mockProjects = [
      { path: '/project/a', status: 'active', owner: null },
    ];

    await updateCommand();

    const output = mockOutputHuman.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('/project/a');
  });
});

describe('updateCommand — no registered projects', () => {
  it('only calls bun update when no projects registered', async () => {
    mockProjects = [];

    await updateCommand();

    const installerCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCalls).toHaveLength(0);

    const updateCall = mockExeca.mock.calls.find(([cmd, args]) => cmd === 'bun' && Array.isArray(args) && args.includes('update'));
    expect(updateCall).toBeDefined();
  });

  it('reports "No registered projects" in output', async () => {
    mockProjects = [];

    await updateCommand();

    const output = mockOutputHuman.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output.toLowerCase()).toContain('no registered projects');
  });
});

describe('updateCommand — individual project failure', () => {
  it('continues to next project when installer fails for one', async () => {
    mockProjects = [
      { path: '/project/a', status: 'active', owner: null },
      { path: '/project/b', status: 'active', owner: null },
    ];

    // First project fails, second succeeds
    let callCount = 0;
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('update')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (Array.isArray(args) && args.includes('--opencode')) {
        callCount++;
        if (callCount === 1) {
          return { exitCode: 1, stdout: '', stderr: 'Error: some project-specific error' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    // Should not throw — continues to next project even on individual failure
    let threw = false;
    try {
      await updateCommand();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);

    // Both projects should have been attempted
    const installerCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCalls).toHaveLength(2);
  });

  it('includes failed project in json output with success: false', async () => {
    mockJsonMode = true;
    mockProjects = [
      { path: '/project/fail', status: 'active', owner: null },
    ];

    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('update')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (Array.isArray(args) && args.includes('--opencode')) {
        return { exitCode: 1, stdout: '', stderr: 'Installation error' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await updateCommand();

    expect(mockOutputJson).toHaveBeenCalled();
    const jsonResult = mockOutputJson.mock.calls[0][0] as {
      updated: boolean;
      packageUpdated: boolean;
      projects: Array<{ path: string; success: boolean; error?: string }>;
    };
    expect(jsonResult.updated).toBe(true);
    expect(jsonResult.packageUpdated).toBe(true);
    expect(jsonResult.projects).toHaveLength(1);
    expect(jsonResult.projects[0].path).toBe('/project/fail');
    expect(jsonResult.projects[0].success).toBe(false);
  });
});

describe('updateCommand — blocked projects skipped', () => {
  it('skips blocked projects', async () => {
    mockProjects = [
      { path: '/project/blocked', status: 'blocked', owner: null },
      { path: '/project/active', status: 'active', owner: null },
    ];

    await updateCommand();

    // Only one installer call — for the active project
    const installerCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCalls).toHaveLength(1);

    const calledCwds = installerCalls.map((args) => (args[2] as { cwd?: string } | undefined)?.cwd);
    expect(calledCwds).toContain('/project/active');
    expect(calledCwds).not.toContain('/project/blocked');
  });

  it('mentions blocked projects in output', async () => {
    mockProjects = [
      { path: '/project/blocked', status: 'blocked', owner: null },
    ];

    await updateCommand();

    const output = mockOutputHuman.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output.toLowerCase()).toContain('blocked');
  });
});

describe('updateCommand — JSON output', () => {
  it('outputs valid JSON result with packageUpdated: true on success', async () => {
    mockJsonMode = true;
    mockProjects = [
      { path: '/project/a', status: 'active', owner: null },
    ];

    await updateCommand();

    expect(mockOutputJson).toHaveBeenCalled();
    const result = mockOutputJson.mock.calls[0][0] as { updated: boolean; packageUpdated: boolean; projects: unknown[] };
    expect(result.updated).toBe(true);
    expect(result.packageUpdated).toBe(true);
    expect(result.projects).toHaveLength(1);
  });
});

describe('updateCommand — approved version rollout', () => {
  it('converges the runtime installer to the approved version before rollout', async () => {
    mockProjects = [
      { path: '/project/a', status: 'active', owner: null },
    ];
    mockJsonMode = true;

    await updateCommand();

    expect(mockEnsureApprovedGsdPackage).toHaveBeenCalledWith('1.24.0', expect.any(String));
  });

  it('reports blocked rollout projects as blocked-skipped', async () => {
    mockJsonMode = true;
    mockProjects = [
      { path: '/project/blocked', status: 'blocked', owner: null },
    ];

    await updateCommand();

    const payload = mockOutputJson.mock.calls[0][0] as {
      projects: Array<{ path: string; action: string; success: boolean }>;
    };
    expect(payload.projects).toEqual([
      expect.objectContaining({ path: '/project/blocked', action: 'blocked-skipped', success: true }),
    ]);
  });

  it('records rollout actions for behind, unknown, ahead, and already-current projects', async () => {
    mockJsonMode = true;
    mockProjects = [
      { path: '/project/current', status: 'active', owner: null },
      { path: '/project/behind', status: 'active', owner: null },
      { path: '/project/unknown', status: 'active', owner: null },
      { path: '/project/ahead', status: 'active', owner: null },
    ];

    mockInspectProjectGsdState
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.24.0', driftStatus: 'matches', checkedAt: '2026-03-26T00:00:00.000Z', error: null })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.23.0', driftStatus: 'behind', checkedAt: '2026-03-26T00:00:00.000Z', error: null })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.24.0', driftStatus: 'matches', checkedAt: '2026-03-26T00:00:01.000Z', error: null })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: null, driftStatus: 'unknown', checkedAt: '2026-03-26T00:00:00.000Z', error: 'VERSION missing' })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: null, driftStatus: 'unknown', checkedAt: '2026-03-26T00:00:01.000Z', error: 'VERSION still missing' })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.25.0', driftStatus: 'ahead', checkedAt: '2026-03-26T00:00:00.000Z', error: null });

    await updateCommand();

    const payload = mockOutputJson.mock.calls[0][0] as {
      projects: Array<{ path: string; action: string; driftStatus: string; success: boolean }>;
    };
    expect(payload.projects).toEqual([
      expect.objectContaining({ path: '/project/current', action: 'already-current', driftStatus: 'matches', success: true }),
      expect.objectContaining({ path: '/project/behind', action: 'update-to-approved', driftStatus: 'matches', success: true }),
      expect.objectContaining({ path: '/project/unknown', action: 'repair-to-approved', driftStatus: 'unknown', success: true }),
      expect.objectContaining({ path: '/project/ahead', action: 'ahead-skipped', driftStatus: 'ahead', success: true }),
    ]);
    expect(mockUpdateProjectGsdState).toHaveBeenCalledWith(
      '/project/behind',
      expect.objectContaining({ driftStatus: 'matches', installedVersion: '1.24.0' }),
    );
    expect(mockUpdateProjectGsdState).toHaveBeenCalledWith(
      '/project/unknown',
      expect.objectContaining({ driftStatus: 'unknown' }),
    );
  });

  it('keeps per-project rollout failures in the result without aborting the rollout', async () => {
    mockJsonMode = true;
    mockProjects = [
      { path: '/project/behind', status: 'active', owner: null },
      { path: '/project/current', status: 'active', owner: null },
    ];

    mockInspectProjectGsdState
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.23.0', driftStatus: 'behind', checkedAt: '2026-03-26T00:00:00.000Z', error: null })
      .mockResolvedValueOnce({ approvedVersion: '1.24.0', installedVersion: '1.24.0', driftStatus: 'matches', checkedAt: '2026-03-26T00:00:00.000Z', error: null });

    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('--opencode')) {
        return { exitCode: 1, stdout: '', stderr: 'installer exploded' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await updateCommand();

    const payload = mockOutputJson.mock.calls[0][0] as {
      projects: Array<{ path: string; action: string; success: boolean; error?: string }>;
    };
    expect(payload.projects).toEqual([
      expect.objectContaining({ path: '/project/behind', action: 'update-to-approved', success: false, error: 'installer exploded' }),
      expect.objectContaining({ path: '/project/current', action: 'already-current', success: true }),
    ]);
  });

  it('includes approved version in JSON rollout output', async () => {
    mockJsonMode = true;

    await updateCommand();

    expect(mockOutputJson).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedVersion: '1.24.0',
      }),
    );
  });
});
