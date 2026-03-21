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
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'completed_pending_review' | 'review_hold';
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
  delegationPlan: string | null;  // JSON string of DelegationResult (intent-based, since Phase 66)
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
  startedDirty: boolean;
  skipGracePeriod: boolean;
  // ── Retry budget (Phase 67/70) ──────────────────────────────────────────
  retryBudget: number;           // Total retries allowed (default 2). Shared between hung and judge-fail.
  retryCount: number;            // How many retries consumed so far
  retryHint: string | null;      // Latest retry hint captured from judge/retry policy
  lastFailureFingerprint: string[] | null; // Latest structured failure fingerprint for same-failure detection
  hungCount: number;            // How many times this job hung (for observability)
  lastHungReason: string | null; // Last hung reason for same-error detection
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

export type DelegationIntent =
  | { type: 'quick'; description: string; flags?: ('full' | 'research')[] }
  | { type: 'init-project'; prdPath: string }
  | { type: 'new-milestone'; prdPath: string }
  | { type: 'plan-and-execute'; phaseNumber: number; prdPath?: string; isGapClosure?: boolean; addPhaseTitle?: string }
  | { type: 'execute-only'; phaseNumber: number }
  | { type: 'audit-milestone'; version: string }
  | { type: 'noop'; reason: string }

export interface DelegationResult {
  intent: DelegationIntent;
  reasoning: string;
}

// ── Session State Detection (Phase 67) ────────────────────────────────────

/**
 * Deterministic session state derived from the opencode DB part table.
 *
 * - 'done'           — step-finish with reason 'stop' or 'length'
 * - 'working'        — session is actively processing (no blocking state)
 * - 'hung-on-prompt' — question tool has no result (awaiting user input)
 * - 'hung-on-tool'   — non-question tool has no result (possibly stuck)
 * - 'crashed'        — PID is dead with no step-finish present
 */
export type SessionState = 'done' | 'working' | 'hung-on-prompt' | 'hung-on-tool' | 'crashed';

export interface SessionStateResult {
  state: SessionState;
  pendingToolName?: string;    // tool name when hung-on-prompt or hung-on-tool
  pendingToolContent?: string; // question content for debugging (truncated)
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

/** Why a step exists — tracks provenance for the append-forward model. */
export type StepSource = 'delegation' | 'judge:gaps' | 'judge:hung' | 'judge:failed' | 'operator';

/** Maximum total steps per job — prevents infinite append loops. */
export const MAX_STEPS_PER_JOB = 10;

/** Maximum judge-driven continuation cycles (gaps/failed) per job — prevents infinite replan loops. */
export const MAX_CONTINUATION_CYCLES = 2;

export interface JobStep {
  id: number;                     // auto-increment
  jobId: string;                  // FK to jobs.id
  stepIndex: number;              // 0-based step position
  command: string;                // e.g. "execute-phase", "plan-phase", "quick"
  args: string;                   // e.g. "3 --auto"
  source: StepSource;             // why this step exists (delegation, judge:gaps, etc.)
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  sessionId: string | null;       // opencode session ID (if found)
  sessionTitle: string | null;    // opencode session title
  reason: string | null;          // human-readable reason (e.g. "judge found 3 gaps")
  startedAt: string | null;       // ISO 8601 — nullable (pending steps haven't started)
  completedAt: string | null;
  error: string | null;           // failure reason if status=failed
  durationMs: number | null;
  // Legacy fields kept for backward compat during transition
  verdictSource: string | null;   // e.g. "semantic-check", null for non-phase commands
  verdictReason: string | null;   // reason for the verdict
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
  defaultCategories: string[] | null;  // project-level default skill categories
}

export interface ProjectWithStats {
  path: string;
  owner: string | null;
  status: ProjectStatus;
  blockedReason: string | null;
  blockedAt: string | null;
  defaultCategories: string[] | null;
  activeJobCount: number;    // running + pending
  completedJobCount: number;
  failedJobCount: number;
}

// ── Skills System ──────────────────────────────────────────────────────────

/** A single installed skill entry in the manifest. */
export interface SkillEntry {
  name: string;        // skill identifier (matches --skill flag value)
  description: string; // from manual entry or empty string
  categories: string[]; // user-assigned tags (empty = universal skill)
  repo: string;        // e.g. 'https://github.com/anthropics/skills'
  skill: string;       // e.g. 'frontend-design' (the --skill flag)
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

// ── Compact DTO shapes for web UI / TUI query backbone ────────────────────

/**
 * Root return type of getJobDetail() — compact snapshot of a job
 * with summary cards for sessions, steps, and recent activity.
 */
export interface JobDetailSnapshot {
  job: {
    id: string;
    project: string;
    description: string;
    scope: JobScope;
    status: JobStatus;
    verdict: string | null;
    confidence: number | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    currentStep: number;
    modelProfile: ModelProfile;
    providerMode: string;
    error: string | null;
    observedModels: string[];
    gitBaseCommit: string | null;
    gitHeadCommit: string | null;
    startedDirty: boolean;
  };
  steps: JobStepSummary[];
  rootSessions: SessionSummary[];
  subagents: SessionSummary[];
  activityPreview: ActivityPreviewItem[];
  cursor: string;
}

/** Compact step timeline entry. */
export interface JobStepSummary {
  stepIndex: number;
  command: string;
  args: string;
  status: string;
  source: string;              // 'delegation' | 'judge:gaps' | etc.
  reason: string | null;       // why this step exists
  error: string | null;        // failure reason
  sessionId: string | null;
  durationMs: number | null;
  verdictReason: string | null;
}

/**
 * Compact session card — used for root sessions AND subagent cards.
 * Deliberately non-recursive: children are summary counts, not inline transcripts.
 */
export interface SessionSummary {
  sessionId: string;
  title: string;
  role: 'root' | 'subagent';
  status: 'active' | 'done' | 'unknown';
  parentSessionId: string | null;
  startedAt: number;
  updatedAt: number;
  durationMs: number | null;
  latestMessagePreview: string | null;
  messageCount: number;
  childCount: number;
  tokenTotal: number;
  models: string[];
}

/** Compact activity snippet for the main scroll pane. */
export interface ActivityPreviewItem {
  sessionId: string;
  partId: string;
  type: 'text' | 'tool' | 'patch';
  role: string;
  createdAt: number;
  preview: string;
  tool?: string;
  toolInput?: string;
}

/** Paginated session activity response. */
export interface SessionActivityPage {
  parts: SessionPart[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Options for getSessionActivity(). */
export interface SessionActivityOptions {
  cursor?: string;
  limit?: number;
  includeToolDetails?: boolean;
}

/** Incremental update delta for job detail polling. */
export interface JobDetailEvent {
  type: 'job-update' | 'step-update' | 'session-update' | 'activity-new';
  timestamp: number;
  data: Record<string, unknown>;
}

/** Return type of getJobDetailEvents(). */
export interface JobDetailEventsResponse {
  events: JobDetailEvent[];
  cursor: string;
}

// ── Step-First Timeline Types (Phase 63) ──────────────────────────────────

export interface TimelineActivityItem {
  kind: 'activity';
  sessionId: string;
  partId: string;
  role: string;
  createdAt: number;
  text: string;
}

export interface TimelineToolSummaryItem {
  kind: 'tool-summary';
  sessionId: string;
  partId: string;
  createdAt: number;
  tool: string;
  toolInput?: string;
  toolStatus?: string;
  patchFiles?: string[];
}

/**
 * One lifecycle-aware branch object keyed by child session identity.
 *
 * The item is inserted at fork time (`createdAt`) and later updated in place
 * with latest status/progress/completion metadata.
 */
export interface BranchLifecycleItem {
  kind: 'fork-card';
  sessionId: string;       // child session ID
  parentSessionId: string;
  title: string;
  createdAt: number;       // child session start time = fork point
  updatedAt?: number;       // latest observed child activity/update timestamp
  completedAt?: number | null;
  status: 'active' | 'done' | 'unknown';
  messageCount: number;
  tokenTotal: number;
  models: string[];
  latestMessagePreview: string | null;
  finalMessagePreview?: string | null;
  childCount: number;
  durationMs: number | null;
}

/** Discriminated union for step-grouped timeline items. */
export type StepTimelineItem =
  | TimelineActivityItem
  | TimelineToolSummaryItem
  | BranchLifecycleItem;

export interface StepTimelineGroup {
  stepIndex: number | null;
  command: string;
  status: string;
  source: string;               // 'delegation' | 'judge:gaps' | etc.
  sessionId: string | null;
  items: StepTimelineItem[];
  semanticLabel?: string;       // Pre-computed human-readable label (e.g., "Execution", "Judge", "Gap Closure")
  verdictReason?: string | null; // Populated for judge steps — the judge's verdict reason text
}

/** Grouped timeline payload for step-first rendering. */
export interface GroupedTimelinePage {
  groups: StepTimelineGroup[];
  /** @deprecated Transitional flat list; consumers should use groups. */
  items: StepTimelineItem[];
  hasMore: boolean;
  nextCursor: string | null;
  sessionCount: number;
  childCount: number;
}

// Legacy flat timeline exports kept temporarily for transitional callers.
// New consumers should use StepTimelineGroup + GroupedTimelinePage.

export type TimelineForkCardItem = BranchLifecycleItem;

export interface TimelineCompletionCardItem {
  kind: 'completion-card';
  sessionId: string;
  title: string;
  createdAt: number;       // completion time
  status: 'done';
  durationMs: number | null;
  tokenTotal: number;
  latestMessagePreview: string | null;
}

/** @deprecated Use StepTimelineItem for grouped timeline consumers. */
export type TimelineItem = StepTimelineItem | TimelineCompletionCardItem;

/** @deprecated Use GroupedTimelinePage for grouped timeline consumers. */
export interface TimelinePage {
  items: TimelineItem[];
  hasMore: boolean;
  nextCursor: string | null;
  sessionCount: number;
  childCount: number;
}
