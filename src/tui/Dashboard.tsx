/**
 * Dashboard component — placeholder.
 *
 * This placeholder will be fully replaced in Plan 04-04 with
 * the full-featured TUI dashboard layout and panels.
 *
 * TUI module — depends on React + Ink.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface DashboardProps {
  intervalMs: number;
}

export function Dashboard({ intervalMs }: DashboardProps): React.ReactElement {
  return (
    <Box>
      <Text>Dashboard loading... (refresh: {intervalMs}ms)</Text>
    </Box>
  );
}
