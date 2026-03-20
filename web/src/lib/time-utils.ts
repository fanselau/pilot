/**
 * Client-safe timestamp utilities for the Pilot web UI.
 *
 * Mirror of src/core/time-utils.ts — intentionally duplicated to avoid
 * importing the core module (which has sqlite3 dependencies) in browser code.
 *
 * SQLite stores timestamps without timezone suffix (e.g. "2026-03-20 16:14:00").
 * Date.parse() treats these as LOCAL time on most runtimes, causing incorrect
 * duration calculations. These utilities normalize all timestamps to UTC.
 *
 * No external dependencies — safe for browser and server-function boundaries.
 */

/**
 * Parse a raw SQLite timestamp string to epoch milliseconds.
 * Treats timezone-naive strings as UTC.
 *
 * @param raw - SQLite space-separated format or ISO 8601 string, or null.
 * @returns Epoch milliseconds, or null if input is null/empty/invalid.
 */
export function parseSqliteTimestamp(raw: string | null): number | null {
  if (!raw) return null
  const hasZone = /[zZ]$|[+-]\d\d:\d\d$/.test(raw)
  const withTime = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const normalized = hasZone ? withTime : `${withTime}Z`
  const millis = Date.parse(normalized)
  if (Number.isNaN(millis)) return null
  return millis
}

/**
 * Format a human-readable duration string from two raw timestamps.
 * Returns '—' if startedAt is null/invalid.
 *
 * @param startedAt  - Job start timestamp (SQLite or ISO 8601 format)
 * @param completedAt - Job completion timestamp, or null if still running
 */
export function formatDurationSafe(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return '\u2014'
  const start = parseSqliteTimestamp(startedAt)
  if (start === null) return '\u2014'
  const end = completedAt ? (parseSqliteTimestamp(completedAt) ?? Date.now()) : Date.now()
  const diffMs = Math.max(0, end - start)
  const mins = Math.floor(diffMs / 60_000)
  const secs = Math.floor((diffMs % 60_000) / 1_000)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

/**
 * Compute duration in milliseconds between two raw timestamps.
 * Returns 0 if startedAt is null/invalid.
 *
 * @param startedAt  - Job start timestamp (SQLite or ISO 8601 format)
 * @param completedAt - Job completion timestamp, or null if still running
 */
export function getDurationMsSafe(
  startedAt: string | null,
  completedAt: string | null,
): number {
  if (!startedAt) return 0
  const start = parseSqliteTimestamp(startedAt)
  if (start === null) return 0
  const end = completedAt ? (parseSqliteTimestamp(completedAt) ?? Date.now()) : Date.now()
  return Math.max(0, end - start)
}
