// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BudgetExceededBanner } from '../BudgetExceededBanner'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockSetBudgetMutate = vi.fn()
const mockControlMutate = vi.fn()
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
  },
  useEventSubscription: (opts: any) => {
    mockEventSubscriptions.push(opts)
  },
}))

function simulateBudgetExceeded() {
  const sub = mockEventSubscriptions.find(
    (s) => s.channels.includes('cost:budget-exceeded'),
  )!
  act(() => {
    sub.onEvent('cost:budget-exceeded', {
      projectId: 'project-1',
      utilizationPercent: 120,
      currentSpendUsd: 24.00,
      budgetCeilingUsd: 20.00,
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEventSubscriptions = []
})

describe('BudgetExceededBanner', () => {
  it('is not visible when no budget-exceeded event received', () => {
    render(<BudgetExceededBanner />)
    expect(screen.queryByTestId('budget-exceeded-banner')).toBeNull()
  })

  it('renders on cost:budget-exceeded SSE event with interpolated content', () => {
    render(<BudgetExceededBanner />)

    expect(mockEventSubscriptions.find(
      (s) => s.channels.includes('cost:budget-exceeded'),
    )).toBeTruthy()

    simulateBudgetExceeded()

    expect(screen.getByTestId('budget-exceeded-banner')).toBeTruthy()
    expect(screen.getByText(/\$24\.00/)).toBeTruthy()
    expect(screen.getByText(/\$20\.00/)).toBeTruthy()
  })

  it('banner is non-dismissible (no close button)', () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

    expect(screen.queryByLabelText('Dismiss')).toBeNull()
    expect(screen.queryByLabelText('Close')).toBeNull()
  })

  it('"Increase Budget" button triggers setBudgetPolicy mutation', () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

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

  it('"Resume" button triggers requestProjectControl mutation with resume_project action', () => {
    render(<BudgetExceededBanner />)
    simulateBudgetExceeded()

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
