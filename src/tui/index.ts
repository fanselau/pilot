/**
 * TUI entry point — creates the OpenTUI/Solid renderer and starts the app.
 *
 * Lazily loaded from commands/tui.ts to keep CLI startup fast.
 */

// @ts-ignore — Node16 can't resolve @opentui/solid render through bare .d.ts chain
import { render } from '@opentui/solid';
import { App } from './app.js';

export async function startTui(opts: { interval?: number }): Promise<void> {
  // Use App directly — @opentui/solid render accepts a function returning JSX
  return render(
    // @ts-ignore — render expects () => JSX.Element; App component invoked at runtime
    () => App({ interval: opts.interval ?? 3 }),
    {
      targetFps: 30,
      exitOnCtrlC: false,
      gatherStats: false,
      autoFocus: false,
    },
  );
}
