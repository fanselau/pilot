import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ── Import subjects (will fail in RED — functions don't exist yet) ──────────

import {
  countSummaryFiles,
  countNonGapPlanFiles,
} from '../../src/core/phase-state.js';

// ── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string | null = null;

afterEach(async () => {
  if (tmpDir !== null) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

async function createTmpDir(): Promise<string> {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'phase-state-test-'));
  return tmpDir;
}

// ── countSummaryFiles ──────────────────────────────────────────────────────

describe('countSummaryFiles', () => {
  it('returns 0 for empty directory', async () => {
    const dir = await createTmpDir();
    const result = await countSummaryFiles(dir);
    expect(result).toBe(0);
  });

  it('counts SUMMARY.md files correctly', async () => {
    const dir = await createTmpDir();
    await writeFile(path.join(dir, '09-01-SUMMARY.md'), '# Summary\n\nSome content here.\n');
    await writeFile(path.join(dir, '09-02-SUMMARY.md'), '# Summary\n\nMore content.\n');
    const result = await countSummaryFiles(dir);
    expect(result).toBe(2);
  });

  it('excludes superseded summaries', async () => {
    const dir = await createTmpDir();
    await writeFile(path.join(dir, '09-01-SUMMARY.md'), '# Summary\n\nNormal summary content.\n');
    await writeFile(
      path.join(dir, '09-02-SUMMARY.md'),
      '# Summary\n\nStatus: Superseded\n\nThis plan was superseded.\n',
    );
    const result = await countSummaryFiles(dir);
    expect(result).toBe(1);
  });

  it('returns 0 for non-existent directory', async () => {
    const result = await countSummaryFiles('/tmp/nonexistent-phase-state-test-dir');
    expect(result).toBe(0);
  });

  it('ignores non-SUMMARY files', async () => {
    const dir = await createTmpDir();
    await writeFile(path.join(dir, '09-01-PLAN.md'), '# Plan\n');
    await writeFile(path.join(dir, '09-01-SUMMARY.md'), '# Summary\n\nContent.\n');
    await writeFile(path.join(dir, 'STATE'), 'executed');
    const result = await countSummaryFiles(dir);
    expect(result).toBe(1);
  });
});

// ── countNonGapPlanFiles ───────────────────────────────────────────────────

describe('countNonGapPlanFiles', () => {
  it('returns 0 for empty directory', async () => {
    const dir = await createTmpDir();
    const result = await countNonGapPlanFiles(dir);
    expect(result).toBe(0);
  });

  it('counts regular PLAN files', async () => {
    const dir = await createTmpDir();
    await writeFile(
      path.join(dir, '09-01-PLAN.md'),
      '---\nphase: 09\nplan: 01\ntype: tdd\n---\n\n# Plan 1\n',
    );
    await writeFile(
      path.join(dir, '09-02-PLAN.md'),
      '---\nphase: 09\nplan: 02\ntype: auto\n---\n\n# Plan 2\n',
    );
    const result = await countNonGapPlanFiles(dir);
    expect(result).toBe(2);
  });

  it('excludes gap_closure PLAN files', async () => {
    const dir = await createTmpDir();
    await writeFile(
      path.join(dir, '09-01-PLAN.md'),
      '---\nphase: 09\nplan: 01\ntype: tdd\n---\n\n# Original Plan\n',
    );
    await writeFile(
      path.join(dir, '09-02-PLAN.md'),
      '---\nphase: 09\nplan: 02\ntype: auto\n---\n\n# Original Plan 2\n',
    );
    await writeFile(
      path.join(dir, '09-03-PLAN.md'),
      '---\nphase: 09\nplan: 03\ntype: tdd\ngap_closure: true\n---\n\n# Gap closure plan\n',
    );
    const result = await countNonGapPlanFiles(dir);
    expect(result).toBe(2);
  });

  it('returns 0 when only gap_closure plans exist', async () => {
    const dir = await createTmpDir();
    await writeFile(
      path.join(dir, '09-03-PLAN.md'),
      '---\nphase: 09\nplan: 03\ngap_closure: true\n---\n\n# Gap closure only\n',
    );
    await writeFile(
      path.join(dir, '09-04-PLAN.md'),
      '---\nphase: 09\nplan: 04\ngap_closure: true\n---\n\n# Another gap\n',
    );
    const result = await countNonGapPlanFiles(dir);
    expect(result).toBe(0);
  });

  it('returns 0 for non-existent directory', async () => {
    const result = await countNonGapPlanFiles('/tmp/nonexistent-phase-state-test-dir');
    expect(result).toBe(0);
  });

  it('ignores non-PLAN files', async () => {
    const dir = await createTmpDir();
    await writeFile(
      path.join(dir, '09-01-PLAN.md'),
      '---\nphase: 09\nplan: 01\n---\n\n# Plan\n',
    );
    await writeFile(path.join(dir, '09-01-SUMMARY.md'), '# Summary\n');
    await writeFile(path.join(dir, 'STATE'), 'executed');
    await writeFile(path.join(dir, '09-UAT.md'), '# UAT\n');
    const result = await countNonGapPlanFiles(dir);
    expect(result).toBe(1);
  });
});
