/**
 * TUI data layer: pilot.db wrappers.
 *
 * Thin wrappers over core/db.ts for TUI consumption.
 * Splits queue into pending/running for separate panels.
 * Re-exports mutation functions for queue management actions.
 *
 * All reads are synchronous (better-sqlite3). Fast (<1ms) — no async needed.
 */

import { getQueue, getRecent, getJob, cancel, retry, bump, getAllProjects, unblockProject, blockProject, deregisterProject } from '../../core/db.js';
import type { Job, Project } from '../../core/types.js';

// ── Read wrappers ─────────────────────────────────────────────────────────

/**
 * Fetch queue data split into pending and running lists.
 * Dashboard uses these for the Queue and Running panels.
 */
export function fetchQueueData(): { pending: Job[]; running: Job[] } {
  const all = getQueue();
  return {
    pending: all.filter(j => j.status === 'pending'),
    // review_hold jobs appear alongside running — they're active work paused for review, not failures
    running: all.filter(j => j.status === 'running' || j.status === 'review_hold'),
  };
}

/**
 * Fetch recently completed/failed/cancelled jobs.
 * Dashboard uses this for the Recent Completions panel.
 */
export function fetchRecentData(limit = 50): Job[] {
  return getRecent(limit);
}

/**
 * Fetch all registered projects.
 * Dashboard uses this for the Projects panel.
 */
export function fetchProjectData(): Project[] {
  return getAllProjects();
}

// ── Re-export mutations for queue management actions ──────────────────────

export { cancel, retry, bump, getJob, unblockProject, blockProject, deregisterProject };
