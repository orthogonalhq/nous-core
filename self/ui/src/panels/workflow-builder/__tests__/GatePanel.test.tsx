// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { GatePanel } from '../monitoring/GatePanel'
import type { GateState } from '../../../types/workflow-builder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_GATES: GateState[] = [
  { gateId: 'g1', name: 'Code review approval', status: 'passed', nodeId: 'n1', type: 'approval', errorDetail: null },
  { gateId: 'g2', name: 'Unit test coverage', status: 'failed', nodeId: 'n1', type: 'quality', errorDetail: 'Coverage dropped below 80%' },
  { gateId: 'g3', name: 'Compliance check', status: 'pending', nodeId: 'n1', type: 'governance', errorDetail: null },
]

function renderGatePanel(props?: Partial<React.ComponentProps<typeof GatePanel>>) {
  const containerRef = { current: document.createElement('div') }
  const defaultProps = {
    nodeId: 'n1',
    nodeLabel: 'Test Node',
    gates: SAMPLE_GATES,
    containerRef,
    ...props,
  }

  return render(<GatePanel {...defaultProps} />)
}

// ─── Tier 1 — Contract ────────────────────────────────────────────────────────

describe('GatePanel — Contract', () => {
  it('renders inside a FloatingPanel with "Gate Checks" title', () => {
    renderGatePanel()
    expect(screen.getByText('Gate Checks')).toBeTruthy()
  })

  it('displays the node label as subtitle', () => {
    renderGatePanel()
    expect(screen.getByText('Test Node')).toBeTruthy()
  })

  it('renders a row for each gate', () => {
    renderGatePanel()
    const list = screen.getByTestId('gate-list')
    expect(list).toBeTruthy()
    expect(screen.getByTestId('gate-row-g1')).toBeTruthy()
    expect(screen.getByTestId('gate-row-g2')).toBeTruthy()
    expect(screen.getByTestId('gate-row-g3')).toBeTruthy()
  })
})

// ─── Tier 2 — Behavior ───────────────────────────────────────────────────────

describe('GatePanel — Behavior', () => {
  it('displays gate names', () => {
    renderGatePanel()
    expect(screen.getByText('Code review approval')).toBeTruthy()
    expect(screen.getByText('Unit test coverage')).toBeTruthy()
    expect(screen.getByText('Compliance check')).toBeTruthy()
  })

  it('shows status badges with correct data-status attribute', () => {
    renderGatePanel()
    const passedBadge = screen.getByTestId('gate-status-g1')
    const failedBadge = screen.getByTestId('gate-status-g2')
    const pendingBadge = screen.getByTestId('gate-status-g3')
    expect(passedBadge.getAttribute('data-status')).toBe('passed')
    expect(failedBadge.getAttribute('data-status')).toBe('failed')
    expect(pendingBadge.getAttribute('data-status')).toBe('pending')
  })

  it('shows error detail for failed gates', () => {
    renderGatePanel()
    const errorDetail = screen.getByTestId('gate-error-g2')
    expect(errorDetail.textContent).toBe('Coverage dropped below 80%')
  })

  it('does not show error detail for non-failed gates', () => {
    renderGatePanel()
    expect(screen.queryByTestId('gate-error-g1')).toBeNull()
    expect(screen.queryByTestId('gate-error-g3')).toBeNull()
  })

  it('gate type icons use codicon classes', () => {
    renderGatePanel()
    // The approval gate should have codicon-person-add
    const row = screen.getByTestId('gate-row-g1')
    const icon = row.querySelector('.codicon-person-add')
    expect(icon).toBeTruthy()
  })
})

// ─── Tier 3 — Edge cases ──────────────────────────────────────────────────────

describe('GatePanel — Edge cases', () => {
  it('shows empty state when gates array is empty', () => {
    renderGatePanel({ gates: [] })
    const emptyState = screen.getByTestId('gate-panel-empty')
    expect(emptyState).toBeTruthy()
    expect(emptyState.textContent).toContain('No gate checks')
  })

  it('does not render gate-list when empty', () => {
    renderGatePanel({ gates: [] })
    expect(screen.queryByTestId('gate-list')).toBeNull()
  })
})
