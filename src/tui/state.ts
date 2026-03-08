/**
 * TUI reactive state management using SolidJS signals.
 *
 * PilotState captures all TUI state: queue data, navigation, overlays,
 * log viewing, and session enrichment. Components consume signals for
 * fine-grained reactivity — only re-renders what changed.
 *
 * Pure data module — no UI dependencies (opentui, picocolors).
 */

import { createSignal, createMemo, batch } from 'solid-js';
import type { Job, JobObservabilitySnapshot, SessionMessage, Project } from '../core/types.js';

// ── View types ────────────────────────────────────────────────────────────

export type ViewType = 'dashboard' | 'detail' | 'split';
export type PanelFocus = 'queue' | 'running' | 'completed' | 'projects';

export interface FilterState {
  project?: string;
  status?: string;
  query?: string;
}

// ── State factory ─────────────────────────────────────────────────────────

export function createPilotState() {
  // ── Data signals ──────────────────────────────────────────────────────
  const [queue, setQueue] = createSignal<Job[]>([]);
  const [running, setRunning] = createSignal<Job[]>([]);
  const [completed, setCompleted] = createSignal<Job[]>([]);
  const [projects, setProjects] = createSignal<Project[]>([]);

  // ── Navigation signals ────────────────────────────────────────────────
  const [view, setView] = createSignal<ViewType>('dashboard');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [panelFocus, setPanelFocus] = createSignal<PanelFocus>('queue');
  const [detailJobId, setDetailJobId] = createSignal<string | null>(null);

  // ── Overlay signals ───────────────────────────────────────────────────
  const [showHelp, setShowHelp] = createSignal(false);
  const [showFilter, setShowFilter] = createSignal(false);
  const [filter, setFilter] = createSignal<FilterState>({});

  // ── Confirmation overlay signals ──────────────────────────────────────
  const [showConfirm, setShowConfirm] = createSignal(false);
  // pendingConfirmAction stores what to execute when user confirms
  const [pendingConfirmAction, setPendingConfirmAction] = createSignal<(() => Promise<void>) | null>(null);

  // ── Log state signals ─────────────────────────────────────────────────
  const [followLog, setFollowLog] = createSignal(true);
  const [logMessages, setLogMessages] = createSignal<SessionMessage[]>([]);
  const [logSearchQuery, setLogSearchQuery] = createSignal('');

  // ── Session enrichment signals ────────────────────────────────────────
  const [sessionTokens, setSessionTokens] = createSignal<Map<string, { input: number; output: number; reasoning?: number; cacheRead?: number; cacheWrite?: number }>>(new Map());
  const [lastMessages, setLastMessages] = createSignal<Map<string, string>>(new Map());
  const [observabilitySnapshots, setObservabilitySnapshots] = createSignal<Map<string, JobObservabilitySnapshot>>(new Map());

  // ── Derived state ─────────────────────────────────────────────────────

  /** Selected job based on current panel focus and index. */
  const selectedJob = createMemo(() => {
    const focus = panelFocus();
    const idx = selectedIndex();
    if (focus === 'queue') return queue()[idx] ?? null;
    if (focus === 'running') return running()[idx] ?? null;
    if (focus === 'completed') return completed()[idx] ?? null;
    // 'projects' panel — no job selected
    return null;
  });

  /** Queue items filtered by active filter state. */
  const filteredQueue = createMemo(() => {
    const f = filter();
    let items = queue();
    if (f.project) {
      items = items.filter(j => j.project === f.project);
    }
    if (f.query) {
      const q = f.query.toLowerCase();
      items = items.filter(j =>
        j.description.toLowerCase().includes(q) || j.project.toLowerCase().includes(q),
      );
    }
    return items;
  });

  // ── Return store ──────────────────────────────────────────────────────

  return {
    // Data
    queue, setQueue,
    running, setRunning,
    completed, setCompleted,
    projects, setProjects,

    // Navigation
    view, setView,
    selectedIndex, setSelectedIndex,
    panelFocus, setPanelFocus,
    detailJobId, setDetailJobId,

    // Overlays
    showHelp, setShowHelp,
    showFilter, setShowFilter,
    filter, setFilter,
    showConfirm, setShowConfirm,
    pendingConfirmAction, setPendingConfirmAction,

    // Log
    followLog, setFollowLog,
    logMessages, setLogMessages,
    logSearchQuery, setLogSearchQuery,

    // Session enrichment
    sessionTokens, setSessionTokens,
    lastMessages, setLastMessages,
    observabilitySnapshots, setObservabilitySnapshots,

    // Derived
    selectedJob,
    filteredQueue,

    // ── Navigation actions ────────────────────────────────────────────

    /** Enter job detail view for a specific job ID. */
    navigateToDetail(jobId: string) {
      batch(() => {
        setDetailJobId(jobId);
        setView('detail');
        setFollowLog(true);
      });
    },

    /** Return to dashboard from detail/split view. */
    navigateBack() {
      batch(() => {
        setView('dashboard');
        setDetailJobId(null);
        setLogMessages([]);
      });
    },

    /** Toggle between dashboard and split view. */
    toggleSplit() {
      setView(v => v === 'split' ? 'dashboard' : 'split');
    },

    /** Cycle panel focus: queue → running → completed → projects → queue. */
    cyclePanelFocus() {
      setPanelFocus(f => {
        if (f === 'queue') return 'running';
        if (f === 'running') return 'completed';
        if (f === 'completed') return 'projects';
        return 'queue';
      });
      setSelectedIndex(0);
    },
  };
}

// ── Export type ────────────────────────────────────────────────────────────

export type PilotStateStore = ReturnType<typeof createPilotState>;
