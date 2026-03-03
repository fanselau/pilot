/**
 * Scrollable — thin wrapper around OpenTUI's <scrollbox> element.
 *
 * Sets sensible defaults for vertical scrolling with optional auto-follow
 * mode (stickyScroll from bottom). Used in QueuePanel, CompletedPanel,
 * and LogPanel for content that overflows the visible area.
 */

/* @jsxImportSource @opentui/solid */

import type { JSX } from 'solid-js';
import type { ScrollBoxRenderable } from '@opentui/core';

export function Scrollable(props: {
  children: JSX.Element;
  height?: number;
  follow?: boolean;
}) {
  return (
    <scrollbox
      ref={(el: ScrollBoxRenderable) => {
        // Prevent scrollbox from capturing keyboard events —
        // all keyboard input must flow to the app-level useKeyboard handler.
        el.focusable = false;
      }}
      height={props.height}
      stickyScroll={props.follow ?? false}
      stickyStart="bottom"
      viewportCulling={true}
      focusable={false}
    >
      {props.children}
    </scrollbox>
  );
}
