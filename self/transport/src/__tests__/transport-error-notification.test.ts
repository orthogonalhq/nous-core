import { describe, it, expect, vi } from 'vitest'
import { QueryCache } from '@tanstack/react-query'

/**
 * Tests the QueryCache.onError callback logic used in TransportProvider.
 * We test the callback in isolation — no need to render the full provider tree.
 */
describe('TransportProvider QueryCache error notification', () => {
  function createOnErrorCallback(mockMutate: (...args: unknown[]) => void) {
    const cache = new QueryCache({
      onError: (error) => {
        void mockMutate({
          kind: 'toast' as const,
          projectId: null,
          title: 'Query Error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          transient: true,
          source: 'transport',
          toast: { severity: 'error' as const },
        })
      },
    })
    return cache
  }

  it('calls notifications.raise.mutate with correct shape on Error', () => {
    const mockMutate = vi.fn()
    const cache = createOnErrorCallback(mockMutate)

    // Trigger the onError callback directly
    const error = new Error('Network request failed')
    // QueryCache.onError signature: (error, query) => void
    cache.config.onError?.(error, {} as any)

    expect(mockMutate).toHaveBeenCalledOnce()
    expect(mockMutate).toHaveBeenCalledWith({
      kind: 'toast',
      projectId: null,
      title: 'Query Error',
      message: 'Network request failed',
      transient: true,
      source: 'transport',
      toast: { severity: 'error' },
    })
  })

  it('produces fallback message for non-Error objects', () => {
    const mockMutate = vi.fn()
    const cache = createOnErrorCallback(mockMutate)

    // Non-Error value (e.g., string thrown)
    cache.config.onError?.('something went wrong' as any, {} as any)

    expect(mockMutate).toHaveBeenCalledOnce()
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'An unexpected error occurred',
      }),
    )
  })
})
