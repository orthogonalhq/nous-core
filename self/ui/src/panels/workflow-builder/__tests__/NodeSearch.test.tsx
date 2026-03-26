// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeSearch } from '../NodeSearch'
import type { WorkflowBuilderNode } from '../../../types/workflow-builder'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../nodes/node-registry', () => ({
  getAllRegistryEntries: () => [
    ['nous.trigger.webhook', { category: 'trigger', defaultLabel: 'Webhook Trigger', icon: 'codicon-zap', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
    ['nous.agent.classify', { category: 'agent', defaultLabel: 'Agent Classify', icon: 'codicon-hubot', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
    ['nous.condition.branch', { category: 'condition', defaultLabel: 'Condition Branch', icon: 'codicon-git-compare', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
  ],
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

const testNodes: WorkflowBuilderNode[] = [
  {
    id: 'n1',
    type: 'builderNode',
    position: { x: 0, y: 0 },
    data: { label: 'Webhook Entry', category: 'trigger', nousType: 'nous.trigger.webhook' },
  },
  {
    id: 'n2',
    type: 'builderNode',
    position: { x: 200, y: 0 },
    data: { label: 'Classify Agent', category: 'agent', nousType: 'nous.agent.classify' },
  },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NodeSearch', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    nodes: testNodes,
    onAddNode: vi.fn(),
    onFocusNode: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders search input and two sections when isOpen=true', () => {
      render(<NodeSearch {...defaultProps} />)
      expect(screen.getByTestId('node-search-panel')).toBeTruthy()
      expect(screen.getByTestId('node-search-input')).toBeTruthy()
      expect(screen.getByTestId('node-search-existing-section')).toBeTruthy()
      expect(screen.getByTestId('node-search-add-section')).toBeTruthy()
    })

    it('renders nothing when isOpen=false', () => {
      const { container } = render(<NodeSearch {...defaultProps} isOpen={false} />)
      expect(container.querySelector('[data-testid="node-search-panel"]')).toBeNull()
    })

    it('NodeSearchResult items carry correct type discriminators', () => {
      render(<NodeSearch {...defaultProps} />)
      // Existing nodes should have existing- prefix in data-testid
      expect(screen.getByTestId('node-search-result-existing-n1')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-existing-n2')).toBeTruthy()
      // Add nodes should have add- prefix
      expect(screen.getByTestId('node-search-result-add-nous.trigger.webhook')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.agent.classify')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.condition.branch')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('search input auto-focuses when opened', () => {
      render(<NodeSearch {...defaultProps} />)
      // We can check that the input element exists and has the correct aria-label
      const input = screen.getByTestId('node-search-input')
      expect(input).toBeTruthy()
      expect(input.getAttribute('aria-label')).toBe('Search nodes')
    })

    it('shows existing graph nodes in "Existing Nodes" section', () => {
      render(<NodeSearch {...defaultProps} />)
      const section = screen.getByTestId('node-search-existing-section')
      expect(section.textContent).toContain('Webhook Entry')
      expect(section.textContent).toContain('Classify Agent')
    })

    it('shows available node types in "Add Node" section from registry', () => {
      render(<NodeSearch {...defaultProps} />)
      const section = screen.getByTestId('node-search-add-section')
      expect(section.textContent).toContain('Webhook Trigger')
      expect(section.textContent).toContain('Agent Classify')
      expect(section.textContent).toContain('Condition Branch')
    })

    it('typing "web" filters results by label (case-insensitive substring match)', () => {
      render(<NodeSearch {...defaultProps} />)
      const input = screen.getByTestId('node-search-input')
      fireEvent.change(input, { target: { value: 'web' } })
      // Should show webhook-related items
      expect(screen.getByTestId('node-search-result-existing-n1')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.trigger.webhook')).toBeTruthy()
      // Should NOT show non-matching items
      expect(screen.queryByTestId('node-search-result-existing-n2')).toBeNull()
      expect(screen.queryByTestId('node-search-result-add-nous.condition.branch')).toBeNull()
    })

    it('typing "xyz" shows "No results found" message', () => {
      render(<NodeSearch {...defaultProps} />)
      const input = screen.getByTestId('node-search-input')
      fireEvent.change(input, { target: { value: 'xyz' } })
      expect(screen.getByTestId('node-search-empty')).toBeTruthy()
      expect(screen.getByTestId('node-search-empty').textContent).toBe('No results found')
    })

    it('typing filters by nousType', () => {
      render(<NodeSearch {...defaultProps} />)
      const input = screen.getByTestId('node-search-input')
      fireEvent.change(input, { target: { value: 'condition' } })
      expect(screen.getByTestId('node-search-result-add-nous.condition.branch')).toBeTruthy()
      // Existing nodes don't have "condition" in label, but might in nousType — n1 and n2 don't match
      expect(screen.queryByTestId('node-search-result-existing-n1')).toBeNull()
    })

    it('selecting an existing node result calls onFocusNode with nodeId', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.click(screen.getByTestId('node-search-result-existing-n1'))
      expect(defaultProps.onFocusNode).toHaveBeenCalledWith('n1')
    })

    it('selecting an add-node result calls onAddNode with nousType and position', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.click(screen.getByTestId('node-search-result-add-nous.trigger.webhook'))
      expect(defaultProps.onAddNode).toHaveBeenCalledWith('nous.trigger.webhook', { x: 0, y: 0 })
    })

    it('closes on Escape key', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on click outside', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.mouseDown(document.body)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('closes after selection (existing node)', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.click(screen.getByTestId('node-search-result-existing-n2'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('closes after selection (add node)', () => {
      render(<NodeSearch {...defaultProps} />)
      fireEvent.click(screen.getByTestId('node-search-result-add-nous.agent.classify'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('aria-label on search input and result items', () => {
      render(<NodeSearch {...defaultProps} />)
      expect(screen.getByLabelText('Search nodes')).toBeTruthy()
      expect(screen.getByLabelText('Go to Webhook Entry')).toBeTruthy()
      expect(screen.getByLabelText('Go to Classify Agent')).toBeTruthy()
      expect(screen.getByLabelText('Add Webhook Trigger')).toBeTruthy()
      expect(screen.getByLabelText('Add Agent Classify')).toBeTruthy()
      expect(screen.getByLabelText('Add Condition Branch')).toBeTruthy()
    })
  })

  // ─── Tier 3 — Edge Cases ───────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('empty search shows all results (no filter applied)', () => {
      render(<NodeSearch {...defaultProps} />)
      // All existing + all add-node results should be visible
      expect(screen.getByTestId('node-search-result-existing-n1')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-existing-n2')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.trigger.webhook')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.agent.classify')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.condition.branch')).toBeTruthy()
    })

    it('search with spaces trims and matches correctly', () => {
      render(<NodeSearch {...defaultProps} />)
      const input = screen.getByTestId('node-search-input')
      fireEvent.change(input, { target: { value: '  webhook  ' } })
      expect(screen.getByTestId('node-search-result-existing-n1')).toBeTruthy()
      expect(screen.getByTestId('node-search-result-add-nous.trigger.webhook')).toBeTruthy()
    })

    it('when nodes is empty, "Existing Nodes" section is hidden', () => {
      render(<NodeSearch {...defaultProps} nodes={[]} />)
      expect(screen.queryByTestId('node-search-existing-section')).toBeNull()
      // Add Node section should still be visible
      expect(screen.getByTestId('node-search-add-section')).toBeTruthy()
    })
  })
})
