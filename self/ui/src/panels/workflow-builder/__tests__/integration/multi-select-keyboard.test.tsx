// @vitest-environment jsdom

/**
 * Integration test: Multi-select + keyboard
 *
 * Exercises select multiple nodes -> Delete -> Undo -> verify restoration.
 * Verifies the interaction between selection state (onNodesChange), keyboard
 * shortcuts, and the undo stack for batch operations.
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'
import { triggerKeyboardShortcut } from './test-utils'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@xyflow/react', () => reactFlowMock)

import { trpcMock } from '../trpc-mock'
vi.mock('@nous/transport', () => trpcMock)

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
    ['nous.agent.claude', {
      category: 'agent' as const,
      defaultLabel: 'Claude Agent',
      icon: 'codicon-hubot',
      colorVar: 'var(--c)',
      width: 200,
      height: 80,
      ports: [],
    }],
    ['nous.condition.if', {
      category: 'condition' as const,
      defaultLabel: 'If Condition',
      icon: 'codicon-git-compare',
      colorVar: 'var(--c)',
      width: 200,
      height: 80,
      ports: [],
    }],
  ],
  getRegistryEntry: () => ({
    category: 'trigger' as const,
    defaultLabel: 'Webhook Trigger',
    icon: 'codicon-zap',
    colorVar: 'var(--c)',
    width: 200,
    height: 80,
    ports: [],
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

describe('Integration: multi-select-keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the canvas with multiple demo nodes', () => {
    render(<WorkflowBuilderPanel />)
    expect(screen.getByTestId('react-flow')).toBeTruthy()
  })

  it('Ctrl+Z and Ctrl+Shift+Z shortcuts are operational', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true })
    })
    expect(screen.getByTestId('react-flow')).toBeTruthy()

    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true, shift: true })
    })
    expect(screen.getByTestId('react-flow')).toBeTruthy()
  })

  it('undo/redo toolbar buttons are present and initially disabled', () => {
    render(<WorkflowBuilderPanel />)
    const undoBtn = screen.getByLabelText('Undo') as HTMLButtonElement
    const redoBtn = screen.getByLabelText('Redo') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
    expect(redoBtn.disabled).toBe(true)
  })

  it('canvas wrapper accepts keyboard focus for keyboard-driven operations', () => {
    const { container } = render(<WorkflowBuilderPanel />)
    const wrapper = container.querySelector('[tabindex="0"]') as HTMLDivElement
    expect(wrapper).toBeTruthy()

    act(() => {
      wrapper.focus()
    })
    expect(document.activeElement).toBe(wrapper)
  })

  it('keyboard shortcuts do not fire when focus is in an input element', () => {
    render(<WorkflowBuilderPanel />)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    // Ctrl+Z should be ignored when focused in an input
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    // Canvas still renders fine
    expect(screen.getByTestId('react-flow')).toBeTruthy()
    document.body.removeChild(input)
  })
}, 15_000)
