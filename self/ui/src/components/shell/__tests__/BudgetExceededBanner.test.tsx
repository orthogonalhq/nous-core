// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BudgetExceededBanner } from '../BudgetExceededBanner'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockSetBudgetMutate = vi.fn()
const mockControlMutate = vi.fn()
const mockGetFetch = vi.fn()
let mockEventSubscriptions: Array<{ channels: string[]; onEvent: (...args: any[]) => void }> = []

vi.mock('@nous/transport', () => ({
  trpc: {
    cost: {
      setBudgetPolicy: {
        useMutation: () => ({ mutate: mockSetBudgetMutate }),
      },
    },
    mao: {
      requestProjectControl: {
        useMutation: () => ({ mutate: mockControlMutate }),
      },
    },
    useUtils: () => ({
      notifications: {
        get: { fetch: mockGetFetch },
      },
    }),
  },
  useEventSubscription: (opts: any) => {
    mockEventSubscriptions.push(opts)
  },
}))

function simulateBudgetExceeded() {
  const sub = mockEventSubscriptions.find(
    (s) => s.channels.includes('notification:raised'),
  )!

  // Mock the fetch to return a budget-exceeded alert record
  mockGetFetch.mockResolvedValueOnce({
    id: 'notif-1',
    kind: 'alert',
    projectId: 'project-1',
    alert: {
      category: 'budget-exceeded',
      utilizationPercent: 120,
      currentSpendUsd: 24.00,
      budgetCeilingUsd: 20.00,
    },
  })

  act(() => {
    sub.onEvent('notification:raised', {
      kind: 'alert',
      id: 'notif-1',
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEventSubscriptions = []
})

describe('BudgetExceededBanner', () => {
  it('is not visible when no notification:raised event received', () => {
    render(<BudgetExceededBanner />)
    expect(screen.queryByTestId('budget-exceeded-banner')).toBeNull()
  })

  it('renders on notification:raised SSE event with kind alert and category budget-exceeded', async () => {
    render(<BudgetExceededBanner />)

    expect(mockEventSubscriptions.find(
      (s) => s.channels.includes('notification:raised'),
    )).toBeTruthy()

    simulateBudgetExceeded()

    await waitFor(() => {
      expect(screen.getByTestId('budget-exceeded-banner')).toBeTruthy()
    })
    expect(screen.getByText(/\$24\.00/)).toBeTruthy()
    expect(screen.getByText(/\$20\.00/)).toBeTruthy()
  })

  it('does not render for kind alert events with category budget-warning', async () => {
    render(<BudgetExceededBanner />)

    const sub = mockEventSubscriptions.find(
      (s) => s.channels.includes('notification:raised'),
    )!

    mockGetFetch.mockResolvedValueOnce({
      id: 'notif-2',
      kind: 'alert',
      projectId: 'project-1',
      alert: {
        category: 'budget-warning',
        utilizationPercent: 85,
        currentSpendUsd: 17.00,
        budgetCeilingUsd: 20.00,
      },
    })

    act(() => {
      sub.onEvent('notification:raised', { kind: 'alert', id: 'notif-2' })
    })

    // Wait a tick for the fetch to resolve
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('budget-exceeded-banner')).toBeNull()
  })

  it('banner is non-dismissible (no close button)', async () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

    await waitFor(() => {
      expect(screen.getByTestId('budget-exceeded-banner')).toBeTruthy()
    })

    expect(screen.queryByLabelText('Dismiss')).toBeNull()
    expect(screen.queryByLabelText('Close')).toBeNull()
  })

  it('"Increase Budget" button triggers setBudgetPolicy mutation', async () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

    await waitFor(() => {
      expect(screen.getByTestId('banner-increase-budget')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('banner-increase-budget'))
    expect(mockSetBudgetMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        policy: expect.objectContaining({
          hardCeilingUsd: 40.00,
        }),
      }),
    )
  })

  it('"Resume" button triggers requestProjectControl mutation with resume_project action', async () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

    await waitFor(() => {
      expect(screen.getByTestId('banner-resume')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('banner-resume'))
    expect(mockControlMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          project_id: 'project-1',
          action: 'resume_project',
          actor_type: 'operator',
        }),
      }),
    )
  })
})
