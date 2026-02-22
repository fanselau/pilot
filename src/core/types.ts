/**
 * Shared TypeScript interfaces for Pilot v2.
 *
 * All types used across core/, commands/, and tui/ live here.
 * Pure type definitions — no runtime code, no dependencies.
 */

// ── Configuration ─────────────────────────────────────────────────────────

export interface PilotConfig {
  pilotDir: string;          // ~/.pilot/
  pilotDbPath: string;       // ~/.pilot/pilot.db
  projectDir: string;        // ~/dev/punchlab
  gsdDir: string;            // ~/dev/punchlab/pilot-gsd
  stuckThreshold: number;    // minutes, default 90
  maxParallel: number;       // auto from RAM, default 1
  pollInterval: number;      // seconds, default 5
  defaultTimeout: number;    // minutes per job, default 60
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  noColor: boolean;
}

// ── Job (matches pilot.db schema) ─────────────────────────────────────────

export type JobScope = 'quick' | 'phase' | 'milestone';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;                // 4 alphanumeric chars
  project: string;
  scope: JobScope;
  description: string;
  requirementPath: string | null;
  status: JobStatus;
  priority: number;
  dependsOn: string | null;  // job ID
  createdAt: string;         // ISO 8601
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;       // default 3
  delegationPlan: string | null;  // JSON string of DelegationPlan
  currentStep: number;
  sessionTitles: string | null;   // JSON array of session titles
}

// ── Delegation AI ─────────────────────────────────────────────────────────

export interface DelegationStep {
  command: string;  // "quick", "add-phase", "plan-phase", "execute-phase", "verify-phase"
  args: string;
}

export interface DelegationPlan {
  steps: DelegationStep[];
  reasoning: string;
}

// ── Sessions (from opencode DB) ───────────────────────────────────────────

export interface SessionInfo {
  id: string;
  title: string;
  created: number;    // epoch ms
  updated: number;    // epoch ms
  messageCount?: number;
  tokenUsage?: { input: number; output: number };
}

export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  createdAt: number;  // epoch ms
}

// ── Status output ─────────────────────────────────────────────────────────

export interface PilotStatusJson {
  timestamp: string;
  version: string;
  daemon: { active: boolean };
  active: Job[];
  queue: Job[];
  recent: Job[];
}
