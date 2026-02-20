/**
 * Pure formatting helpers — duration, string truncation, progress bars.
 *
 * ZERO dependencies. Pure functions only.
 */

/**
 * Format seconds into human-friendly duration string.
 *
 * Examples:
 *   0    → "0s"
 *   30   → "30s"
 *   60   → "1m"
 *   90   → "1m 30s"
 *   2700 → "45m"
 *   3600 → "1h 0m"
 *   8100 → "2h 15m"
 */
function formatDuration(seconds: number): string {
  if (seconds < 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(seconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (secs > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${minutes}m`;
}

/**
 * Truncate a string with ellipsis if it exceeds maxLen.
 */
function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  if (maxLen <= 1) {
    return '\u2026';
  }
  return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Truncate a session title to maxLen (default 80) for safe filename use.
 */
function truncateTitle(str: string, maxLen: number = 80): string {
  return truncateString(str, maxLen);
}

/**
 * Render a progress bar using block characters.
 *
 * Example: formatProgressBar(60, 10) → "██████░░░░"
 */
function formatProgressBar(percent: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

export { formatDuration, truncateString, truncateTitle, formatProgressBar };
