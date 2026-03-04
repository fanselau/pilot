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
  resetToPending,
  getChildJobs,
  pauseJob,
  getMilestoneStatus,
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

    it('stores callbackSessionKey and callbackUrl when provided', () => {
      const job = addJob(
        'proj', 'quick', 'notify task',
        undefined, 'balanced', 'claude-only', undefined, undefined,
        'agent:main:subagent:abc123', 'http://custom-url/hooks/agent',
      );
      expect(job.callbackSessionKey).toBe('agent:main:subagent:abc123');
      expect(job.callbackUrl).toBe('http://custom-url/hooks/agent');
    });

    it('defaults callbackSessionKey and callbackUrl to null when not provided', () => {
      const job = addJob('proj', 'quick', 'plain task');
      expect(job.callbackSessionKey).toBeNull();
      expect(job.callbackUrl).toBeNull();
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
      // retry() resets attempts to 0, so after markRunning it's 1 again
      retry(job.id);
      markRunning(job.id);

      const updated = getJob(job.id);
      expect(updated!.attempts).toBe(1);
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

  // ── resetToPending ────────────────────────────────────────────────────

  describe('resetToPending', () => {
    it('sets status to pending and clears started_at', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      resetToPending(job.id);

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('pending');
      expect(updated.startedAt).toBeNull();
    });

    it('clears session_titles to prevent stale reconciler matches', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      updateSessionTitles(job.id, ['proj-phase-abc-1234']);
      expect(getJob(job.id)!.sessionTitles).not.toBeNull();

      resetToPending(job.id);
      expect(getJob(job.id)!.sessionTitles).toBeNull();
    });

    it('deletes all job_steps for the job', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      recordStep(job.id, 0, 'execute-phase', '3 --auto');
      recordStep(job.id, 1, 'verify-phase', '3');
      expect(getJobSteps(job.id)).toHaveLength(2);

      resetToPending(job.id);
      expect(getJobSteps(job.id)).toHaveLength(0);
    });

    it('stores resume_hint in dedicated column (not in error)', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      resetToPending(job.id, 'Resume from plan 04');

      const updated = getJob(job.id)!;
      expect(updated.resumeHint).toBe('Resume from plan 04');
      expect(updated.error).toBeNull(); // error must NOT be overloaded
    });

    it('sets resume_hint to null when no hint provided', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      resetToPending(job.id);

      const updated = getJob(job.id)!;
      expect(updated.resumeHint).toBeNull();
      expect(updated.error).toBeNull();
    });

    it('resume_hint persists through getJob and is accessible as job.resumeHint', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      resetToPending(job.id, 'Fix tsconfig first');

      const fetched = getJob(job.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.resumeHint).toBe('Fix tsconfig first');
    });

    it('clears previous resume_hint when called without hint after a hinted reset', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      // First reset with hint
      resetToPending(job.id, 'Some hint');
      markRunning(job.id);
      // Second reset without hint — should clear the previous hint
      resetToPending(job.id);

      expect(getJob(job.id)!.resumeHint).toBeNull();
    });
  });

  // ── milestone orchestration ───────────────────────────────────────────

  describe('milestone orchestration', () => {

    // ── depends_on enforcement in claimNextLaunchable ──────────────────

    describe('depends_on enforcement in claimNextLaunchable', () => {
      it('claims job A but not job B whose dependency is job A (pending)', () => {
        const jobA = addJob('proj', 'phase', 'phase 1');
        const jobB = addJob('proj-b', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);

        // Should claim A first (no depends_on)
        const first = claimNextLaunchable();
        expect(first).not.toBeNull();
        expect(first!.id).toBe(jobA.id);

        // B has depends_on=A, A is running (not completed) → B should NOT be claimed
        const second = claimNextLaunchable();
        expect(second).toBeNull();

        // B remains pending
        expect(getJob(jobB.id)!.status).toBe('pending');
      });

      it('claims job B after dependency job A is completed', () => {
        const jobA = addJob('proj', 'phase', 'phase 1');
        const jobB = addJob('proj-b', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);

        // Claim and complete A
        claimNextLaunchable(); // claims A
        markCompleted(jobA.id);

        // Now B's dependency is completed — should be claimable
        const claimed = claimNextLaunchable();
        expect(claimed).not.toBeNull();
        expect(claimed!.id).toBe(jobB.id);
        expect(claimed!.status).toBe('running');
      });

      it('does not claim job B when dependency is running', () => {
        const jobA = addJob('proj', 'phase', 'phase 1');
        const jobB = addJob('proj-b', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);

        // Claim A (now running)
        claimNextLaunchable();
        expect(getJob(jobA.id)!.status).toBe('running');

        // B's dependency is running, not completed → B blocked
        const result = claimNextLaunchable();
        expect(result).toBeNull();
        expect(getJob(jobB.id)!.status).toBe('pending');
      });

      it('does not claim job B when dependency is failed', () => {
        const jobA = addJob('proj', 'phase', 'phase 1');
        const jobB = addJob('proj-b', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);

        // Claim A, then fail it
        claimNextLaunchable();
        markFailed(jobA.id, 'phase 1 failed');

        // B's dependency is failed (not completed) → B should NOT be claimed
        const result = claimNextLaunchable();
        expect(result).toBeNull();
        expect(getJob(jobB.id)!.status).toBe('pending');
      });

      it('claims job with no depends_on while blocked job exists', () => {
        const jobA = addJob('proj-a', 'phase', 'phase 1');
        const jobB = addJob('proj-b', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);
        const jobC = addJob('proj-c', 'phase', 'independent job');

        // Claim A (running)
        claimNextLaunchable();

        // Claim C (no depends_on, different project from A)
        const claimed = claimNextLaunchable();
        expect(claimed).not.toBeNull();
        expect(claimed!.id).toBe(jobC.id);

        // B is still blocked
        expect(getJob(jobB.id)!.status).toBe('pending');
      });
    });

    // ── addJob with dependsOn and parentJobId ──────────────────────────

    describe('addJob with dependsOn and parentJobId', () => {
      it('stores dependsOn and parentJobId when provided', () => {
        const parent = addJob('proj', 'milestone', 'big milestone');
        const child = addJob('proj', 'phase', 'phase 1', undefined, 'balanced', 'claude-only', undefined, parent.id);

        const fetched = getJob(child.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.parentJobId).toBe(parent.id);
        expect(fetched!.dependsOn).toBeNull();
      });

      it('stores dependsOn when provided', () => {
        const jobA = addJob('proj', 'phase', 'phase 1');
        const jobB = addJob('proj', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', jobA.id);

        const fetched = getJob(jobB.id);
        expect(fetched!.dependsOn).toBe(jobA.id);
        expect(fetched!.parentJobId).toBeNull();
      });

      it('stores both dependsOn and parentJobId together', () => {
        const parent = addJob('proj', 'milestone', 'milestone');
        const child1 = addJob('proj', 'phase', 'phase 1', undefined, 'balanced', 'claude-only', undefined, parent.id);
        const child2 = addJob('proj', 'phase', 'phase 2', undefined, 'balanced', 'claude-only', child1.id, parent.id);

        const fetched2 = getJob(child2.id);
        expect(fetched2!.dependsOn).toBe(child1.id);
        expect(fetched2!.parentJobId).toBe(parent.id);
      });

      it('defaults dependsOn and parentJobId to null when not provided', () => {
        const job = addJob('proj', 'phase', 'standalone phase');
        expect(job.dependsOn).toBeNull();
        expect(job.parentJobId).toBeNull();
      });
    });

    // ── getChildJobs ───────────────────────────────────────────────────

    describe('getChildJobs', () => {
      it('returns all children of a parent job, ordered by created_at ASC', () => {
        const parent = addJob('proj', 'milestone', 'milestone coordinator');
        const child1 = addJob('proj', 'phase', '1', undefined, 'balanced', 'claude-only', undefined, parent.id);
        const child2 = addJob('proj', 'phase', '2', undefined, 'balanced', 'claude-only', child1.id, parent.id);
        const child3 = addJob('proj', 'phase', '3', undefined, 'balanced', 'claude-only', child2.id, parent.id);

        const children = getChildJobs(parent.id);
        expect(children).toHaveLength(3);
        // Order by created_at ASC (insertion order)
        expect(children[0].id).toBe(child1.id);
        expect(children[1].id).toBe(child2.id);
        expect(children[2].id).toBe(child3.id);
      });

      it('returns empty array for a job with no children', () => {
        const job = addJob('proj', 'milestone', 'empty milestone');
        const children = getChildJobs(job.id);
        expect(children).toHaveLength(0);
        expect(children).toEqual([]);
      });

      it('returns empty array for nonexistent parent ID', () => {
        const children = getChildJobs('zzzz');
        expect(children).toHaveLength(0);
      });

      it('does not include jobs from other parents', () => {
        const parent1 = addJob('proj', 'milestone', 'milestone 1');
        const parent2 = addJob('proj', 'milestone', 'milestone 2');
        const child1 = addJob('proj', 'phase', '1', undefined, 'balanced', 'claude-only', undefined, parent1.id);
        addJob('proj', 'phase', '2', undefined, 'balanced', 'claude-only', undefined, parent2.id);

        const children1 = getChildJobs(parent1.id);
        expect(children1).toHaveLength(1);
        expect(children1[0].id).toBe(child1.id);
      });
    });

    // ── pauseJob ───────────────────────────────────────────────────────

    describe('pauseJob', () => {
      it('sets status to paused and sets completed_at', () => {
        const job = addJob('proj', 'milestone', 'big milestone');
        markRunning(job.id);

        pauseJob(job.id);

        const updated = getJob(job.id)!;
        expect(updated.status).toBe('paused');
        expect(updated.completedAt).not.toBeNull();
      });

      it('can pause a completed milestone coordinator', () => {
        const job = addJob('proj', 'milestone', 'coordinator');
        markRunning(job.id);
        markCompleted(job.id);

        pauseJob(job.id);

        const updated = getJob(job.id)!;
        expect(updated.status).toBe('paused');
      });
    });

    // ── getMilestoneStatus ─────────────────────────────────────────────

    describe('getMilestoneStatus', () => {
      it('returns correct counts for mixed child statuses', () => {
        const parent = addJob('proj', 'milestone', 'coordinator');

        // Create 4 children with different statuses
        const c1 = addJob('proj', 'phase', '1', undefined, 'balanced', 'claude-only', undefined, parent.id);
        const c2 = addJob('proj', 'phase', '2', undefined, 'balanced', 'claude-only', c1.id, parent.id);
        const c3 = addJob('proj', 'phase', '3', undefined, 'balanced', 'claude-only', c2.id, parent.id);
        const c4 = addJob('proj', 'phase', '4', undefined, 'balanced', 'claude-only', c3.id, parent.id);

        markRunning(c1.id);
        markCompleted(c1.id);        // completed

        markRunning(c2.id);
        markFailed(c2.id, 'error');  // failed

        markRunning(c3.id);          // running (stays running)

        // c4 stays pending

        const counts = getMilestoneStatus(parent.id);
        expect(counts.total).toBe(4);
        expect(counts.completed).toBe(1);
        expect(counts.failed).toBe(1);
        expect(counts.running).toBe(1);
        expect(counts.pending).toBe(1);
        expect(counts.paused).toBe(0);
      });

      it('returns all zeros for milestone with no children', () => {
        const parent = addJob('proj', 'milestone', 'empty milestone');
        const counts = getMilestoneStatus(parent.id);
        expect(counts.total).toBe(0);
        expect(counts.completed).toBe(0);
        expect(counts.failed).toBe(0);
        expect(counts.running).toBe(0);
        expect(counts.pending).toBe(0);
        expect(counts.paused).toBe(0);
      });

      it('counts paused children correctly', () => {
        const parent = addJob('proj', 'milestone', 'coordinator');
        const child = addJob('proj', 'phase', '1', undefined, 'balanced', 'claude-only', undefined, parent.id);

        pauseJob(child.id);

        const counts = getMilestoneStatus(parent.id);
        expect(counts.total).toBe(1);
        expect(counts.paused).toBe(1);
        expect(counts.pending).toBe(0);
      });
    });

  }); // end 'milestone orchestration'

});
