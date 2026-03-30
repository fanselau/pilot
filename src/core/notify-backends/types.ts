/**
 * Shared types for the modular notification backend system.
 *
 * NotifyBackend is the interface every backend implements.
 * NotifyRoute is a discriminated union on `kind` for routing delivery.
 */

export type NotifyBackendKind = 'kimaki' | 'openclaw-agent-deliver' | 'webhook' | 'telegram';

export type DetectResult = 'detected' | 'not-found' | 'available' | 'not-configured';

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export type NotifyRoute =
  | { kind: 'kimaki'; sessionId?: string; channelId?: string }
  | { kind: 'openclaw-agent-deliver'; agentId: string; channel: string; to: string; accountId?: string }
  | { kind: 'webhook'; url: string; headers?: Record<string, string> }
  | { kind: 'telegram'; chatId: string };

export interface NotifyBackend {
  kind: NotifyBackendKind;
  displayName: string;
  deliver(
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
  ): Promise<NotifyResult>;
  detect(): Promise<DetectResult>;
  validateConfig(): string | null;
}
