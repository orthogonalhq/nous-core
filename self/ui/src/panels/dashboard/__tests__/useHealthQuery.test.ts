// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useHealthQuery } from '../hooks/useHealthQuery'

describe('useHealthQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- Tier 1: Contract ---

  it('returns { data, isLoading, error, refetch } matching UseHealthQueryResult<T>', () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 })
    const { result } = renderHook(() => useHealthQuery(fetcher))

    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })

  // --- Tier 2: Behavior ---

  it('executes initial fetch on mount and transitions from isLoading to data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 'hello' })
    const { result } = renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()

    // Flush the resolved promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual({ value: 'hello' })
    expect(result.current.error).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('polls at the configured interval', async () => {
    const fetcher = vi.fn().mockResolvedValue({ tick: 1 })
    renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 1000 }))

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetcher).toHaveBeenCalledTimes(2)

    // Second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('refetch() triggers an immediate fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 })
    const { result } = renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isLoading).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.refetch()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('deduplicates in-flight fetches', async () => {
    let resolveFirst: ((v: { v: number }) => void) | null = null
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<{ v: number }>((resolve) => {
          resolveFirst = resolve
        }),
    )

    const { result } = renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    // Initial fetch is in-flight
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Try to refetch while first is still in-flight — should be deduplicated
    act(() => {
      result.current.refetch()
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Resolve the first fetch
    await act(async () => {
      resolveFirst!({ v: 1 })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.data).toEqual({ v: 1 })
  })

  it('sets error state when fetcher rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('Network failure')
    expect(result.current.data).toBeUndefined()
  })

  it('clears error state on successful fetch after error', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ recovered: true })

    const { result } = renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    // Wait for error
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.error).not.toBeNull()

    // Refetch succeeds
    await act(async () => {
      result.current.refetch()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual({ recovered: true })
  })

  it('skips initial fetch and polling when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 })
    const { result } = renderHook(() =>
      useHealthQuery(fetcher, { enabled: false }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('disables polling when pollIntervalMs is 0', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 })
    renderHook(() => useHealthQuery(fetcher, { pollIntervalMs: 0 }))

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Advance time — no more fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // --- Tier 3: Edge ---

  it('cleans up polling interval on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 })
    const { unmount } = renderHook(() =>
      useHealthQuery(fetcher, { pollIntervalMs: 1000 }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // No additional calls after unmount
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
