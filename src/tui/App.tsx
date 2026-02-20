/**
 * Root Ink component for the TUI dashboard.
 *
 * Entry point that the `pilot tui` command renders.
 * Wraps Dashboard with layout container and passes interval prop.
 *
 * TUI module — depends on React + Ink.
 */

import React from 'react';
import { Box } from 'ink';
import { Dashboard } from './Dashboard.js';

interface AppProps {
  interval: number; // seconds
}

export function App({ interval }: AppProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Dashboard intervalMs={interval * 1000} />
    </Box>
  );
}
