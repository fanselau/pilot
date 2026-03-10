import type { Job, OpenClawDeliverRoute, Project } from './types.js';

export type NotifyRouteErrorCode =
  | 'notify-route-missing'
  | 'notify-route-invalid'
  | 'notify-route-legacy-ambiguous';

export interface NotifyRouteError {
  code: NotifyRouteErrorCode;
  message: string;
}

export type NotifyRouteResult =
  | {
    ok: true;
    route: OpenClawDeliverRoute;
    source: 'job-route' | 'project-route' | 'legacy-callback' | 'legacy-owner';
  }
  | {
    ok: false;
    error: NotifyRouteError;
  };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asInvalidRouteResult(context: string): NotifyRouteResult {
  return {
    ok: false,
    error: {
      code: 'notify-route-invalid',
      message: `${context} is missing required fields (kind, agentId, channel, to).`,
    },
  };
}

function validateOpenClawDeliverRoute(value: unknown, context: string): NotifyRouteResult {
  if (!value || typeof value !== 'object') {
    return asInvalidRouteResult(context);
  }

  const route = value as Partial<OpenClawDeliverRoute>;

  if (route.kind !== 'openclaw-agent-deliver') {
    return {
      ok: false,
      error: {
        code: 'notify-route-invalid',
        message: `${context} has unsupported kind '${String(route.kind)}'. Expected 'openclaw-agent-deliver'.`,
      },
    };
  }

  if (!isNonEmptyString(route.agentId) || !isNonEmptyString(route.channel) || !isNonEmptyString(route.to)) {
    return asInvalidRouteResult(context);
  }

  if (route.accountId !== undefined && !isNonEmptyString(route.accountId)) {
    return {
      ok: false,
      error: {
        code: 'notify-route-invalid',
        message: `${context} accountId must be a non-empty string when provided.`,
      },
    };
  }

  return {
    ok: true,
    source: 'job-route',
    route: {
      kind: 'openclaw-agent-deliver',
      agentId: route.agentId,
      channel: route.channel,
      to: route.to,
      ...(route.accountId ? { accountId: route.accountId } : {}),
    },
  };
}

const LEGACY_SESSION_KEY = /^agent:([^:]+):([^:]+):(group|channel|thread|topic):([^:]+)$/;

function deriveRouteFromLegacyValue(value: string, source: 'legacy-callback' | 'legacy-owner'): NotifyRouteResult {
  const trimmed = value.trim();
  const match = trimmed.match(LEGACY_SESSION_KEY);

  if (!match) {
    return {
      ok: false,
      error: {
        code: 'notify-route-legacy-ambiguous',
        message: `Legacy notify value '${trimmed}' cannot be safely mapped to reply routing. Configure a structured OpenClaw route with channel and to.`,
      },
    };
  }

  const [, agentId, channel, lane, target] = match;
  return {
    ok: true,
    source,
    route: {
      kind: 'openclaw-agent-deliver',
      agentId,
      channel,
      to: `${channel}:${target}`,
      ...(lane === 'channel' ? { accountId: agentId } : {}),
    },
  };
}

function resolveNotifyRoute(job: Job, project: Project | null): NotifyRouteResult {
  if (job.notifyRoute !== null) {
    const validated = validateOpenClawDeliverRoute(job.notifyRoute, 'job notifyRoute');
    if (!validated.ok) return validated;
    return { ...validated, source: 'job-route' };
  }

  if (project?.notifyOpenClawRoute !== null && project?.notifyOpenClawRoute !== undefined) {
    const validated = validateOpenClawDeliverRoute(project.notifyOpenClawRoute, 'project notifyOpenClawRoute');
    if (!validated.ok) return validated;
    return { ...validated, source: 'project-route' };
  }

  if (isNonEmptyString(job.callbackSessionKey)) {
    return deriveRouteFromLegacyValue(job.callbackSessionKey, 'legacy-callback');
  }

  if (isNonEmptyString(project?.owner)) {
    return deriveRouteFromLegacyValue(project.owner, 'legacy-owner');
  }

  return {
    ok: false,
    error: {
      code: 'notify-route-missing',
      message: 'No structured OpenClaw notify route is configured. Set a project route or queue a job with a notify route snapshot.',
    },
  };
}

export { resolveNotifyRoute, deriveRouteFromLegacyValue, validateOpenClawDeliverRoute };
