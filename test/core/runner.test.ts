/**
 * Tests for pure exported helpers in runner.ts.
 *
 * Tests `parseJudgeVerdict`, `getDynamicMaxParallel`, `hasSystemdRunUser`,
 * `spawnChildJobs` (milestone coordinator child job spawning), and
 * `parseVerificationResult` (VERIFICATION.md frontmatter parsing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock node:fs so we can control /proc/meminfo content for getDynamicMaxParallel tests
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: unknown) => {
      if (filePath === '/proc/meminfo') {
        return _mockMeminfoContent;
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
  };
});

// Module-level variable to control mock /proc/meminfo content.
// Updated per-test before the module reads it.
let _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB default

import { parseJudgeVerdict, parseVerificationResult, getDynamicMaxParallel, hasSystemdRunUser, _resetSystemdRunCache, spawnChildJobs } from '../../src/core/runner.js';
import { _getTestDb, addJob, markCompleted, getJob, getChildJobs } from '../../src/core/db.js';

// ── parseJudgeVerdict ──────────────────────────────────────────────────────

describe('parseJudgeVerdict', () => {
  it('parses verdict from fenced ```json block', () => {
    const content = [
      "Here's my verdict:",
      '```json',
      '{"verdict":"pass","confidence":95,"summary":"All good","retryRecommendation":"none"}',
      '```',
      'End.',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
    expect(result!.confidence).toBe(95);
    expect(result!.summary).toBe('All good');
    expect(result!.retryRecommendation).toBe('none');
  });

  it('parses verdict from raw JSON (entire content is JSON)', () => {
    const content = '{"verdict":"fail","confidence":80,"summary":"Missing tests","retryRecommendation":"retry-full","retryHint":"Add unit tests"}';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('fail');
    expect(result!.confidence).toBe(80);
    expect(result!.summary).toBe('Missing tests');
    expect(result!.retryRecommendation).toBe('retry-full');
    expect(result!.retryHint).toBe('Add unit tests');
  });

  it('parses verdict from text-wrapped JSON (extracts first {...} block)', () => {
    const content = 'After careful analysis, I believe {"verdict":"partial","confidence":60,"summary":"Partial success","retryRecommendation":"retry-resume"} is my assessment.';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('partial');
    expect(result!.confidence).toBe(60);
    expect(result!.summary).toBe('Partial success');
    expect(result!.retryRecommendation).toBe('retry-resume');
  });

  it('returns null when no JSON found in content', () => {
    const content = "I couldn't evaluate this session properly.";

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for invalid verdict field', () => {
    const content = '{"verdict":"unknown","confidence":50,"summary":"test","retryRecommendation":"none"}';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON in fenced block', () => {
    const content = '```json\n{broken json}\n```';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('handles whitespace in fenced JSON blocks', () => {
    const content = [
      'My evaluation:',
      '```json',
      '',
      '  {',
      '    "verdict": "pass",',
      '    "confidence": 90,',
      '    "summary": "Looks great",',
      '    "retryRecommendation": "none"',
      '  }',
      '',
      '```',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
    expect(result!.confidence).toBe(90);
    expect(result!.summary).toBe('Looks great');
  });
});

// ── getDynamicMaxParallel ─────────────────────────────────────────────────

describe('getDynamicMaxParallel', () => {
  it('caps at configuredMax when plenty of memory available (60GB, 8GB per session, 4GB reserved)', () => {
    // 60GB available - 4GB reserved = 56GB usable, 56GB / 8GB = 7 slots → capped at configuredMax=4
    _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(4); // configuredMax wins
  });

  it('returns memory-limited slot count when less than configuredMax (32GB available, 8GB per session, 4GB reserved)', () => {
    // 32GB available - 4GB reserved = 28GB usable, 28GB / 8GB = 3 slots → 3 < configuredMax=5
    _mockMeminfoContent = 'MemAvailable:   33554432 kB\n'; // 32 GB
    const result = getDynamicMaxParallel(5, 8192, 4096);
    expect(result).toBe(3); // memory-limited
  });

  it('returns 0 when available memory is less than reserved (3GB available, 4GB reserved)', () => {
    // 3GB available - 4GB reserved = negative → clamped to 0 usable → 0 slots
    _mockMeminfoContent = 'MemAvailable:   3145728 kB\n'; // 3 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(0);
  });

  it('returns configuredMax on non-Linux (ENOENT → Infinity)', async () => {
    // Simulate non-Linux: readFileSync throws ENOENT → getAvailableMemoryMb returns Infinity
    _mockMeminfoContent = ''; // Won't be reached — mock throws instead
    const { readFileSync } = vi.mocked(await import('node:fs'));
    const saved = readFileSync.getMockImplementation();
    readFileSync.mockImplementationOnce((path: unknown) => {
      if (path === '/proc/meminfo') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw new Error('unexpected call');
    });

    const result = getDynamicMaxParallel(3, 8192, 4096);
    expect(result).toBe(3); // configuredMax returned on Infinity

    // Restore
    if (saved) readFileSync.mockImplementation(saved as Parameters<typeof readFileSync.mockImplementation>[0]);
    else readFileSync.mockRestore();
  });
});

// ── hasSystemdRunUser ─────────────────────────────────────────────────────

describe('hasSystemdRunUser', () => {
  beforeEach(() => {
    _resetSystemdRunCache();
  });

  afterEach(() => {
    _resetSystemdRunCache();
  });

  it('returns a boolean', async () => {
    const result = await hasSystemdRunUser();
    expect(typeof result).toBe('boolean');
  });

  it('caches its result after first call (returns same value on second call)', async () => {
    const first = await hasSystemdRunUser();
    const second = await hasSystemdRunUser();
    expect(first).toBe(second);
  });
});

// ── spawnChildJobs ───────────────────────────────────────────────────────

describe('spawnChildJobs', () => {
  let tempDir: string;

  beforeEach(() => {
    // Fresh in-memory DB for each test
    _getTestDb();
    // Create a temp directory with .planning/ROADMAP.md
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-test-'));
    mkdirSync(path.join(tempDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const ROADMAP_WITH_3_PHASES = `# Roadmap

## Milestone: launch-v1

### Phase 1: Project Setup
Plans:
- [x] 01-01-PLAN.md — Done
- [x] 01-01-PLAN.md — Done

### Phase 2: Core Engine
Plans:
- [ ] 02-01-PLAN.md — Pending

### Phase 3: UI Components
Plans:
- [ ] 03-01-PLAN.md — Pending
`;

  const ROADMAP_ALL_COMPLETE = `# Roadmap

### Phase 1: Done Phase
Plans:
- [x] 01-01-PLAN.md — Done
- [x] 01-02-PLAN.md — Done
`;

  const ROADMAP_NO_PHASES = `# Roadmap

No phases defined yet.
`;

  it('creates child jobs for incomplete phases only', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    // Phase 1 is complete (all [x]), Phase 2 and 3 are incomplete
    const parent = addJob('my-project', 'milestone', 'big milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    // Phase 1 is all [x] so complete → skipped. Phase 2 and 3 are incomplete.
    expect(children).toHaveLength(2);
  });

  it('child jobs have parentJobId pointing to parent milestone', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    const parent = addJob('my-project', 'milestone', 'big milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    for (const child of children) {
      expect(child.parentJobId).toBe(parent.id);
    }
  });

  it('child jobs are chained with depends_on (sequential)', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    const parent = addJob('my-project', 'milestone', 'big milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    expect(children).toHaveLength(2);
    // First child has no dependency
    expect(children[0].dependsOn).toBeNull();
    // Second child depends on first
    expect(children[1].dependsOn).toBe(children[0].id);
  });

  it('child jobs inherit project, modelProfile, providerMode from parent', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    const parent = addJob('my-project', 'milestone', 'big milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'quality',
      providerMode: 'hybrid',
      callbackSessionKey: null,
    });

    for (const child of children) {
      expect(child.project).toBe('my-project');
      expect(child.modelProfile).toBe('quality');
      expect(child.providerMode).toBe('hybrid');
      expect(child.scope).toBe('phase');
    }
  });

  it('returns empty array when all phases are complete', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_ALL_COMPLETE);

    const parent = addJob('my-project', 'milestone', 'all done milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    expect(children).toHaveLength(0);
  });

  it('returns empty array when ROADMAP.md does not exist', () => {
    // No ROADMAP.md written to tempDir
    const parent = addJob('my-project', 'milestone', 'no roadmap');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    expect(children).toHaveLength(0);
  });

  it('returns empty array when ROADMAP.md has no phases', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_NO_PHASES);

    const parent = addJob('my-project', 'milestone', 'empty roadmap');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    expect(children).toHaveLength(0);
  });

  it('includes phases with no plans (no checkboxes) as incomplete', () => {
    const roadmapWithUnplannedPhase = `# Roadmap

### Phase 1: Not Yet Planned

### Phase 2: In Progress
Plans:
- [ ] 02-01-PLAN.md — Todo
`;
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), roadmapWithUnplannedPhase);

    const parent = addJob('my-project', 'milestone', 'unplanned phases');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    // Both phases are incomplete (phase 1 has no plans, phase 2 has unchecked plan)
    expect(children).toHaveLength(2);
    expect(children[0].description).toBe('1'); // bare phase number
    expect(children[1].description).toBe('2');
  });

  it('persists child jobs in DB so getChildJobs returns them', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    const parent = addJob('my-project', 'milestone', 'big milestone');
    const spawned = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: null,
    });

    const fromDb = getChildJobs(parent.id);
    expect(fromDb).toHaveLength(spawned.length);
    expect(fromDb.map(j => j.id)).toEqual(spawned.map(j => j.id));
  });

  it('propagates callbackSessionKey from parent to children', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    const parent = addJob('my-project', 'milestone', 'big milestone');
    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: 'agent:main:subagent:abc123',
    });

    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(child.callbackSessionKey).toBe('agent:main:subagent:abc123');
    }
  });

  it('does not propagate callbackUrl to children', () => {
    writeFileSync(path.join(tempDir, '.planning', 'ROADMAP.md'), ROADMAP_WITH_3_PHASES);

    // Create parent with a callbackUrl — children should NOT inherit it
    const parent = addJob(
      'my-project', 'milestone', 'big milestone',
      undefined, 'balanced', 'claude-only', undefined, undefined,
      'agent:main:subagent:abc123', 'http://custom-url/hooks/agent',
    );

    const children = spawnChildJobs(parent.id, tempDir, {
      project: 'my-project',
      requirementPath: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      callbackSessionKey: parent.callbackSessionKey,
    });

    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      // callbackSessionKey propagated
      expect(child.callbackSessionKey).toBe('agent:main:subagent:abc123');
      // callbackUrl NOT propagated — children use global config URL
      expect(child.callbackUrl).toBeNull();
    }
  });
});

// ── parseVerificationResult ───────────────────────────────────────────────

describe('parseVerificationResult', () => {
  it('parses fully populated VERIFICATION.md with all checks passing', () => {
    const content = [
      '---',
      'phase: 31-automated-phase-verification',
      'status: passed',
      'verdict: PASS',
      'score: 5/5',
      'automated_checks:',
      '  typescript: { pass: true, duration_ms: 8200 }',
      '  tests: { pass: true, duration_ms: 12400 }',
      '  build: { pass: true, duration_ms: 18600 }',
      'blocking_issues: []',
      '---',
      '',
      '# Verification Report',
    ].join('\n');

    const result = parseVerificationResult(content);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('passed');
    expect(result!.verdict).toBe('PASS');
    expect(result!.score).toBe('5/5');
    expect(result!.automatedChecks['typescript']).toEqual({ pass: true, duration_ms: 8200 });
    expect(result!.automatedChecks['tests']).toEqual({ pass: true, duration_ms: 12400 });
    expect(result!.automatedChecks['build']).toEqual({ pass: true, duration_ms: 18600 });
    expect(result!.blockingIssues).toEqual([]);
    expect(Object.keys(result!.automatedChecks)).toHaveLength(3);
  });

  it('parses VERIFICATION.md with failed automated checks', () => {
    const content = [
      '---',
      'phase: 31-automated-phase-verification',
      'status: failed',
      'verdict: FAIL',
      'score: 1/2',
      'automated_checks:',
      '  typescript: { pass: false, duration_ms: 9100, error_summary: "3 type errors" }',
      '  tests: { pass: true, duration_ms: 11000 }',
      'blocking_issues:',
      '  - "TypeScript compilation failed: 3 type errors"',
      '---',
    ].join('\n');

    const result = parseVerificationResult(content);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('failed');
    expect(result!.verdict).toBe('FAIL');
    expect(result!.automatedChecks['typescript'].pass).toBe(false);
    expect(result!.automatedChecks['typescript'].error_summary).toBe('3 type errors');
    expect(result!.automatedChecks['tests'].pass).toBe(true);
    expect(result!.blockingIssues).toHaveLength(1);
    expect(result!.blockingIssues[0]).toBe('TypeScript compilation failed: 3 type errors');
  });

  it('parses VERIFICATION.md with gaps_found status', () => {
    const content = [
      '---',
      'status: gaps_found',
      'verdict: FAIL',
      'score: 3/5',
      'automated_checks:',
      '  typescript: { pass: true, duration_ms: 7800 }',
      'blocking_issues:',
      '  - "Missing error handling in task 3"',
      '---',
    ].join('\n');

    const result = parseVerificationResult(content);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('gaps_found');
    expect(result!.verdict).toBe('FAIL');
    expect(result!.score).toBe('3/5');
  });

  it('parses VERIFICATION.md with human_needed status and WARN verdict', () => {
    const content = [
      '---',
      'status: human_needed',
      'verdict: WARN',
      'score: 5/5',
      'automated_checks:',
      '  typescript: { pass: true, duration_ms: 8200 }',
      '  tests: { pass: true, duration_ms: 12400 }',
      'blocking_issues: []',
      '---',
    ].join('\n');

    const result = parseVerificationResult(content);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('human_needed');
    expect(result!.verdict).toBe('WARN');
    expect(result!.blockingIssues).toEqual([]);
  });

  it('returns null for content without frontmatter delimiters', () => {
    const content = 'Just some markdown content without --- delimiters';
    expect(parseVerificationResult(content)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseVerificationResult('')).toBeNull();
  });

  it('returns null for content with only opening --- but no closing', () => {
    const content = '---\nstatus: passed\nverdict: PASS\nSome body content';
    expect(parseVerificationResult(content)).toBeNull();
  });
});


