import type { Job, JobStatus } from './types.js';
import { safeParseTimestamp } from './time-utils.js';

export type JobWhyCode =
  | 'grace-wait'
  | 'project-blocked'
  | 'depends-on'
  | 'project-serial'
  | 'launchable'
  | 'failed'
  | 'needs-revision'
  | 'not-applicable'
  | 'undo-safe'
  | 'undo-guarded-newer-work'
  | 'undo-guarded-diverged'
  | 'undo-unavailable'
  | 'no-commit-delta'
  | 'running'
  | 'pending-human-review'
  | 'review-hold';

export interface JobWhy {
  code: JobWhyCode;
  badge: string;
  what: string;
  why: string;
  next: string;
  remainingSeconds?: number;
}

export interface JobWhyContext {
  nowEpochSeconds?: number;
  queueGraceSeconds?: number;
  projectBlocked?: boolean;
  blockedReason?: string | null;
  dependencyStatus?: JobStatus | null;
  hasRunningJobForProject?: boolean;
}

function hasNoCommitDelta(job: Job): boolean {
  return (
    job.gitBaseCommit !== null
    && job.gitHeadCommit !== null
    && job.gitBaseCommit === job.gitHeadCommit
  );
}

function parseTimestampToEpochSeconds(raw: string): number | null {
  const ms = safeParseTimestamp(raw);
  return ms !== null ? Math.floor(ms / 1000) : null;
}

function inferKnownGuardState(job: Job): 'newer-work' | 'diverged-history' | null {
  const lower = `${job.error ?? ''} ${job.resumeHint ?? ''}`.toLowerCase();
  if (
    lower.includes('newer commits exist')
    || lower.includes('newer work')
    || lower.includes('ahead of this checkpoint')
  ) {
    return 'newer-work';
  }
  if (lower.includes('diverged')) {
    return 'diverged-history';
  }
  return null;
}

function inferNeedsRevision(job: Job): boolean {
  if (hasNoCommitDelta(job)) {
    return true;
  }

  if (job.judgeVerdict) {
    try {
      const verdict = JSON.parse(job.judgeVerdict) as { verdict?: string; confidence?: number };
      if (verdict.verdict === 'failed' && typeof verdict.confidence === 'number' && verdict.confidence >= 80) {
        return true;
      }
    } catch {
      // Ignore parse errors and fall through to text heuristics.
    }
  }

  const lower = `${job.error ?? ''} ${job.resumeHint ?? ''}`.toLowerCase();
  return (
    lower.includes('needs revision')
    || lower.includes('revise requirement')
    || lower.includes('requirements not met')
  );
}

function buildGraceWhy(job: Job, context: JobWhyContext): JobWhy {
  const now = context.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const queuedAt = parseTimestampToEpochSeconds(job.createdAt);
  if (queuedAt === null) {
    return {
      code: 'launchable',
      badge: 'pending-ready',
      what: 'Job is pending and can start when a slot opens.',
      why: 'Queue age could not be parsed, so no grace wait is enforced.',
      next: 'Wait for runner capacity.',
    };
  }

  const grace = context.queueGraceSeconds ?? 0;
  const age = Math.max(0, now - queuedAt);
  const remainingSeconds = Math.max(0, grace - age);

  if (remainingSeconds > 0) {
    return {
      code: 'grace-wait',
      badge: 'grace-wait',
      what: 'Job is waiting for the queue grace window.',
      why: `Queue grace is ${grace}s and this job is only ${age}s old.`,
      next: 'Wait for grace to elapse or queue with --start-immediately.',
      remainingSeconds,
    };
  }

  return {
    code: 'launchable',
    badge: 'pending-ready',
    what: 'Job is pending and launchable.',
    why: 'All known launch guards are currently clear.',
    next: 'Wait for runner capacity.',
  };
}

function buildPendingWhy(job: Job, context: JobWhyContext): JobWhy {
  if (context.projectBlocked) {
    const reason = context.blockedReason ? ` (${context.blockedReason})` : '';
    return {
      code: 'project-blocked',
      badge: 'blocked-project',
      what: 'Project is blocked from launching new jobs.',
      why: `A prior failure blocked this project${reason}.`,
      next: `Run pilot unblock "${job.project}" after reviewing the failure.`,
    };
  }

  if (job.dependsOn && context.dependencyStatus && context.dependencyStatus !== 'completed') {
    return {
      code: 'depends-on',
      badge: 'depends-on',
      what: 'Job is waiting on a dependency.',
      why: `Dependency ${job.dependsOn} is ${context.dependencyStatus}.`,
      next: `Resolve dependency ${job.dependsOn} before retrying this job.`,
    };
  }

  if (context.hasRunningJobForProject) {
    return {
      code: 'project-serial',
      badge: 'project-serial',
      what: 'Another job for this project is already running.',
      why: 'Pilot enforces same-project serialization for safety.',
      next: 'Wait for the running project job to finish.',
    };
  }

  if (!job.skipGracePeriod && (context.queueGraceSeconds ?? 0) > 0) {
    return buildGraceWhy(job, context);
  }

  return {
    code: 'launchable',
    badge: 'pending-ready',
    what: 'Job is pending and launchable.',
    why: 'No pending guard is currently active.',
    next: 'Wait for runner capacity.',
  };
}

function buildRetryWhy(job: Job): JobWhy {
  if (job.status === 'cancelled') {
    return {
      code: 'failed',
      badge: 'cancelled',
      what: 'Job was cancelled.',
      why: 'Cancellation does not imply a requirement issue.',
      next: `Queue a new job with pilot add ${job.project}.`,
    };
  }

  if (job.status === 'failed') {
    if (inferNeedsRevision(job)) {
      return {
        code: 'needs-revision',
        badge: 'needs-revision',
        what: 'This failure suggests a requirement or outcome mismatch.',
        why: 'Signals point to requirement or outcome mismatch rather than a transient error.',
        next: 'Revise the requirement and queue a follow-up job.',
      };
    }

    return {
      code: 'failed',
      badge: 'failed',
      what: 'Last run failed.',
      why: job.error ? `Latest failure: ${job.error}` : 'No non-retryable guard was detected.',
      next: `Run pilot unblock "${job.project}" and queue a new job.`,
    };
  }

  return {
    code: 'not-applicable',
    badge: 'n/a',
    what: `Job is ${job.status}.`,
    why: 'Failure analysis only applies to failed or cancelled jobs.',
    next: 'Wait for terminal failure/cancel state or queue a new job.',
  };
}

function buildUndoWhy(job: Job): JobWhy {
  if (job.status === 'pending' || job.status === 'running') {
    return {
      code: 'undo-unavailable',
      badge: 'undo:unavailable',
      what: 'Undo checkpoints are not actionable yet.',
      why: 'Undo is only safe to evaluate after terminal status.',
      next: 'Wait for completion/failure, then run pilot undo --dry-run.',
    };
  }

  if (!job.gitBaseCommit || !job.gitHeadCommit) {
    return {
      code: 'undo-unavailable',
      badge: 'undo:unavailable',
      what: 'Undo checkpoints are missing.',
      why: 'Base/head commits were not recorded for this job.',
      next: 'Use pilot log/info context and queue a corrective job.',
    };
  }

  const knownGuard = inferKnownGuardState(job);
  if (knownGuard === 'newer-work') {
    return {
      code: 'undo-guarded-newer-work',
      badge: 'undo:guarded-newer-work',
      what: 'Undo is guarded by newer work.',
      why: 'Commits exist after this checkpoint.',
      next: 'Undo newer jobs first or use --force intentionally.',
    };
  }

  if (knownGuard === 'diverged-history') {
    return {
      code: 'undo-guarded-diverged',
      badge: 'undo:guarded-diverged',
      what: 'Undo is guarded by history divergence.',
      why: 'Current git history diverged from recorded checkpoints.',
      next: 'Inspect git history before using --force.',
    };
  }

  return {
    code: 'undo-safe',
    badge: 'undo:safe',
    what: 'Undo checkpoints look compatible.',
    why: 'Base/head checkpoints exist with no active guard signals.',
    next: `Run pilot undo ${job.id} --dry-run to preview rollback.`,
  };
}

function buildJobWhy(job: Job, context: JobWhyContext = {}): JobWhy {
  if (job.status === 'pending') {
    return buildPendingWhy(job, context);
  }

  if (job.status === 'running') {
    return {
      code: 'running',
      badge: 'running',
      what: 'Job is currently running.',
      why: 'Runner claimed this job and started execution.',
      next: 'Use pilot log <id> for live progress.',
    };
  }

  if (job.status === 'completed_pending_review') {
    return {
      code: 'pending-human-review',
      badge: 'review-pending',
      what: 'Autonomous work is complete. Human review required.',
      why: job.resumeHint
        ? `Review items: ${job.resumeHint}`
        : 'Judge determined remaining items require human verification.',
      next: `Run: pilot review ${job.id} --approve  OR  pilot review ${job.id} --reject "reason"`,
    };
  }

  if (job.status === 'review_hold') {
    return {
      code: 'review-hold',
      badge: 'review-hold',
      what: 'Execution paused for mid-phase human review.',
      why: job.resumeHint ?? 'A checkpoint requires human verification before continuing.',
      next: `Run: pilot review ${job.id} --approve  to resume execution`,
    };
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    return buildRetryWhy(job);
  }

  if (hasNoCommitDelta(job)) {
    return {
      code: 'no-commit-delta',
      badge: 'no-op',
      what: 'Job produced no commit delta.',
      why: 'Recorded base/head checkpoints are identical.',
      next: 'Retry only if requirement still needs changes.',
    };
  }

  return buildUndoWhy(job);
}

export {
  hasNoCommitDelta,
  buildJobWhy,
  buildRetryWhy,
  buildUndoWhy,
};
