/**
 * Webhook (HTTP POST) notification backend.
 *
 * Sends job completion data as JSON to an arbitrary URL.
 * Uses native fetch() — no new dependencies.
 */
import type { NotifyBackend, NotifyResult, NotifyRoute, DetectResult } from './types.js';

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m ${seconds % 60}s`;
}

export const webhookBackend: NotifyBackend = {
  kind: 'webhook',
  displayName: 'Webhook (HTTP POST)',

  async deliver(
    route: NotifyRoute,
    prompt: string,
    job: {
      id: string;
      project: string;
      status: string;
      description: string;
      startedAt: string | null;
      completedAt: string | null;
      error: string | null;
    },
  ): Promise<NotifyResult> {
    if (route.kind !== 'webhook') {
      return { ok: false, error: 'wrong backend kind' };
    }

    const payload = {
      jobId: job.id,
      project: job.project,
      status: job.status,
      description: job.description,
      duration: formatDuration(job.startedAt, job.completedAt),
      error: job.error ?? null,
      prompt,
      timestamp: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(route.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...route.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `Webhook returned ${response.status} ${response.statusText}`,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, error: `Webhook request failed: ${err.message}` };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async detect(): Promise<DetectResult> {
    return 'available'; // Always available — no external binary needed
  },

  validateConfig(): string | null {
    return null; // Webhook URLs are per-job or per-project, not global
  },
};
