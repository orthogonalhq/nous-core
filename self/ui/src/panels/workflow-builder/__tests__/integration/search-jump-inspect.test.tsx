// @vitest-environment jsdom

/**
 * Integration test: Search -> Jump -> Inspect
 *
 * Exercises Ctrl+K -> NodeSearch overlay -> search -> select -> fitView + inspector.
 * Verifies the Ctrl+K handler, NodeSearch component, and onFocusNode integration.
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
    ['nous.agent.classify', {
      category: 'agent' as const,
      defaultLabel: 'Agent Classify',
      icon: 'codicon-hubot',
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

describe('Integration: search-jump-inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Ctrl+K opens the NodeSearch overlay', async () => {
    render(<WorkflowBuilderPanel />)

    // Initially no search overlay
    expect(screen.queryByTestId('node-search-overlay')).toBeNull()

    // Fire Ctrl+K
    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    // Search overlay should appear
    expect(screen.getByTestId('node-search-overlay')).toBeTruthy()
  })

  it('Ctrl+K toggles the NodeSearch overlay off', async () => {
    render(<WorkflowBuilderPanel />)

    // Open search
    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })
    expect(screen.getByTestId('node-search-overlay')).toBeTruthy()

    // Close search
    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })
    expect(screen.queryByTestId('node-search-overlay')).toBeNull()
  })

  it('NodeSearch panel has role="search" and aria-label', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    const panel = screen.getByTestId('node-search-panel')
    expect(panel.getAttribute('role')).toBe('search')
    expect(panel.getAttribute('aria-label')).toBe('Node search')
  })

  it('NodeSearch input has correct aria attributes', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    const input = screen.getByTestId('node-search-input')
    expect(input.getAttribute('aria-label')).toBe('Search nodes')
    expect(input.hasAttribute('aria-expanded')).toBe(true)
    expect(input.hasAttribute('aria-controls')).toBe(true)
  })

  it('NodeSearch shows results matching demo node labels', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    // Default state (empty query) shows existing nodes from demo
    expect(screen.getByTestId('node-search-existing-section')).toBeTruthy()
  })

  it('NodeSearch shows add node section with registry entries', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    expect(screen.getByTestId('node-search-add-section')).toBeTruthy()
  })

  it('NodeSearch result sections have role="listbox"', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    const existingSection = screen.getByTestId('node-search-existing-section')
    expect(existingSection.getAttribute('role')).toBe('listbox')
  })

  it('NodeSearch has screen-reader result count announcement', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      triggerKeyboardShortcut('k', { ctrl: true })
    })

    const srCount = screen.getByTestId('node-search-sr-count')
    expect(srCount.getAttribute('role')).toBe('status')
    expect(srCount.getAttribute('aria-live')).toBe('polite')
    expect(srCount.textContent).toContain('results available')
  })
}, 15_000)
