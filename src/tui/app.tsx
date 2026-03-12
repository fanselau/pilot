/**
 * App — root TUI component with view routing and keyboard handling.
 *
 * Sets up the state store, data pollers, global keyboard handler,
 * and renders the chrome (StatusBar, FooterBar) with the active view.
 */

/* @jsxImportSource @opentui/solid */

// @ts-ignore — Node16 can't resolve @opentui/solid hooks through bare .d.ts chain
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid';
import { Show, Switch, Match, onMount, onCleanup, batch } from 'solid-js';
import { createPilotState } from './state.js';
import { createPoller } from './data/poller.js';
import { fetchQueueData, fetchRecentData, fetchProjectData, unblockProject, cancel, retry, deregisterProject } from './data/pilot-db.js';
import { fetchSessionEnrichment } from './data/opencode-db.js';
import { buildJobObservability } from '../core/job-observability.js';
import { StatusBar } from './components/status-bar.js';
import { FooterBar } from './components/footer-bar.js';
import { HelpOverlay } from './components/help-overlay.js';
import { FilterOverlay } from './components/filter-overlay.js';
import { ConfirmOverlay } from './components/confirm-overlay.js';
import { Dashboard } from './views/dashboard.js';
import { DetailView } from './views/detail.js';
import { forceQuitJob } from '../core/db.js';
import { killJobSession } from '../core/runner.js';
import type { Job } from '../core/types.js';

// ── Keyboard event interface (matches OpenTUI KeyEvent shape) ─────────────

interface TuiKeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

// ── App component ─────────────────────────────────────────────────────────

export function App(_props: { interval?: number }) {
  const state = createPilotState();
  const renderer = useRenderer();
  const dims = useTerminalDimensions();

  // ── Data pollers ──────────────────────────────────────────────────────

  const queuePoller = createPoller(() => {
    try {
      const { pending, running } = fetchQueueData();
      batch(() => {
        state.setQueue(pending);
        state.setRunning(running);
      });
    } catch {
      // DB may not exist yet — ignore
    }
  }, 1000);

  const completedPoller = createPoller(() => {
    try {
      const recent = fetchRecentData(50);
      state.setCompleted(recent);
    } catch {
      // DB may not exist yet — ignore
    }
  }, 5000);

  const enrichmentPoller = createPoller(() => {
    try {
      const running = state.running();
      const completed = state.completed();

      const byJobId = new Map<string, Job>();
      for (const job of running) byJobId.set(job.id, job);
      for (const job of completed) {
        if (!byJobId.has(job.id)) {
          byJobId.set(job.id, job);
        }
      }

      const observability = new Map<string, ReturnType<typeof buildJobObservability>>();
      for (const job of byJobId.values()) {
        observability.set(job.id, buildJobObservability(job));
      }

      const titles: string[] = [];
      for (const job of running) {
        if (!job.sessionTitles) continue;
        try {
          const parsed = JSON.parse(job.sessionTitles) as string[];
          titles.push(...parsed);
        } catch {
          // skip malformed
        }
      }

      let tokens = new Map<string, { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }>();
      let lastMsgs = new Map<string, string>();
      if (titles.length > 0) {
        const enrichment = fetchSessionEnrichment(titles);
        tokens = enrichment.tokens;
        lastMsgs = enrichment.lastMsgs;
      }

      batch(() => {
        state.setObservabilitySnapshots(observability);
        state.setSessionTokens(tokens);
        state.setLastMessages(lastMsgs);
      });
    } catch {
      // DB may not exist yet — ignore
    }
  }, 2000);

  const projectsPoller = createPoller(() => {
    try {
      state.setProjects(fetchProjectData());
    } catch {
      // DB may not exist yet — ignore
    }
  }, 2000);

  onMount(() => {
    queuePoller.start();
    completedPoller.start();
    enrichmentPoller.start();
    projectsPoller.start();
  });

  onCleanup(() => {
    queuePoller.stop();
    completedPoller.stop();
    enrichmentPoller.stop();
    projectsPoller.stop();
  });

  // ── Helper: resolve detail view job status ─────────────────────────────

  function detailJobStatus() {
    if (state.view() !== 'detail') return undefined;
    const id = state.detailJobId();
    if (!id) return undefined;
    const allJobs = [...state.queue(), ...state.running(), ...state.completed()];
    const job = allJobs.find(j => j.id === id);
    return job?.status;
  }

  // ── Helper: get item count for focused panel ──────────────────────────

  function focusedPanelLength(): number {
    const focus = state.panelFocus();
    if (focus === 'queue') return state.filteredQueue().length;
    if (focus === 'running') return state.running().length;
    if (focus === 'completed') return state.completed().length;
    if (focus === 'projects') return state.projects().length;
    return 0;
  }

  // ── Keyboard handler ──────────────────────────────────────────────────

  useKeyboard((key: TuiKeyEvent) => {
    // Confirm overlay captures y/n/Esc when open
    if (state.showConfirm()) {
      if (key.sequence === 'y' || key.sequence === 'Y') {
        const action = state.pendingConfirmAction();
        if (action) {
          state.setShowConfirm(false);
          state.setPendingConfirmAction(null);
          action().catch((err: unknown) => {
            process.stderr.write(`[tui] force-quit error: ${String(err)}\n`);
          });
        }
      } else if (key.sequence === 'n' || key.sequence === 'N' || key.name === 'escape') {
        state.setShowConfirm(false);
        state.setPendingConfirmAction(null);
      }
      return;
    }

    // Filter overlay captures input when open — only handle Esc
    if (state.showFilter()) {
      if (key.name === 'escape') {
        state.setShowFilter(false);
      }
      return;
    }

    // Help overlay — close on ? or Esc
    if (state.showHelp()) {
      if (key.name === 'escape' || key.sequence === '?') {
        state.setShowHelp(false);
      }
      return;
    }

    // q — in detail/split view: go back; in dashboard: quit
    if (key.name === 'q') {
      if (state.view() !== 'dashboard') {
        state.navigateBack();
      } else {
        renderer.destroy();
      }
      return;
    }

    // Ctrl-C always quits
    if (key.ctrl && key.name === 'c') {
      renderer.destroy();
      return;
    }

    // Help toggle
    if (key.sequence === '?') {
      state.setShowHelp(true);
      return;
    }

    // Filter
    if (key.sequence === '/') {
      state.setShowFilter(true);
      return;
    }

    // Escape — close overlays / navigate back
    if (key.name === 'escape') {
      if (state.view() !== 'dashboard') {
        state.navigateBack();
      }
      return;
    }

    // Backspace — navigate back from detail/split view
    if (key.name === 'backspace' || key.name === 'delete') {
      if (state.view() !== 'dashboard') {
        state.navigateBack();
        return;
      }
    }

    // Tab — cycle panel focus
    if (key.name === 'tab') {
      state.cyclePanelFocus();
      return;
    }

    // View shortcuts
    if (key.sequence === 's') {
      state.toggleSplit();
      return;
    }
    if (key.sequence === '1') {
      state.setView('dashboard');
      return;
    }
    if (key.sequence === '2') {
      if (state.selectedJob()) {
        state.navigateToDetail(state.selectedJob()!.id);
      }
      return;
    }
    if (key.sequence === '3') {
      state.setView('split');
      return;
    }

    // d — remove project from management (projects panel only)
    if (key.sequence === 'd' && state.panelFocus() === 'projects') {
      const idx = state.selectedIndex();
      const project = state.projects()[idx];
      if (project) {
        state.setConfirmMessage(`Remove project ${project.path.replace(process.env['HOME'] ?? '', '~')} from management?`);
        state.setPendingConfirmAction(() => async () => {
          deregisterProject(project.path);
          state.setProjects(fetchProjectData());
        });
        state.setShowConfirm(true);
      }
      return;
    }

    // u — unblock selected blocked project (projects panel only)
    if (key.sequence === 'u' && state.panelFocus() === 'projects') {
      const idx = state.selectedIndex();
      const project = state.projects()[idx];
      if (project && project.status === 'blocked') {
        try {
          unblockProject(project.path);
          // Refresh projects immediately
          state.setProjects(fetchProjectData());
        } catch (err) {
          process.stderr.write(`[tui] unblock error: ${String(err)}\n`);
        }
      }
      return;
    }

    // r — retry failed/cancelled job (works from any view where selectedJob() returns a job)
    if (key.sequence === 'r') {
      const job = state.selectedJob();
      if (job && (job.status === 'failed' || job.status === 'cancelled')) {
        try {
          retry(job.id);
          // Also unblock the project if it was blocked by this failure
          try { unblockProject(job.project); } catch { /* project may not be blocked */ }
          // Force immediate queue refresh
          const { pending, running } = fetchQueueData();
          const recent = fetchRecentData();
          batch(() => {
            state.setQueue(pending);
            state.setRunning(running);
            state.setCompleted(recent);
          });
        } catch (err) {
          process.stderr.write(`[tui] retry error: ${String(err)}\n`);
        }
      }
      return;
    }

    // x — cancel pending job (works from any view where selectedJob() returns a job)
    if (key.sequence === 'x') {
      const job = state.selectedJob();
      if (job && job.status === 'pending') {
        try {
          cancel(job.id);
          // Force immediate queue refresh
          const { pending, running } = fetchQueueData();
          batch(() => {
            state.setQueue(pending);
            state.setRunning(running);
          });
        } catch (err) {
          process.stderr.write(`[tui] cancel error: ${String(err)}\n`);
        }
      }
      return;
    }

    // K — force-quit running job (works from dashboard OR detail view, any panel focus)
    if (key.sequence === 'K') {
      const job = state.selectedJob();
      if (job && job.status === 'running') {
        state.setConfirmMessage(`Kill job ${job.id} (${job.project.replace(process.env['HOME'] ?? '', '~')})?`);
        state.setPendingConfirmAction(() => async () => {
          // Kill process first, then update DB
          await killJobSession(job);
          forceQuitJob(job.id, 'tui');
          // Force immediate queue refresh
          try {
            const { pending, running } = fetchQueueData();
            batch(() => {
              state.setQueue(pending);
              state.setRunning(running);
            });
          } catch {
            // Refresh on next poll cycle if immediate fails
          }
        });
        state.setShowConfirm(true);
      }
      return;
    }

    // Dashboard navigation
    if (state.view() === 'dashboard') {
      const len = focusedPanelLength();

      // j / down — move cursor down
      if (key.name === 'j' || key.name === 'down') {
        state.setSelectedIndex(i => Math.min(i + 1, len - 1));
        return;
      }

      // k / up — move cursor up
      if (key.name === 'k' || key.name === 'up') {
        state.setSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }

      // g — jump to top
      if (key.sequence === 'g' && !key.shift) {
        state.setSelectedIndex(0);
        return;
      }

      // G — jump to bottom
      if (key.sequence === 'G' || (key.sequence === 'g' && key.shift)) {
        state.setSelectedIndex(Math.max(len - 1, 0));
        return;
      }

      // Enter — open job detail
      if (key.name === 'return') {
        const job = state.selectedJob();
        if (job) {
          state.navigateToDetail(job.id);
        }
        return;
      }
    }
  });

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <box flexDirection="column" width={dims().width} height={dims().height}>
      <StatusBar queue={state.queue()} running={state.running()} completed={state.completed()} />
      <box flexGrow={1}>
        <Switch>
          <Match when={state.view() === 'dashboard'}>
            <Dashboard state={state} />
          </Match>
          <Match when={state.view() === 'detail'}>
            <DetailView state={state} />
          </Match>
          <Match when={state.view() === 'split'}>
            <box><text content="Split view — coming soon" /></box>
          </Match>
        </Switch>
      </box>
      <Show when={state.showHelp()}>
        <HelpOverlay />
      </Show>
      <Show when={state.showFilter()}>
        <FilterOverlay
          onApply={(query: string) => {
            state.setFilter({ query: query || undefined });
            state.setShowFilter(false);
          }}
          onClose={() => state.setShowFilter(false)}
        />
      </Show>
      <Show when={state.showConfirm()}>
        <ConfirmOverlay
          message={state.confirmMessage()}
          onConfirm={() => {
            const action = state.pendingConfirmAction();
            if (action) {
              state.setShowConfirm(false);
              state.setPendingConfirmAction(null);
              action().catch(() => {});
            }
          }}
          onCancel={() => {
            state.setShowConfirm(false);
            state.setPendingConfirmAction(null);
          }}
        />
      </Show>
      <FooterBar view={state.view()} panelFocus={state.panelFocus()} jobStatus={detailJobStatus()} />
    </box>
  );
}
