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
import { fetchQueueData, fetchRecentData } from './data/pilot-db.js';
import { fetchSessionEnrichment } from './data/opencode-db.js';
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
      if (titles.length > 0) {
        const { tokens, lastMsgs } = fetchSessionEnrichment(titles);
        batch(() => {
          state.setSessionTokens(tokens);
          state.setLastMessages(lastMsgs);
        });
      }
    } catch {
      // DB may not exist yet — ignore
    }
  }, 2000);

  onMount(() => {
    queuePoller.start();
    completedPoller.start();
    enrichmentPoller.start();
  });

  onCleanup(() => {
    queuePoller.stop();
    completedPoller.stop();
    enrichmentPoller.stop();
  });

  // ── Helper: get item count for focused panel ──────────────────────────

  function focusedPanelLength(): number {
    const focus = state.panelFocus();
    if (focus === 'queue') return state.filteredQueue().length;
    if (focus === 'running') return state.running().length;
    if (focus === 'completed') return state.completed().length;
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

      // K — force-quit running job (only when running panel focused)
      if (key.sequence === 'K' && state.panelFocus() === 'running') {
        const job = state.selectedJob();
        if (job && job.status === 'running') {
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
          message={`Kill job ${state.selectedJob()?.id ?? ''} (${state.selectedJob()?.project ?? ''})?`}
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
      <FooterBar view={state.view()} />
    </box>
  );
}
