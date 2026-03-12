/**
 * HelpOverlay — modal overlay showing keyboard shortcuts.
 *
 * Positioned absolutely on top of the main layout.
 * Grouped by section: Global, Dashboard, Detail.
 */

/* @jsxImportSource @opentui/solid */

import { theme, statusColors } from '../theme.js';

export const HELP_TEXT = `
 ── Global ──────────────────────────
  q / Ctrl+C   Quit
  ?            Toggle help
  /            Open search/filter
  Esc          Back / close overlay
  Tab          Cycle panel focus
  s            Toggle split view
  1 2 3        Dashboard / Detail / Split

 ── Dashboard ───────────────────────
  j / ↓        Move cursor down
  k / ↑        Move cursor up
  Enter        Open job detail
  r            Retry failed job
  x            Cancel pending job
   K            Force-quit running job
   u            Unblock project (projects panel)
   d            Remove project (projects panel)
   g            Jump to top
  G            Jump to bottom

 ── Detail ──────────────────────────
  Esc / q      Back to dashboard
  K            Force-quit running job
  r            Retry failed job
  x            Cancel pending job
`.trim();

export function HelpOverlay() {
  return (
    <box
      position="absolute"
      top={2}
      left="20%"
      width="60%"
      height="80%"
      borderStyle="rounded"
      border={true}
      borderColor={statusColors.running}
      title=" Keyboard Shortcuts "
      backgroundColor={theme.bg}
      zIndex={100}
      padding={1}
    >
      <text content={HELP_TEXT} fg={theme.fg} />
    </box>
  );
}
