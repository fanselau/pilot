/**
 * Running sessions panel for the TUI dashboard.
 *
 * Shows active sessions with runtime duration and log activity indicator.
 * Activity indicator color: green (<60s stale), yellow (60-300s), red (>300s).
 *
 * TUI module — depends on React + Ink. No picocolors, no cli-table3.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { formatDuration } from '../util/format.js';

export interface RunningPanelProps {
  sessions: Array<{
    session: string;
    pid: number;
    runtimeSeconds: number;
    logStaleSeconds: number;
    verdict: string;
  }>;
  active: boolean;
  selectedIndex: number;
  width: number;
  height: number;
}

function logActivityIndicator(staleSeconds: number): React.ReactElement {
  if (staleSeconds < 60) {
    return <Text color="green">◆</Text>;
  }
  if (staleSeconds <= 300) {
    return <Text color="yellow">◆</Text>;
  }
  return <Text color="red">◆</Text>;
}

export function RunningPanel({
  sessions,
  active,
  selectedIndex,
  width,
  height,
}: RunningPanelProps): React.ReactElement {
  const borderColor = active ? 'green' : 'gray';
  const maxVisible = Math.max(1, height - 2); // border takes 2 lines

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      <Text bold> Running</Text>
      {sessions.length === 0 ? (
        <Text dimColor>  No active sessions</Text>
      ) : (
        sessions.slice(0, maxVisible).map((s, i) => {
          const isSelected = active && i === selectedIndex;
          const prefix = isSelected ? '> ' : '  ';
          const duration = formatDuration(s.runtimeSeconds);
          // Truncate session name to fit available width
          const maxNameLen = Math.max(10, width - duration.length - 10);
          const name = s.session.length > maxNameLen
            ? s.session.slice(0, maxNameLen - 1) + '\u2026'
            : s.session;

          return (
            <Box key={s.session}>
              <Text bold={isSelected} inverse={isSelected}>
                {prefix}● {name}  {duration}  </Text>
              {logActivityIndicator(s.logStaleSeconds)}
            </Box>
          );
        })
      )}
    </Box>
  );
}
