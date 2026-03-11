/**
 * FooterBar — bottom bar with context-sensitive key hints.
 *
 * Fixed height: 1 row. Shows different hints depending on
 * the current view (dashboard, detail, split).
 */

/* @jsxImportSource @opentui/solid */

import { theme } from '../theme.js';
import type { ViewType } from '../state.js';

export const HINTS: Record<ViewType, string> = {
  dashboard: ' j/k navigate │ enter detail │ tab panel │ r retry │ x cancel │ K kill │ / filter │ ? help │ q quit',
  detail: ' r retry │ x cancel │ K kill │ ? help │ esc back',
  split: ' esc back │ ? help │ q quit',
};

export function FooterBar(props: { view: ViewType }) {
  return (
    <box height={1}>
      <text content={HINTS[props.view] ?? HINTS.dashboard} fg={theme.muted} />
    </box>
  );
}
