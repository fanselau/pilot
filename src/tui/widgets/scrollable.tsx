/**
 * Scrollable — thin wrapper around OpenTUI's <scrollbox> element.
 *
 * Sets sensible defaults for vertical scrolling with optional auto-follow
 * mode (stickyScroll from bottom). Used in QueuePanel, CompletedPanel,
 * and LogPanel for content that overflows the visible area.
 */

/* @jsxImportSource @opentui/solid */

import type { JSX } from 'solid-js';

export function Scrollable(props: {
  children: JSX.Element;
  height?: number;
  follow?: boolean;
}) {
  return (
    <scrollbox
      height={props.height}
      stickyScroll={props.follow ?? false}
      stickyStart="bottom"
      viewportCulling={true}
    >
      {props.children}
    </scrollbox>
  );
}
