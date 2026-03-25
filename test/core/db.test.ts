/**
 * TDD tests for pilot.db SQLite queue operations.
 *
 * Uses in-memory database via _getTestDb() for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DelegationResult, OpenClawDeliverRoute } from '../../src/core/types.js';
import { _resetConfigCache } from '../../src/core/config.js';

// Import the module under test — will fail until db.ts is implemented
import {
  addJob,
  getJob,
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  cancel,
  getQueue,
  getRecent,
  updateDelegationPayload,
  advanceStep,
  bump,
  updateSessionTitles,
  updateJobRecoveryStart,
  updateJobRecoveryHead,
  _getTestDb,
  claimNextLaunchable,
  forceQuitJob,
  getJobSteps,
  recordStep,
  getChildJobs,
  pauseJob,
  getMilestoneStatus,
  registerProject,
  getProject,
  getAllProjects,
  updateProjectOwner,
  updateProjectNotifyOpenClawRoute,
  blockProject,
  unblockProject,
  // Phase 67 hung helpers
  incrementHungCount,
  getRetryAttempts,
  // Phase 73: step CRUD for append-forward model
  createPendingStep,
  getNextPendingStep,
  markStepRunning,
  markStepCompleted,
  markStepSkipped,
  markStepFailed,
  cancelPendingSteps,
  getTotalStepCount,
  getPendingStepCount,
  appendSteps,
  // Phase 81: review state transitions
  markCompletedPendingReview,
  markReviewHold,
  approveReview,
  resumeFromReviewHold,
  // Phase 83: resumed review_hold pickup
  getResumedReviewHoldJobs,
  clearResumedFlag,
} from '../../src/core/db.js';

describe('pilot.db', () => {
  beforeEach(() => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/pilot-test-isolation';
    _resetConfigCache();
    // Get a fresh in-memory DB for each test
    _getTestDb();
  });

  afterEach(() => {
    delete process.env.PILOT_CONFIG_FILE;
    _resetConfigCache();
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
      expect(job.timeout).toBe(0);
      expect(job.delegationPlan).toBeNull();
      expect(job.currentStep).toBe(0);
      expect(job.sessionTitles).toBeNull();
      expect(job.requirementPath).toBeNull();
      expect(job.createdAt).toBeDefined();
      expect(job.modelProfile).toBe('balanced');
      expect(job.providerMode).toBe('claude-only');
      expect(job.gitBaseCommit).toBeNull();
      expect(job.gitHeadCommit).toBeNull();
      expect(job.startedDirty).toBe(false);
      expect(job.skipGracePeriod).toBe(false);
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
      expect(job.notifyRoute).toBeNull();
    });

    it('stores notifyRoute snapshot and round-trips through getJob', () => {
      const route: OpenClawDeliverRoute = {
        kind: 'openclaw-agent-deliver',
        agentId: 'benefitu',
        channel: 'telegram',
        to: 'telegram:-5181925291',
        accountId: 'benefitu',
      };

      const job = addJob(
        'proj',
        'quick',
        'notify route task',
        undefined,
        'balanced',
        'claude-only',
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        false,
        route,
      );

      expect(job.notifyRoute).toEqual(route);
      expect(getJob(job.id)!.notifyRoute).toEqual(route);
    });

    it('maps malformed notify_route JSON to null without crashing', () => {
      const db = _getTestDb();
      const job = addJob('proj', 'quick', 'bad notify route');
      db.prepare('UPDATE jobs SET notify_route = ? WHERE id = ?').run('{bad-json', job.id);

      const fetched = getJob(job.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.notifyRoute).toBeNull();
    });

    it('stores skipGracePeriod=true when explicitly provided', () => {
      const job = addJob(
        'proj',
        'quick',
        'skip-grace task',
        undefined,
        'balanced',
        'claude-only',
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        true,
      );
      expect(job.skipGracePeriod).toBe(true);
    });

    it('always sets retry_budget to 0 (retries removed)', () => {
      const job = addJob('proj', 'quick', 'no retry budget');
      expect(job.retryBudget).toBe(0);
    });
  });

  // ── recovery metadata ────────────────────────────────────────────────

  describe('recovery metadata', () => {
    it('defaults recovery metadata for new jobs', () => {
      const job = addJob('proj', 'quick', 'task');
      expect(job.gitBaseCommit).toBeNull();
      expect(job.gitHeadCommit).toBeNull();
      expect(job.startedDirty).toBe(false);
    });

    it('updates git_base_commit and started_dirty via updateJobRecoveryStart', () => {
      const job = addJob('proj', 'quick', 'task');
      updateJobRecoveryStart(job.id, 'abc1234', true);

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.gitBaseCommit).toBe('abc1234');
      expect(updated!.startedDirty).toBe(true);
    });

    it('updates git_head_commit via updateJobRecoveryHead', () => {
      const job = addJob('proj', 'quick', 'task');
      updateJobRecoveryHead(job.id, 'def5678');

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.gitHeadCommit).toBe('def5678');
    });

    it('allows recovery attempt metadata to be overwritten on later updates', () => {
      const job = addJob('proj', 'quick', 'task');
      updateJobRecoveryStart(job.id, 'base-one', true);
      updateJobRecoveryHead(job.id, 'head-one');

      updateJobRecoveryStart(job.id, 'base-two', false);
      updateJobRecoveryHead(job.id, 'head-two');

      const updated = getJob(job.id);
      expect(updated).not.toBeNull();
      expect(updated!.gitBaseCommit).toBe('base-two');
      expect(updated!.gitHeadCommit).toBe('head-two');
      expect(updated!.startedDirty).toBe(false);
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

    it('maps skipGracePeriod from stored row values', () => {
      const created = addJob('proj', 'quick', 'grace mapping', undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0, true);
      const fetched = getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.skipGracePeriod).toBe(true);
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

  // ── updateDelegationPayload ───────────────────────────────────────────

  describe('updateDelegationPayload', () => {
    it('stores and retrieves JSON delegation result', () => {
      const job = addJob('proj', 'phase', 'build feature');
      const plan: DelegationResult = {
        intent: { type: 'plan-and-execute', phaseNumber: 3 },
        reasoning: 'Phase 3 needs planning then execution',
      };

      updateDelegationPayload(job.id, plan);
      const updated = getJob(job.id);
      expect(updated!.delegationPlan).not.toBeNull();

      const parsed = JSON.parse(updated!.delegationPlan!) as DelegationResult;
      expect(parsed.intent.type).toBe('plan-and-execute');
      expect(parsed.reasoning).toBe('Phase 3 needs planning then execution');
    });

    it('rejects legacy array payloads at write boundary', () => {
      const job = addJob('proj', 'phase', 'legacy payload write');
      const legacyPayload = [{ command: 'gsd-execute-phase', args: '3' }];

      expect(() => {
        updateDelegationPayload(job.id, legacyPayload as unknown as DelegationResult);
      }).toThrow('Legacy delegation payload blocked at runtime boundary');

      expect(getJob(job.id)!.delegationPlan).toBeNull();
    });

    it('normalizes legacy step-array payloads to null on read', () => {
      const db = _getTestDb();
      const job = addJob('proj', 'phase', 'legacy payload read');
      db.prepare('UPDATE jobs SET delegation_plan = ? WHERE id = ?').run(
        JSON.stringify([{ command: 'gsd-execute-phase', args: '3' }]),
        job.id,
      );

      const fetched = getJob(job.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.delegationPlan).toBeNull();
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

    it('does not claim a newly queued job younger than the grace window', () => {
      const job = addJob('proj-grace', 'quick', 'fresh job');

      const claimed = claimNextLaunchable(120);
      expect(claimed).toBeNull();
      expect(getJob(job.id)!.status).toBe('pending');
    });

    it('claims a pending job after the grace threshold age is reached', () => {
      const db = _getTestDb();
      const job = addJob('proj-grace', 'quick', 'aged job');
      db.prepare("UPDATE jobs SET created_at = datetime('now', '-121 seconds') WHERE id = ?").run(job.id);

      const claimed = claimNextLaunchable(120);
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.status).toBe('running');
    });

    it('bypasses grace wait when skipGracePeriod=true on the job', () => {
      const job = addJob(
        'proj-grace',
        'quick',
        'urgent job',
        undefined,
        'balanced',
        'claude-only',
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        true,
      );

      const claimed = claimNextLaunchable(300);
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.status).toBe('running');
    });

    it('treats queueGraceSeconds=0 as globally disabled waiting', () => {
      const job = addJob('proj-grace', 'quick', 'no grace global');

      const claimed = claimNextLaunchable(0);
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.status).toBe('running');
    });

    it('marks pending legacy delegation payloads failed and skips them', () => {
      const db = _getTestDb();
      const legacyJob = addJob('proj-legacy', 'quick', 'legacy pending job');
      const validJob = addJob('proj-valid', 'quick', 'valid pending job');

      db.prepare('UPDATE jobs SET delegation_plan = ? WHERE id = ?').run(
        JSON.stringify([{ command: 'gsd-execute-phase', args: '3' }]),
        legacyJob.id,
      );

      const claimed = claimNextLaunchable();
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(validJob.id);

      const legacyState = getJob(legacyJob.id)!;
      expect(legacyState.status).toBe('failed');
      expect(legacyState.error).toContain('Legacy delegation payload blocked at runtime boundary');
      expect(legacyState.delegationPlan).toBeNull();
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

  // ── resetToPending (removed — retries removed) ────────────────────────

  // resetToPending tests removed — retry concept eliminated.

  // ── dummy anchor to mark removal end ─────────────────────────────
  // The following tests were removed:
  // - resetToPending: sets status to pending, clears session_titles, archives attempts, stores resume_hint, etc.
  // resetToPending tests removed — retry concept eliminated (quick task 260320-nc6).

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

  // ── step CRUD (append-forward model, Phase 73) ────────────────────────

  describe('step CRUD (append-forward model)', () => {
    it('createPendingStep creates step with status=pending and source', () => {
      const job = addJob('proj', 'phase', 'step test');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      expect(stepId).toBeGreaterThan(0);

      const steps = getJobSteps(job.id);
      expect(steps).toHaveLength(1);
      expect(steps[0].status).toBe('pending');
      expect(steps[0].source).toBe('delegation');
      expect(steps[0].command).toBe('plan-phase');
      expect(steps[0].args).toBe('31');
      expect(steps[0].startedAt).toBeNull();
    });

    it('getNextPendingStep returns first pending step by index', () => {
      const job = addJob('proj', 'phase', 'multi-step');
      markRunning(job.id);
      createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      createPendingStep(job.id, 1, 'execute-phase', '31', 'delegation');
      createPendingStep(job.id, 2, 'judge', '', 'delegation');

      const next = getNextPendingStep(job.id);
      expect(next).not.toBeNull();
      expect(next!.stepIndex).toBe(0);
      expect(next!.command).toBe('plan-phase');
    });

    it('getNextPendingStep returns null when no pending steps', () => {
      const job = addJob('proj', 'phase', 'no pending');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      markStepRunning(stepId);

      const next = getNextPendingStep(job.id);
      expect(next).toBeNull();
    });

    it('markStepRunning sets status and started_at', () => {
      const job = addJob('proj', 'phase', 'running step');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      markStepRunning(stepId);

      const steps = getJobSteps(job.id);
      expect(steps[0].status).toBe('running');
      expect(steps[0].startedAt).not.toBeNull();
    });

    it('markStepCompleted sets status, completed_at, duration, sessionId', () => {
      const job = addJob('proj', 'phase', 'complete step');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'execute-phase', '31', 'delegation');
      markStepRunning(stepId);
      markStepCompleted(stepId, 'session-abc', 'My Session Title');

      const steps = getJobSteps(job.id);
      expect(steps[0].status).toBe('completed');
      expect(steps[0].completedAt).not.toBeNull();
      expect(steps[0].sessionId).toBe('session-abc');
      expect(steps[0].sessionTitle).toBe('My Session Title');
    });

    it('markStepFailed sets status, error, completed_at', () => {
      const job = addJob('proj', 'phase', 'fail step');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'judge', '', 'delegation');
      markStepRunning(stepId);
      markStepFailed(stepId, 'Process died unexpectedly');

      const steps = getJobSteps(job.id);
      expect(steps[0].status).toBe('failed');
      expect(steps[0].error).toBe('Process died unexpectedly');
      expect(steps[0].completedAt).not.toBeNull();
    });

    it('getTotalStepCount returns total step count for job', () => {
      const job = addJob('proj', 'phase', 'count steps');
      markRunning(job.id);
      createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      createPendingStep(job.id, 1, 'execute-phase', '31', 'delegation');
      createPendingStep(job.id, 2, 'judge', '', 'delegation');

      expect(getTotalStepCount(job.id)).toBe(3);
    });

    it('getPendingStepCount returns only pending steps', () => {
      const job = addJob('proj', 'phase', 'pending count');
      markRunning(job.id);
      createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      const step2 = createPendingStep(job.id, 1, 'execute-phase', '31', 'delegation');
      createPendingStep(job.id, 2, 'judge', '', 'delegation');
      markStepRunning(step2);

      expect(getPendingStepCount(job.id)).toBe(2);
    });

    it('appendSteps bulk-inserts pending steps with correct indexes', () => {
      const job = addJob('proj', 'phase', 'append test');
      markRunning(job.id);
      createPendingStep(job.id, 0, 'plan-phase', '31', 'delegation');
      createPendingStep(job.id, 1, 'execute-phase', '31', 'delegation');

      appendSteps(
        job.id,
        [
          { command: 'plan-phase', args: '31 --gaps' },
          { command: 'judge', args: '' },
        ],
        'judge:gaps',
        'Found 3 gaps',
      );

      const allSteps = getJobSteps(job.id);
      expect(allSteps).toHaveLength(4);
      // New steps should have indexes 2 and 3
      expect(allSteps[2].stepIndex).toBe(2);
      expect(allSteps[3].stepIndex).toBe(3);
      expect(allSteps[2].source).toBe('judge:gaps');
      expect(allSteps[3].source).toBe('judge:gaps');
      expect(allSteps[2].reason).toBe('Found 3 gaps');
      expect(allSteps[2].status).toBe('pending');
      expect(allSteps[2].startedAt).toBeNull();
    });

    it('appendSteps with source judge:hung', () => {
      const job = addJob('proj', 'phase', 'hung append');
      markRunning(job.id);
      createPendingStep(job.id, 0, 'execute-phase', '31', 'delegation');

      appendSteps(
        job.id,
        [{ command: 'execute-phase', args: '31 --resume' }],
        'judge:hung',
        'Session hung on interactive-prompt',
      );

      const allSteps = getJobSteps(job.id);
      expect(allSteps).toHaveLength(2);
      expect(allSteps[1].source).toBe('judge:hung');
      expect(allSteps[1].reason).toBe('Session hung on interactive-prompt');
    });

    it('markStepSkipped sets status to skipped with reason', () => {
      const job = addJob('proj', 'phase', 'skip step');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'ui-phase', '97', 'delegation');
      markStepRunning(stepId);
      markStepSkipped(stepId, 'ui-phase skipped: hung before producing UI-SPEC', 'session-xyz', 'ui-phase-title');

      const steps = getJobSteps(job.id);
      expect(steps[0].status).toBe('skipped');
      expect(steps[0].error).toBe('ui-phase skipped: hung before producing UI-SPEC');
      expect(steps[0].completedAt).not.toBeNull();
      expect(steps[0].sessionId).toBe('session-xyz');
      expect(steps[0].sessionTitle).toBe('ui-phase-title');
    });

    it('cancelPendingSteps cancels all pending steps and returns count', () => {
      const job = addJob('proj', 'phase', 'cancel pending');
      markRunning(job.id);
      // 3 delegation steps, then 3 hung-recovery steps
      const step0 = createPendingStep(job.id, 0, 'ui-phase', '97', 'delegation');
      createPendingStep(job.id, 1, 'plan-phase', '97', 'delegation');
      createPendingStep(job.id, 2, 'execute-phase', '97 --auto', 'delegation');
      createPendingStep(job.id, 3, 'judge', '', 'delegation');
      // Simulate: step 0 completed, step 1 running, steps 2-3 pending
      markStepRunning(step0);
      markStepCompleted(step0);
      const step1 = 2; // createPendingStep returns row id
      markStepRunning(step1);

      // Also append hung-recovery steps (pending)
      appendSteps(
        job.id,
        [
          { command: 'plan-phase', args: '97' },
          { command: 'execute-phase', args: '97 --auto' },
          { command: 'judge', args: '' },
        ],
        'judge:hung',
        'interactive-prompt',
      );

      const cancelled = cancelPendingSteps(job.id, 'Judge passed — remaining steps skipped');
      // Steps 2, 3 (delegation pending) + steps 4, 5, 6 (hung-recovery pending) = 5 pending
      expect(cancelled).toBe(5);

      // Verify all are now skipped
      const allSteps = getJobSteps(job.id);
      const skipped = allSteps.filter(s => s.status === 'skipped');
      expect(skipped).toHaveLength(5);
      for (const s of skipped) {
        expect(s.error).toBe('Judge passed — remaining steps skipped');
      }

      // Running and completed steps should NOT be affected
      const completed = allSteps.filter(s => s.status === 'completed');
      const running = allSteps.filter(s => s.status === 'running');
      expect(completed).toHaveLength(1);
      expect(running).toHaveLength(1);
    });

    it('cancelPendingSteps returns 0 when no pending steps exist', () => {
      const job = addJob('proj', 'phase', 'no pending');
      markRunning(job.id);
      const stepId = createPendingStep(job.id, 0, 'judge', '', 'delegation');
      markStepRunning(stepId);
      markStepCompleted(stepId);

      const cancelled = cancelPendingSteps(job.id, 'Judge passed');
      expect(cancelled).toBe(0);
    });
  });

}); // end 'pilot.db'

// ── managed projects ──────────────────────────────────────────────────────

describe('managed projects', () => {
  beforeEach(() => { _getTestDb(); });

  describe('registerProject / getProject', () => {
    it('registers a new project', () => {
      registerProject('/path/to/proj', 'agent:main:main');
      const p = getProject('/path/to/proj');
      expect(p).not.toBeNull();
      expect(p!.path).toBe('/path/to/proj');
      expect(p!.owner).toBe('agent:main:main');
      expect(p!.notifyOpenClawRoute).toBeNull();
      expect(p!.status).toBe('active');
    });

    it('re-registering same path updates owner (idempotent)', () => {
      registerProject('/path/to/proj', 'agent:main:main');
      registerProject('/path/to/proj', 'agent:other:other');
      const p = getProject('/path/to/proj');
      expect(p!.owner).toBe('agent:other:other');
    });

    it('returns null for unregistered project', () => {
      expect(getProject('/nonexistent')).toBeNull();
    });
  });

  describe('updateProjectOwner', () => {
    it('updates owner on existing project', () => {
      registerProject('/path/to/proj', 'old-owner');
      updateProjectOwner('/path/to/proj', 'new-owner');
      expect(getProject('/path/to/proj')!.owner).toBe('new-owner');
    });
  });

  describe('updateProjectNotifyOpenClawRoute', () => {
    it('persists structured notify route and round-trips through getProject', () => {
      registerProject('/path/to/proj', 'owner');
      const route: OpenClawDeliverRoute = {
        kind: 'openclaw-agent-deliver',
        agentId: 'main',
        channel: 'telegram',
        to: 'telegram:6102973659',
        accountId: 'gorb',
      };

      updateProjectNotifyOpenClawRoute('/path/to/proj', route);
      expect(getProject('/path/to/proj')!.notifyOpenClawRoute).toEqual(route);
    });

    it('clears stored route when set to null', () => {
      registerProject('/path/to/proj', 'owner');
      updateProjectNotifyOpenClawRoute('/path/to/proj', {
        kind: 'openclaw-agent-deliver',
        agentId: 'main',
        channel: 'telegram',
        to: 'telegram:6102973659',
      });

      updateProjectNotifyOpenClawRoute('/path/to/proj', null);
      expect(getProject('/path/to/proj')!.notifyOpenClawRoute).toBeNull();
    });

    it('maps malformed notify_openclaw_route JSON to null without crashing', () => {
      const db = _getTestDb();
      registerProject('/path/to/proj', 'owner');
      db.prepare('UPDATE projects SET notify_openclaw_route = ? WHERE path = ?').run('{not-json', '/path/to/proj');

      const project = getProject('/path/to/proj');
      expect(project).not.toBeNull();
      expect(project!.notifyOpenClawRoute).toBeNull();
    });
  });

  describe('getAllProjects', () => {
    it('returns empty array when no projects registered', () => {
      expect(getAllProjects()).toEqual([]);
    });

    it('returns all registered projects ordered by path', () => {
      registerProject('/b/proj', 'owner-b');
      registerProject('/a/proj', 'owner-a');
      const all = getAllProjects();
      expect(all.length).toBe(2);
      expect(all[0].path).toBe('/a/proj');
      expect(all[1].path).toBe('/b/proj');
    });
  });

  describe('blockProject / unblockProject', () => {
    it('blocks a project with reason', () => {
      registerProject('/path/to/proj', 'owner');
      blockProject('/path/to/proj', 'Build failed: type error');
      const p = getProject('/path/to/proj');
      expect(p!.status).toBe('blocked');
      expect(p!.blockedReason).toBe('Build failed: type error');
      expect(p!.blockedAt).not.toBeNull();
    });

    it('unblocks a blocked project', () => {
      registerProject('/path/to/proj', 'owner');
      blockProject('/path/to/proj', 'some reason');
      unblockProject('/path/to/proj');
      const p = getProject('/path/to/proj');
      expect(p!.status).toBe('active');
      expect(p!.blockedReason).toBeNull();
      expect(p!.blockedAt).toBeNull();
    });
  });

  describe('markFailed → blocks project', () => {
    it('blocking a project after job failure if project is registered', () => {
      registerProject('/test/proj', 'owner');
      const job = addJob('/test/proj', 'quick', 'test task');
      markRunning(job.id);
      markFailed(job.id, 'Something went wrong');
      const p = getProject('/test/proj');
      expect(p!.status).toBe('blocked');
      expect(p!.blockedReason).toBe('Something went wrong');
    });

    it('markFailed on unregistered project does not crash (blockProject no-ops)', () => {
      const job = addJob('/unregistered/proj', 'quick', 'test task');
      markRunning(job.id);
      expect(() => markFailed(job.id, 'error')).not.toThrow();
    });
  });

  describe('claimNextLaunchable — skips blocked projects', () => {
    it('skips pending jobs for blocked projects', () => {
      registerProject('/blocked/proj', 'owner');
      blockProject('/blocked/proj', 'blocked');
      addJob('/blocked/proj', 'quick', 'should be skipped');

      const claimed = claimNextLaunchable();
      expect(claimed).toBeNull();
    });

    it('claims jobs for active projects but not blocked ones', () => {
      registerProject('/blocked/proj', 'owner');
      blockProject('/blocked/proj', 'reason');

      registerProject('/active/proj', 'owner');
      addJob('/blocked/proj', 'quick', 'blocked job');
      addJob('/active/proj', 'quick', 'active job');

      const claimed = claimNextLaunchable();
      expect(claimed).not.toBeNull();
      expect(claimed!.project).toBe('/active/proj');
    });
  });

  describe('new jobs default to timeout=0', () => {
    it('addJob creates job with timeout=0 (no limit)', () => {
      const job = addJob('/test/proj', 'quick', 'test');
      expect(job.timeout).toBe(0);
    });
  });

  // ── Phase 67: hung session retry helpers ──────────────────────────────

  describe('retry budget always zero on new jobs', () => {
    it('new job has retryBudget=0, retryCount=0, hungCount=0', () => {
      const job = addJob('/proj', 'quick', 'test job');
      expect(job.retryBudget).toBe(0);
      expect(job.retryCount).toBe(0);
      expect(job.hungCount).toBe(0);
      expect(job.lastHungReason).toBeNull();
    });
  });

  describe('incrementHungCount', () => {
    it('increments hung_count by 1 and sets last_hung_reason', () => {
      const job = addJob('/proj', 'quick', 'hung test');
      expect(job.hungCount).toBe(0);
      expect(job.lastHungReason).toBeNull();

      incrementHungCount(job.id, 'interactive-prompt');

      const updated = getJob(job.id)!;
      expect(updated.hungCount).toBe(1);
      expect(updated.lastHungReason).toBe('interactive-prompt');
    });

    it('accumulates hung count on multiple calls', () => {
      const job = addJob('/proj', 'quick', 'multi-hung');
      incrementHungCount(job.id, 'interactive-prompt');
      incrementHungCount(job.id, 'stuck-tool');

      const updated = getJob(job.id)!;
      expect(updated.hungCount).toBe(2);
      expect(updated.lastHungReason).toBe('stuck-tool'); // last reason wins
    });
  });

  // incrementRetryCount, canRetry, isSameHungReason, resetRetryState, retry() tests
  // removed — retry concept eliminated (quick task 260320-nc6).

  // ── review state transitions (Phase 81) ──────────────────────────────

  describe('review state transitions', () => {
    it('markCompletedPendingReview sets status to completed_pending_review', () => {
      registerProject('/review/proj', 'owner');
      const job = addJob('/review/proj', 'quick', 'review task');
      markRunning(job.id);
      markCompletedPendingReview(job.id);

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('completed_pending_review');
    });

    it('markCompletedPendingReview does NOT block the project', () => {
      registerProject('/review/proj2', 'owner');
      const job = addJob('/review/proj2', 'quick', 'review job');
      markRunning(job.id);
      markCompletedPendingReview(job.id);

      const project = getProject('/review/proj2')!;
      expect(project.status).toBe('active');
      expect(project.blockedReason).toBeNull();
    });

    it('markCompletedPendingReview stores reviewChecklist in resume_hint', () => {
      const job = addJob('/proj', 'quick', 'review job with checklist');
      markRunning(job.id);
      markCompletedPendingReview(job.id, 'Check API response shapes, verify auth flow');

      const updated = getJob(job.id)!;
      expect(updated.resumeHint).toBe('Check API response shapes, verify auth flow');
    });

    it('markCompletedPendingReview sets completed_at', () => {
      const job = addJob('/proj', 'quick', 'review job timestamps');
      markRunning(job.id);
      markCompletedPendingReview(job.id);

      const updated = getJob(job.id)!;
      expect(updated.completedAt).not.toBeNull();
    });

    it('markReviewHold sets status to review_hold without blocking project', () => {
      registerProject('/review/proj3', 'owner');
      const job = addJob('/review/proj3', 'quick', 'mid-phase job');
      markRunning(job.id);
      markReviewHold(job.id, 'Verify migration results before continuing');

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('review_hold');

      const project = getProject('/review/proj3')!;
      expect(project.status).toBe('active');
    });

    it('markReviewHold stores reviewReason in resume_hint', () => {
      const job = addJob('/proj', 'quick', 'hold job');
      markRunning(job.id);
      markReviewHold(job.id, 'Check migration output before continuing');

      const updated = getJob(job.id)!;
      expect(updated.resumeHint).toBe('Check migration output before continuing');
    });

    it('approveReview transitions completed_pending_review to completed', () => {
      const job = addJob('/proj', 'quick', 'approve me');
      markRunning(job.id);
      markCompletedPendingReview(job.id);
      approveReview(job.id);

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('completed');
      expect(updated.resumeHint).toBeNull();
    });

    it('approveReview is a no-op when job is not in completed_pending_review', () => {
      const job = addJob('/proj', 'quick', 'pending job');
      approveReview(job.id); // no-op

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('pending');
    });

    it('resumeFromReviewHold transitions review_hold to running and returns job', () => {
      const job = addJob('/proj', 'quick', 'resume me');
      markRunning(job.id);
      markReviewHold(job.id, 'review reason');

      const resumed = resumeFromReviewHold(job.id);
      expect(resumed).not.toBeNull();
      expect(resumed!.status).toBe('running');

      const updated = getJob(job.id)!;
      expect(updated.status).toBe('running');
      expect(updated.resumeHint).toBeNull();
    });

    it('resumeFromReviewHold returns null when job is not in review_hold', () => {
      const job = addJob('/proj', 'quick', 'pending job');
      const result = resumeFromReviewHold(job.id);
      expect(result).toBeNull();
    });

    it('markFailed still blocks project (existing behavior preserved)', () => {
      registerProject('/test/proj-fail2', 'owner');
      const job = addJob('/test/proj-fail2', 'quick', 'fail task');
      markRunning(job.id);
      markFailed(job.id, 'Something went wrong');

      const project = getProject('/test/proj-fail2')!;
      expect(project.status).toBe('blocked');
    });

    it('claimNextLaunchable does NOT skip projects that only have completed_pending_review jobs', () => {
      registerProject('/review/proj4', 'owner');
      const job1 = addJob('/review/proj4', 'quick', 'first job');
      markRunning(job1.id);
      markCompletedPendingReview(job1.id);

      // Second job for same project — should be claimable since first is not 'running'
      const job2 = addJob('/review/proj4', 'quick', 'second job');

      const claimed = claimNextLaunchable();
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job2.id);
    });

    it('review_hold jobs appear in getQueue', () => {
      const job = addJob('/proj', 'quick', 'held job');
      markRunning(job.id);
      markReviewHold(job.id, 'mid-phase check needed');

      const queue = getQueue();
      const ids = queue.map((j) => j.id);
      expect(ids).toContain(job.id);
    });

    it('completed_pending_review jobs appear in getRecent', () => {
      const job = addJob('/proj', 'quick', 'review recent');
      markRunning(job.id);
      markCompletedPendingReview(job.id);

      const recent = getRecent();
      const ids = recent.map((j) => j.id);
      expect(ids).toContain(job.id);
    });

    it('resumeFromReviewHold sets resumed_from_hold so getResumedReviewHoldJobs can find it', () => {
      const job = addJob('/proj', 'quick', 'resume hold job');
      markRunning(job.id);
      markReviewHold(job.id, 'checkpoint reason');
      resumeFromReviewHold(job.id);

      const resumed = getResumedReviewHoldJobs();
      const ids = resumed.map((j) => j.id);
      expect(ids).toContain(job.id);
    });
  });

  describe('getResumedReviewHoldJobs', () => {
    it('returns empty array when no resumed jobs exist', () => {
      const resumed = getResumedReviewHoldJobs();
      expect(resumed).toEqual([]);
    });

    it('returns jobs in running status that were resumed from review_hold', () => {
      const job = addJob('/proj', 'quick', 'resumed job');
      markRunning(job.id);
      markReviewHold(job.id, 'mid-phase checkpoint');
      resumeFromReviewHold(job.id);

      const resumed = getResumedReviewHoldJobs();
      expect(resumed.length).toBe(1);
      expect(resumed[0].id).toBe(job.id);
      expect(resumed[0].status).toBe('running');
    });

    it('does not return normal running jobs without resumed_from_hold flag', () => {
      const job = addJob('/proj', 'quick', 'normal running job');
      markRunning(job.id);

      const resumed = getResumedReviewHoldJobs();
      expect(resumed.length).toBe(0);
    });

    it('does not return review_hold jobs that have not been resumed yet', () => {
      const job = addJob('/proj', 'quick', 'still held job');
      markRunning(job.id);
      markReviewHold(job.id, 'waiting for approval');

      const resumed = getResumedReviewHoldJobs();
      expect(resumed.length).toBe(0);
    });
  });

  describe('clearResumedFlag', () => {
    it('clears the resumed_from_hold flag so job is no longer in resumed list', () => {
      const job = addJob('/proj', 'quick', 'clear flag job');
      markRunning(job.id);
      markReviewHold(job.id, 'reason');
      resumeFromReviewHold(job.id);

      // Should be in resumed list before clearing
      const before = getResumedReviewHoldJobs();
      expect(before.map((j) => j.id)).toContain(job.id);

      // Clear the flag
      clearResumedFlag(job.id);

      // Should no longer appear in resumed list
      const after = getResumedReviewHoldJobs();
      expect(after.map((j) => j.id)).not.toContain(job.id);
    });

    it('is a no-op for jobs without the resumed flag', () => {
      const job = addJob('/proj', 'quick', 'no-op clear');
      markRunning(job.id);

      // Should not throw
      expect(() => clearResumedFlag(job.id)).not.toThrow();
    });
  });

});
