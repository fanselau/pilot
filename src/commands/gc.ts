/**
 * `pilot gc` — Garbage collection / cleanup.
 *
 * Reports old completed/failed jobs (>7 days).
 * Placeholder for future cleanup of old data and DB compaction.
 */

import { getRecent } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { dim } from '../util/colors.js';

async function gcCommand(): Promise<void> {
  const recent = getRecent(100);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const old = recent.filter((j) => {
    if (!j.completedAt) return false;
    const age = Date.now() - new Date(j.completedAt).getTime();
    return age > sevenDaysMs;
  });

  if (isJsonMode()) {
    outputJson({ oldJobs: old.length, threshold: '7 days' });
    return;
  }

  outputHuman('');
  outputHuman(`  ${dim('Jobs older than 7 days:')} ${old.length}`);
  if (old.length === 0) {
    outputHuman(`  ${dim('Nothing to clean up')}`);
  } else {
    outputHuman(`  ${dim('TODO: Implement cleanup in future iteration')}`);
  }
  outputHuman('');
}

export { gcCommand };
