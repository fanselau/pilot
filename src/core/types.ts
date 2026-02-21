/**
 * All shared TypeScript interfaces for the Pilot CLI.
 *
 * This file is the single source of truth for data structures used across
 * core/, commands/, and tui/ layers. No default exports. No `any` types.
 */

// ── Configuration ──────────────────────────────────────────────────────────

export interface PilotConfig {
  queueFile: string;        // legacy QUEUE.md path (keep for import command)
  pilotDir: string;          // ~/.pilot/
  queueJsonFile: string;     // ~/.pilot/queue.json
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
  message_count?: number;
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

// ── Spawn ──────────────────────────────────────────────────────────────────

export interface SpawnOptions {
  project: string;
  projectDir: string;
  command: string;     // gsd-* command name
  args?: string;
  title: string;
  logFile: string;
}

export interface SpawnResult {
  pid: number;
  title: string;
  logFile: string;
  process: unknown;    // ChildProcess from execa — opaque to consumers
}

// ── Phase State ────────────────────────────────────────────────────────────

export type PhaseState = 'needs-plan' | 'needs-execute' | 'needs-verify' | 'needs-gaps' | 'done';

// ── Runner ─────────────────────────────────────────────────────────────────

export interface RunnerJob {
  entry: QueueEntry;
  pid: number;
  title: string;
  logFile: string;
  startTime: number;
  preCommitCount: number;
  retries: number;
}

export interface RunnerOptions {
  maxParallel: number;
  maxRetries: number;
  once: boolean;
  dryRun: boolean;
  force: boolean;
}

// ── Smart Add ─────────────────────────────────────────────────────────────

export type SmartAddScope = 'milestone' | 'phase' | 'quick';

export interface ScopeDetectionResult {
  scope: SmartAddScope;
  itemCount: number;
  hasPhaseHeaders: boolean;
  isDirectory: boolean;
  rationale: string;
}

export interface ProjectStateResult {
  exists: boolean;
  hasOpencode: boolean;
  hasPlanning: boolean;
  allPhasesDone: boolean;
  phasesIncomplete: boolean;
  isQueued: boolean;
  isRunning: boolean;
  queuedMode: string | null;
  runningPhase: string | null;
  needsSetup: boolean;
  needsInit: boolean;
}

export interface SmartAddDecision {
  scope: SmartAddScope;
  internalMode: string;
  project: string;
  description: string;
  requirementsPath: string | null;
  projectState: ProjectStateResult;
  scopeDetection: ScopeDetectionResult;
}

// ── Verify Routing ──────────────────────────────────────────────────────
export type ProjectType = 'web' | 'cli' | 'file-content';
export type VerifyStrategy = 'auto' | 'browser' | 'file' | 'cli';

export interface VerifyResult {
  strategy: ProjectType;
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  issues: string[];
  testsRan: boolean;
  testsPassed: boolean | null;  // null if no tests found
}

// ── Queue JSON Storage ────────────────────────────────────────────────────

export interface QueueJsonItem {
  id: string;                    // nanoid
  project: string;
  mode: string;                  // build-full, continue, continue-all, etc.
  description: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  addedAt: string;               // ISO 8601
  startedAt: string | null;
  completedAt: string | null;
  phase: number | null;
  attempts: number;
  maxAttempts: number;           // default 3
  dependsOn: string | null;      // item ID (not project name)
  error: string | null;
  meta: Record<string, unknown>;
}

export interface QueueHistoryItem extends QueueJsonItem {
  duration: number;              // seconds
}

export interface QueueJsonFile {
  version: 1;
  items: QueueJsonItem[];
  history: QueueHistoryItem[];
}
