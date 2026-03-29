// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TokenUsageWidget } from '../widgets/TokenUsageWidget'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('@nous/transport', () => ({
  trpc: {
    inference: {
      getTokenUsageSummary: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
      getProviderBreakdown: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
    },
  },
}))

import { trpc } from '@nous/transport'

const mockUsageData = {
  today: { inputTokens: 5000, outputTokens: 7450, callCount: 12, windowStart: '2026-03-28T00:00:00Z' },
  week: { inputTokens: 40000, outputTokens: 44200, callCount: 85, windowStart: '2026-03-22T00:00:00Z' },
  month: { inputTokens: 150000, outputTokens: 162800, callCount: 340, windowStart: '2026-03-01T00:00:00Z' },
}

const mockProviderData = [
  { providerId: 'anthropic', inputTokens: 30000, outputTokens: 35000, callCount: 150 },
  { providerId: 'openai', inputTokens: 20000, outputTokens: 25000, callCount: 100 },
]

const dockviewProps = {} as IDockviewPanelProps

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TokenUsageWidget', () => {
  it('renders loading skeleton when usage query is pending', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)
    expect(screen.getByTestId('skeleton-today')).toBeTruthy()
    expect(screen.getByTestId('skeleton-week')).toBeTruthy()
    expect(screen.getByTestId('skeleton-month')).toBeTruthy()
  })

  it('renders usage rows with token counts and call counts when data is available', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: mockUsageData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: mockProviderData,
      isLoading: false,
      error: null,
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)

    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('This week')).toBeTruthy()
    expect(screen.getByText('This month')).toBeTruthy()

    // 5000 + 7450 = 12,450
    expect(screen.getByText('12,450 tokens')).toBeTruthy()
    expect(screen.getByText('12 calls')).toBeTruthy()

    // Provider section
    expect(screen.getByText('anthropic')).toBeTruthy()
    expect(screen.getByText('openai')).toBeTruthy()
  })

  it('renders error state when usage query fails', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Server unreachable'),
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)
    expect(screen.getByText(/Failed to load token usage: Server unreachable/)).toBeTruthy()
  })

  it('renders error state when provider query fails', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: mockUsageData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Timeout'),
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)
    expect(screen.getByText(/Failed to load provider data: Timeout/)).toBeTruthy()
  })

  it('renders empty provider placeholder when breakdown is empty', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: mockUsageData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)
    expect(screen.getByText('No provider activity')).toBeTruthy()
  })

  it('renders zero token counts as "0" not blank', () => {
    vi.mocked(trpc.inference.getTokenUsageSummary.useQuery).mockReturnValue({
      data: {
        today: { inputTokens: 0, outputTokens: 0, callCount: 0, windowStart: '2026-03-28T00:00:00Z' },
        week: { inputTokens: 0, outputTokens: 0, callCount: 0, windowStart: '2026-03-22T00:00:00Z' },
        month: { inputTokens: 0, outputTokens: 0, callCount: 0, windowStart: '2026-03-01T00:00:00Z' },
      },
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.inference.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<TokenUsageWidget {...dockviewProps} />)
    const tokenZeros = screen.getAllByText('0 tokens')
    expect(tokenZeros.length).toBe(3)
    const callZeros = screen.getAllByText('0 calls')
    expect(callZeros.length).toBe(3)
  })

  it('does not reference STUB_USAGE or STUB_BUDGETS', async () => {
    const module = await import('../widgets/TokenUsageWidget')
    const source = Object.keys(module).join(',')
    expect(source).not.toContain('STUB_USAGE')
    expect(source).not.toContain('STUB_BUDGETS')
  })
})
