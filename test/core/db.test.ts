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
  retry,
  getQueue,
  getRecent,
  updateDelegationPlan,
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
  resetToPending,
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
  // Phase 67 retry helpers
  incrementHungCount,
  incrementRetryCount,
  updateRetryHint,
  updateLastFailureFingerprint,
  recordRetryAttempt,
  getRetryAttempts,
  canRetry,
  isSameHungReason,
  resetRetryState,
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

    it('persists explicit retry budget when provided', () => {
      const job = addJob(
        'proj',
        'quick',
        'custom retry budget',
        undefined,
        'balanced',
        'claude-only',
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        false,
        undefined,
        5,
      );
      expect(job.retryBudget).toBe(5);
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
    it('stores and retrieves JSON delegation result', () => {
      const job = addJob('proj', 'phase', 'build feature');
      const plan: DelegationResult = {
        intent: { type: 'plan-and-execute', phaseNumber: 3 },
        reasoning: 'Phase 3 needs planning then execution',
      };

      updateDelegationPlan(job.id, plan);
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
        updateDelegationPlan(job.id, legacyPayload as unknown as DelegationResult);
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

    it('archives retry attempt lineage before clearing live fields', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      updateSessionTitles(job.id, ['session-a', 'session-b']);
      updateRetryHint(job.id, 'focus failing lint and rerun');
      updateLastFailureFingerprint(job.id, ['lint:src/core/db.ts:line-120']);

      resetToPending(job.id, 'retry-resume');

      const attempts = getRetryAttempts(job.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptNumber).toBe(1);
      expect(attempts[0].retryStrategy).toBe('retry-resume');
      expect(attempts[0].retryHint).toBe('focus failing lint and rerun');
      expect(attempts[0].failureFingerprint).toEqual(['lint:src/core/db.ts:line-120']);
      expect(attempts[0].sessionTitles).toEqual(['session-a', 'session-b']);

      const updated = getJob(job.id)!;
      expect(updated.sessionTitles).toBeNull();
    });

    it('getRetryAttempts returns deterministic attempt ordering', () => {
      const job = addJob('proj', 'phase', 'multi-attempt task');

      markRunning(job.id);
      updateSessionTitles(job.id, ['session-1']);
      updateRetryHint(job.id, 'attempt-one');
      resetToPending(job.id, 'retry-full');

      markRunning(job.id);
      updateSessionTitles(job.id, ['session-2']);
      updateRetryHint(job.id, 'attempt-two');
      resetToPending(job.id, 'retry-resume');

      const attempts = getRetryAttempts(job.id);
      expect(attempts).toHaveLength(2);
      expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
      expect(attempts[0].retryHint).toBe('attempt-one');
      expect(attempts[1].retryHint).toBe('attempt-two');
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

    it('returns true when resetting a running job', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);

      const didReset = resetToPending(job.id);
      expect(didReset).toBe(true);
      expect(getJob(job.id)!.status).toBe('pending');
    });

    it('is no-op on failed (force-quit) jobs', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      forceQuitJob(job.id, 'cli');
      expect(getJob(job.id)!.status).toBe('failed');

      const didReset = resetToPending(job.id, 'retry hint');
      expect(didReset).toBe(false);
      expect(getJob(job.id)!.status).toBe('failed'); // Still failed, not resurrected
    });

    it('is no-op on completed jobs', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      markCompleted(job.id);

      const didReset = resetToPending(job.id);
      expect(didReset).toBe(false);
      expect(getJob(job.id)!.status).toBe('completed');
    });

    it('is no-op on cancelled jobs', () => {
      const job = addJob('proj', 'phase', 'task');
      markRunning(job.id);
      cancel(job.id);

      const didReset = resetToPending(job.id);
      expect(didReset).toBe(false);
      expect(getJob(job.id)!.status).toBe('cancelled');
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

  describe('retry budget fields on new jobs', () => {
    it('new job has retryBudget=2, retryCount=0, hungCount=0, lastHungReason=null', () => {
      const job = addJob('/proj', 'quick', 'test job');
      expect(job.retryBudget).toBe(2);
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

  describe('incrementRetryCount', () => {
    it('increments retry_count by 1', () => {
      const job = addJob('/proj', 'quick', 'retry test');
      expect(job.retryCount).toBe(0);

      incrementRetryCount(job.id);

      const updated = getJob(job.id)!;
      expect(updated.retryCount).toBe(1);
    });

    it('accumulates on multiple calls', () => {
      const job = addJob('/proj', 'quick', 'multi-retry');
      incrementRetryCount(job.id);
      incrementRetryCount(job.id);

      const updated = getJob(job.id)!;
      expect(updated.retryCount).toBe(2);
    });
  });

  describe('retry metadata helpers', () => {
    it('round-trips retryHint persistence through updateRetryHint', () => {
      const job = addJob('/proj', 'quick', 'retry hint test');
      updateRetryHint(job.id, 'investigate flaky test ordering');

      const updated = getJob(job.id)!;
      expect(updated.retryHint).toBe('investigate flaky test ordering');
    });

    it('round-trips lastFailureFingerprint through updateLastFailureFingerprint', () => {
      const job = addJob('/proj', 'quick', 'fingerprint test');
      updateLastFailureFingerprint(job.id, ['verify:missing-summary', 'lint:src/core/runner.ts']);

      const updated = getJob(job.id)!;
      expect(updated.lastFailureFingerprint).toEqual([
        'verify:missing-summary',
        'lint:src/core/runner.ts',
      ]);
    });

    it('records explicit retry attempts via recordRetryAttempt helper', () => {
      const job = addJob('/proj', 'quick', 'manual archive test');
      markRunning(job.id);
      updateSessionTitles(job.id, ['session-manual']);
      updateRetryHint(job.id, 'manual-hint');
      updateLastFailureFingerprint(job.id, ['manual:fingerprint']);

      const archived = recordRetryAttempt(job.id, 'retry-full');
      expect(archived).not.toBeNull();

      const attempts = getRetryAttempts(job.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].retryStrategy).toBe('retry-full');
      expect(attempts[0].retryHint).toBe('manual-hint');
      expect(attempts[0].failureFingerprint).toEqual(['manual:fingerprint']);
    });
  });

  describe('canRetry', () => {
    it('returns true when retry_count < retry_budget (0 < 2)', () => {
      const job = addJob('/proj', 'quick', 'can retry');
      expect(canRetry(job.id)).toBe(true);
    });

    it('returns false when retry_count equals retry_budget', () => {
      const job = addJob('/proj', 'quick', 'budget exhausted');
      incrementRetryCount(job.id);
      incrementRetryCount(job.id);

      // retryCount=2, retryBudget=2 → cannot retry
      expect(canRetry(job.id)).toBe(false);
    });

    it('returns false when retry_count exceeds retry_budget (defensive)', () => {
      const job = addJob('/proj', 'quick', 'over budget');
      incrementRetryCount(job.id);
      incrementRetryCount(job.id);
      incrementRetryCount(job.id);
      incrementRetryCount(job.id); // 4 > 2

      expect(canRetry(job.id)).toBe(false);
    });

    it('returns false for non-existent job id', () => {
      expect(canRetry('xxxx')).toBe(false);
    });
  });

  describe('isSameHungReason', () => {
    it('returns true when last_hung_reason matches current reason', () => {
      const job = addJob('/proj', 'quick', 'same reason');
      incrementHungCount(job.id, 'interactive-prompt');

      expect(isSameHungReason(job.id, 'interactive-prompt')).toBe(true);
    });

    it('returns false when last_hung_reason differs from current reason', () => {
      const job = addJob('/proj', 'quick', 'different reason');
      incrementHungCount(job.id, 'interactive-prompt');

      expect(isSameHungReason(job.id, 'stuck-tool')).toBe(false);
    });

    it('returns false when last_hung_reason is null (no previous hang)', () => {
      const job = addJob('/proj', 'quick', 'fresh job');
      expect(isSameHungReason(job.id, 'interactive-prompt')).toBe(false);
    });
  });

  describe('resetRetryState', () => {
    it('clears retry_count, hung_count, and last_hung_reason', () => {
      const job = addJob('/proj', 'quick', 'reset test');
      incrementHungCount(job.id, 'interactive-prompt');
      incrementRetryCount(job.id);
      incrementRetryCount(job.id);

      // Verify state before reset
      const before = getJob(job.id)!;
      expect(before.hungCount).toBe(1);
      expect(before.retryCount).toBe(2);
      expect(before.lastHungReason).toBe('interactive-prompt');

      resetRetryState(job.id);

      const after = getJob(job.id)!;
      expect(after.retryCount).toBe(0);
      expect(after.hungCount).toBe(0);
      expect(after.lastHungReason).toBeNull();
    });
  });

  describe('retry() resets retry state', () => {
    it('pilot retry clears retry_count, hung_count, last_hung_reason', () => {
      const job = addJob('/proj', 'quick', 'pilot retry test');
      markRunning(job.id);
      incrementHungCount(job.id, 'interactive-prompt');
      incrementRetryCount(job.id);
      markFailed(job.id, 'Retry budget exhausted after interactive-prompt hang');

      // Before pilot retry
      const before = getJob(job.id)!;
      expect(before.retryCount).toBe(1);
      expect(before.hungCount).toBe(1);
      expect(before.lastHungReason).toBe('interactive-prompt');

      retry(job.id);

      const after = getJob(job.id)!;
      expect(after.status).toBe('pending');
      expect(after.retryCount).toBe(0);
      expect(after.hungCount).toBe(0);
      expect(after.lastHungReason).toBeNull();
    });
  });

});
