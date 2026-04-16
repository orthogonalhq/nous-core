// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ThoughtSummary } from '../ThoughtSummary'
import type { ExecutionTrace } from '@nous/shared'

// Mock @nous/transport trpc client
const mockUseQuery = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    traces: {
      get: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}))

function makeTrace(overrides?: Partial<ExecutionTrace>): ExecutionTrace {
  return {
    traceId: '00000000-0000-0000-0000-000000000001' as any,
    startedAt: '2026-03-28T00:00:00.000Z',
    turns: [
      {
        input: 'hello',
        output: 'world',
        modelCalls: [],
        pfcDecisions: [
          { approved: true, reason: 'passed', confidence: 1 },
          { approved: true, reason: 'passed', confidence: 0.9 },
          { approved: false, reason: 'denied', confidence: 0.3 },
        ],
        toolDecisions: [
          { toolName: 'echo', approved: true },
        ],
        memoryWrites: ['00000000-0000-0000-0000-000000000002' as any],
        memoryDenials: [],
        evidenceRefs: [],
        timestamp: '2026-03-28T00:00:01.000Z',
      },
    ],
    ...overrides,
  }
}

describe('ThoughtSummary', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  // Tier 1 -- Contract
  it('renders without crashing when given a valid traceId', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace(),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)
    expect(screen.getByTestId('thought-summary')).toBeTruthy()
  })

  it('renders nothing when traceId is empty string (graceful degradation)', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    })

    const { container } = render(<ThoughtSummary traceId="" />)
    expect(container.innerHTML).toBe('')
  })

  // Tier 2 -- Behavior
  it('displays correct counts from ExecutionTrace', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace(),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)

    const summary = screen.getByTestId('thought-summary')
    expect(summary.textContent).toContain('3 decisions')
    expect(summary.textContent).toContain('2 approved')
    expect(summary.textContent).toContain('1 denied')
    expect(summary.textContent).toContain('1 memory write')
  })

  it('click expands to show TraceDetail', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace(),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)

    expect(screen.queryByTestId('trace-detail')).toBeNull()

    fireEvent.click(screen.getByTestId('thought-summary'))

    expect(screen.getByTestId('trace-detail')).toBeTruthy()
  })

  it('shows loading state while trace is being fetched', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)
    expect(screen.getByTestId('thought-summary-loading')).toBeTruthy()
  })

  it('passes enabled: false when traceId is empty', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="" />)
    // useQuery was called with enabled: false
    expect(mockUseQuery).toHaveBeenCalledWith(
      { traceId: '' },
      { enabled: false },
    )
  })

  // Tier 3 -- Edge cases
  it('handles null trace response', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    })

    const { container } = render(
      <ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />,
    )
    // No trace data -- renders nothing
    expect(container.querySelector('[data-testid="thought-summary"]')).toBeNull()
  })

  it('handles ExecutionTrace with zero turns', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace({ turns: [] }),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)

    const summary = screen.getByTestId('thought-summary')
    expect(summary.textContent).toContain('0 decisions')
    expect(summary.textContent).toContain('0 approved')
    expect(summary.textContent).toContain('0 denied')
    expect(summary.textContent).toContain('0 memory writes')
  })

  it('handles ExecutionTrace with zero pfcDecisions', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace({
        turns: [
          {
            input: 'hello',
            output: 'world',
            modelCalls: [],
            pfcDecisions: [],
            toolDecisions: [],
            memoryWrites: [],
            memoryDenials: [],
            evidenceRefs: [],
            timestamp: '2026-03-28T00:00:01.000Z',
          },
        ],
      }),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)

    const summary = screen.getByTestId('thought-summary')
    expect(summary.textContent).toContain('0 decisions')
  })

  it('handles error state by rendering nothing', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    const { container } = render(
      <ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />,
    )
    expect(container.querySelector('[data-testid="thought-summary"]')).toBeNull()
  })

  it('has correct ARIA attributes', () => {
    mockUseQuery.mockReturnValue({
      data: makeTrace(),
      isLoading: false,
      isError: false,
    })

    render(<ThoughtSummary traceId="00000000-0000-0000-0000-000000000001" />)

    const summary = screen.getByTestId('thought-summary')
    expect(summary.getAttribute('role')).toBe('status')
    expect(summary.getAttribute('aria-label')).toContain('3 decisions')
    expect(summary.getAttribute('aria-expanded')).toBe('false')
  })
})
