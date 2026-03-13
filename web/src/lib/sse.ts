/**
 * SSE-style streaming hook for live job detail updates.
 *
 * Uses TanStack React Query's refetchInterval for polling-based
 * incremental updates. The cursor advances after each fetch,
 * so only new events since the last poll are returned.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJobDetailEventsFn } from './server-fns'

/**
 * Poll for incremental job detail events.
 *
 * Returns the accumulated events from the latest poll cycle and
 * the current cursor position. The cursor auto-advances as new
 * events arrive.
 *
 * @param jobId - The job to watch
 * @param initialCursor - Starting cursor (typically from getJobDetailFn response)
 * @param enabled - Whether polling is active (disable for completed jobs)
 * @param intervalMs - Polling interval in milliseconds (default: 3000)
 */
export function useJobDetailStream(
  jobId: string,
  initialCursor: string,
  enabled = true,
  intervalMs = 3000,
) {
  const [cursor, setCursor] = useState(initialCursor)

  // Reset cursor when jobId changes
  useEffect(() => {
    setCursor(initialCursor)
  }, [jobId, initialCursor])

  const { data, isLoading, error } = useQuery({
    queryKey: ['job-events', jobId, cursor],
    queryFn: () => getJobDetailEventsFn({ data: { jobId, cursor } }),
    refetchInterval: enabled ? intervalMs : false,
    enabled: enabled && !!jobId,
  })

  // Advance cursor when new data arrives
  useEffect(() => {
    if (data?.cursor && data.cursor !== cursor) {
      setCursor(data.cursor)
    }
  }, [data?.cursor, cursor])

  return {
    events: data?.events ?? [],
    cursor,
    isLoading,
    error,
  }
}
