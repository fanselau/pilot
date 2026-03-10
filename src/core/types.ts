/**
 * Shared TypeScript interfaces for Pilot v2.
 *
 * All types used across core/, commands/, and tui/ live here.
 * Pure type definitions — no runtime code, no dependencies.
 */

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Shape of ~/.pilot/config.json file.
 * All fields are optional — missing fields use hardcoded defaults.
 * Unknown keys are ignored for forward compatibility.
 */
export interface ConfigFileSchema {
  projectDir?: string;
  gsdDir?: string | null;
  runner?: {
    maxParallel?: number | null;  // null = auto-detect from RAM
    queueGraceSeconds?: number;
    // pollInterval, defaultTimeout, stuckThreshold are REMOVED — internal constants
  };
  memory?: {
    sessionMaxMb?: number;
    reservedMb?: number;
    killThresholdMb?: number;
  };
  defaults?: {
    modelProfile?: 'quality' | 'balanced' | 'budget';
    providerMode?: string;  // accepts built-in modes + custom user-defined modes from provider_modes table
    notifyTarget?: string | null;
    scope?: 'quick' | 'phase' | 'milestone' | null;
  };
  notifications?: {
    openclawHooksUrl?: string | null;
    openclawHooksToken?: string | null;
    telegramBotToken?: string | null;
    telegramChatId?: string | null;
  };
  logging?: {
    level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    noColor?: boolean;
  };
}

/** Source of a config value for display purposes. */
export type ConfigSource = 'env' | 'config' | 'default' | 'auto-detect';

/** Config-only defaults not in PilotConfig (accessed via getConfigFileDefaults). */
export interface ConfigFileDefaults {
  modelProfile: 'quality' | 'balanced' | 'budget';
  providerMode: string;  // accepts built-in modes + custom user-defined modes
  scope: 'quick' | 'phase' | 'milestone' | null;
}

export interface PilotConfig {
  pilotDir: string;          // ~/.pilot/
  pilotDbPath: string;       // ~/.pilot/pilot.db
  projectDir: string;        // ~/dev (PILOT_PROJECT_DIR)
  gsdDir: string;            // ./pilot-gsd (PILOT_GSD_DIR)
  maxParallel: number;       // auto from RAM, default 1
  queueGraceSeconds: number; // minimum queue age before launch eligibility, default 120
  sessionMemoryMaxMb: number;      // per-session systemd MemoryMax, default 8192 (8GB)
  reservedMemoryMb: number;        // reserved for OS/SSH/pilot before dynamic maxParallel calc, default 4096
  memoryKillThresholdMb: number;   // watchdog kills if available drops below this, default 2048
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  noColor: boolean;
  telegramBotToken: string | null;   // PILOT_TELEGRAM_BOT_TOKEN — optional Telegram notifications
  telegramChatId: string | null;     // PILOT_TELEGRAM_CHAT_ID — optional Telegram chat ID
  openclawHooksUrl: string | null;   // PILOT_OPENCLAW_HOOKS_URL — base webhook URL for session wake
  openclawHooksToken: string | null; // PILOT_OPENCLAW_HOOKS_TOKEN — auth token for hooks endpoint
  defaultNotifySessionKey: string | null;  // PILOT_DEFAULT_NOTIFY — fallback agent ID for --notify
}

// ── Job (matches pilot.db schema) ─────────────────────────────────────────

export type JobScope = 'quick' | 'phase' | 'milestone';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type ModelProfile = 'quality' | 'balanced' | 'budget';
export type ProviderMode = 'hybrid' | 'claude-only' | 'openai-only';

/** ProviderMode including custom user-defined modes from provider_modes table. */
export type DynamicProviderMode = string;

export interface ModelEntry {
  model: string;
  variant?: string;
}

export interface OpenClawDeliverRoute {
  kind: 'openclaw-agent-deliver';
  agentId: string;
  channel: string;
  to: string;
  accountId?: string;
}

export interface Job {
  id: string;                // 4 alphanumeric chars
  project: string;
  scope: JobScope;
  description: string;
  requirementPath: string | null;
  status: JobStatus;
  priority: number;
  dependsOn: string | null;  // job ID
  parentJobId: string | null;  // parent milestone job ID
  createdAt: string;         // ISO 8601
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  resumeHint: string | null;  // hint for --resume flag on next attempt
  attempts: number;
  timeout: number;            // minutes, 0 = infinite (no timeout)
  delegationPlan: string | null;  // JSON string of DelegationPlan
  currentStep: number;
  sessionTitles: string | null;   // JSON array of session titles
  modelProfile: ModelProfile;
  providerMode: string;         // ProviderMode or custom user-defined mode from provider_modes table
  judgeVerdict: string | null;  // JSON string of judge verdict
  actualModels: string[] | null;  // actual provider/model strings from opencode DB
  callbackUrl: string | null;     // custom webhook URL for job completion notification
  callbackSessionKey: string | null;  // Agent ID to notify on completion (e.g. "main")
  notifyRoute: OpenClawDeliverRoute | null; // queue-time snapshot of structured OpenClaw delivery route
  categories: string[] | null;    // user-assigned skill categories for the job
  gitBaseCommit: string | null;
  gitHeadCommit: string | null;
  allowDirtyStart: boolean;
  startedDirty: boolean;
  skipGracePeriod: boolean;
}

// ── Job Observability + Cost Estimation ───────────────────────────────────

export type ObservabilityDataStatus = 'available' | 'partial' | 'unavailable';
export type CostEstimateStatus = 'estimated' | 'partial' | 'unavailable';

export interface TokenUsageBreakdown {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface JobCostEstimateByModel {
  model: string;
  status: CostEstimateStatus;
  estimatedUsd: number | null;
  tokens: TokenUsageBreakdown;
  notes: string[];
}

export interface JobCostEstimate {
  status: CostEstimateStatus;
  currency: 'USD';
  estimatedUsd: number | null;
  byModel: JobCostEstimateByModel[];
  notes: string[];
}

export interface JobObservabilityRequested {
  modelProfile: ModelProfile;
  providerMode: string;  // ProviderMode or custom user-defined mode
  scope: JobScope;
  intendedExecutorModel: string | null;
  notes: string[];
}

export interface JobObservabilityObserved {
  status: ObservabilityDataStatus;
  models: string[];
  notes: string[];
}

export interface JobObservabilityTokens {
  status: ObservabilityDataStatus;
  totals: TokenUsageBreakdown | null;
  byModel: Record<string, TokenUsageBreakdown>;
  notes: string[];
}

export interface JobObservabilitySnapshot {
  jobId: string;
  jobStatus: JobStatus;
  terminal: boolean;
  requested: JobObservabilityRequested;
  observed: JobObservabilityObserved;
  tokens: JobObservabilityTokens;
  cost: JobCostEstimate;
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
  verdictReason: string | null;   // reason for the verdict
  startedAt: string;              // ISO 8601
  completedAt: string | null;
  durationMs: number | null;
}

// ── Project (matches projects table in pilot.db) ─────────────────────────

export type ProjectStatus = 'active' | 'blocked';

export interface Project {
  path: string;              // absolute project path (primary key)
  owner: string | null;      // agent ID e.g. "main"
  notifyOpenClawRoute: OpenClawDeliverRoute | null; // structured OpenClaw deliver route
  status: ProjectStatus;
  blockedReason: string | null;
  blockedAt: string | null;  // ISO 8601
  createdAt: string;
}

// ── Skills System ──────────────────────────────────────────────────────────

/** A single installed skill entry in the manifest. */
export interface SkillEntry {
  name: string;        // from SKILL.md frontmatter
  description: string; // from SKILL.md frontmatter
  categories: string[]; // user-assigned tags (empty = universal skill)
  source: string;      // e.g. "github:owner/repo"
  path: string;        // absolute path to skill directory (~/.pilot/skills/<name>/)
}

/** The manifest.json file at ~/.pilot/skills/manifest.json */
export interface SkillManifest {
  version: 1;
  skills: SkillEntry[];
}

// ── Model Profile Database Rows ───────────────────────────────────────────

/** Row shape for the model_profiles table. */
export interface ModelProfileRow {
  provider_mode: string;
  agent_or_scope: string;
  profile: string;        // 'quality' | 'balanced' | 'budget'
  model: string;          // e.g. 'anthropic/claude-opus-4-6'
  variant: string | null; // e.g. 'none', 'minimal', 'low', 'medium', 'high', or null in storage
}

/** Row shape for the provider_modes table. */
export interface ProviderModeRow {
  name: string;
  description: string;
  is_builtin: number;    // 1 = built-in, 0 = user-created
  created_at: string;
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
