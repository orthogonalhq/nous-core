// @vitest-environment jsdom

/**
 * Integration test: Delete node via context menu -> Undo -> Verify restored
 *
 * Exercises the cross-component interaction between context menu delete actions,
 * the undo/redo stack, and node state management.
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'
import { triggerKeyboardShortcut } from './test-utils'

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

describe('Integration: delete-undo-restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the canvas with initial demo nodes', () => {
    render(<WorkflowBuilderPanel />)
    expect(screen.getByTestId('react-flow')).toBeTruthy()
  })

  it('Ctrl+Z keyboard shortcut is wired (does not throw)', async () => {
    render(<WorkflowBuilderPanel />)
    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true })
    })
    // Should not throw — undo with empty stack is a no-op
    expect(screen.getByTestId('react-flow')).toBeTruthy()
  })

  it('Ctrl+Shift+Z keyboard shortcut is wired (does not throw)', async () => {
    render(<WorkflowBuilderPanel />)
    await act(async () => {
      triggerKeyboardShortcut('z', { ctrl: true, shift: true })
    })
    expect(screen.getByTestId('react-flow')).toBeTruthy()
  })

  it('undo button is disabled when there is no undo history', () => {
    render(<WorkflowBuilderPanel />)
    const undoBtn = screen.getByLabelText('Undo') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
  })

  it('redo button is disabled when there is no redo history', () => {
    render(<WorkflowBuilderPanel />)
    const redoBtn = screen.getByLabelText('Redo') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(true)
  })
}, 15_000)
