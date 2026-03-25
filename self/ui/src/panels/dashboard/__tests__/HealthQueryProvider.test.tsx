// @vitest-environment jsdom

import React from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HealthQueryProvider, useHealthQueries } from '../hooks/HealthQueryProvider'
import type { HealthFetchers } from '../hooks/HealthQueryProvider'

const mockFetchers: HealthFetchers = {
  fetchSystemStatus: vi.fn(),
  fetchProviderHealth: vi.fn(),
  fetchAgentStatus: vi.fn(),
}

describe('HealthQueryProvider', () => {
  // --- Tier 1: Contract ---

  it('returns HealthFetchers when provider is mounted', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HealthQueryProvider fetchers={mockFetchers}>{children}</HealthQueryProvider>
    )

    const { result } = renderHook(() => useHealthQueries(), { wrapper })

    expect(result.current).toHaveProperty('fetchSystemStatus')
    expect(result.current).toHaveProperty('fetchProviderHealth')
    expect(result.current).toHaveProperty('fetchAgentStatus')
    expect(typeof result.current.fetchSystemStatus).toBe('function')
    expect(typeof result.current.fetchProviderHealth).toBe('function')
    expect(typeof result.current.fetchAgentStatus).toBe('function')
  })

  // --- Tier 2: Behavior ---

  it('throws descriptive error when provider is not mounted', () => {
    expect(() => {
      renderHook(() => useHealthQueries())
    }).toThrow('useHealthQueries must be used within a <HealthQueryProvider>')
  })

  it('passes fetcher functions through to consumer hooks', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HealthQueryProvider fetchers={mockFetchers}>{children}</HealthQueryProvider>
    )

    const { result } = renderHook(() => useHealthQueries(), { wrapper })

    expect(result.current.fetchSystemStatus).toBe(mockFetchers.fetchSystemStatus)
    expect(result.current.fetchProviderHealth).toBe(mockFetchers.fetchProviderHealth)
    expect(result.current.fetchAgentStatus).toBe(mockFetchers.fetchAgentStatus)
  })
})
