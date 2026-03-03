/**
 * TDD tests for pilot.db SQLite queue operations.
 *
 * Uses in-memory database via _getTestDb() for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { DelegationPlan } from '../../src/core/types.js';

// Import the module under test — will fail until db.ts is implemented
import {
  addJob,
  getJob,
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  cancel,
  retry,
  getQueue,
  getRecent,
  updateDelegationPlan,
  advanceStep,
  bump,
  updateSessionTitles,
  _getTestDb,
  claimNextLaunchable,
  forceQuitJob,
  getJobSteps,
  recordStep,
} from '../../src/core/db.js';

describe('pilot.db', () => {
  beforeEach(() => {
    // Get a fresh in-memory DB for each test
    _getTestDb();
  });

  // ── addJob ────────────────────────────────────────────────────────────

  describe('addJob', () => {
    it('creates a job and returns it with valid 4-char id', () => {
      const job = addJob('my-project', 'quick', 'fix the navbar');
      expect(job).toBeDefined();
      expect(job.id).toMatch(/^[a-z0-9]{4}$/);
      expect(job.project).toBe('my-project');
      expect(job.scope).toBe('quick');
      expect(job.description).toBe('fix the navbar');
      expect(job.status).toBe('pending');
      expect(job.priority).toBe(0);
      expect(job.dependsOn).toBeNull();
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(3);
      expect(job.delegationPlan).toBeNull();
      expect(job.currentStep).toBe(0);
      expect(job.sessionTitles).toBeNull();
      expect(job.requirementPath).toBeNull();
      expect(job.createdAt).toBeDefined();
      expect(job.modelProfile).toBe('balanced');
      expect(job.providerMode).toBe('claude-only');
    });

    it('stores requirementPath when provided', () => {
      const job = addJob('my-project', 'phase', 'add caching', 'requirements/cache.md');
      expect(job.requirementPath).toBe('requirements/cache.md');
    });

    it('generates unique IDs for different jobs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const job = addJob('proj', 'quick', `task ${i}`);
        ids.add(job.id);
      }
      expect(ids.size).toBe(20);
    });

    it('stores model_profile and provider_mode when provided', () => {
      const job = addJob('proj', 'quick', 'budget task', undefined, 'budget', 'hybrid');
      expect(job.modelProfile).toBe('budget');
      expect(job.providerMode).toBe('hybrid');
    });

    it('defaults to balanced / claude-only when profile/provider not provided', () => {
      const job = addJob('proj', 'quick', 'default task');
      expect(job.modelProfile).toBe('balanced');
      expect(job.providerMode).toBe('claude-only');
    });
  });

  // ── getJob ────────────────────────────────────────────────────────────

  describe('getJob', () => {
    it('returns the job by id', () => {
      const created = addJob('proj', 'quick', 'do stuff');
      const fetched = getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.project).toBe('proj');
    });

    it('returns null for unknown id', () => {
      expect(getJob('zzzz')).toBeNull();
    });
  });

  // ── getNextPending ────────────────────────────────────────────────────

  describe('getNextPending', () => {
    it('returns highest priority pending job', () => {
      addJob('a', 'quick', 'low priority');
      const high = addJob('b', 'quick', 'high priority');
      // bump b to higher priority
      bump(high.id);

      const next = getNextPending();
      expect(next).not.toBeNull();
      expect(next!.id).toBe(high.id);
    });

    it('returns oldest when priorities equal', () => {
      const first = addJob('a', 'quick', 'first');
      addJob('b', 'quick', 'second');

      const next = getNextPending();
      expect(next).not.toBeNull();
      expect(next!.id).toBe(first.id);
    });

    it('returns null when no pending jobs', () => {
      expect(getNextPending()).toBeNull();
    });

    it('skips non-pending jobs', () => {
      const j1 = addJob('a', 'quick', 'running');
      markRunning(j1.id);
      const j2 = addJob('b', 'quick', 'pending');

      const next = getNextPending();
      expect(next).not.toBeNull();
      expect(next!.id).toBe(j2.id);
    });
  });

  // ── markRunning ───────────────────────────────────────────────────────

  describe('markRunning', () => {
    it('sets status, started_at, and increments attempts', () => {
      const job = addJob('proj', 'quick', 'task');
      markRunning(job.id);

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).not.toBeNull();
      expect(updated!.attempts).toBe(1);
    });

    it('increments attempts on each call', () => {
      const job = addJob('proj', 'quick', 'task');
      markRunning(job.id);
      // Reset to pending for another run
      retry(job.id);
      markRunning(job.id);

      const updated = getJob(job.id);
      expect(updated!.attempts).toBe(2);
    });
  });

  // ── markCompleted ─────────────────────────────────────────────────────

  describe('markCompleted', () => {
    it('sets status and completed_at', () => {
      const job = addJob('proj', 'quick', 'task');
      markRunning(job.id);
      markCompleted(job.id);

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).not.toBeNull();
    });
  });

  // ── markFailed ────────────────────────────────────────────────────────

  describe('markFailed', () => {
    it('sets status, completed_at, and error message', () => {
      const job = addJob('proj', 'quick', 'task');
      markRunning(job.id);
      markFailed(job.id, 'OOM killed');

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('failed');
      expect(updated!.completedAt).not.toBeNull();
      expect(updated!.error).toBe('OOM killed');
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('sets status to cancelled', () => {
      const job = addJob('proj', 'quick', 'task');
      cancel(job.id);

      const updated = getJob(job.id);
      expect(updated!.status).toBe('cancelled');
    });
  });

  // ── retry ─────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('resets job to pending state', () => {
      const job = addJob('proj', 'quick', 'task');
      markRunning(job.id);
      markFailed(job.id, 'timeout');
      retry(job.id);

      const updated = getJob(job.id);
      expect(updated!.status).toBe('pending');
      expect(updated!.startedAt).toBeNull();
      expect(updated!.completedAt).toBeNull();
      expect(updated!.error).toBeNull();
    });
  });

  // ── getQueue ──────────────────────────────────────────────────────────

  describe('getQueue', () => {
    it('returns only pending + running jobs, ordered correctly', () => {
      const j1 = addJob('a', 'quick', 'pending-low');
      const j2 = addJob('b', 'quick', 'pending-high');
      bump(j2.id);
      const j3 = addJob('c', 'quick', 'will-run');
      markRunning(j3.id);
      const j4 = addJob('d', 'quick', 'will-complete');
      markRunning(j4.id);
      markCompleted(j4.id);

      const queue = getQueue();
      // Should have j2 (high priority pending), j1 (low priority pending), j3 (running)
      // j4 is completed and should not appear
      expect(queue.length).toBe(3);
      const ids = queue.map((j) => j.id);
      expect(ids).toContain(j1.id);
      expect(ids).toContain(j2.id);
      expect(ids).toContain(j3.id);
      expect(ids).not.toContain(j4.id);
      // First should be highest priority
      expect(queue[0].id).toBe(j2.id);
    });
  });

  // ── getRecent ─────────────────────────────────────────────────────────

  describe('getRecent', () => {
    it('returns completed/failed/cancelled in reverse chrono', () => {
      const j1 = addJob('a', 'quick', 'done');
      markRunning(j1.id);
      markCompleted(j1.id);

      const j2 = addJob('b', 'quick', 'failed');
      markRunning(j2.id);
      markFailed(j2.id, 'error');

      const j3 = addJob('c', 'quick', 'cancelled');
      cancel(j3.id);

      const j4 = addJob('d', 'quick', 'still pending');

      const recent = getRecent();
      expect(recent.length).toBe(3);
      const ids = recent.map((j) => j.id);
      expect(ids).toContain(j1.id);
      expect(ids).toContain(j2.id);
      expect(ids).toContain(j3.id);
      expect(ids).not.toContain(j4.id);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const j = addJob('p', 'quick', `task-${i}`);
        markRunning(j.id);
        markCompleted(j.id);
      }

      const recent = getRecent(3);
      expect(recent.length).toBe(3);
    });
  });

  // ── updateDelegationPlan ──────────────────────────────────────────────

  describe('updateDelegationPlan', () => {
    it('stores and retrieves JSON plan', () => {
      const job = addJob('proj', 'phase', 'build feature');
      const plan: DelegationPlan = {
        steps: [
          { command: 'plan-phase', args: '3 --auto' },
          { command: 'execute-phase', args: '3 --auto' },
        ],
        reasoning: 'Phase 3 needs planning then execution',
      };

      updateDelegationPlan(job.id, plan);
      const updated = getJob(job.id);
      expect(updated!.delegationPlan).not.toBeNull();

      const parsed = JSON.parse(updated!.delegationPlan!) as DelegationPlan;
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0].command).toBe('plan-phase');
      expect(parsed.reasoning).toBe('Phase 3 needs planning then execution');
    });
  });

  // ── advanceStep ───────────────────────────────────────────────────────

  describe('advanceStep', () => {
    it('increments current_step', () => {
      const job = addJob('proj', 'phase', 'multi-step');
      expect(job.currentStep).toBe(0);

      advanceStep(job.id);
      expect(getJob(job.id)!.currentStep).toBe(1);

      advanceStep(job.id);
      expect(getJob(job.id)!.currentStep).toBe(2);
    });
  });

  // ── bump ──────────────────────────────────────────────────────────────

  describe('bump', () => {
    it('moves job to front of queue', () => {
      const j1 = addJob('a', 'quick', 'first');
      const j2 = addJob('b', 'quick', 'second');
      const j3 = addJob('c', 'quick', 'third');

      // j3 should be last by default, bump to front
      bump(j3.id);

      const next = getNextPending();
      expect(next!.id).toBe(j3.id);

      // j3 priority should be higher than j1 and j2
      const j3Updated = getJob(j3.id)!;
      const j1Updated = getJob(j1.id)!;
      const j2Updated = getJob(j2.id)!;
      expect(j3Updated.priority).toBeGreaterThan(j1Updated.priority);
      expect(j3Updated.priority).toBeGreaterThan(j2Updated.priority);
    });
  });

  // ── updateSessionTitles ───────────────────────────────────────────────

  describe('updateSessionTitles', () => {
    it('stores and retrieves JSON array of session titles', () => {
      const job = addJob('proj', 'quick', 'task');
      updateSessionTitles(job.id, ['session-abc-123']);

      const updated = getJob(job.id);
      expect(updated!.sessionTitles).not.toBeNull();
      const titles = JSON.parse(updated!.sessionTitles!) as string[];
      expect(titles).toEqual(['session-abc-123']);
    });

    it('appends to existing titles (does not overwrite)', () => {
      const job = addJob('proj', 'quick', 'task');
      updateSessionTitles(job.id, ['session-1']);
      updateSessionTitles(job.id, ['session-2']);

      const updated = getJob(job.id);
      const titles = JSON.parse(updated!.sessionTitles!) as string[];
      expect(titles).toEqual(['session-1', 'session-2']);
    });

    it('handles first call when sessionTitles is null', () => {
      const job = addJob('proj', 'quick', 'task');
      expect(job.sessionTitles).toBeNull();

      updateSessionTitles(job.id, ['first-session']);
      const updated = getJob(job.id);
      const titles = JSON.parse(updated!.sessionTitles!) as string[];
      expect(titles).toEqual(['first-session']);
    });
  });

  // ── claimNextLaunchable ───────────────────────────────────────────────

  describe('claimNextLaunchable', () => {
    it('returns null when no pending jobs exist', () => {
      const result = claimNextLaunchable();
      expect(result).toBeNull();
    });

    it('claims a pending job and marks it running atomically', () => {
      const job = addJob('proj-a', 'quick', 'task 1');
      const claimed = claimNextLaunchable();
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.status).toBe('running');
      // Verify DB was updated too
      const fresh = getJob(job.id)!;
      expect(fresh.status).toBe('running');
      expect(fresh.startedAt).not.toBeNull();
      expect(fresh.attempts).toBe(1);
    });

    it('respects project serialization: does not claim if project already running', () => {
      const job1 = addJob('proj-x', 'quick', 'task 1');
      const job2 = addJob('proj-x', 'quick', 'task 2');  // same project

      // Claim first job
      const first = claimNextLaunchable();
      expect(first!.id).toBe(job1.id);

      // Second job from same project should NOT be claimed
      const second = claimNextLaunchable();
      expect(second).toBeNull();

      // job2 remains pending
      const j2 = getJob(job2.id)!;
      expect(j2.status).toBe('pending');
    });

    it('claims from a different project while one project is running', () => {
      const jobA = addJob('proj-a', 'quick', 'task 1');
      const jobB = addJob('proj-b', 'quick', 'task 2');  // different project

      // Claim proj-a job
      claimNextLaunchable();
      expect(getJob(jobA.id)!.status).toBe('running');

      // proj-b job should be claimable
      const claimed = claimNextLaunchable();
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(jobB.id);
      expect(claimed!.status).toBe('running');
    });

    it('returns null when only running jobs exist (all pending claimed)', () => {
      addJob('proj-a', 'quick', 'task 1');
      claimNextLaunchable();  // claims it
      const second = claimNextLaunchable();
      expect(second).toBeNull();
    });
  });

  // ── forceQuitJob ──────────────────────────────────────────────────────

  describe('forceQuitJob', () => {
    it('returns ok:false when job not found', () => {
      const result = forceQuitJob('nonexistent', 'cli');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/not found|not running/i);
    });

    it('returns ok:false when job is not running', () => {
      const job = addJob('proj-a', 'quick', 'task 1');  // pending
      const result = forceQuitJob(job.id, 'cli');
      expect(result.ok).toBe(false);
    });

    it('marks running job as failed with operator audit message', () => {
      const job = addJob('proj-a', 'quick', 'task 1');
      markRunning(job.id);

      const result = forceQuitJob(job.id, 'cli', 'stuck process');
      expect(result.ok).toBe(true);

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('failed');
      expect(updated.error).toMatch(/stuck process/i);
      expect(updated.error).toMatch(/cli/);
      expect(updated.completedAt).not.toBeNull();
    });

    it('marks running job_steps as failed with audit message', () => {
      const job = addJob('proj-a', 'quick', 'task 1');
      markRunning(job.id);
      const stepId = recordStep(job.id, 0, 'execute-phase', '1');

      forceQuitJob(job.id, 'tui');

      const steps = getJobSteps(job.id);
      const step = steps.find(s => s.id === stepId)!;
      expect(step.status).toBe('failed');
      expect(step.verdictReason).toMatch(/tui/i);
    });

    it('records source=cli vs source=tui in the error message', () => {
      const job1 = addJob('proj-a', 'quick', 'task 1');
      const job2 = addJob('proj-b', 'quick', 'task 2');
      markRunning(job1.id);
      markRunning(job2.id);

      forceQuitJob(job1.id, 'cli');
      forceQuitJob(job2.id, 'tui');

      expect(getJob(job1.id)!.error).toMatch(/cli/);
      expect(getJob(job2.id)!.error).toMatch(/tui/);
    });
  });
});
