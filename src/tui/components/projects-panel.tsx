/**
 * ProjectsPanel — list of registered projects with status indicators.
 *
 * Shows all projects from the projects table. Blocked projects are
 * highlighted in red with their reason displayed. Operators can press
 * 'u' to unblock the selected blocked project.
 */

/* @jsxImportSource @opentui/solid */

import { For, Show } from 'solid-js';
import type { Project } from '../../core/types.js';
import { statusColors, theme } from '../theme.js';

interface ProjectsPanelProps {
  projects: Project[];
  selectedIndex: number;
  focused: boolean;
}

function shortenPath(p: string): string {
  return p.replace(process.env['HOME'] ?? '', '~');
}

export function ProjectsPanel(props: ProjectsPanelProps) {
  const borderColor = () => props.focused ? statusColors.running : theme.border;
  const title = () => ` Projects (${props.projects.length}) `;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="rounded"
      border={true}
      borderColor={borderColor()}
      title={title()}
    >
      <Show when={props.projects.length === 0}>
        <text fg={theme.muted}>No registered projects. Run: pilot setup &lt;dir&gt;</text>
      </Show>
      <For each={props.projects}>
        {(project, i) => {
          const isSelected = () => props.focused && i() === props.selectedIndex;
          const isBlocked = () => project.status === 'blocked';
          const rowBg = () => isSelected() ? theme.highlight : undefined;
          const dotColor = () => isBlocked() ? statusColors.failed : statusColors.done;
          const shortPath = shortenPath(project.path);

          return (
            <box flexDirection="row" backgroundColor={rowBg()}>
              <text fg={dotColor()}>● </text>
              <box flexDirection="column" flexGrow={1}>
                <text fg={isSelected() ? theme.fg : theme.muted}>{shortPath}</text>
                <text fg={theme.muted}>
                  notify: {(project.notifyRoutes && project.notifyRoutes.length > 0) ? project.notifyRoutes.map((r: any) => r.kind).join(', ') : '(none)'}  status: {isBlocked() ? 'BLOCKED' : 'active'}
                </text>
                <Show when={isBlocked() && !!project.blockedReason}>
                  <text fg={statusColors.warning}>
                    {(project.blockedReason ?? '').slice(0, 80)}
                  </text>
                  <text fg={theme.muted}>Press u to unblock</text>
                </Show>
                <Show when={isSelected() && !isBlocked()}>
                  <text fg={theme.muted}>Press b to block</text>
                </Show>
                <Show when={isSelected()}>
                  <text fg={theme.muted}>Press d to remove</text>
                </Show>
              </box>
            </box>
          );
        }}
      </For>
    </box>
  );
}
