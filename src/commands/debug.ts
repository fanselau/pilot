/**
 * pilot debug <project> [desc] — Debug session.
 * Stub: Implementation in Phase 3.
 */

export async function debugCommand(
  _project: string,
  _desc: string | undefined,
  _opts: Record<string, unknown>,
): Promise<void> {
  process.stderr.write('Error: debug command not yet implemented\n');
  process.exit(1);
}
