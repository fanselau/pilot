import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Job, JobStep, DelegationIntent } from './types.js';

function findPhaseDir(projectDir: string, phaseNumber: number): string | null {
  try {
    const phasesDir = path.join(projectDir, '.planning', 'phases');
    if (!existsSync(phasesDir)) return null;

    const phasePrefix = String(phaseNumber);
    const phaseDir = readdirSync(phasesDir).find((entry) => {
      const match = entry.match(/^(\d+)-/);
      return match?.[1] === phasePrefix;
    });

    return phaseDir ? path.join(phasesDir, phaseDir) : null;
  } catch {
    return null;
  }
}

function findPhaseArtifact(projectDir: string, phaseNumber: number, suffix: string): string | null {
  try {
    const phaseDir = findPhaseDir(projectDir, phaseNumber);
    if (!phaseDir) return null;

    const artifact = readdirSync(phaseDir).find((entry) => entry.endsWith(suffix));
    return artifact ? path.join(phaseDir, artifact) : null;
  } catch {
    return null;
  }
}

function parseDelegationIntent(delegationPlan: string | null): DelegationIntent | null {
  if (!delegationPlan) return null;

  try {
    const parsed = JSON.parse(delegationPlan) as { intent?: DelegationIntent };
    return parsed.intent ?? null;
  } catch {
    return null;
  }
}

export function findExistingUiSpec(projectDir: string, phaseNumber: number): string | null {
  return findPhaseArtifact(projectDir, phaseNumber, '-UI-SPEC.md');
}

export function findExistingUiReview(projectDir: string, phaseNumber: number): string | null {
  return findPhaseArtifact(projectDir, phaseNumber, '-UI-REVIEW.md');
}

export function extractPhaseNumberFromStepArgs(args: string): number | null {
  const match = args.match(/^(\d+)/);
  if (!match) return null;

  const phaseNumber = Number.parseInt(match[1], 10);
  return Number.isInteger(phaseNumber) ? phaseNumber : null;
}

export function isUiReviewEligible(
  job: Pick<Job, 'scope' | 'delegationPlan'>,
  steps: Array<Pick<JobStep, 'command' | 'args'>>,
  projectDir: string,
  phaseNumber: number,
): { eligible: boolean; reason: string; uiSpecPath: string | null; uiReviewPath: string | null } {
  const uiSpecPath = findExistingUiSpec(projectDir, phaseNumber);
  const uiReviewPath = findExistingUiReview(projectDir, phaseNumber);

  if (job.scope !== 'phase') {
    return { eligible: false, reason: 'job scope is not phase', uiSpecPath, uiReviewPath };
  }

  if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
    return { eligible: false, reason: 'invalid phase number', uiSpecPath, uiReviewPath };
  }

  const intent = parseDelegationIntent(job.delegationPlan);
  if (intent?.type === 'plan-and-execute' && intent.uiPhase === true) {
    return { eligible: true, reason: 'eligible via delegationPlan uiPhase flag', uiSpecPath, uiReviewPath };
  }

  if (steps.some((step) => step.command === 'ui-phase')) {
    return { eligible: true, reason: 'eligible via existing ui-phase step', uiSpecPath, uiReviewPath };
  }

  if (uiSpecPath) {
    return { eligible: true, reason: 'eligible via existing UI-SPEC artifact', uiSpecPath, uiReviewPath };
  }

  return { eligible: false, reason: 'no UI review eligibility signals found', uiSpecPath, uiReviewPath };
}

export function resolveUiArtifactOutcome(
  command: string,
  args: string,
  projectDir: string,
): 'completed' | 'skipped' | 'failed' {
  const phaseNumber = extractPhaseNumberFromStepArgs(args);
  if (!phaseNumber) return 'failed';

  if (command === 'ui-phase') {
    return findExistingUiSpec(projectDir, phaseNumber) ? 'completed' : 'failed';
  }

  if (command === 'ui-review') {
    return findExistingUiReview(projectDir, phaseNumber) ? 'completed' : 'skipped';
  }

  return 'failed';
}
