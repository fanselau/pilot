/**
 * FooterBar — bottom bar with context-sensitive key hints.
 *
 * Fixed height: 1 row. Shows different hints depending on
 * the current view (dashboard, detail, split).
 */

/* @jsxImportSource @opentui/solid */

import { theme } from '../theme.js';
import type { ViewType } from '../state.js';

const HINTS: Record<ViewType, string> = {
  dashboard: ' j/k navigate │ enter detail │ tab panel │ K kill │ / filter │ ? help │ q quit',
  detail: ' esc/q back │ ? help',
  split: ' j/k navigate │ enter expand │ tab switch │ esc back │ q quit',
};

export function FooterBar(props: { view: ViewType }) {
  return (
    <box height={1}>
      <text content={HINTS[props.view] ?? HINTS.dashboard} fg={theme.muted} />
    </box>
  );
}
