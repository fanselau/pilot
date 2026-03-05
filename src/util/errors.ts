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
