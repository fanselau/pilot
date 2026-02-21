/**
 * Full-screen 4-panel TUI dashboard layout with keyboard handling.
 *
 * Panels: Running (top-left), Queue (top-right), Log (middle), Completed (bottom).
 * Keyboard: Tab cycles panels, j/k navigates, Enter expands log, q quits,
 * r refreshes, K kills selected session with y/n confirmation.
 *
 * TUI module — depends on React + Ink. No picocolors, no cli-table3.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { Key } from 'ink';
import { useStatusData } from './useStatusData.js';
import { RunningPanel } from './RunningPanel.js';
import { QueuePanel } from './QueuePanel.js';
import { LogPanel } from './LogPanel.js';
import { CompletedPanel } from './CompletedPanel.js';

type PanelId = 'running' | 'queue' | 'log' | 'completed';

const PANEL_ORDER: PanelId[] = ['running', 'queue', 'log', 'completed'];

interface DashboardProps {
  intervalMs: number;
}

export function Dashboard({ intervalMs }: DashboardProps): React.ReactElement {
  const { exit } = useApp();
  const data = useStatusData({ intervalMs });

  // Panel navigation state
  const [activePanel, setActivePanel] = useState<PanelId>('running');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Log expansion state
  const [logExpanded, setLogExpanded] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Kill confirmation state
  const [killConfirm, setKillConfirm] = useState<{ session: string; pid: number } | null>(null);

  // Get item count for current panel (for clamping)
  const getItemCount = useCallback((panel: PanelId): number => {
    switch (panel) {
      case 'running':
        return data.running.length;
      case 'queue':
        return data.queue.filter((e) => e.status === 'queued' || e.status === 'running').length;
      case 'completed':
        return data.completed.length;
      case 'log':
        return 0;
    }
  }, [data.running.length, data.queue, data.completed.length]);

  // Keyboard handling
  useInput((input: string, key: Key) => {
    // Kill confirmation mode — only y/n accepted
    if (killConfirm !== null) {
      if (input === 'y') {
        const pid = killConfirm.pid;
        setKillConfirm(null);
        // Dynamic import to avoid loading tree-kill at startup
        void import('tree-kill').then((mod) => {
          const treeKill = mod.default;
          treeKill(pid, 'SIGTERM');
          // Refresh data after kill
          setTimeout(() => {
            void data.refresh();
          }, 1000);
        });
      } else {
        setKillConfirm(null);
      }
      return;
    }

    // Quit
    if (input === 'q') {
      exit();
      return;
    }

    // Manual refresh
    if (input === 'r') {
      void data.refresh();
      return;
    }

    // Tab: cycle panels
    if (key.tab) {
      const currentIdx = PANEL_ORDER.indexOf(activePanel);
      const nextIdx = (currentIdx + 1) % PANEL_ORDER.length;
      setActivePanel(PANEL_ORDER[nextIdx]!);
      setSelectedIndex(0);
      return;
    }

    // Navigation: j/down = next item, k/up = previous item
    if (input === 'j' || key.downArrow) {
      const max = getItemCount(activePanel);
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, max - 1)));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    // Enter: expand/collapse log
    if (key.return) {
      if (activePanel === 'running' && data.running.length > 0) {
        const session = data.running[selectedIndex];
        if (session) {
          setSelectedSession(session.session);
          setLogExpanded(true);
          setActivePanel('log');
        }
      } else if (activePanel === 'log' && logExpanded) {
        setLogExpanded(false);
      }
      return;
    }

    // K (capital): kill selected running session
    if (input === 'K' && activePanel === 'running' && killConfirm === null) {
      const session = data.running[selectedIndex];
      if (session) {
        setKillConfirm({ session: session.session, pid: session.pid });
      }
      return;
    }
  });

  // Layout calculations based on terminal size
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  const headerHeight = 1;
  const killBarHeight = killConfirm !== null ? 1 : 0;
  const availableHeight = rows - headerHeight - killBarHeight;

  // Log panel height: collapsed = 3, expanded = ~40% of available
  const logHeight = logExpanded ? Math.max(5, Math.floor(availableHeight * 0.4)) : 3;
  const remainingHeight = availableHeight - logHeight;

  // Top row: running + queue share ~50% of remaining height
  const topHeight = Math.max(5, Math.floor(remainingHeight * 0.55));
  // Bottom: completed gets the rest
  const bottomHeight = Math.max(3, remainingHeight - topHeight);

  // Top panels split width
  const leftWidth = Math.floor(cols / 2);
  const rightWidth = cols - leftWidth;

  // Queue summary: done/failed from summary (via history), total = items + done + failed
  const queueDone = data.summary.done;
  const queueFailed = data.summary.failed;
  const queueTotal = data.queue.length + queueDone + queueFailed;

  if (data.loading && data.running.length === 0 && data.completed.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  if (data.error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {data.error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Header */}
      <Box>
        <Text bold>
          {' '}Pilot Dashboard  │  {data.summary.running} running  {data.summary.stuck} stuck  {data.summary.queued} queued  │  ↑↓/jk:select  Tab:panel  Enter:expand  q:quit
        </Text>
      </Box>

      {/* Top row: Running + Queue */}
      <Box flexDirection="row">
        <RunningPanel
          sessions={data.running}
          active={activePanel === 'running'}
          selectedIndex={activePanel === 'running' ? selectedIndex : -1}
          width={leftWidth}
          height={topHeight}
        />
        <QueuePanel
          entries={data.queue}
          active={activePanel === 'queue'}
          selectedIndex={activePanel === 'queue' ? selectedIndex : -1}
          width={rightWidth}
          height={topHeight}
          summary={{ done: queueDone, failed: queueFailed, total: queueTotal }}
        />
      </Box>

      {/* Middle: Log panel */}
      <LogPanel
        sessionName={selectedSession}
        expanded={logExpanded}
        active={activePanel === 'log'}
        width={cols}
        height={logHeight}
      />

      {/* Bottom: Completed panel */}
      <CompletedPanel
        sessions={data.completed}
        active={activePanel === 'completed'}
        selectedIndex={activePanel === 'completed' ? selectedIndex : -1}
        width={cols}
        height={bottomHeight}
      />

      {/* Kill confirmation bar */}
      {killConfirm !== null && (
        <Box>
          <Text color="yellow">Kill {killConfirm.session}? (y/n)</Text>
        </Box>
      )}
    </Box>
  );
}
