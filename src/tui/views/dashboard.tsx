/**
 * Dashboard — default TUI view composing the 3 main panels.
 *
 * Layout per spec §2 View 1:
 *   Top row:  QueuePanel (left) + RunningPanel (right)
 *   Bottom:   CompletedPanel (full width)
 *
 * Wire selectedIndex per panel based on panelFocus.
 */

/* @jsxImportSource @opentui/solid */

import { QueuePanel } from '../components/queue-panel.js';
import { RunningPanel } from '../components/running-panel.js';
import { CompletedPanel } from '../components/completed-panel.js';
import type { PilotStateStore } from '../state.js';

export function Dashboard(props: { state: PilotStateStore }) {
  const s = props.state;

  // Per-panel selected index tracking
  const queueIndex = () => s.panelFocus() === 'queue' ? s.selectedIndex() : -1;
  const runningIndex = () => s.panelFocus() === 'running' ? s.selectedIndex() : -1;
  const completedIndex = () => s.panelFocus() === 'completed' ? s.selectedIndex() : -1;

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Top row: Queue + Running */}
      <box flexDirection="row" flexGrow={1}>
        <QueuePanel
          jobs={s.filteredQueue()}
          selectedIndex={queueIndex()}
          focused={s.panelFocus() === 'queue'}
        />
        <RunningPanel
          jobs={s.running()}
          selectedIndex={runningIndex()}
          focused={s.panelFocus() === 'running'}
          sessionTokens={s.sessionTokens()}
          lastMessages={s.lastMessages()}
        />
      </box>
      {/* Bottom: Completed */}
      <CompletedPanel
        jobs={s.completed()}
        selectedIndex={completedIndex()}
        focused={s.panelFocus() === 'completed'}
      />
    </box>
  );
}
