import type { Job, Project } from './types.js';
import type { NotifyRoute } from './notify-backends/types.js';

const LEGACY_SESSION_KEY = /^agent:([^:]+):([^:]+):(group|channel|thread|topic):([^:]+)$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Derive an openclaw NotifyRoute from a legacy string value
 * (e.g. callbackSessionKey or project.owner).
 * Returns null if the value cannot be parsed.
 */
function deriveRouteFromLegacyValue(value: string): NotifyRoute | null {
  const trimmed = value.trim();
  const match = trimmed.match(LEGACY_SESSION_KEY);

  if (!match) {
    process.stderr.write(
      `[notify-route] Legacy notify value '${trimmed}' cannot be safely mapped to reply routing.\n`,
    );
    return null;
  }

  const [, agentId, channel, lane, target] = match;
  return {
    kind: 'openclaw-agent-deliver',
    agentId,
    channel,
    to: `${channel}:${target}`,
    ...(lane === 'channel' ? { accountId: agentId } : {}),
  };
}

/**
 * Resolve notification routes for a job.
 *
 * Resolution priority:
 *   1. Job-level routes (job.notifyRoute) — if non-null and non-empty, return as-is
 *   2. Project-level routes (project.notifyRoutes) — if job has no routes, use project routes
 *   3. Legacy fallback — if callbackSessionKey set and no routes from 1-2, derive openclaw route
 *   4. Empty — return []
 */
function resolveNotifyRoutes(job: Job, project: Project | null): NotifyRoute[] {
  // 1. Job-level routes
  if (job.notifyRoute !== null && job.notifyRoute.length > 0) {
    return job.notifyRoute;
  }

  // 2. Project-level routes
  if (project?.notifyRoutes !== null && project?.notifyRoutes !== undefined && project.notifyRoutes.length > 0) {
    return project.notifyRoutes;
  }

  // 3. Legacy fallback via callbackSessionKey
  if (isNonEmptyString(job.callbackSessionKey)) {
    const route = deriveRouteFromLegacyValue(job.callbackSessionKey);
    if (route) return [route];
  }

  // 4. Empty
  return [];
}

export { resolveNotifyRoutes, deriveRouteFromLegacyValue };
