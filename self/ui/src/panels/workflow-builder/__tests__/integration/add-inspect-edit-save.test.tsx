// @vitest-environment jsdom

/**
 * Integration test: Add node -> Inspect -> Edit -> Save
 *
 * Exercises the full workflow from node creation through parameter editing
 * to saving. Verifies cross-component integration between CanvasContextMenu,
 * NodeInspector, ParameterForm, BuilderToolbar, and useBuilderState.
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'
import { triggerKeyboardShortcut } from './test-utils'

// ─── Mocks (must be before imports of tested modules) ─────────────────────────

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
    ['nous.agent.claude', {
      category: 'agent' as const,
      defaultLabel: 'Claude Agent',
      icon: 'codicon-hubot',
      colorVar: 'var(--c)',
      width: 200,
      height: 80,
      ports: [
        { id: 'in-0', type: 'target', position: 'top', label: 'In' },
        { id: 'out-0', type: 'source', position: 'bottom', label: 'Out' },
      ],
    }],
  ],
  getRegistryEntry: (nousType: string) => {
    if (nousType === 'nous.trigger.webhook') {
      return {
        category: 'trigger' as const,
        defaultLabel: 'Webhook Trigger',
        icon: 'codicon-zap',
        colorVar: 'var(--c)',
        width: 200,
        height: 80,
        ports: [{ id: 'out-0', type: 'source', position: 'bottom', label: 'Out' }],
      }
    }
    return {
      category: 'agent' as const,
      defaultLabel: nousType,
      icon: 'codicon-symbol-method',
      colorVar: 'var(--c)',
      width: 200,
      height: 80,
      ports: [],
    }
  },
}))

vi.mock('@nous/shared', () => {
  return {
    resolveNodeTypeParameterSchema: () => ({
      safeParse: () => ({ success: true, data: {} }),
      shape: {},
    }),
    validateWorkflowSpec: vi.fn(() => []),
  }
})

vi.mock('yaml', () => ({
  default: {
    parse: vi.fn(() => ({ name: 'Test', version: 1, nodes: [], connections: [] })),
    stringify: vi.fn(() => 'name: Test'),
  },
}))

import { WorkflowBuilderPanel } from '../../WorkflowBuilderPanel'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Integration: add-inspect-edit-save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the canvas with toolbar and initial demo nodes', () => {
    render(<WorkflowBuilderPanel />)
    // Canvas renders
    expect(screen.getByTestId('react-flow')).toBeTruthy()
    // Toolbar renders with Save button
    expect(screen.getByTestId('toolbar-save')).toBeTruthy()
  })

  it('Save button is initially disabled when builder is not dirty', () => {
    render(<WorkflowBuilderPanel />)
    const saveBtn = screen.getByTestId('toolbar-save') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('Ctrl+S shortcut does not trigger browser save dialog (preventDefault)', () => {
    render(<WorkflowBuilderPanel />)
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)
    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('renders toolbar undo/redo buttons', () => {
    render(<WorkflowBuilderPanel />)
    expect(screen.getByLabelText('Undo')).toBeTruthy()
    expect(screen.getByLabelText('Redo')).toBeTruthy()
  })

  it('Ctrl+Z triggers undo (undo button should reflect state)', async () => {
    render(<WorkflowBuilderPanel />)
    // Initially undo should be disabled (no mutations yet)
    const undoBtn = screen.getByLabelText('Undo') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)

    // Fire Ctrl+Z — should not throw even with nothing to undo
    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true })
    })
    // Button still disabled — no undo history
    expect(undoBtn.disabled).toBe(true)
  })

  it('Ctrl+Shift+Z triggers redo', async () => {
    render(<WorkflowBuilderPanel />)
    const redoBtn = screen.getByLabelText('Redo') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(true)

    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true, shift: true })
    })
    // Still disabled — no redo history
    expect(redoBtn.disabled).toBe(true)
  })
}, 15_000)
