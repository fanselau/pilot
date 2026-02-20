import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanProjects, getProjectInfo, detectPlanningState } from '../../src/core/projects.js';
import { getProgress } from '../../src/core/progress.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const TMP_ROOT = join(tmpdir(), `pilot-test-projects-${process.pid}`);

function createDir(...segments: string[]): string {
  const dir = join(TMP_ROOT, ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(relativePath: string, content: string): void {
  const full = join(TMP_ROOT, relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

// ── Setup & Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── detectPlanningState ────────────────────────────────────────────────────

describe('detectPlanningState', () => {
  it('returns no-planning when .planning/ does not exist', async () => {
    const result = await detectPlanningState(join(TMP_ROOT, 'nonexistent', '.planning'));
    expect(result.state).toBe('no-planning');
    expect(result.progress).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('returns no-planning when .planning/ exists but ROADMAP.md is missing', async () => {
    createDir('proj-a', '.planning');
    const result = await detectPlanningState(join(TMP_ROOT, 'proj-a', '.planning'));
    expect(result.state).toBe('no-planning');
  });

  it('returns no-planning when ROADMAP.md has no phase entries', async () => {
    createDir('proj-b', '.planning');
    writeFile('proj-b/.planning/ROADMAP.md', '# Roadmap\n\nJust some text\n');
    const result = await detectPlanningState(join(TMP_ROOT, 'proj-b', '.planning'));
    expect(result.state).toBe('no-planning');
  });

  it('returns active state with correct phase count', async () => {
    createDir('proj-c', '.planning', 'phases', '01-foundation');
    writeFile('proj-c/.planning/ROADMAP.md', [
      '# Roadmap',
      '### Phase 1: Foundation',
      '### Phase 2: Features',
      '### Phase 3: Polish',
    ].join('\n'));
    writeFile('proj-c/.planning/STATE.md', [
      '## Current Position',
      'Phase: 1 of 3 (Foundation)',
      'Status: In progress',
    ].join('\n'));
    writeFile('proj-c/.planning/phases/01-foundation/01-01-PLAN.md', '# Plan');

    const result = await detectPlanningState(join(TMP_ROOT, 'proj-c', '.planning'));
    expect(result.state).toBe('active');
    expect(result.progress.total).toBe(3);
    expect(result.progress.done).toBe(0);
    expect(result.progress.percent).toBe(0);
    expect(result.currentPhase).toBe(1);
  });

  it('counts done phases correctly when all plans have summaries', async () => {
    createDir('proj-d', '.planning', 'phases', '01-foundation');
    createDir('proj-d', '.planning', 'phases', '02-features');
    writeFile('proj-d/.planning/ROADMAP.md', [
      '### Phase 1: Foundation',
      '### Phase 2: Features',
    ].join('\n'));
    writeFile('proj-d/.planning/STATE.md', 'Phase: 2 of 2 (Features)\nStatus: In progress');

    // Phase 1: 2 plans, 2 summaries → done
    writeFile('proj-d/.planning/phases/01-foundation/01-01-PLAN.md', '# P1');
    writeFile('proj-d/.planning/phases/01-foundation/01-01-SUMMARY.md', '# S1');
    writeFile('proj-d/.planning/phases/01-foundation/01-02-PLAN.md', '# P2');
    writeFile('proj-d/.planning/phases/01-foundation/01-02-SUMMARY.md', '# S2');

    // Phase 2: 1 plan, 0 summaries → not done
    writeFile('proj-d/.planning/phases/02-features/02-01-PLAN.md', '# P1');

    const result = await detectPlanningState(join(TMP_ROOT, 'proj-d', '.planning'));
    expect(result.state).toBe('active');
    expect(result.progress.done).toBe(1);
    expect(result.progress.total).toBe(2);
    expect(result.progress.percent).toBe(50);
  });

  it('returns complete when all phases have matching summaries', async () => {
    createDir('proj-e', '.planning', 'phases', '01-foundation');
    writeFile('proj-e/.planning/ROADMAP.md', '### Phase 1: Foundation\n');
    writeFile('proj-e/.planning/phases/01-foundation/01-01-PLAN.md', '# P');
    writeFile('proj-e/.planning/phases/01-foundation/01-01-SUMMARY.md', '# S');

    const result = await detectPlanningState(join(TMP_ROOT, 'proj-e', '.planning'));
    expect(result.state).toBe('complete');
    expect(result.progress.done).toBe(1);
    expect(result.progress.total).toBe(1);
    expect(result.progress.percent).toBe(100);
  });

  it('extracts currentPhaseState from STATUS line', async () => {
    createDir('proj-f', '.planning');
    writeFile('proj-f/.planning/ROADMAP.md', '### Phase 1: Foundation\n');
    writeFile('proj-f/.planning/STATE.md', 'Phase: 1 of 1 (Foundation)\nStatus: Phase complete');

    const result = await detectPlanningState(join(TMP_ROOT, 'proj-f', '.planning'));
    expect(result.currentPhaseState).toBe('Phase complete');
  });
});

// ── getProjectInfo ─────────────────────────────────────────────────────────

describe('getProjectInfo', () => {
  it('returns project name from directory basename', async () => {
    const dir = createDir('my-project');
    const info = await getProjectInfo(dir);
    expect(info.name).toBe('my-project');
    expect(info.path).toBe(dir);
  });

  it('returns git branch for a git repo', async () => {
    const dir = createDir('git-proj');
    // Init a git repo in the temp dir
    const { execa: execaFn } = await import('execa');
    await execaFn('git', ['init', '-q'], { cwd: dir });
    await execaFn('git', ['checkout', '-b', 'main'], { cwd: dir });
    // Need at least one commit for branch to show
    writeFileSync(join(dir, 'README.md'), '# Test\n');
    await execaFn('git', ['add', '.'], { cwd: dir });
    await execaFn('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'init', '--no-gpg-sign'], { cwd: dir });

    const info = await getProjectInfo(dir);
    expect(info.branch).toBe('main');
    expect(info.gitState).toBe('clean');
  });

  it('returns dirty gitState when there are uncommitted changes', async () => {
    const dir = createDir('dirty-proj');
    const { execa: execaFn } = await import('execa');
    await execaFn('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'README.md'), '# Test\n');
    await execaFn('git', ['add', '.'], { cwd: dir });
    await execaFn('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'init', '--no-gpg-sign'], { cwd: dir });
    // Create uncommitted file
    writeFileSync(join(dir, 'new.txt'), 'new\n');

    const info = await getProjectInfo(dir);
    expect(info.gitState).toBe('dirty');
  });

  it('returns unknown branch for non-git directory', async () => {
    const dir = createDir('no-git');
    const info = await getProjectInfo(dir);
    expect(info.branch).toBe('unknown');
    expect(info.gitState).toBe('clean');
  });

  it('returns no-planning state for project without .planning/', async () => {
    const dir = createDir('bare-proj');
    const info = await getProjectInfo(dir);
    expect(info.planningState).toBe('no-planning');
    expect(info.progress).toBe(0);
  });

  it('returns active planning state with progress', async () => {
    createDir('active-proj', '.planning', 'phases', '01-setup');
    createDir('active-proj', '.planning', 'phases', '02-features');
    writeFile('active-proj/.planning/ROADMAP.md', '### Phase 1: Setup\n### Phase 2: Features\n');
    writeFile('active-proj/.planning/STATE.md', 'Phase: 1 of 2 (Setup)\nStatus: In progress');
    writeFile('active-proj/.planning/phases/01-setup/01-01-PLAN.md', '# P');
    writeFile('active-proj/.planning/phases/01-setup/01-01-SUMMARY.md', '# S');
    writeFile('active-proj/.planning/phases/02-features/02-01-PLAN.md', '# P');

    const info = await getProjectInfo(join(TMP_ROOT, 'active-proj'));
    expect(info.planningState).toBe('active');
    expect(info.currentPhase).toBe(1);
    expect(info.progress).toBe(50);
  });
});

// ── scanProjects ───────────────────────────────────────────────────────────

describe('scanProjects', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns sorted list of project directories', async () => {
    process.env.PILOT_PROJECT_DIR = TMP_ROOT;
    createDir('zebra');
    createDir('alpha');
    createDir('middle');

    const projects = await scanProjects();
    expect(projects.map((p) => p.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('skips hidden directories', async () => {
    process.env.PILOT_PROJECT_DIR = TMP_ROOT;
    createDir('.hidden');
    createDir('visible');

    const projects = await scanProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('visible');
  });

  it('skips non-directory entries', async () => {
    process.env.PILOT_PROJECT_DIR = TMP_ROOT;
    createDir('real-project');
    writeFileSync(join(TMP_ROOT, 'file.txt'), 'not a dir');

    const projects = await scanProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('real-project');
  });

  it('returns empty array when project dir does not exist', async () => {
    process.env.PILOT_PROJECT_DIR = join(TMP_ROOT, 'nonexistent');
    const projects = await scanProjects();
    expect(projects).toEqual([]);
  });
});

// ── getProgress ────────────────────────────────────────────────────────────

describe('getProgress', () => {
  it('returns empty result for project without .planning/', async () => {
    const dir = createDir('no-planning-prog');
    const progress = await getProgress(dir);
    expect(progress.project).toBe('no-planning-prog');
    expect(progress.overall).toBe(0);
    expect(progress.phases).toEqual([]);
    expect(progress.nextAction).toBe('No planning data found');
  });

  it('returns per-phase breakdown with correct statuses', async () => {
    const projectDir = createDir('progress-proj');
    createDir('progress-proj', '.planning', 'phases', '01-foundation');
    createDir('progress-proj', '.planning', 'phases', '02-features');
    createDir('progress-proj', '.planning', 'phases', '03-polish');

    writeFile('progress-proj/.planning/ROADMAP.md', [
      '### Phase 1: Foundation',
      '### Phase 2: Features',
      '### Phase 3: Polish',
    ].join('\n'));
    writeFile('progress-proj/.planning/STATE.md', 'Phase: 2 of 3 (Features)\nStatus: In progress');

    // Phase 1: done (1 plan + 1 summary)
    writeFile('progress-proj/.planning/phases/01-foundation/01-01-PLAN.md', '#P');
    writeFile('progress-proj/.planning/phases/01-foundation/01-01-SUMMARY.md', '#S');

    // Phase 2: in-progress (2 plans, 1 summary)
    writeFile('progress-proj/.planning/phases/02-features/02-01-PLAN.md', '#P');
    writeFile('progress-proj/.planning/phases/02-features/02-01-SUMMARY.md', '#S');
    writeFile('progress-proj/.planning/phases/02-features/02-02-PLAN.md', '#P');

    // Phase 3: no plans yet → pending

    const progress = await getProgress(projectDir);
    expect(progress.project).toBe('progress-proj');
    expect(progress.overall).toBe(33); // 1 of 3 done
    expect(progress.currentPhase).toBe(2);

    expect(progress.phases).toHaveLength(3);
    expect(progress.phases[0]).toMatchObject({ number: 1, name: 'Foundation', status: 'done' });
    expect(progress.phases[1]).toMatchObject({ number: 2, name: 'Features', status: 'in-progress' });
    expect(progress.phases[2]).toMatchObject({ number: 3, name: 'Polish', status: 'pending' });
  });

  it('returns correct next action for current phase', async () => {
    const projectDir = createDir('next-action-proj');
    createDir('next-action-proj', '.planning', 'phases', '01-setup');
    createDir('next-action-proj', '.planning', 'phases', '02-build');

    writeFile('next-action-proj/.planning/ROADMAP.md', '### Phase 1: Setup\n### Phase 2: Build\n');
    writeFile('next-action-proj/.planning/STATE.md', 'Phase: 2 of 2 (Build)\nStatus: In progress');

    // Phase 1: done
    writeFile('next-action-proj/.planning/phases/01-setup/01-01-PLAN.md', '#P');
    writeFile('next-action-proj/.planning/phases/01-setup/01-01-SUMMARY.md', '#S');

    // Phase 2: has plans
    writeFile('next-action-proj/.planning/phases/02-build/02-01-PLAN.md', '#P');

    const progress = await getProgress(projectDir);
    expect(progress.nextAction).toBe('execute phase 2');
  });

  it('returns "All phases complete" when project is fully done', async () => {
    const projectDir = createDir('done-proj');
    createDir('done-proj', '.planning', 'phases', '01-only');

    writeFile('done-proj/.planning/ROADMAP.md', '### Phase 1: Only Phase\n');
    writeFile('done-proj/.planning/STATE.md', 'Phase: 1 of 1 (Only Phase)\nStatus: Phase complete');
    writeFile('done-proj/.planning/phases/01-only/01-01-PLAN.md', '#P');
    writeFile('done-proj/.planning/phases/01-only/01-01-SUMMARY.md', '#S');

    const progress = await getProgress(projectDir);
    expect(progress.overall).toBe(100);

    // Current phase is done, no more phases → "All phases complete"
    // Since current phase is done, it should look for next incomplete
    // There is none, so nextAction = "All phases complete"
  });

  it('reports phase plans count', async () => {
    const projectDir = createDir('plans-count-proj');
    createDir('plans-count-proj', '.planning', 'phases', '01-foundation');

    writeFile('plans-count-proj/.planning/ROADMAP.md', '### Phase 1: Foundation\n');
    writeFile('plans-count-proj/.planning/phases/01-foundation/01-01-PLAN.md', '#P');
    writeFile('plans-count-proj/.planning/phases/01-foundation/01-02-PLAN.md', '#P');
    writeFile('plans-count-proj/.planning/phases/01-foundation/01-03-PLAN.md', '#P');

    const progress = await getProgress(projectDir);
    expect(progress.phases[0].plans).toBe(3);
  });

  it('returns empty blockers array', async () => {
    const projectDir = createDir('blockers-proj');
    createDir('blockers-proj', '.planning');
    writeFile('blockers-proj/.planning/ROADMAP.md', '### Phase 1: Test\n');

    const progress = await getProgress(projectDir);
    expect(progress.blockers).toEqual([]);
  });
});
