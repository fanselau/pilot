/**
 * JSON/human output helpers with --json mode branching.
 *
 * Uses process.stdout.write (NOT console.log) for JSON output
 * to avoid Node.js adding extra newlines.
 */

let jsonMode = false;

function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Output structured data as JSON to stdout.
 * Automatically adds ISO 8601 UTC timestamp.
 */
function outputJson(data: Record<string, unknown>): void {
  const output = {
    timestamp: new Date().toISOString(),
    ...data,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

/**
 * Output human-readable text to stdout.
 * Suppressed when --json mode is active.
 */
function outputHuman(text: string): void {
  if (!jsonMode) {
    process.stdout.write(text + '\n');
  }
}

export { setJsonMode, isJsonMode, outputJson, outputHuman };
