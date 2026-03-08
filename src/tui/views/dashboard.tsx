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
import { ProjectsPanel } from '../components/projects-panel.js';
import type { PilotStateStore } from '../state.js';
import type { JobStatus } from '../../core/types.js';
import { getConfig } from '../../core/config.js';

export function Dashboard(props: { state: PilotStateStore }) {
  const s = props.state;
  const queueGraceSeconds = getConfig().queueGraceSeconds ?? 0;

  // Per-panel selected index tracking
  const queueIndex = () => s.panelFocus() === 'queue' ? s.selectedIndex() : -1;
  const runningIndex = () => s.panelFocus() === 'running' ? s.selectedIndex() : -1;
  const completedIndex = () => s.panelFocus() === 'completed' ? s.selectedIndex() : -1;
  const projectsIndex = () => s.panelFocus() === 'projects' ? s.selectedIndex() : -1;

  // Blocked project paths — used to highlight jobs in the queue
  const blockedProjects = () => new Set(
    s.projects().filter(p => p.status === 'blocked').map(p => p.path),
  );

  const blockedProjectReasons = () => {
    const reasons = new Map<string, string | null>();
    for (const project of s.projects()) {
      if (project.status === 'blocked') {
        reasons.set(project.path, project.blockedReason);
      }
    }
    return reasons;
  };

  const runningProjects = () => new Set(s.running().map((job) => job.project));

  const jobStatusById = () => {
    const statuses = new Map<string, JobStatus>();
    for (const job of s.queue()) {
      statuses.set(job.id, job.status);
    }
    for (const job of s.running()) {
      statuses.set(job.id, job.status);
    }
    for (const job of s.completed()) {
      statuses.set(job.id, job.status);
    }
    return statuses;
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Top row: Queue + Running */}
      <box flexDirection="row" flexGrow={1}>
        <QueuePanel
          jobs={s.filteredQueue()}
          selectedIndex={queueIndex()}
          focused={s.panelFocus() === 'queue'}
          blockedProjects={blockedProjects()}
          blockedProjectReasons={blockedProjectReasons()}
          runningProjects={runningProjects()}
          jobStatusById={jobStatusById()}
          queueGraceSeconds={queueGraceSeconds}
        />
        <RunningPanel
          jobs={s.running()}
          selectedIndex={runningIndex()}
          focused={s.panelFocus() === 'running'}
          observabilitySnapshots={s.observabilitySnapshots()}
          sessionTokens={s.sessionTokens()}
          lastMessages={s.lastMessages()}
        />
      </box>
      {/* Bottom row: Completed + Projects */}
      <box flexDirection="row" flexGrow={1}>
        <CompletedPanel
          jobs={s.completed()}
          selectedIndex={completedIndex()}
          focused={s.panelFocus() === 'completed'}
          observabilitySnapshots={s.observabilitySnapshots()}
        />
        <ProjectsPanel
          projects={s.projects()}
          selectedIndex={projectsIndex()}
          focused={s.panelFocus() === 'projects'}
        />
      </box>
    </box>
  );
}
