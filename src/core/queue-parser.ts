/**
 * QUEUE.md v5 parser — read, parse, and mark queue entries.
 *
 * Parses the pipe-delimited markdown format used by the Pilot queue system.
 * Supports 4 status types: pending, running (🔨), done (✅ DONE:), failed (❌ FAIL:).
 * Extracts project, mode, args, metadata (depends-on, timeout), and description.
 *
 * Used by: pilot queue, pilot status, pilot run, pilot add.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { QueueEntry } from './types.js';

// ── Status prefix patterns ─────────────────────────────────────────────────

/**
 * Matches a `## ` header line and captures optional status prefix + remaining content.
 *
 * Groups:
 *   1. Status prefix (optional): `✅ DONE: ` | `❌ FAIL: ` | `🔨 `
 *   2. Remaining content after prefix
 */
const HEADER_RE = /^## (✅ DONE: |❌ FAIL: |🔨 )?(.+)$/;

/**
 * Metadata key-value pattern. Matches lines like `depends-on: registry` or `timeout: 120`.
 */
const METADATA_RE = /^(depends-on|timeout):\s*(.+)$/;

// ── Status prefix map ──────────────────────────────────────────────────────

const PREFIX_TO_STATUS: Record<string, QueueEntry['status']> = {
  '✅ DONE: ': 'done',
  '❌ FAIL: ': 'failed',
  '🔨 ': 'running',
};

const STATUS_TO_PREFIX: Record<string, string> = {
  running: '🔨 ',
  done: '✅ DONE: ',
  failed: '❌ FAIL: ',
  pending: '',
};

// ── parseQueue ─────────────────────────────────────────────────────────────

/**
 * Parse raw QUEUE.md content into an array of QueueEntry objects.
 *
 * Pure function — no I/O.
 */
export function parseQueue(content: string): QueueEntry[] {
  const lines = content.split('\n');
  const entries: QueueEntry[] = [];
  let current: QueueEntry | null = null;
  const descriptionLines: string[] = [];

  function finalizeCurrent(): void {
    if (current !== null) {
      if (descriptionLines.length > 0) {
        current.description = descriptionLines.join('\n');
      }
      entries.push(current);
      descriptionLines.length = 0;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1; // 1-indexed

    const headerMatch = HEADER_RE.exec(line);
    if (headerMatch !== null) {
      const prefixRaw = headerMatch[1] ?? '';
      const rest = headerMatch[2]!;

      // Must have at least one pipe to be a queue entry
      if (!rest.includes('|')) {
        continue;
      }

      // Finalize previous entry
      finalizeCurrent();

      // Determine status
      const status: QueueEntry['status'] = PREFIX_TO_STATUS[prefixRaw] ?? 'pending';

      // Split remaining by ` | ` — project | mode | args...
      const segments = rest.split('|').map((s) => s.trim());
      const project = segments[0] ?? '';
      const mode = segments[1] ?? '';
      // Args is everything after mode, joined back with ' | ' for multi-pipe args
      const args = segments.length > 2 ? segments.slice(2).join(' | ') : '';

      current = {
        lineNum,
        project,
        mode,
        args,
        status,
      };

      continue;
    }

    // Not a header line — check for metadata or description
    if (current !== null) {
      const metaMatch = METADATA_RE.exec(line);
      if (metaMatch !== null) {
        const key = metaMatch[1]!;
        const value = metaMatch[2]!;

        if (key === 'depends-on') {
          current.dependsOn = value.split(',').map((s) => s.trim());
        } else if (key === 'timeout') {
          const parsed = parseInt(value, 10);
          if (!Number.isNaN(parsed)) {
            current.timeout = parsed;
          }
        }
        continue;
      }

      // Non-empty, non-metadata line → description
      if (line.trim().length > 0) {
        descriptionLines.push(line);
      }
    }
  }

  // Finalize last entry
  finalizeCurrent();

  return entries;
}

// ── parseQueueFile ─────────────────────────────────────────────────────────

/**
 * Read a QUEUE.md file from disk and parse it.
 */
export async function parseQueueFile(filePath: string): Promise<QueueEntry[]> {
  const content = await readFile(filePath, 'utf8');
  return parseQueue(content);
}

// ── markEntry ──────────────────────────────────────────────────────────────

/**
 * Mark an entry at a specific line number with a new status.
 *
 * Reads the file, modifies the header at `lineNum`, and writes back.
 * Handles entries that already have a status prefix (strips before applying new one).
 */
export async function markEntry(
  filePath: string,
  lineNum: number,
  status: 'running' | 'done' | 'failed',
): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const idx = lineNum - 1; // Convert to 0-indexed

  if (idx < 0 || idx >= lines.length) {
    throw new Error(`Line number ${lineNum} out of range (file has ${lines.length} lines)`);
  }

  const line = lines[idx]!;
  const headerMatch = HEADER_RE.exec(line);

  if (headerMatch === null) {
    throw new Error(`Line ${lineNum} is not a ## header: "${line}"`);
  }

  // headerMatch[2] is the content after the status prefix
  const rest = headerMatch[2]!;
  const newPrefix = STATUS_TO_PREFIX[status] ?? '';
  lines[idx] = `## ${newPrefix}${rest}`;

  await writeFile(filePath, lines.join('\n'));
}
