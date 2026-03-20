/**
 * Timezone-safe timestamp utilities for Pilot core.
 *
 * SQLite stores timestamps without timezone suffix (e.g. "2026-03-20 16:14:00").
 * Date.parse() treats these as LOCAL time on most runtimes, causing incorrect
 * duration calculations when the server is not in UTC.
 *
 * These utilities normalize all timestamps to UTC before parsing.
 *
 * Pure module — no dependencies on sqlite3 or any external packages.
 */

/**
 * Parse a raw timestamp string to epoch milliseconds, treating timezone-naive
 * strings (SQLite format) as UTC.
 *
 * @param raw - ISO 8601 string with or without timezone, SQLite space-separated
 *              format, or null/empty.
 * @returns Epoch milliseconds, or null if the input is null, empty, or invalid.
 *
 * @example
 * safeParseTimestamp("2026-03-20 16:14:00")     // → epoch ms (UTC)
 * safeParseTimestamp("2026-03-20T16:14:00Z")    // → same epoch ms
 * safeParseTimestamp("2026-03-20T18:14:00+02:00") // → correct UTC ms
 * safeParseTimestamp(null)                       // → null
 * safeParseTimestamp("")                         // → null
 * safeParseTimestamp("garbage")                  // → null
 */
export function safeParseTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const hasZone = /[zZ]$|[+-]\d\d:\d\d$/.test(raw);
  const withTime = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const normalized = hasZone ? withTime : `${withTime}Z`;
  const millis = Date.parse(normalized);
  if (Number.isNaN(millis)) return null;
  return millis;
}

/**
 * Compute the duration in milliseconds between two raw timestamp strings.
 *
 * Both timestamps are parsed with `safeParseTimestamp` (timezone-safe).
 * If `completedAt` is null, the duration is computed from `startedAt` to now
 * (useful for currently-running jobs).
 *
 * @param startedAt  - Job start timestamp (may be SQLite format or ISO 8601)
 * @param completedAt - Job completion timestamp, or null if still running
 * @returns Duration in ms (≥0), or null if startedAt is null/invalid.
 *
 * @example
 * computeSafeDurationMs("2026-03-20 16:14:00", "2026-03-20 16:15:30") // → 90000
 * computeSafeDurationMs(null, "2026-03-20 16:15:30")                   // → null
 * computeSafeDurationMs("2026-03-20 16:14:00", null)                   // → ms since start
 */
export function computeSafeDurationMs(
  startedAt: string | null,
  completedAt: string | null,
): number | null {
  if (!startedAt) return null;
  const start = safeParseTimestamp(startedAt);
  if (start === null) return null;
  if (completedAt) {
    const end = safeParseTimestamp(completedAt);
    if (end !== null) return Math.max(0, end - start);
  }
  return Math.max(0, Date.now() - start);
}
