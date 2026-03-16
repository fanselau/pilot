/**
 * Tests for isWellFormedVerificationEvidence() — structural validation
 * of VERIFICATION.md content used by the judge system.
 *
 * Confirms RNIN-05/RNIN-06: evidence is validated for both size AND
 * structural markers (frontmatter status/verdict + body headings).
 */

import { describe, it, expect } from 'vitest';
import { _isWellFormedVerificationEvidence } from '../../src/core/runner.js';

/** Helper: build a well-formed VERIFICATION.md string */
function makeValid(overrides?: {
  status?: string;
  verdict?: string;
  body?: string;
  extraFrontmatter?: string;
}): string {
  const status = overrides?.status ?? 'verified';
  const verdict = overrides?.verdict ?? 'PASS';
  const extra = overrides?.extraFrontmatter ?? '';
  const body =
    overrides?.body ??
    `\n# Phase 1 Verification Report\n\n## Observable Truths\n\n| # | Truth | Status |\n| --- | --- | --- |\n| 1 | Feature works | ✓ VERIFIED |\n`;

  return `---\nstatus: ${status}\nscore: 9/9\n${extra}verdict: ${verdict}\n---\n${body}`;
}

describe('isWellFormedVerificationEvidence', () => {
  it('rejects content <= 100 bytes', () => {
    const short = '---\nstatus: verified\nverdict: PASS\n---\n## A\nShort.';
    expect(short.length).toBeLessThanOrEqual(100);
    expect(_isWellFormedVerificationEvidence(short)).toBe(false);
  });

  it('rejects content without frontmatter', () => {
    const noFrontmatter =
      '# Verification Report\n\n## Observable Truths\n\nLots of content here to exceed the 100-byte minimum threshold for well-formed evidence files used by the judge system.';
    expect(noFrontmatter.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(noFrontmatter)).toBe(false);
  });

  it('rejects frontmatter missing status field', () => {
    const noStatus = `---\nscore: 9/9\nverdict: PASS\n---\n\n# Report\n\n## Observable Truths\n\n| # | Truth | Status |\n| --- | --- | --- |\n| 1 | Feature works | ✓ VERIFIED |\n`;
    expect(noStatus.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(noStatus)).toBe(false);
  });

  it('rejects frontmatter missing verdict field', () => {
    const noVerdict = `---\nstatus: verified\nscore: 9/9\n---\n\n# Report\n\n## Observable Truths\n\n| # | Truth | Status |\n| --- | --- | --- |\n| 1 | Feature works | ✓ VERIFIED |\n`;
    expect(noVerdict.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(noVerdict)).toBe(false);
  });

  it('rejects content without body headings', () => {
    const noHeadings = `---\nstatus: verified\nverdict: PASS\n---\n\nThis is a verification report with no markdown headings at all. It has plenty of text content to exceed the minimum byte threshold but lacks any heading markers.\n`;
    expect(noHeadings.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(noHeadings)).toBe(false);
  });

  it('accepts well-formed VERIFICATION.md', () => {
    const valid = makeValid();
    expect(valid.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(valid)).toBe(true);
  });

  it('accepts content with extra frontmatter fields', () => {
    const valid = makeValid({
      extraFrontmatter:
        'automated_checks:\n  typescript: { pass: true }\n  tests: { pass: true }\nblocking_issues: []\ngaps: []\n',
    });
    expect(valid.length).toBeGreaterThan(100);
    expect(_isWellFormedVerificationEvidence(valid)).toBe(true);
  });
});
