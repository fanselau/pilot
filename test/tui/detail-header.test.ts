/**
 * Tests for detail header pure helpers: parseStepInfo and buildHeaderLines.
 *
 * Validates that the structured header renders all required metadata fields
 * at narrow (100×30) and wide (160×45) terminal widths without regressions.
 *
 * No UI renderer required — tests exercise pure TypeScript helper functions
 * exported from detail.tsx.
 */

import { describe, it, expect } from 'vitest';
import { parseStepInfo, buildHeaderLines } from '../../src/tui/views/detail.js';
import type { Job, DelegationPlan } from '../../src/core/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'phase',
    description: 'Implement authentication system',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-03T10:00:00Z',
    startedAt: '2026-03-03T10:05:00Z',
    completedAt: null,
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
    skipGracePeriod: false,
    ...overrides,
  };
}

function makeDelegationPlan(steps: Array<{ command: string; args: string }>): string {
  const plan: DelegationPlan = {
    steps,
    reasoning: 'test delegation plan',
  };
  return JSON.stringify(plan);
}

// ── parseStepInfo ─────────────────────────────────────────────────────────────

describe('parseStepInfo', () => {
  it('returns em-dash placeholders when delegationPlan is null', () => {
    const job = makeJob({ delegationPlan: null });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('returns em-dash placeholders when delegationPlan is empty string', () => {
    const job = makeJob({ delegationPlan: '' });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('returns em-dash placeholders for malformed JSON', () => {
    const job = makeJob({ delegationPlan: 'not-json{[' });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('returns em-dash label when currentStep is out of bounds', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '1 --auto' },
    ]);
    // currentStep=5 but only 1 step in plan
    const job = makeJob({ delegationPlan: plan, currentStep: 5 });
    const result = parseStepInfo(job);
    expect(result.label).toBe('—');
    // index clamps to total: min(5+1, 1)/1 = 1/1
    expect(result.index).toBe('1/1');
  });

  it('parses single-step plan at step 0', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '3 --auto' },
    ]);
    const job = makeJob({ delegationPlan: plan, currentStep: 0 });
    const result = parseStepInfo(job);
    expect(result.label).toBe('plan-phase "3 --auto"');
    expect(result.index).toBe('1/1');
  });

  it('parses multi-step plan at first step', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '1 --auto' },
      { command: 'execute-phase', args: '1 --auto' },
      { command: 'verify-phase', args: '1' },
    ]);
    const job = makeJob({ delegationPlan: plan, currentStep: 0 });
    const result = parseStepInfo(job);
    expect(result.label).toBe('plan-phase "1 --auto"');
    expect(result.index).toBe('1/3');
  });

  it('parses multi-step plan at middle step', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '2 --auto' },
      { command: 'execute-phase', args: '2 --auto' },
      { command: 'verify-phase', args: '2' },
    ]);
    const job = makeJob({ delegationPlan: plan, currentStep: 1 });
    const result = parseStepInfo(job);
    expect(result.label).toBe('execute-phase "2 --auto"');
    expect(result.index).toBe('2/3');
  });

  it('parses multi-step plan at last step', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '4 --auto' },
      { command: 'execute-phase', args: '4 --auto' },
      { command: 'verify-phase', args: '4' },
    ]);
    const job = makeJob({ delegationPlan: plan, currentStep: 2 });
    const result = parseStepInfo(job);
    expect(result.label).toBe('verify-phase "4"');
    expect(result.index).toBe('3/3');
  });

  it('truncates long args to 20 chars with ellipsis in label', () => {
    const longArgs = 'some-very-long-arg-value-that-exceeds-limit';
    const plan = makeDelegationPlan([
      { command: 'execute-phase', args: longArgs },
    ]);
    const job = makeJob({ delegationPlan: plan, currentStep: 0 });
    const result = parseStepInfo(job);
    // truncate(longArgs, 20) = longArgs.slice(0,19) + '…'
    const expectedArgs = longArgs.slice(0, 19) + '…';
    expect(result.label).toBe(`execute-phase "${expectedArgs}"`);
  });
});

// ── buildHeaderLines ──────────────────────────────────────────────────────────

describe('buildHeaderLines', () => {
  it('returns exactly 6 lines', () => {
    const job = makeJob();
    const lines = buildHeaderLines(job, 100);
    expect(lines).toHaveLength(6);
  });

  describe('line 1 — identity', () => {
    it('contains job id, project, scope, and status', () => {
      const job = makeJob({ id: 'xy99', project: 'auth-service', scope: 'phase', status: 'running' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[0]).toContain('#xy99');
      expect(lines[0]).toContain('auth-service');
      expect(lines[0]).toContain('phase');
      expect(lines[0]).toContain('running');
    });
  });

  describe('line 2 — description', () => {
    it('wraps description in double quotes', () => {
      const job = makeJob({ description: 'build the thing' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[1]).toMatch(/^".*"$/);
    });

    it('includes description text', () => {
      const job = makeJob({ description: 'short description' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[1]).toContain('short description');
    });

    it('truncates very long descriptions at narrow width (100 cols → descWidth=96)', () => {
      const longDesc = 'A'.repeat(200);
      const job = makeJob({ description: longDesc });
      const lines = buildHeaderLines(job, 100);
      // descWidth = max(20, 100-4) = 96; truncated to 96 chars
      expect(lines[1].length).toBeLessThan(200);
      // Line includes opening/closing quotes + at most descWidth chars
      expect(lines[1]).toMatch(/^".*"$/);
    });

    it('allows more description text at wide width (160 cols → descWidth=156)', () => {
      const longDesc = 'A'.repeat(200);
      const job = makeJob({ description: longDesc });
      const narrowLines = buildHeaderLines(job, 100);
      const wideLines = buildHeaderLines(job, 160);
      // Wide terminal should show more of the description
      expect(wideLines[1].length).toBeGreaterThan(narrowLines[1].length);
    });
  });

  describe('line 3 — separator', () => {
    it('is the separator string', () => {
      const job = makeJob();
      const lines = buildHeaderLines(job, 100);
      expect(lines[2]).toBe('separator');
    });
  });

  describe('line 4 — elapsed + step + tokens', () => {
    it('contains elapsed time indicator', () => {
      const job = makeJob({ startedAt: '2026-03-03T10:05:00Z' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[3]).toContain('⏱');
    });

    it('contains Step label', () => {
      const job = makeJob();
      const lines = buildHeaderLines(job, 100);
      expect(lines[3]).toContain('Step');
    });

    it('contains token indicator', () => {
      const job = makeJob();
      const lines = buildHeaderLines(job, 100);
      expect(lines[3]).toContain('◆');
      expect(lines[3]).toContain('tokens');
    });

    it('shows step index from delegation plan', () => {
      const plan = makeDelegationPlan([
        { command: 'plan-phase', args: '5 --auto' },
        { command: 'execute-phase', args: '5 --auto' },
      ]);
      const job = makeJob({ delegationPlan: plan, currentStep: 1 });
      const lines = buildHeaderLines(job, 100);
      expect(lines[3]).toContain('2/2');
    });

    it('shows em-dash step when no delegation plan', () => {
      const job = makeJob({ delegationPlan: null });
      const lines = buildHeaderLines(job, 100);
      // format: "Step {index}: {label}" — both are '—' when no plan
      expect(lines[3]).toContain('Step —: —');
    });
  });

  describe('line 5 — model + attempts + started', () => {
    it('contains model profile and provider mode', () => {
      const job = makeJob({ modelProfile: 'quality', providerMode: 'claude-only' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[4]).toContain('quality/claude-only');
    });

    it('contains attempts', () => {
      const job = makeJob({ attempts: 2 });
      const lines = buildHeaderLines(job, 100);
      expect(lines[4]).toContain('Attempts: 2');
    });

    it('contains Started label', () => {
      const job = makeJob({ startedAt: '2026-03-03T10:05:00Z' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[4]).toContain('Started:');
    });

    it('shows em-dash for started when startedAt is null', () => {
      const job = makeJob({ startedAt: null });
      const lines = buildHeaderLines(job, 100);
      expect(lines[4]).toContain('Started: —');
    });

    it('shows formatted time when startedAt is set', () => {
      const job = makeJob({ startedAt: '2026-03-03T10:05:30Z' });
      const lines = buildHeaderLines(job, 100);
      // Should have a HH:MM:SS formatted time (not the raw ISO string)
      expect(lines[4]).toMatch(/Started:\s+\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('line 6 — recovery metadata', () => {
    it('shows safe state with base/head shas by default', () => {
      const job = makeJob({ status: 'completed' });
      const lines = buildHeaderLines(job, 100);
      expect(lines[5]).toContain('Recovery: safe');
      expect(lines[5]).toContain('base:111111111111');
      expect(lines[5]).toContain('head:222222222222');
    });

    it('shows dirty-start guarded reason', () => {
      const job = makeJob({ status: 'completed', startedDirty: true });
      const lines = buildHeaderLines(job, 100);
      expect(lines[5]).toContain('Recovery: guarded (dirty-start)');
    });

    it('shows newer-work blocked guarded reason when available', () => {
      const job = makeJob({
        status: 'completed',
        error: 'Refusing undo for job ab12: newer commits exist after this checkpoint.',
      });
      const lines = buildHeaderLines(job, 100);
      expect(lines[5]).toContain('Recovery: guarded (blocked-newer-work)');
    });

    it('shows unavailable state for missing checkpoints', () => {
      const job = makeJob({ status: 'completed', gitBaseCommit: null, gitHeadCommit: null });
      const lines = buildHeaderLines(job, 100);
      expect(lines[5]).toContain('Recovery: unavailable (missing-checkpoint)');
    });
  });

  describe('compact reason lines', () => {
    it('adds grace-wait reason line with remaining seconds', () => {
      const job = makeJob({ status: 'pending', createdAt: '2026-03-08T00:00:00Z' });
      const lines = buildHeaderLines(job, 100, {
        nowEpochSeconds: Math.floor(new Date('2026-03-08T00:00:30Z').getTime() / 1000),
        queueGraceSeconds: 120,
      });
      expect(lines.some((line) => line.includes('Wait: grace-wait:90s'))).toBe(true);
    });

    it('adds retry guidance line for needs-revision failures', () => {
      const job = makeJob({
        status: 'failed',
        gitBaseCommit: 'abc123',
        gitHeadCommit: 'abc123',
      });
      const lines = buildHeaderLines(job, 100);
      expect(lines.some((line) => line.includes('Retry: needs-revision'))).toBe(true);
    });

    it('adds undo guarded line for newer-work jobs', () => {
      const job = makeJob({
        status: 'completed',
        error: 'Refusing undo for job ab12: newer commits exist after this checkpoint.',
      });
      const lines = buildHeaderLines(job, 100);
      expect(lines.some((line) => line.includes('Undo: undo:guarded-newer-work'))).toBe(true);
    });
  });

  describe('width-specific header composition', () => {
    it('produces valid 6-line header at narrow width (100 cols)', () => {
      const plan = makeDelegationPlan([
        { command: 'plan-phase', args: '3 --auto' },
        { command: 'execute-phase', args: '3 --auto' },
        { command: 'verify-phase', args: '3' },
      ]);
      const job = makeJob({
        id: 'ab12',
        project: 'my-project',
        scope: 'phase',
        description: 'Implement user authentication with JWT tokens',
        delegationPlan: plan,
        currentStep: 1,
        modelProfile: 'balanced',
        providerMode: 'hybrid',
        attempts: 1,
        startedAt: '2026-03-03T10:05:00Z',
        status: 'completed',
      });

      const lines = buildHeaderLines(job, 100);
      expect(lines).toHaveLength(6);

      // Identity
      expect(lines[0]).toContain('#ab12');
      expect(lines[0]).toContain('my-project');
      expect(lines[0]).toContain('completed');

      // Description within bounds
      expect(lines[1]).toMatch(/^".*"$/);
      expect(lines[1]).toContain('Implement user authentication');

      // Separator
      expect(lines[2]).toBe('separator');

      // Step/elapsed/tokens
      expect(lines[3]).toContain('⏱');
      expect(lines[3]).toContain('2/3');
      expect(lines[3]).toContain('execute-phase');

      // Model/attempts/started
      expect(lines[4]).toContain('balanced/hybrid');
      expect(lines[4]).toContain('Attempts: 1');
      expect(lines[4]).toContain('Started:');

      // Recovery
      expect(lines[5]).toContain('Recovery: safe');
      expect(lines[5]).toContain('base:111111111111');
    });

    it('produces valid 7-line header at wide width (160 cols) for non-balanced profile', () => {
      const plan = makeDelegationPlan([
        { command: 'plan-phase', args: '7 --auto' },
        { command: 'execute-phase', args: '7 --auto' },
      ]);
      const job = makeJob({
        id: 'cd34',
        project: 'big-service',
        scope: 'milestone',
        description: 'Build complete payment integration with Stripe webhooks and subscription management',
        delegationPlan: plan,
        currentStep: 0,
        modelProfile: 'quality',
        providerMode: 'claude-only',
        attempts: 3,
        startedAt: '2026-03-03T08:00:00Z',
        status: 'completed',
      });

      const lines = buildHeaderLines(job, 160);
      // 7 lines: identity, description, separator, step/elapsed, model/attempts, recovery, resolved models
      expect(lines).toHaveLength(7);

      // Identity
      expect(lines[0]).toContain('#cd34');
      expect(lines[0]).toContain('big-service');
      expect(lines[0]).toContain('milestone');
      expect(lines[0]).toContain('completed');

      // Description — wider terminal shows more
      expect(lines[1]).toMatch(/^".*"$/);
      // descWidth = max(20, 160-4) = 156
      expect(lines[1]).toContain('Build complete payment integration');

      // Separator
      expect(lines[2]).toBe('separator');

      // Step
      expect(lines[3]).toContain('1/2');
      expect(lines[3]).toContain('plan-phase');

      // Model
      expect(lines[4]).toContain('quality/claude-only');
      expect(lines[4]).toContain('Attempts: 3');

      // Recovery
      expect(lines[5]).toContain('Recovery: safe');
      expect(lines[5]).toContain('base:111111111111');

      // Resolved models line (only for non-balanced profiles)
      expect(lines[6]).toContain('Models:');
      expect(lines[6]).toContain('claude-opus-4-6');
    });

    it('wide header description line is longer than narrow for same long description', () => {
      const longDesc = 'B'.repeat(200);
      const job = makeJob({ description: longDesc });

      const narrow = buildHeaderLines(job, 100);
      const wide = buildHeaderLines(job, 160);

      // The description line at wide width should be longer
      expect(wide[1].length).toBeGreaterThan(narrow[1].length);
    });
  });
});
