import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';

import {
  deriveVerificationRouting,
  readLatestVerificationArtifact,
} from '../../src/core/verification-artifact.js';

function writeVerificationArtifact(
  rootDir: string,
  phaseNumber: number,
  phaseSlug: string,
  filename: string,
  frontmatter: string,
  body = '## Findings\n\n- Verification output',
): string {
  const phaseDir = path.join(rootDir, '.planning', 'phases', `${phaseNumber}-${phaseSlug}`);
  mkdirSync(phaseDir, { recursive: true });
  const filePath = path.join(phaseDir, filename);
  writeFileSync(filePath, `---\n${frontmatter.trim()}\n---\n\n${body}\n`);
  return filePath;
}

const tempDirs: string[] = [];

function makeProjectDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pilot-verification-artifact-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readLatestVerificationArtifact', () => {
  it('selects the newest phase-local verification artifact and parses typed fields', () => {
    const projectDir = makeProjectDir();

    const olderPath = writeVerificationArtifact(
      projectDir,
      87,
      'phase-alpha',
      '87-VERIFICATION.md',
      `
status: passed
gaps: []
human_verification: []
`,
    );
    const newerPath = writeVerificationArtifact(
      projectDir,
      87,
      'phase-beta',
      '87-latest-VERIFICATION.md',
      `
status: gaps_found
gaps:
  - truth: Add regression coverage
    status: failed
    reason: Missing continuation routing test
human_verification:
  - test: Confirm review-hold copy is clear
    expected: Operator understands why the job paused
    why_human: Visual wording check
`,
    );

    const snapshot = readLatestVerificationArtifact(projectDir, 87);

    expect(snapshot.available).toBe(true);
    expect(snapshot.artifactPath).toBe(newerPath);
    expect(snapshot.verificationStatus).toBe('gaps_found');
    expect(snapshot.gaps).toHaveLength(1);
    expect(snapshot.humanVerification).toHaveLength(1);
    expect(snapshot.gaps[0]).toMatchObject({
      truth: 'Add regression coverage',
      actionable: true,
    });
    expect(snapshot.humanVerification[0]).toMatchObject({
      test: 'Confirm review-hold copy is clear',
    });
    expect(snapshot.artifactPath).not.toBe(olderPath);
  });

  it('preserves structured gaps and manual checks as separate buckets for real-world frontmatter', () => {
    const projectDir = makeProjectDir();

    writeVerificationArtifact(
      projectDir,
      91,
      'routing-cleanup',
      '91-k87k-VERIFICATION.md',
      `
status: gaps_found
score: 78
gaps:
  - truth: Missing integration coverage for judge gap continuation
    status: failed
    reason: The k87k regression is still reproducible
    artifacts:
      - test/core/runner.test.ts
    missing:
      - Integration test proving mixed artifacts re-delegate
human_verification:
  - test: Visit pilot info output in a terminal
    expected: Structured verification counts are easy to read
    why_human: Terminal copy clarity
  - test: Review log summary wording
    expected: Re-delegation language is operator-friendly
    why_human: Human readability
`,
    );

    const snapshot = readLatestVerificationArtifact(projectDir, 91);

    expect(snapshot.verificationStatus).toBe('gaps_found');
    expect(snapshot.gaps).toHaveLength(1);
    expect(snapshot.humanVerification).toHaveLength(2);
    expect(snapshot.gaps[0]).toMatchObject({
      truth: 'Missing integration coverage for judge gap continuation',
      missing: ['Integration test proving mixed artifacts re-delegate'],
      actionable: true,
    });
  });

  it('treats every structured gap as actionable unless the schema marks it human-only', () => {
    const projectDir = makeProjectDir();

    writeVerificationArtifact(
      projectDir,
      92,
      'classification',
      '92-VERIFICATION.md',
      `
status: gaps_found
gaps:
  - truth: Manual-looking prose gap
    status: failed
    reason: Needs manual review wording but still comes from gaps
  - truth: Explicit human-only structured gap
    status: failed
    human_only: true
    reason: Human-only by schema
human_verification:
  - test: Check final button alignment
    expected: Alignment looks correct
    why_human: Visual QA
`,
    );

    const snapshot = readLatestVerificationArtifact(projectDir, 92);
    const routing = deriveVerificationRouting(snapshot);

    expect(snapshot.gaps.map((gap) => gap.actionable)).toEqual([true, false]);
    expect(routing.actionableGapCount).toBe(1);
    expect(routing.humanVerificationCount).toBe(1);
    expect(routing.routingDecision).toBe('continue-gaps');
  });

  it('returns deterministic fallback snapshots for missing or unreadable structured artifacts', () => {
    const missingProjectDir = makeProjectDir();
    const missingSnapshot = readLatestVerificationArtifact(missingProjectDir, 93);

    expect(missingSnapshot.available).toBe(false);
    expect(missingSnapshot.verificationStatus).toBe('unavailable');
    expect(missingSnapshot.unavailableReason).toBe('verification-artifact-missing');

    const malformedProjectDir = makeProjectDir();
    const phaseDir = path.join(malformedProjectDir, '.planning', 'phases', '93-bad-frontmatter');
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(
      path.join(phaseDir, '93-VERIFICATION.md'),
      '---\nstatus: [broken\n---\n\n## Findings\n\n- malformed\n',
    );

    const malformedSnapshot = readLatestVerificationArtifact(malformedProjectDir, 93);
    const routing = deriveVerificationRouting(malformedSnapshot);

    expect(malformedSnapshot.available).toBe(false);
    expect(malformedSnapshot.verificationStatus).toBe('unavailable');
    expect(malformedSnapshot.unavailableReason).toBe('verification-artifact-unreadable');
    expect(routing.routingDecision).toBe('review-hold');
    expect(routing.routingReason).toContain('verification-artifact-unreadable');
  });

  it('routes explicit human_needed artifacts to human review instead of gap continuation', () => {
    const projectDir = makeProjectDir();

    writeVerificationArtifact(
      projectDir,
      94,
      'human-review',
      '94-VERIFICATION.md',
      `
status: human_needed
gaps: []
human_verification:
  - test: Validate the mobile summary layout on iPhone Safari
    expected: No viewport overflow remains
    why_human: Device-specific visual check
`,
    );

    const snapshot = readLatestVerificationArtifact(projectDir, 94);
    const routing = deriveVerificationRouting(snapshot);

    expect(snapshot.verificationStatus).toBe('human_needed');
    expect(routing.actionableGapCount).toBe(0);
    expect(routing.humanVerificationCount).toBe(1);
    expect(routing.routingDecision).toBe('human-review');
  });
});
