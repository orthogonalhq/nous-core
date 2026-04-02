// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CostBreakdownWidget } from '../widgets/CostBreakdownWidget'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('@nous/transport', () => ({
  trpc: {
    costGovernance: {
      getBudgetStatus: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
      getProviderBreakdown: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
    },
  },
}))

import { trpc } from '@nous/transport'

const mockBudgetData = {
  projectId: 'test-project',
  currentSpendDollars: 12.50,
  hardCeilingDollars: 50.00,
  softThresholdDollars: 40.00,
  percentUsed: 25,
  alertLevel: 'normal' as const,
  periodType: 'monthly' as const,
  periodStart: '2026-04-01T00:00:00Z',
  periodEnd: '2026-05-01T00:00:00Z',
  isPaused: false,
}

const mockBreakdownData = [
  {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    inputTokens: 50000,
    outputTokens: 30000,
    inputCostDollars: 0.15,
    outputCostDollars: 0.45,
    totalCostDollars: 0.60,
    callCount: 25,
  },
  {
    providerId: 'openai',
    modelId: 'gpt-4o',
    inputTokens: 20000,
    outputTokens: 15000,
    inputCostDollars: 0.05,
    outputCostDollars: 0.30,
    totalCostDollars: 0.35,
    callCount: 10,
  },
]

const dockviewProps = { params: { projectId: 'test-project' } } as unknown as IDockviewPanelProps

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CostBreakdownWidget', () => {
  it('renders loading skeleton when budget query is pending', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByTestId('budget-skeleton')).toBeTruthy()
    expect(screen.getByTestId('breakdown-skeleton')).toBeTruthy()
  })

  it('renders budget gauge and spend info when data is available', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: mockBreakdownData,
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)

    expect(screen.getByText(/\$12\.50/)).toBeTruthy()
    expect(screen.getByText(/\$50\.00/)).toBeTruthy()
    expect(screen.getByTestId('budget-gauge')).toBeTruthy()
    expect(screen.getByTestId('budget-alert-level')).toBeTruthy()
    expect(screen.getByText('Normal')).toBeTruthy()
  })

  it('renders warning state when soft threshold breached', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: { ...mockBudgetData, alertLevel: 'soft_threshold', percentUsed: 85 },
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByText('Warning')).toBeTruthy()
  })

  it('renders paused state when hard ceiling reached', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: { ...mockBudgetData, alertLevel: 'hard_ceiling', percentUsed: 100, isPaused: true },
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByText('Paused (ceiling reached)')).toBeTruthy()
  })

  it('renders no-budget placeholder when budget is null', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByTestId('no-budget')).toBeTruthy()
    expect(screen.getByText('No budget policy configured')).toBeTruthy()
  })

  it('renders provider breakdown table with cost data', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: mockBreakdownData,
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByText('anthropic')).toBeTruthy()
    expect(screen.getByText(/gpt-4o/)).toBeTruthy()
    expect(screen.getByText('$0.6000')).toBeTruthy()
    expect(screen.getByText('$0.3500')).toBeTruthy()
  })

  it('renders empty breakdown placeholder when no cost data', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetData,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByTestId('no-breakdown')).toBeTruthy()
    expect(screen.getByText('No cost data available')).toBeTruthy()
  })

  it('renders error state when budget query fails', () => {
    vi.mocked(trpc.costGovernance.getBudgetStatus.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as any)
    vi.mocked(trpc.costGovernance.getProviderBreakdown.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any)

    render(<CostBreakdownWidget {...dockviewProps} />)
    expect(screen.getByTestId('budget-error')).toBeTruthy()
    expect(screen.getByText(/Failed to load budget: Network error/)).toBeTruthy()
  })
})
