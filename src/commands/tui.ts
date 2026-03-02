/**
 * `pilot tui` — launch full-screen TUI dashboard.
 *
 * Lazily loads @opentui/solid and the TUI module to keep
 * CLI startup fast for all other commands.
 *
 * IMPORTANT: Must register the @opentui/solid bun plugin BEFORE
 * importing the TUI module tree. The plugin redirects solid-js
 * from the SSR server bundle to the client bundle and transforms
 * JSX via babel-preset-solid.
 *
 * NOTE: The TUI source files (.tsx) are NOT compiled by tsc — bun
 * handles them natively at runtime. The import below uses
 * import.meta.url to resolve back to the source tree.
 */

export async function tuiCommand(opts: { interval?: number }): Promise<void> {
  // Register OpenTUI's bun plugin to fix solid-js resolution
  // (bun resolves solid-js to server.js which crashes in non-SSR context)
  const { plugin } = await import('bun');
  const { default: solidPlugin } = await import('@opentui/solid/bun-plugin');
  plugin(solidPlugin);

  // Resolve path to src/tui/index.ts from either src/ or dist/ at runtime.
  // tsc excludes src/tui/ — bun loads .ts/.tsx source files natively.
  const tuiUrl = new URL('../../src/tui/index.ts', import.meta.url);
  const { startTui } = await import(tuiUrl.href);
  await startTui({ interval: opts.interval });
}
