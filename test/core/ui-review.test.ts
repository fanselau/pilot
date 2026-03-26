import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  findExistingUiReview,
  findExistingUiSpec,
  isUiReviewEligible,
  resolveUiArtifactOutcome,
} from '../../src/core/ui-review.js';

describe('isUiReviewEligible', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = path.join(tmpdir(), `pilot-ui-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns eligible when delegation intent marks the phase as uiPhase', () => {
    const result = isUiReviewEligible(
      {
        scope: 'phase',
        delegationPlan: JSON.stringify({
          intent: { type: 'plan-and-execute', phaseNumber: 98, uiPhase: true },
          reasoning: 'UI-heavy phase',
        }),
      },
      [{ command: 'plan-phase', args: '98' }],
      projectDir,
      98,
    );

    expect(result.eligible).toBe(true);
    expect(result.reason).toMatch(/delegationPlan/);
    expect(result.uiSpecPath).toBeNull();
    expect(result.uiReviewPath).toBeNull();
  });

  it('returns eligible when a UI-SPEC already exists', () => {
    const phaseDir = path.join(projectDir, '.planning', 'phases', '98-sample-phase');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(path.join(phaseDir, '98-UI-SPEC.md'), '# UI spec');

    const result = isUiReviewEligible(
      {
        scope: 'phase',
        delegationPlan: JSON.stringify({
          intent: { type: 'plan-and-execute', phaseNumber: 98, uiPhase: false },
          reasoning: 'Not explicitly UI',
        }),
      },
      [{ command: 'plan-phase', args: '98' }],
      projectDir,
      98,
    );

    expect(result.eligible).toBe(true);
    expect(result.uiSpecPath).toBe(path.join(phaseDir, '98-UI-SPEC.md'));
    expect(result.reason).toMatch(/UI-SPEC/);
  });

  it('returns ineligible for non-phase jobs', () => {
    const result = isUiReviewEligible(
      {
        scope: 'quick',
        delegationPlan: JSON.stringify({
          intent: { type: 'quick', description: 'do something fast' },
          reasoning: 'quick task',
        }),
      },
      [{ command: 'quick', args: 'do something fast' }],
      projectDir,
      98,
    );

    expect(result).toEqual({
      eligible: false,
      reason: 'job scope is not phase',
      uiSpecPath: null,
      uiReviewPath: null,
    });
  });
});

describe('artifact helpers', () => {
  let projectDir: string;
  let phaseDir: string;

  beforeEach(() => {
    projectDir = path.join(tmpdir(), `pilot-ui-artifacts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    phaseDir = path.join(projectDir, '.planning', 'phases', '98-sample-phase');
    mkdirSync(phaseDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('finds the existing UI review file', () => {
    const reviewPath = path.join(phaseDir, '98-UI-REVIEW.md');
    writeFileSync(reviewPath, '# UI review');

    expect(findExistingUiReview(projectDir, 98)).toBe(reviewPath);
  });

  it('keeps the Phase 87 UI-SPEC lookup behavior', () => {
    const specPath = path.join(phaseDir, '98-UI-SPEC.md');
    writeFileSync(specPath, '# UI spec');

    expect(findExistingUiSpec(projectDir, 98)).toBe(specPath);
  });

  it('returns completed for ui-review when UI-REVIEW exists and skipped when absent', () => {
    expect(resolveUiArtifactOutcome('ui-review', '98', projectDir)).toBe('skipped');

    writeFileSync(path.join(phaseDir, '98-UI-REVIEW.md'), '# UI review');

    expect(resolveUiArtifactOutcome('ui-review', '98', projectDir)).toBe('completed');
  });
});
