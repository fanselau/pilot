/**
 * Shared error message extraction utility.
 *
 * Replaces the ~23 occurrences of `err instanceof Error ? err.message : String(err)`
 * scattered across the codebase with a single reusable function.
 */

/**
 * Extract a human-readable message from an unknown error value.
 * Returns err.message for Error instances, String(err) for everything else.
 */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── HungSessionError ───────────────────────────────────────────────────────

export type HungReason = 'interactive-prompt' | 'stuck-tool' | 'unknown';

/**
 * Thrown when a session is detected as hung and must be killed.
 * Carries enough context for the runner to log and notify meaningfully.
 */
export class HungSessionError extends Error {
  readonly hungReason: HungReason;
  readonly lastToolCall: string | undefined;
  readonly sessionTitle: string;

  constructor(opts: {
    hungReason: HungReason;
    lastToolCall?: string;
    sessionTitle: string;
    message?: string;
  }) {
    const msg = opts.message ??
      `Session hung on ${opts.hungReason}${opts.lastToolCall ? ` (tool: ${opts.lastToolCall})` : ''}: ${opts.sessionTitle}`;
    super(msg);
    this.name = 'HungSessionError';
    this.hungReason = opts.hungReason;
    this.lastToolCall = opts.lastToolCall;
    this.sessionTitle = opts.sessionTitle;
  }
}
