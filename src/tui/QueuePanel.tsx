/**
 * Queue panel for the TUI dashboard.
 *
 * Shows pending and running queue entries with a progress bar showing
 * completion ratio (done / total).
 *
 * TUI module — depends on React + Ink. No picocolors, no cli-table3.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { QueueJsonItem } from '../core/types.js';

export interface QueuePanelProps {
  entries: QueueJsonItem[];
  active: boolean;
  selectedIndex: number;
  width: number;
  height: number;
  summary: { done: number; failed: number; total: number };
}

export function QueuePanel({
  entries,
  active,
  selectedIndex,
  width,
  height,
  summary,
}: QueuePanelProps): React.ReactElement {
  const borderColor = active ? 'green' : 'gray';
  const maxVisible = Math.max(1, height - 4); // border + title + progress bar

  // Progress bar
  const ratio = summary.total > 0 ? summary.done / summary.total : 0;
  const barWidth = Math.min(width - 10, 20);
  const fill = Math.round(ratio * barWidth);
  const empty = barWidth - fill;

  // Filter to queued and running entries for display
  const displayEntries = entries.filter(
    (e) => e.status === 'queued' || e.status === 'running',
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      <Text bold> Queue</Text>
      <Box>
        <Text color="green">{'\u2588'.repeat(fill)}</Text>
        <Text dimColor>{'\u2591'.repeat(empty)}</Text>
        <Text> {summary.done}/{summary.total}</Text>
      </Box>
      {displayEntries.length === 0 ? (
        <Text dimColor>  Queue empty</Text>
      ) : (
        displayEntries.slice(0, maxVisible).map((e, i) => {
          const isSelected = active && i === selectedIndex;
          const prefix = isSelected ? '> ' : '  ';
          const maxEntryLen = Math.max(10, width - 8);
          const entryText = `${e.project}: ${e.mode}`;
          const display = entryText.length > maxEntryLen
            ? entryText.slice(0, maxEntryLen - 1) + '\u2026'
            : entryText;

          if (e.status === 'running') {
            return (
              <Text key={e.lineNum} bold={isSelected} inverse={isSelected}>
                {prefix}<Text color="cyan">{'\u27F3'}</Text> {display}
              </Text>
            );
          }

          return (
            <Text key={e.lineNum} bold={isSelected} inverse={isSelected}>
              {prefix}<Text dimColor>○</Text> {display}
            </Text>
          );
        })
      )}
    </Box>
  );
}
