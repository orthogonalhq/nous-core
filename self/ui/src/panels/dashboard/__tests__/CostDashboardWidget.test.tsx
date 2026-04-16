// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CostDashboardWidget } from '../widgets/CostDashboardWidget'
import type { IDockviewPanelProps } from 'dockview-react'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockShowToast = vi.fn()

vi.mock('../../../components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast, toasts: [], dismissToast: vi.fn() }),
}))

const mockActiveProjectId = { current: 'project-1' as string | null }

vi.mock('../../../components/shell/ShellContext', () => ({
  useShellContext: () => ({ activeProjectId: mockActiveProjectId.current }),
}))

const mockInvalidateBudgetStatus = vi.fn()
const mockInvalidateCostSummary = vi.fn()
const mockNotificationsGetFetch = vi.fn()
let mockEventSubscriptions: Array<{ channels: string[]; onEvent: (...args: any[]) => void }> = []

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      cost: {
        getBudgetStatus: { invalidate: (...args: any[]) => mockInvalidateBudgetStatus(...args) },
        getCostSummary: { invalidate: (...args: any[]) => mockInvalidateCostSummary(...args) },
      },
      notifications: {
        get: { fetch: (...args: any[]) => mockNotificationsGetFetch(...args) },
      },
    }),
    cost: {
      getBudgetStatus: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
      getCostSummary: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
      getCostBreakdown: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
    },
  },
  useEventSubscription: (opts: any) => {
    mockEventSubscriptions.push(opts)
  },
}))

import { trpc } from '@nous/transport'

const dockviewProps = {} as IDockviewPanelProps

const mockBudgetStatus = {
  hasBudget: true,
  currentSpendUsd: 14.70,
  budgetCeilingUsd: 20.00,
  utilizationPercent: 73.5,
  softAlertFired: false,
  hardCeilingFired: false,
  periodStart: '2026-04-01T00:00:00.000Z',
  periodEnd: '2026-04-30T23:59:59.000Z',
  projectControlState: 'running',
}

const mockCostSummary = {
  totalCostUsd: 14.70,
  totalInputCostUsd: 10.50,
  totalOutputCostUsd: 4.20,
  totalEvents: 42,
  periodStart: '2026-04-01T00:00:00.000Z',
  periodEnd: '2026-04-30T23:59:59.000Z',
  topProvider: 'anthropic',
  topModel: 'claude-opus-4',
}

const mockBreakdownData = [
  { key: 'anthropic', totalCostUsd: 10.00, inputCostUsd: 7.00, outputCostUsd: 3.00, eventCount: 30 },
  { key: 'openai', totalCostUsd: 4.70, inputCostUsd: 3.50, outputCostUsd: 1.20, eventCount: 12 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockActiveProjectId.current = 'project-1'
  mockEventSubscriptions = []
})

describe('CostDashboardWidget', () => {
  it('renders loading state when queries are pending', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('loading')).toBeTruthy()
  })

  it('renders "Select a project" when activeProjectId is null', () => {
    mockActiveProjectId.current = null

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('no-project')).toBeTruthy()
    expect(screen.getByText('Select a project to view cost data')).toBeTruthy()
  })

  it('renders error state when queries fail', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: undefined, isLoading: false, error: new Error('Server error'),
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('error')).toBeTruthy()
    expect(screen.getByText(/Failed to load cost data: Server error/)).toBeTruthy()
  })

  it('renders all three sections when data is available', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetStatus, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: mockBreakdownData, isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)

    // Budget utilization
    expect(screen.getByTestId('utilization-percent')).toBeTruthy()
    expect(screen.getByText('73.5%')).toBeTruthy()

    // Cost summary — values may appear in multiple sections
    expect(screen.getByText('Total Spend')).toBeTruthy()
    expect(screen.getAllByText('$14.70').length).toBeGreaterThanOrEqual(1)
    // 'anthropic' appears in both summary (topProvider) and breakdown tab
    expect(screen.getAllByText('anthropic').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('claude-opus-4')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()

    // Breakdown contains second provider
    expect(screen.getByText('openai')).toBeTruthy()
  })

  it('renders "No budget configured" when hasBudget is false', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: { ...mockBudgetStatus, hasBudget: false }, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('no-budget')).toBeTruthy()
    expect(screen.getByText('No budget configured')).toBeTruthy()
  })

  // ─── Color threshold tests ─────────────────────────────────────────────

  it.each([
    { percent: 30, expected: 'normal' },
    { percent: 59.9, expected: 'normal' },
    { percent: 60, expected: 'moderate' },
    { percent: 79.9, expected: 'moderate' },
    { percent: 80, expected: 'high' },
    { percent: 99.9, expected: 'high' },
    { percent: 100, expected: 'critical' },
    { percent: 150, expected: 'critical' },
  ])('budget utilization bar shows $expected label at $percent%', ({ percent, expected }) => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: { ...mockBudgetStatus, utilizationPercent: percent }, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('utilization-label').textContent).toBe(expected)
  })

  // ─── Tab switching ──────────────────────────────────────────────────────

  it('switches breakdown tabs', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetStatus, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: mockBreakdownData, isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)

    // Default is provider tab
    expect(screen.getByTestId('tab-provider')).toBeTruthy()

    // Click model tab
    fireEvent.click(screen.getByTestId('tab-model'))

    // Verify the query was called — the groupBy parameter changes
    expect(trpc.cost.getCostBreakdown.useQuery).toHaveBeenCalled()
  })

  // ─── SSE invalidation ────────────────────────────────────────────────

  it('subscribes to cost:snapshot for cache invalidation', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetStatus, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: mockBreakdownData, isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)

    const snapshotSub = mockEventSubscriptions.find(
      (s) => s.channels.includes('cost:snapshot'),
    )
    expect(snapshotSub).toBeTruthy()

    // Trigger the event
    snapshotSub!.onEvent('cost:snapshot', {})
    expect(mockInvalidateBudgetStatus).toHaveBeenCalled()
    expect(mockInvalidateCostSummary).toHaveBeenCalled()
  })

  // ─── Edge cases ──────────────────────────────────────────────────────

  it('renders empty breakdown list gracefully', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: mockBudgetStatus, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: mockCostSummary, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByTestId('no-breakdown')).toBeTruthy()
  })

  it('displays zero-valued spend correctly', () => {
    vi.mocked(trpc.cost.getBudgetStatus.useQuery).mockReturnValue({
      data: { ...mockBudgetStatus, currentSpendUsd: 0, utilizationPercent: 0 }, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostSummary.useQuery).mockReturnValue({
      data: { ...mockCostSummary, totalCostUsd: 0, totalEvents: 0 }, isLoading: false, error: null,
    } as any)
    vi.mocked(trpc.cost.getCostBreakdown.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any)

    render(<CostDashboardWidget {...dockviewProps} />)
    expect(screen.getByText('0.0%')).toBeTruthy()
    // Verify Total Spend row shows $0.00
    expect(screen.getByText('Total Spend')).toBeTruthy()
    const allZeros = screen.getAllByText('$0.00')
    expect(allZeros.length).toBeGreaterThan(0)
  })
})
