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
export type ModelProfile = 'quality' | 'balanced' | 'budget';
export type ProviderMode = 'hybrid' | 'claude-only' | 'openai-only';

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
  modelProfile: ModelProfile;
  providerMode: ProviderMode;
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

export interface SessionPart {
  id: string;
  messageId: string;
  role: string;          // from parent message's data.role
  type: string;          // text, tool, patch, step-start, step-finish, reasoning
  createdAt: number;     // epoch ms
  // Tool-specific fields (present when type='tool')
  tool?: string;         // bash, read, write, edit, glob, grep, etc.
  toolInput?: string;    // truncated input summary
  toolOutput?: string;   // truncated output summary
  toolStatus?: string;   // running, completed, error
  // Text/reasoning fields
  text?: string;         // text content
  // Patch fields
  patchFiles?: string[]; // filenames from patch operations
}

// ── Job Steps (per-step audit trail) ──────────────────────────────────────

export interface JobStep {
  id: number;                     // auto-increment
  jobId: string;                  // FK to jobs.id
  stepIndex: number;              // 0-based step position
  command: string;                // e.g. "execute-phase", "plan-phase", "quick"
  args: string;                   // e.g. "3 --auto"
  sessionTitle: string | null;    // opencode session title
  sessionId: string | null;       // opencode session ID (if found)
  status: 'running' | 'completed' | 'failed' | 'skipped';
  verdictSource: string | null;   // e.g. "semantic-check", null for non-phase commands
  verdictReason: string | null;   // reason from evaluateStepResult
  startedAt: string;              // ISO 8601
  completedAt: string | null;
  durationMs: number | null;
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
