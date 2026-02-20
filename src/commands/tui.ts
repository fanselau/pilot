/**
 * pilot tui — Full-screen TUI dashboard.
 *
 * Lazy-loads React and Ink via dynamic import() to avoid pulling
 * them into memory for any other CLI command. This keeps
 * `pilot status`, `pilot queue`, etc. fast (<100ms startup).
 *
 * This file is .ts (not .tsx) — uses createElement() instead of JSX.
 */

interface TuiOpts {
  interval?: string;
  json?: boolean;
}

export async function tuiCommand(opts: TuiOpts): Promise<void> {
  if (opts.json) {
    process.stderr.write('Error: TUI does not support --json mode\n');
    process.exit(1);
  }

  const interval = Number(opts.interval) || 3;

  // Lazy import React, Ink, and App — only loaded when `pilot tui` is invoked
  const { createElement } = await import('react');
  const { render } = await import('ink');
  const { App } = await import('../tui/App.js');

  const { waitUntilExit } = render(
    createElement(App, { interval }),
    { exitOnCtrlC: true },
  );

  await waitUntilExit();
}
