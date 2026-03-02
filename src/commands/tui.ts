/**
 * `pilot tui` — launch full-screen TUI dashboard.
 *
 * Lazily loads @opentui/solid and the TUI module to keep
 * CLI startup fast for all other commands.
 */

export async function tuiCommand(opts: { interval?: number }): Promise<void> {
  const { startTui } = await import('../tui/index.js');
  await startTui({ interval: opts.interval });
}
