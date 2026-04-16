// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { ExecutionMonitor } from '../monitoring/ExecutionMonitor'
import { DEMO_EXECUTION_RUNS } from '../monitoring/demo-execution-data'
import type { ExecutionRun } from '../../../types/workflow-builder'

// ─── Tier 2 — Behavior ──────────────────────────────────────────────────────

describe('ExecutionMonitor — Behavior', () => {
  it('renders overlay container when activeRun has node states', () => {
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[0]} />)
    expect(screen.getByTestId('execution-monitor-overlay')).toBeTruthy()
  })

  it('renders badges for non-pending nodes', () => {
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[0]} />)
    // Run 1 has node-1 completed, node-4 skipped, etc.
    expect(screen.getByTestId('monitor-badge-node-1')).toBeTruthy()
    expect(screen.getByTestId('monitor-badge-node-2')).toBeTruthy()
  })

  it('does not render badges for pending nodes', () => {
    // Run 2 has node-3 through node-7 as pending
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[1]} />)
    expect(screen.queryByTestId('monitor-badge-node-3')).toBeNull()
    expect(screen.queryByTestId('monitor-badge-node-4')).toBeNull()
  })

  it('overlay elements have pointer-events none', () => {
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[0]} />)
    const overlay = screen.getByTestId('execution-monitor-overlay')
    expect(overlay.style.pointerEvents).toBe('none')
  })

  it('running node has nous-node-pulse CSS class', () => {
    // Run 2 has node-2 running
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[1]} />)
    const badge = screen.getByTestId('monitor-badge-node-2')
    expect(badge.className).toContain('nous-node-pulse')
  })

  it('completed node does not have pulse class', () => {
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[0]} />)
    const badge = screen.getByTestId('monitor-badge-node-1')
    expect(badge.className).not.toContain('nous-node-pulse')
  })

  it('badge shows correct data-status attribute', () => {
    render(<ExecutionMonitor activeRun={DEMO_EXECUTION_RUNS[2]} />)
    const failedBadge = screen.getByTestId('monitor-badge-node-4')
    expect(failedBadge.getAttribute('data-status')).toBe('failed')
  })
})

// ─── Tier 3 — Edge cases ────────────────────────────────────────────────────

describe('ExecutionMonitor — Edge cases', () => {
  it('renders nothing when nodeStates is empty', () => {
    const emptyRun: ExecutionRun = {
      id: 'empty',
      workflowId: 'demo',
      status: 'running',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: null,
      nodeStates: {},
      edgeStates: {},
      events: [],
    }
    const { container } = render(<ExecutionMonitor activeRun={emptyRun} />)
    expect(screen.queryByTestId('execution-monitor-overlay')).toBeNull()
  })
})
