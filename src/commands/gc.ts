/**
 * `pilot gc` — Garbage collection: clean old jobs, vacuum DB, remove orphan PIDs.
 *
 * Deletes completed/failed jobs older than --days (default 30),
 * vacuums the SQLite database, and cleans up orphaned PID files.
 *
 * Supports --dry-run to preview what would be cleaned,
 * --days to customize age threshold, and --json for structured output.
 */

import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { deleteOldJobs, countOldJobs, vacuumDb, getJob } from '../core/db.js';
import { getConfig } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim } from '../util/colors.js';

interface GcOptions {
  dryRun?: boolean;
  days?: number;
  json?: boolean;
}

/**
 * Clean up orphaned PID files in ~/.pilot/pids/.
 * A PID file is orphaned when:
 *   - Its job no longer exists in the DB, OR
 *   - The process it references is dead.
 *
 * Returns count of cleaned PID files.
 */
function cleanOrphanedPids(dryRun: boolean): number {
  const config = getConfig();
  const pidsDir = path.join(config.pilotDir, 'pids');

  let cleaned = 0;
  try {
    const pidFiles = readdirSync(pidsDir).filter((f) => f.endsWith('.pid'));
    for (const pidFile of pidFiles) {
      const jobId = pidFile.replace('.pid', '');
      const filePath = path.join(pidsDir, pidFile);

      let orphaned = false;

      // Check if job exists in DB
      const job = getJob(jobId);
      if (!job) {
        orphaned = true;
      } else if (job.status !== 'running') {
        // Job exists but isn't running — PID file is stale
        orphaned = true;
      } else {
        // Job exists and is running — check if process is alive
        try {
          const pidContent = readFileSync(filePath, 'utf8').trim();
          const pid = parseInt(pidContent, 10);
          if (!isNaN(pid)) {
            try {
              process.kill(pid, 0);
            } catch {
              orphaned = true; // Process is dead
            }
          } else {
            orphaned = true; // Invalid PID content
          }
        } catch {
          orphaned = true; // Can't read file
        }
      }

      if (orphaned) {
        if (!dryRun) {
          try {
            unlinkSync(filePath);
          } catch {
            // Best effort
          }
        }
        cleaned++;
      }
    }
  } catch {
    // pids directory doesn't exist — nothing to clean
  }

  return cleaned;
}

async function gcCommand(opts: GcOptions = {}): Promise<void> {
  const days = opts.days ?? 30;
  const dryRun = opts.dryRun ?? false;

  if (dryRun) {
    // Preview mode: count but don't delete
    const counts = countOldJobs(days);
    const orphanedPids = cleanOrphanedPids(true);

    if (isJsonMode()) {
      outputJson({
        dryRun: true,
        days,
        wouldDelete: {
          completed: counts.completedDeleted,
          failed: counts.failedDeleted,
          orphanedPids,
        },
      });
      return;
    }

    outputHuman('');
    outputHuman(`  ${dim('[dry-run]')} Would clean jobs older than ${days} days:`);
    outputHuman(`    Completed: ${counts.completedDeleted}`);
    outputHuman(`    Failed:    ${counts.failedDeleted}`);
    outputHuman(`    Orphan PIDs: ${orphanedPids}`);
    outputHuman(`  ${dim('Run without --dry-run to execute')}`);
    outputHuman('');
    return;
  }

  // Execute cleanup
  const counts = deleteOldJobs(days);
  const orphanedPids = cleanOrphanedPids(false);
  vacuumDb();

  if (isJsonMode()) {
    outputJson({
      days,
      deleted: {
        completed: counts.completedDeleted,
        failed: counts.failedDeleted,
        orphanedPids,
      },
      vacuumed: true,
    });
    return;
  }

  outputHuman('');
  outputHuman(`  ${green('✓')} Cleaned ${counts.completedDeleted} completed jobs, ${counts.failedDeleted} failed jobs. Database vacuumed.`);
  if (orphanedPids > 0) {
    outputHuman(`  ${green('✓')} Removed ${orphanedPids} orphaned PID files.`);
  }
  outputHuman('');
}

export { gcCommand };
