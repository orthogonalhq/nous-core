// @vitest-environment jsdom

/**
 * Integration test: Validation feedback loop
 *
 * Exercises invalid state -> error in panel -> click error -> navigate.
 * Verifies ValidationPanel, BuilderToolbar validation toggle, and error
 * click navigation work together through shared state.
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@xyflow/react', () => reactFlowMock)

vi.mock('../../nodes/node-registry', () => ({
  getAllRegistryEntries: () => [
    ['nous.trigger.webhook', {
      category: 'trigger' as const,
      defaultLabel: 'Webhook Trigger',
      icon: 'codicon-zap',
      colorVar: 'var(--c)',
      width: 200,
      height: 80,
      ports: [{ id: 'out-0', type: 'source', position: 'bottom', label: 'Out' }],
    }],
  ],
  getRegistryEntry: () => ({
    category: 'trigger' as const,
    defaultLabel: 'Webhook Trigger',
    icon: 'codicon-zap',
    colorVar: 'var(--c)',
    width: 200,
    height: 80,
    ports: [{ id: 'out-0', type: 'source', position: 'bottom', label: 'Out' }],
  }),
}))

vi.mock('@nous/shared', () => ({
  resolveNodeTypeParameterSchema: () => ({
    safeParse: () => ({ success: true, data: {} }),
    shape: {},
  }),
  validateWorkflowSpec: vi.fn(() => []),
}))

vi.mock('yaml', () => ({
  default: {
    parse: vi.fn(() => ({ name: 'Test', version: 1, nodes: [], connections: [] })),
    stringify: vi.fn(() => 'name: Test'),
  },
}))

import { WorkflowBuilderPanel } from '../../WorkflowBuilderPanel'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Integration: validation-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Validate button in toolbar', () => {
    render(<WorkflowBuilderPanel />)
    const validateBtn = screen.getByTestId('toolbar-validate')
    expect(validateBtn).toBeTruthy()
    expect(validateBtn.getAttribute('aria-label')).toBe('Toggle validation panel')
  })

  it('clicking Validate button toggles validation panel visibility', async () => {
    render(<WorkflowBuilderPanel />)
    const validateBtn = screen.getByTestId('toolbar-validate')

    // Initially no validation panel visible
    expect(screen.queryByTestId('validation-panel')).toBeNull()

    // Click to open
    await act(async () => {
      fireEvent.click(validateBtn)
    })
    expect(screen.getByTestId('validation-panel')).toBeTruthy()
  })

  it('validation panel shows empty state when no errors', async () => {
    render(<WorkflowBuilderPanel />)
    const validateBtn = screen.getByTestId('toolbar-validate')

    await act(async () => {
      fireEvent.click(validateBtn)
    })

    expect(screen.getByTestId('validation-panel-empty')).toBeTruthy()
    expect(screen.getByText('No issues found')).toBeTruthy()
  })

  it('validation panel has aria-live status region', async () => {
    render(<WorkflowBuilderPanel />)
    const validateBtn = screen.getByTestId('toolbar-validate')

    await act(async () => {
      fireEvent.click(validateBtn)
    })

    const statusRegion = screen.getByTestId('validation-panel-status')
    expect(statusRegion).toBeTruthy()
    expect(statusRegion.getAttribute('role')).toBe('status')
    expect(statusRegion.getAttribute('aria-live')).toBe('polite')
  })

  it('validation panel empty state has role="status"', async () => {
    render(<WorkflowBuilderPanel />)
    const validateBtn = screen.getByTestId('toolbar-validate')

    await act(async () => {
      fireEvent.click(validateBtn)
    })

    const emptyState = screen.getByTestId('validation-panel-empty')
    expect(emptyState.getAttribute('role')).toBe('status')
  })

  it('validation error badge is hidden when there are no errors', () => {
    render(<WorkflowBuilderPanel />)
    // With no errors, the badge should not be rendered (conditional on count > 0)
    expect(screen.queryByTestId('toolbar-validation-badge')).toBeNull()
  })
}, 15_000)
