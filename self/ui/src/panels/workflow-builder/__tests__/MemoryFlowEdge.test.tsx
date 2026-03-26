// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { MemoryFlowEdge } from '../edges/MemoryFlowEdge'
import { edgeTypes } from '../edges'

// ─── Tier 1 — Contract ────────────────────────────────────────────────────────

describe('MemoryFlowEdge — Contract', () => {
  it('renders without error', () => {
    const { container } = render(
      <MemoryFlowEdge
        id="test-edge"
        source="a"
        target="b"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={'bottom' as any}
        targetPosition={'top' as any}
        data={{ edgeType: 'memory' }}
      />,
    )
    expect(container).toBeTruthy()
  })

  it('is registered in edgeTypes map as "memory"', () => {
    expect(edgeTypes).toHaveProperty('memory')
    expect(edgeTypes.memory).toBe(MemoryFlowEdge)
  })
})

// ─── Tier 2 — Behavior ──────────────────────────────────────────────────────

describe('MemoryFlowEdge — Behavior', () => {
  it('renders BaseEdge (via mock) with correct structure', () => {
    const { container } = render(
      <MemoryFlowEdge
        id="mem-1"
        source="a"
        target="b"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={'bottom' as any}
        targetPosition={'top' as any}
        data={{ edgeType: 'memory' }}
      />,
    )
    // BaseEdge mock renders as <g data-testid="base-edge">
    const baseEdge = container.querySelector('[data-testid="base-edge"]')
    expect(baseEdge).toBeTruthy()
  })

  it('renders label when data.label is provided', () => {
    const { getByText } = render(
      <MemoryFlowEdge
        id="mem-2"
        source="a"
        target="b"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={'bottom' as any}
        targetPosition={'top' as any}
        data={{ edgeType: 'memory', label: 'Test Label' }}
      />,
    )
    expect(getByText('Test Label')).toBeTruthy()
  })

  it('does not render label when data.label is absent', () => {
    const { queryByText } = render(
      <MemoryFlowEdge
        id="mem-3"
        source="a"
        target="b"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={'bottom' as any}
        targetPosition={'top' as any}
        data={{ edgeType: 'memory' }}
      />,
    )
    // No label text should be rendered
    expect(queryByText('Test Label')).toBeNull()
  })
})
