/**
 * Generic polling scheduler for TUI data fetching.
 *
 * Creates a start/stop/adjustable interval poller.
 * Used to schedule periodic reads from pilot.db and opencode.db
 * at different cadences:
 *   - Queue data: 1s
 *   - Session enrichment: 2s
 *   - Active log messages: 500ms
 *
 * Pure utility — no UI or DB dependencies.
 */

export interface Poller {
  /** Start polling. Calls fn immediately, then every intervalMs. No-op if already started. */
  start(): void;
  /** Stop polling. No-op if not started. */
  stop(): void;
  /** Change the polling interval. If running, restarts the timer with the new interval. */
  setInterval(ms: number): void;
}

/**
 * Create a poller that calls `fn` at a fixed interval.
 *
 * @param fn - Synchronous function to call on each tick
 * @param intervalMs - Polling interval in milliseconds
 */
export function createPoller(fn: () => void, intervalMs: number): Poller {
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentInterval = intervalMs;

  return {
    start() {
      if (timer) return;
      fn(); // immediate first call
      timer = setInterval(fn, currentInterval);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    setInterval(ms: number) {
      currentInterval = ms;
      if (timer) {
        clearInterval(timer);
        timer = setInterval(fn, currentInterval);
      }
    },
  };
}
