/**
 * Server functions wrapping the compact query backbone.
 *
 * These run ONLY on the server (Node.js) — they have access to
 * better-sqlite3, pilot.db, and the opencode DB. TanStack Start's
 * compiler enforces the server/client boundary.
 */

import { createServerFn } from '@tanstack/react-start'
import {
  getJobDetail,
  getSessionActivity,
  getSessionChildSummaries,
  getJobDetailEvents,
  getJobTimeline,
  getFullJobTimeline,
  getProjectsWithStats,
  getProjectDetail,
  getProjectJobs,
  getFullSessionPart,
  retryJobAction,
  cancelJobAction,
  forceQuitJobAction,
  unblockProjectAction,
  blockProjectAction,
} from '@pilot/core/job-detail-query.js'
import type { GroupedTimelinePage, ProjectWithStats } from '@pilot/core/types.js'
import { getQueue, getRecent, getJob } from '@pilot/core/db.js'
import { getConfig, getConfigSource, getConfigFileDefaults, _resetConfigCache } from '@pilot/core/config.js'
import { buildJobObservability } from '@pilot/core/job-observability.js'
import type { ConfigFileSchema, ConfigSource, ModelEntry, ModelProfile, SkillEntry } from '@pilot/core/types.js'
import { AGENT_MODELS } from '@pilot/core/models.js'
import { getProviderModes, setModelEntry, getAllEntriesForMode } from '@pilot/core/model-store.js'
import { listSkills, registerSkill, unregisterSkill, tagSkill, PREDEFINED_CATEGORIES, CATEGORY_INFO } from '@pilot/core/skills.js'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── Grace Config ─────────────────────────────────────────────────────────

export const getGraceConfigFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const config = getConfig()
    return { queueGraceSeconds: config.queueGraceSeconds }
  },
)

// ── Jobs List ────────────────────────────────────────────────────────────

export const getJobsListFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const queue = getQueue()
    const recent = getRecent(20)
    const active = queue.filter((j) => j.status === 'running')
    const queued = queue.filter((j) => j.status === 'pending')
    return { active, queued, recent }
  },
)

// ── Jobs Activity Preview (batch) ────────────────────────────────────────

export const getJobsActivityPreviewFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string[]) => d)
  .handler(async ({ data: jobIds }) => {
    const result: Record<string, { latestActivity: string | null; activityCount: number; stepCount: number }> = {}
    for (const jobId of jobIds) {
      const detail = getJobDetail(jobId)
      if (!detail) {
        result[jobId] = { latestActivity: null, activityCount: 0, stepCount: 0 }
        continue
      }
      const lastPreview = detail.activityPreview.length > 0
        ? detail.activityPreview[detail.activityPreview.length - 1]
        : null
      result[jobId] = {
        latestActivity: lastPreview?.preview ?? null,
        activityCount: detail.activityPreview.length,
        stepCount: detail.steps.length,
      }
    }
    return result
  })

// ── Job Detail ───────────────────────────────────────────────────────────

export const getJobDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: jobId }) => {
    return getJobDetail(jobId)
  })

// ── Session Activity ─────────────────────────────────────────────────────

export const getSessionActivityFn = createServerFn({ method: 'GET' })
  .inputValidator(
    (d: { sessionId: string; cursor?: string; limit?: number; includeToolDetails?: boolean }) => d,
  )
  .handler(async ({ data }) => {
    return getSessionActivity(data.sessionId, {
      cursor: data.cursor,
      limit: data.limit,
      includeToolDetails: data.includeToolDetails,
    })
  })

// ── Session Children ─────────────────────────────────────────────────────

export const getSessionChildrenFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: sessionId }) => {
    return getSessionChildSummaries(sessionId)
  })

// ── Job Detail Events (incremental updates) ──────────────────────────────

export const getJobDetailEventsFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { jobId: string; cursor: string }) => d)
  .handler(async ({ data }) => {
    const result = getJobDetailEvents(data.jobId, data.cursor)
    // Cast to satisfy TanStack Start's serialization constraint
    // (Record<string, unknown> → Record<string, {}>)
    return result as {
      events: Array<{
        type: 'job-update' | 'step-update' | 'session-update' | 'activity-new'
        timestamp: number
        data: Record<string, {}>
      }>
      cursor: string
    }
  })

// ── Job Timeline (step-grouped stream) ───────────────────────────────────

export const getJobTimelineFn = createServerFn({ method: 'GET' })
  .inputValidator(
    (d: { jobId: string; cursor?: string; limit?: number }) => d,
  )
  .handler(async ({ data }): Promise<GroupedTimelinePage | null> => {
    return getJobTimeline(data.jobId, {
      cursor: data.cursor,
      limit: data.limit,
    })
  })

// ── Full Job Timeline (unpaginated) ──────────────────────────────────────

export const getFullJobTimelineFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: jobId }) => getFullJobTimeline(jobId))

// ── Projects List ────────────────────────────────────────────────────────

export const getProjectsListFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProjectWithStats[]> => {
    return getProjectsWithStats()
  },
)

// ── Full Message Part (untruncated content) ───────────────────────────────

export const getFullMessageFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { sessionId: string; partId: string }) => d)
  .handler(async ({ data }) => getFullSessionPart(data.sessionId, data.partId))

// ── Mutation: Retry Job ──────────────────────────────────────────────────

export const retryJobFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data }) => {
    try {
      retryJobAction(data.jobId)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

// ── Mutation: Cancel Job ─────────────────────────────────────────────────

export const cancelJobFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data }) => {
    try {
      cancelJobAction(data.jobId)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

// ── Mutation: Force Quit Job ─────────────────────────────────────────────

export const forceQuitJobFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data }) => {
    try {
      forceQuitJobAction(data.jobId, 'Force quit via web UI')
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

// ── Mutation: Unblock Project ────────────────────────────────────────────

export const unblockProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { projectPath: string }) => d)
  .handler(async ({ data }) => {
    try {
      unblockProjectAction(data.projectPath)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

// ── Mutation: Block Project ──────────────────────────────────────────────

export const blockProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { projectPath: string; reason: string }) => d)
  .handler(async ({ data }) => {
    try {
      blockProjectAction(data.projectPath, data.reason)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

// ── Project Detail ───────────────────────────────────────────────────────

export const getProjectDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: projectPath }) => getProjectDetail(projectPath))

// ── Project Jobs ─────────────────────────────────────────────────────────

export const getProjectJobsFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { projectPath: string; limit?: number }) => d)
  .handler(async ({ data }) => getProjectJobs(data.projectPath, data.limit))

// ── Job Observability ────────────────────────────────────────────────────

export const getJobObservabilityFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: jobId }) => {
    const job = getJob(jobId)
    if (!job) return null
    return buildJobObservability(job)
  })

// ── Job Verdict History ──────────────────────────────────────────────────

export const getJobVerdictHistoryFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: jobId }) => {
    const detail = getJobDetail(jobId)
    if (!detail) return []
    return detail.steps
      .filter(s => s.source.startsWith('judge') && s.verdictReason)
      .map((s, i) => ({
        stepIndex: s.stepIndex,
        iteration: i + 1,
        verdict: s.status,
        verdictReason: s.verdictReason,
        confidence: null as number | null,
      }))
  })

// ── Session State ────────────────────────────────────────────────────────

export const getSessionStateFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: sessionId }) => {
    const { getSessionState } = await import('@pilot/core/opencode-db.js')
    return getSessionState(sessionId)
  })

// ── Job Verdict (parsed) ─────────────────────────────────────────────────

export const getJobVerdictFn = createServerFn({ method: 'GET' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: jobId }) => {
    const detail = getJobDetail(jobId)
    if (!detail) return null
    const raw = (detail.job as any).judgeVerdict
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  })

// ── Settings: Full Config ─────────────────────────────────────────────────

const ENV_VAR_NAMES: Record<string, string> = {
  projectDir: 'PILOT_PROJECT_DIR',
  maxParallel: 'PILOT_MAX_PARALLEL',
  queueGraceSeconds: 'PILOT_QUEUE_GRACE_SECONDS',
  sessionMemoryMaxMb: 'PILOT_SESSION_MEMORY_MAX_MB',
  reservedMemoryMb: 'PILOT_RESERVED_MEMORY_MB',
  memoryKillThresholdMb: 'PILOT_MEMORY_KILL_THRESHOLD_MB',
  logLevel: 'PILOT_LOG_LEVEL',
  noColor: 'NO_COLOR',
  telegramBotToken: 'PILOT_TELEGRAM_BOT_TOKEN',
  telegramChatId: 'PILOT_TELEGRAM_CHAT_ID',
  openclawHooksUrl: 'PILOT_OPENCLAW_HOOKS_URL',
  openclawHooksToken: 'PILOT_OPENCLAW_HOOKS_TOKEN',
  defaultNotifySessionKey: 'PILOT_DEFAULT_NOTIFY',
}

export const getFullConfigFn = createServerFn({ method: 'GET' }).handler(async () => {
  const config = getConfig()
  const defaults = getConfigFileDefaults()

  const configKeys = Object.keys(ENV_VAR_NAMES)
  const configWithSources: Record<string, { value: string | number | boolean | null; source: ConfigSource; envVar?: string }> = {}

  for (const key of configKeys) {
    const source = getConfigSource(key)
    const rawValue = (config as unknown as Record<string, unknown>)[key]
    const entry: { value: string | number | boolean | null; source: ConfigSource; envVar?: string } = {
      value: rawValue as string | number | boolean | null,
      source,
    }
    if (source === 'env') {
      entry.envVar = ENV_VAR_NAMES[key]
    }
    configWithSources[key] = entry
  }

  return {
    config: configWithSources,
    defaults,
  }
})

// ── Settings: Update Config ───────────────────────────────────────────────

export const updateConfigFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { updates: Partial<ConfigFileSchema> }) => d)
  .handler(async ({ data }) => {
    const configPath = process.env.PILOT_CONFIG_FILE || path.join(os.homedir(), '.pilot', 'config.json')
    const configDir = path.dirname(configPath)

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    // Read existing config
    let existing: Partial<ConfigFileSchema> = {}
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8')
        existing = JSON.parse(raw) as Partial<ConfigFileSchema>
      } catch {
        existing = {}
      }
    }

    // Deep-merge updates
    const merged: Partial<ConfigFileSchema> = { ...existing }
    const updates = data.updates

    if (updates.projectDir !== undefined) merged.projectDir = updates.projectDir
    if (updates.runner !== undefined) {
      merged.runner = { ...merged.runner, ...updates.runner }
    }
    if (updates.memory !== undefined) {
      merged.memory = { ...merged.memory, ...updates.memory }
    }
    if (updates.defaults !== undefined) {
      merged.defaults = { ...merged.defaults, ...updates.defaults }
    }
    if (updates.notifications !== undefined) {
      merged.notifications = { ...merged.notifications, ...updates.notifications }
    }
    if (updates.logging !== undefined) {
      merged.logging = { ...merged.logging, ...updates.logging }
    }

    // Validate types/ranges
    const errors: Record<string, string> = {}

    if (merged.runner?.maxParallel !== undefined && merged.runner.maxParallel !== null) {
      if (typeof merged.runner.maxParallel !== 'number' || merged.runner.maxParallel < 1) {
        errors['runner.maxParallel'] = 'Must be a number >= 1'
      }
    }
    if (merged.runner?.queueGraceSeconds !== undefined) {
      if (typeof merged.runner.queueGraceSeconds !== 'number' || merged.runner.queueGraceSeconds < 0) {
        errors['runner.queueGraceSeconds'] = 'Must be a number >= 0'
      }
    }
    if (merged.memory?.sessionMaxMb !== undefined) {
      if (typeof merged.memory.sessionMaxMb !== 'number' || merged.memory.sessionMaxMb < 1) {
        errors['memory.sessionMaxMb'] = 'Must be a number >= 1'
      }
    }
    if (merged.memory?.reservedMb !== undefined) {
      if (typeof merged.memory.reservedMb !== 'number' || merged.memory.reservedMb < 1) {
        errors['memory.reservedMb'] = 'Must be a number >= 1'
      }
    }
    if (merged.memory?.killThresholdMb !== undefined) {
      if (typeof merged.memory.killThresholdMb !== 'number' || merged.memory.killThresholdMb < 1) {
        errors['memory.killThresholdMb'] = 'Must be a number >= 1'
      }
    }
    if (merged.logging?.level !== undefined) {
      if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(merged.logging.level as string)) {
        errors['logging.level'] = 'Must be one of DEBUG, INFO, WARN, ERROR'
      }
    }
    if (merged.defaults?.modelProfile !== undefined) {
      if (!['quality', 'balanced', 'budget'].includes(merged.defaults.modelProfile as string)) {
        errors['defaults.modelProfile'] = 'Must be one of quality, balanced, budget'
      }
    }
    if (merged.defaults?.scope !== undefined && merged.defaults.scope !== null) {
      if (!['quick', 'phase', 'debug', 'fast'].includes(merged.defaults.scope as string)) {
        errors['defaults.scope'] = 'Must be one of quick, phase, debug, fast'
      }
    }

    if (Object.keys(errors).length > 0) {
      return { ok: false, errors }
    }

    // Write atomically: write to .tmp then rename
    const tmpPath = configPath + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8')
    renameSync(tmpPath, configPath)

    // Clear cached config so next getConfig() reads fresh values
    _resetConfigCache()

    return { ok: true }
  })

// ── Settings: Model Table ─────────────────────────────────────────────────

export const getModelTableFn = createServerFn({ method: 'GET' }).handler(async () => {
  const providerModeRows = getProviderModes()
  const allModes = providerModeRows.map(r => r.name)
  const customModes = providerModeRows.filter(r => r.is_builtin === 0).map(r => r.name)

  // Build table: mode → agent → profile → ModelEntry
  const table: Record<string, Record<string, Record<string, ModelEntry>>> = {}

  const profiles: ModelProfile[] = ['quality', 'balanced', 'budget']

  for (const mode of allModes) {
    table[mode] = {}

    // Get all entries for this mode from DB
    const dbEntries = getAllEntriesForMode(mode)
    const dbMap: Record<string, Record<string, ModelEntry>> = {}
    for (const row of dbEntries) {
      if (!dbMap[row.agent_or_scope]) dbMap[row.agent_or_scope] = {}
      dbMap[row.agent_or_scope][row.profile] = { model: row.model, variant: row.variant ?? undefined }
    }

    // Get all agent/scope keys from AGENT_MODELS for built-in modes, or DB for custom
    const agentKeysSet = new Set<string>()

    // Add all agents from AGENT_MODELS built-in modes
    for (const builtinMode of Object.keys(AGENT_MODELS)) {
      for (const agentKey of Object.keys((AGENT_MODELS as Record<string, Record<string, unknown>>)[builtinMode])) {
        agentKeysSet.add(agentKey)
      }
    }

    // Also add any extra keys from DB (custom modes may have additional)
    for (const key of Object.keys(dbMap)) {
      agentKeysSet.add(key)
    }

    for (const agentKey of agentKeysSet) {
      table[mode][agentKey] = {}
      for (const profile of profiles) {
        // DB takes priority
        const dbEntry = dbMap[agentKey]?.[profile]
        if (dbEntry) {
          table[mode][agentKey][profile] = dbEntry
          continue
        }
        // Fallback to AGENT_MODELS for built-in modes
        const builtinEntry = (AGENT_MODELS as Record<string, Record<string, Record<string, ModelEntry>>>)[mode]?.[agentKey]?.[profile]
        if (builtinEntry) {
          table[mode][agentKey][profile] = builtinEntry
        }
      }
    }
  }

  return { modes: allModes, customModes, table }
})

// ── Settings: Update Model Mapping ────────────────────────────────────────

export const updateModelMappingFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { providerMode: string; agent: string; profile: ModelProfile; model: string; variant?: string }) => d)
  .handler(async ({ data }) => {
    setModelEntry(data.providerMode, data.agent, data.profile, data.model, data.variant ?? null)
    return { ok: true }
  })

// ── Settings: Skills List ─────────────────────────────────────────────────

export const getSkillsListFn = createServerFn({ method: 'GET' }).handler(async () => {
  const skills = listSkills()
  return {
    skills,
    categories: PREDEFINED_CATEGORIES,
    categoryInfo: CATEGORY_INFO,
  }
})

// ── Settings: Install Skill ───────────────────────────────────────────────

export const installSkillFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { repo: string; skill: string; categories: string[] }) => d)
  .handler(async ({ data }) => {
    try {
      const skill = registerSkill(data.repo, data.skill, data.categories)
      return { ok: true, skill }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

// ── Settings: Remove Skill ────────────────────────────────────────────────

export const removeSkillFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const result = unregisterSkill(data.name)
    return { ok: true, removed: result.removed }
  })

// ── Settings: Update Skill Tags ───────────────────────────────────────────

export const updateSkillTagsFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { name: string; categories: string[] }) => d)
  .handler(async ({ data }) => {
    const skill = tagSkill(data.name, data.categories)
    return { ok: true, skill }
  })

// ── Settings: System Info ─────────────────────────────────────────────────

export const getSystemInfoFn = createServerFn({ method: 'GET' }).handler(async () => {
  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024))
  const totalRamGb = Math.round((totalRamMb / 1024) * 10) / 10
  return { totalRamMb, totalRamGb }
})
