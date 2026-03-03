/**
 * TUI theme constants: colors, border styles, spacing.
 *
 * Defines the visual identity for all TUI components.
 * Matches the spec §6 color scheme and layout constants.
 *
 * Pure data module — no UI dependencies, no runtime code.
 */

// ── Status colors (spec §6) ──────────────────────────────────────────────

export const statusColors = {
  pending: '#666666',    // dim gray
  running: '#4A9EFF',    // bright blue
  runningDim: '#2D6FBF', // dim blue (pulse alternate)
  done: '#4ADE80',       // green
  failed: '#F87171',     // red
  cancelled: '#A1A1AA',  // zinc
} as const;

// ── Global theme ──────────────────────────────────────────────────────────

export const theme = {
  // Base colors
  bg: '#0a0a0a',
  fg: '#eeeeee',
  muted: '#808080',
  border: '#333333',
  highlight: '#1a1a3a',

  // Border styles
  borderStyle: 'rounded' as const,

  // Spacing
  panelGap: 1,
  padding: 1,
} as const;

// ── Subagent visual nesting colors ────────────────────────────────────────

export const subagentColors = {
  border: '#4A9EFF',       // blue border for subagent boxes
  borderChild: '#555555',  // dimmer for nested children
  borderGrandchild: '#3a3a3a', // dimmest for grandchildren
  header: '#4A9EFF',       // bright blue header text
  headerChild: '#888888',  // dimmer for nested
  headerGrandchild: '#666666', // dimmest for grandchildren
} as const;
