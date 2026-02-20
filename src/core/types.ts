/**
 * All shared TypeScript interfaces for the Pilot CLI.
 *
 * This file is the single source of truth for data structures used across
 * core/, commands/, and tui/ layers. No default exports. No `any` types.
 */

// ── Configuration ──────────────────────────────────────────────────────────

export interface PilotConfig {
  queueFile: string;
  logDir: string;
  stuckThreshold: number;
  projectDir: string;
  gsdDir: string;
  noColor: boolean;
}

// ── Queue ──────────────────────────────────────────────────────────────────

export interface QueueEntry {
  lineNum: number;
  project: string;
  mode: string;
  args: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  description?: string;
  dependsOn?: string[];
  timeout?: number;
}

export interface QueueItem {
  status: 'pending' | 'running' | 'done' | 'failed';
  project: string;
  mode: string;
  args: string;
  description: string;
  line_num: number;
}

// ── Sessions ───────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  title: string;
  updated: number;
  created: number;
  message_count: number;
}

// ── Stuck Detection ────────────────────────────────────────────────────────

export interface StuckSignal {
  name: string;
  points: number;
  detail: string;
}

export interface StuckAssessment {
  pid: number;
  session: string;
  score: number;
  verdict: 'healthy' | 'suspect' | 'stuck';
  signals: StuckSignal[];
  runtime_seconds: number;
  log_staleness_seconds: number;
}

export interface StuckSession extends SessionInfo {
  pid: number;
  runtime_seconds: number;
  log_staleness_seconds: number;
  score: number;
  verdict: 'stuck' | 'suspect';
  signals: StuckSignal[];
}

// ── Status JSON Contract ───────────────────────────────────────────────────

export interface PilotStatusJson {
  timestamp: string;
  summary: {
    running: number;
    stuck: number;
    suspect: number;
    queued: number;
    completed: number;
  };
  sessions: {
    running: SessionInfo[];
    stuck: StuckSession[];
    suspect: StuckSession[];
  };
  queue: QueueItem[];
  completed: SessionInfo[];
  runner: {
    active: boolean;
    pid: number | null;
    uptime_seconds: number | null;
  };
}

// ── Projects ───────────────────────────────────────────────────────────────

export interface ProjectInfo {
  name: string;
  path: string;
  branch: string;
  gitState: 'clean' | 'dirty';
  planningState: 'no-planning' | 'active' | 'complete';
  currentPhase?: number;
  currentPhaseState?: string;
  progress: number;
}

// ── Progress ───────────────────────────────────────────────────────────────

export interface PhaseProgress {
  number: number;
  name: string;
  status: 'done' | 'in-progress' | 'pending';
  plans: number;
}

export interface ProgressInfo {
  project: string;
  overall: number;
  phases: PhaseProgress[];
  currentPhase: number | null;
  nextAction: string;
  blockers: string[];
}
