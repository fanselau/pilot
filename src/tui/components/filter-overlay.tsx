/**
 * FilterOverlay — search/filter modal for jobs.
 *
 * Centered modal with a text input field. Filters jobs by
 * project name or description (case-insensitive contains).
 * Enter applies the filter, Esc closes without applying.
 */

/* @jsxImportSource @opentui/solid */

import { statusColors, theme } from '../theme.js';

export function FilterOverlay(props: {
  onApply: (query: string) => void;
  onClose: () => void;
}) {
  return (
    <box
      position="absolute"
      top="35%"
      left="25%"
      width="50%"
      height={5}
      borderStyle="rounded"
      border={true}
      borderColor={statusColors.running}
      title=" Filter "
      backgroundColor={theme.bg}
      zIndex={100}
      padding={1}
      flexDirection="column"
    >
      <text content="Filter by project or description:" fg={theme.muted} />
      <input
        placeholder="Type to filter..."
        focused={true}
        fg={theme.fg}
        width="100%"
        onSubmit={(value: string) => props.onApply(value)}
      />
    </box>
  );
}
