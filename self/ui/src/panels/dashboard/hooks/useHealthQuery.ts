import { useState, useEffect, useRef, useCallback } from 'react'
import { HEALTH_POLL_INTERVAL_MS } from '../constants'

export type UseHealthQueryResult<T> = {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Generic polling hook for health data.
 *
 * Accepts a plain async fetcher and returns reactive query state with
 * configurable polling and an imperative `refetch` handle for
 * event-driven cache invalidation.
 *
 * - Executes an initial fetch on mount (when `enabled` is true).
 * - Polls at `pollIntervalMs` (default `HEALTH_POLL_INTERVAL_MS`).
 * - Deduplicates in-flight fetches via a ref guard.
 * - `pollIntervalMs <= 0` disables polling.
 */
export function useHealthQuery<T>(
  fetcher: () => Promise<T>,
  options?: { pollIntervalMs?: number; enabled?: boolean },
): UseHealthQueryResult<T> {
  const {
    pollIntervalMs = HEALTH_POLL_INTERVAL_MS,
    enabled = true,
  } = options ?? {}

  const [data, setData] = useState<T | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  // Ref guard: prevent overlapping fetches
  const inFlightRef = useRef(false)
  // Keep fetcher in a ref so polling/refetch always calls the latest
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const executeFetch = useCallback(() => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    fetcherRef
      .current()
      .then((result) => {
        setData(result)
        setError(null)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
        setIsLoading(false)
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    // Initial fetch
    executeFetch()

    // Polling
    if (pollIntervalMs > 0) {
      const id = setInterval(executeFetch, pollIntervalMs)
      return () => clearInterval(id)
    }
  }, [enabled, pollIntervalMs, executeFetch])

  const refetch = useCallback(() => {
    executeFetch()
  }, [executeFetch])

  return { data, isLoading, error, refetch }
}
