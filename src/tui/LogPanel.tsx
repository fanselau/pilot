/**
 * Log panel for the TUI dashboard.
 *
 * When collapsed: shows placeholder text.
 * When expanded: reads the session log file and displays the last N lines,
 * refreshing every 3 seconds.
 *
 * TUI module — depends on React + Ink. No picocolors, no cli-table3.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';

export interface LogPanelProps {
  sessionName: string | null;
  expanded: boolean;
  active: boolean;
  width: number;
  height: number;
}

export function LogPanel({
  sessionName,
  expanded,
  active,
  width,
  height,
}: LogPanelProps): React.ReactElement {
  const borderColor = active ? 'green' : 'gray';
  const [logLines, setLogLines] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!expanded || sessionName === null) {
      setLogLines([]);
      return;
    }

    const config = getConfig();
    const logPath = path.join(config.logDir, `gsd-${sessionName}.log`);
    const maxLines = Math.max(1, height - 2);

    const readLog = async (): Promise<void> => {
      try {
        const content = await readFile(logPath, 'utf8');
        const lines = content.split('\n').filter((l) => l.length > 0);
        setLogLines(lines.slice(-maxLines));
      } catch {
        setLogLines(['Log file not found']);
      }
    };

    void readLog();
    intervalRef.current = setInterval(() => {
      void readLog();
    }, 3000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionName, expanded, height]);

  const title = sessionName !== null ? `Log: ${sessionName}` : 'Log';

  if (!expanded) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        width={width}
        height={3}
      >
        <Text dimColor> Log: select a session and press Enter</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      <Text bold> {title}</Text>
      {sessionName === null ? (
        <Text dimColor>  No session selected</Text>
      ) : (
        logLines.map((line, i) => (
          <Text key={i} wrap="truncate">{line}</Text>
        ))
      )}
    </Box>
  );
}
