/**
 * JSONL job result logging for post-mortem analysis.
 *
 * Appends one JSON line per completed job to `$PILOT_LOG_DIR/pilot-job-history.jsonl`.
 * Used by the queue runner to track success/failure/retry outcomes.
 *
 * Pure core module — no UI dependencies.
 */

import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from './config.js';

/**
 * Shape of a single post-mortem log entry.
 * Each entry is one line in the JSONL file.
 */
export interface PostmortemEntry {
  ts: string;                // ISO 8601
  project: string;
  title: string;
  mode: string;
  exit: number;
  duration_ms: number;
  result: 'success' | 'success_no_artifacts' | 'retry' | 'failed';
  commits: number;
  messages: number;
  failure_category?: string;
}

/**
 * Append a post-mortem entry to the JSONL log file.
 *
 * Creates the file if it doesn't exist (appendFile creates on ENOENT).
 * Each call writes exactly one line: `JSON.stringify(entry) + '\n'`.
 */
async function logPostmortem(entry: PostmortemEntry): Promise<void> {
  const config = getConfig();
  const logPath = path.join(config.logDir, 'pilot-job-history.jsonl');
  const line = JSON.stringify(entry) + '\n';
  await appendFile(logPath, line, 'utf8');
}

export { logPostmortem };
