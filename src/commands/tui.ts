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
 */

export async function tuiCommand(opts: { interval?: number }): Promise<void> {
  // Register OpenTUI's bun plugin to fix solid-js resolution
  // (bun resolves solid-js to server.js which crashes in non-SSR context)
  const { plugin } = await import('bun');
  const { default: solidPlugin } = await import('@opentui/solid/bun-plugin');
  plugin(solidPlugin);

  const { startTui } = await import('../tui/index.js');
  await startTui({ interval: opts.interval });
}
