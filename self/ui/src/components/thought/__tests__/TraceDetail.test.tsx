// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TraceDetail } from '../TraceDetail'
import type { ExecutionTrace } from '@nous/shared'

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
          { approved: true, reason: 'passed Phase 1 checks', confidence: 1 },
          { approved: false, reason: 'tool not registered', confidence: 0 },
        ],
        toolDecisions: [
          { toolName: 'echo', approved: true },
          { toolName: 'danger', approved: false, reason: 'not registered' },
        ],
        memoryWrites: ['00000000-0000-0000-0000-000000000002' as any],
        memoryDenials: [
          {
            candidate: {
              content: 'test',
              type: 'fact',
              scope: 'project',
              confidence: 0.3,
              sensitivity: [],
              retention: 'permanent',
              provenance: {
                traceId: '00000000-0000-0000-0000-000000000001' as any,
                source: 'test',
                timestamp: '2026-03-28T00:00:00.000Z',
              },
              tags: [],
            },
            reason: 'MEM-CONFIDENCE-BELOW-THRESHOLD',
          },
        ],
        evidenceRefs: [],
        timestamp: '2026-03-28T00:00:01.000Z',
      },
    ],
    ...overrides,
  }
}

describe('TraceDetail', () => {
  // Tier 1 -- Contract
  it('renders without crashing given a valid ExecutionTrace', () => {
    render(<TraceDetail trace={makeTrace()} />)
    expect(screen.getByTestId('trace-detail')).toBeTruthy()
  })

  // Tier 2 -- Behavior
  it('lists pfcDecisions with decision status and reason', () => {
    render(<TraceDetail trace={makeTrace()} />)

    const decisions = screen.getAllByTestId('trace-pfc-decision')
    expect(decisions).toHaveLength(2)
    expect(decisions[0]!.textContent).toContain('approved')
    expect(decisions[0]!.textContent).toContain('passed Phase 1 checks')
    expect(decisions[1]!.textContent).toContain('denied')
    expect(decisions[1]!.textContent).toContain('tool not registered')
  })

  it('lists tool decisions with tool name and approved status', () => {
    render(<TraceDetail trace={makeTrace()} />)

    const toolDecisions = screen.getAllByTestId('trace-tool-decision')
    expect(toolDecisions).toHaveLength(2)
    expect(toolDecisions[0]!.textContent).toContain('echo')
    expect(toolDecisions[0]!.textContent).toContain('approved')
    expect(toolDecisions[1]!.textContent).toContain('danger')
    expect(toolDecisions[1]!.textContent).toContain('denied')
  })

  it('shows memory writes count', () => {
    render(<TraceDetail trace={makeTrace()} />)

    const memWrites = screen.getByTestId('trace-memory-writes')
    expect(memWrites.textContent).toContain('1')
  })

  it('shows memory denials', () => {
    render(<TraceDetail trace={makeTrace()} />)

    const memDenials = screen.getByTestId('trace-memory-denials')
    expect(memDenials.textContent).toContain('MEM-CONFIDENCE-BELOW-THRESHOLD')
  })

  // Tier 3 -- Edge cases
  it('handles ExecutionTrace with zero turns', () => {
    render(<TraceDetail trace={makeTrace({ turns: [] })} />)

    expect(screen.getByTestId('trace-detail').textContent).toContain(
      'No turn data available.',
    )
  })

  it('handles turn with empty arrays (no decisions, no writes, no denials)', () => {
    render(
      <TraceDetail
        trace={makeTrace({
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
        })}
      />,
    )

    const detail = screen.getByTestId('trace-detail')
    expect(detail.textContent).toContain('No decision data in this turn.')
  })
})
