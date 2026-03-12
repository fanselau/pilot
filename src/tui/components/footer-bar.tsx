/**
 * FooterBar — bottom bar with context-sensitive key hints.
 *
 * Fixed height: 1 row. Shows different hints depending on
 * the current view (dashboard, detail, split) and the
 * focused panel within the dashboard.
 *
 * Use `getFooterHint(view, panelFocus?)` for context-aware hints.
 * The `HINTS` export is kept for backward compatibility.
 */

/* @jsxImportSource @opentui/solid */

import { theme } from '../theme.js';
import type { ViewType, PanelFocus } from '../state.js';

// ── Legacy HINTS export (backward compatibility) ──────────────────────────
// Prefer getFooterHint(view, panelFocus) for context-aware hints.
export const HINTS: Record<ViewType, string> = {
  dashboard: ' j/k navigate │ enter detail │ tab panel │ r retry │ x cancel │ K kill │ / filter │ ? help │ q quit',
  detail: ' r retry │ x cancel │ K kill │ ? help │ esc back',
  split: ' esc back │ ? help │ q quit',
};

// ── Panel-specific dashboard hints ────────────────────────────────────────

const DASHBOARD_PANEL_HINTS: Record<PanelFocus, string> = {
  queue:     ' j/k navigate │ enter detail │ tab panel │ r retry │ x cancel │ / filter │ ? help │ q quit',
  running:   ' j/k navigate │ enter detail │ tab panel │ K kill │ / filter │ ? help │ q quit',
  completed: ' j/k navigate │ enter detail │ tab panel │ r retry │ / filter │ ? help │ q quit',
  projects:  ' j/k navigate │ tab panel │ u unblock │ d remove │ / filter │ ? help │ q quit',
};

/**
 * Returns the footer hint string for a given view and optional panel focus.
 *
 * For the dashboard view, hints change based on which panel is focused
 * to reflect only the action shortcuts that apply in that context.
 */
export function getFooterHint(view: ViewType, panelFocus?: PanelFocus): string {
  if (view === 'dashboard' && panelFocus) {
    return DASHBOARD_PANEL_HINTS[panelFocus] ?? HINTS.dashboard;
  }
  return HINTS[view] ?? HINTS.dashboard;
}

export function FooterBar(props: { view: ViewType; panelFocus?: PanelFocus }) {
  return (
    <box height={1}>
      <text content={getFooterHint(props.view, props.panelFocus)} fg={theme.muted} />
    </box>
  );
}
