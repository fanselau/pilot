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
import { getQueue, getRecent } from '@pilot/core/db.js'
import { getConfig } from '@pilot/core/config.js'

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
