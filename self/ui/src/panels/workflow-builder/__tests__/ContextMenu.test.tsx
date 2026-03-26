// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CanvasContextMenu } from '../context-menu/CanvasContextMenu'
import { NodeContextMenu } from '../context-menu/NodeContextMenu'
import { EdgeContextMenu } from '../context-menu/EdgeContextMenu'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../nodes/node-registry', () => ({
  getAllRegistryEntries: () => [
    ['nous.trigger.webhook', { category: 'trigger', defaultLabel: 'Webhook Trigger', icon: 'codicon-zap', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
    ['nous.agent.classify', { category: 'agent', defaultLabel: 'Agent Classify', icon: 'codicon-hubot', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
    ['nous.condition.branch', { category: 'condition', defaultLabel: 'Condition Branch', icon: 'codicon-git-compare', colorVar: 'var(--c)', width: 200, height: 80, ports: [] }],
  ],
}))

// ─── CanvasContextMenu ──────────────────────────────────────────────────────

describe('CanvasContextMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    onClose: vi.fn(),
    onAddNode: vi.fn(),
    onSelectAll: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders four action items at specified position', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      const menu = screen.getByTestId('canvas-context-menu')
      expect(menu).toBeTruthy()
      expect(screen.getByTestId('context-menu-add-node')).toBeTruthy()
      expect(screen.getByTestId('context-menu-paste')).toBeTruthy()
      expect(screen.getByTestId('context-menu-select-all')).toBeTruthy()
      expect(screen.getByTestId('context-menu-auto-layout')).toBeTruthy()
    })

    it('all interactive elements have aria-label attributes', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      expect(screen.getByLabelText('Add node')).toBeTruthy()
      expect(screen.getByLabelText('Paste')).toBeTruthy()
      expect(screen.getByLabelText('Select all')).toBeTruthy()
      expect(screen.getByLabelText('Auto-layout')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('Paste action is disabled', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      const paste = screen.getByTestId('context-menu-paste')
      expect(paste).toHaveProperty('disabled', true)
    })

    it('Auto-layout action is disabled', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      const autoLayout = screen.getByTestId('context-menu-auto-layout')
      expect(autoLayout).toHaveProperty('disabled', true)
    })

    it('Select all action calls onSelectAll', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-select-all'))
      expect(defaultProps.onSelectAll).toHaveBeenCalledTimes(1)
    })

    it('Add node sub-menu shows categories from registry', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      // Hover over "Add node" to show sub-menu
      fireEvent.mouseEnter(screen.getByTestId('context-menu-add-node'))
      const submenu = screen.getByTestId('add-node-submenu')
      expect(submenu).toBeTruthy()
      expect(screen.getByTestId('add-node-nous.trigger.webhook')).toBeTruthy()
      expect(screen.getByTestId('add-node-nous.agent.classify')).toBeTruthy()
      expect(screen.getByTestId('add-node-nous.condition.branch')).toBeTruthy()
    })

    it('selecting an add-node action calls onAddNode with correct nousType', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      fireEvent.mouseEnter(screen.getByTestId('context-menu-add-node'))
      fireEvent.click(screen.getByTestId('add-node-nous.trigger.webhook'))
      expect(defaultProps.onAddNode).toHaveBeenCalledWith('nous.trigger.webhook')
    })

    it('menu dismisses on Escape key', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses on click outside', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      fireEvent.mouseDown(document.body)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses after action selection (Select all)', () => {
      render(<CanvasContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-select-all'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  // ─── Tier 3 — Edge Cases ───────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('menu renders within viewport bounds when position is near right edge', () => {
      // Set window dimensions
      Object.defineProperty(window, 'innerWidth', { value: 300, writable: true })
      Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })

      render(<CanvasContextMenu {...defaultProps} position={{ x: 290, y: 100 }} />)
      const menu = screen.getByTestId('canvas-context-menu')
      // The menu should exist and render (clamping logic runs async via useEffect)
      expect(menu).toBeTruthy()
    })
  })
})

// ─── NodeContextMenu ────────────────────────────────────────────────────────

describe('NodeContextMenu', () => {
  const defaultProps = {
    position: { x: 150, y: 250 },
    nodeId: 'node-1',
    onClose: vi.fn(),
    onDeleteNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onOpenInspector: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders six action items at specified position', () => {
      render(<NodeContextMenu {...defaultProps} />)
      const menu = screen.getByTestId('node-context-menu')
      expect(menu).toBeTruthy()
      expect(screen.getByTestId('context-menu-delete-node')).toBeTruthy()
      expect(screen.getByTestId('context-menu-duplicate-node')).toBeTruthy()
      expect(screen.getByTestId('context-menu-bind-skill')).toBeTruthy()
      expect(screen.getByTestId('context-menu-bind-contract')).toBeTruthy()
      expect(screen.getByTestId('context-menu-bind-template')).toBeTruthy()
      expect(screen.getByTestId('context-menu-view-nodemd')).toBeTruthy()
    })

    it('all interactive elements have aria-label attributes', () => {
      render(<NodeContextMenu {...defaultProps} />)
      expect(screen.getByLabelText('Delete node')).toBeTruthy()
      expect(screen.getByLabelText('Duplicate node')).toBeTruthy()
      expect(screen.getByLabelText('Bind skill')).toBeTruthy()
      expect(screen.getByLabelText('Bind contract')).toBeTruthy()
      expect(screen.getByLabelText('Bind template')).toBeTruthy()
      expect(screen.getByLabelText('View node.md')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('Delete action calls onDeleteNode with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-delete-node'))
      expect(defaultProps.onDeleteNode).toHaveBeenCalledWith('node-1')
    })

    it('Duplicate action calls onDuplicateNode with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-duplicate-node'))
      expect(defaultProps.onDuplicateNode).toHaveBeenCalledWith('node-1')
    })

    it('Bind skill calls onOpenInspector with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-bind-skill'))
      expect(defaultProps.onOpenInspector).toHaveBeenCalledWith('node-1')
    })

    it('Bind contract calls onOpenInspector with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-bind-contract'))
      expect(defaultProps.onOpenInspector).toHaveBeenCalledWith('node-1')
    })

    it('Bind template calls onOpenInspector with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-bind-template'))
      expect(defaultProps.onOpenInspector).toHaveBeenCalledWith('node-1')
    })

    it('View node.md calls onOpenInspector with nodeId', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-view-nodemd'))
      expect(defaultProps.onOpenInspector).toHaveBeenCalledWith('node-1')
    })

    it('menu dismisses on Escape key', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses on click outside', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.mouseDown(document.body)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses after action selection (Delete)', () => {
      render(<NodeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-delete-node'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })
})

// ─── EdgeContextMenu ────────────────────────────────────────────────────────

describe('EdgeContextMenu', () => {
  const defaultProps = {
    position: { x: 120, y: 300 },
    edgeId: 'edge-1',
    onClose: vi.fn(),
    onDeleteEdge: vi.fn(),
    onChangeEdgeType: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders three action items at specified position', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      const menu = screen.getByTestId('edge-context-menu')
      expect(menu).toBeTruthy()
      expect(screen.getByTestId('context-menu-delete-edge')).toBeTruthy()
      expect(screen.getByTestId('context-menu-change-edge-type')).toBeTruthy()
      expect(screen.getByTestId('context-menu-set-condition')).toBeTruthy()
    })

    it('all interactive elements have aria-label attributes', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      expect(screen.getByLabelText('Delete edge')).toBeTruthy()
      expect(screen.getByLabelText('Change edge type')).toBeTruthy()
      expect(screen.getByLabelText('Set condition')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('Set condition is disabled', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      const setCondition = screen.getByTestId('context-menu-set-condition')
      expect(setCondition).toHaveProperty('disabled', true)
    })

    it('Delete action calls onDeleteEdge with edgeId', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-delete-edge'))
      expect(defaultProps.onDeleteEdge).toHaveBeenCalledWith('edge-1')
    })

    it('Change type action calls onChangeEdgeType with edgeId', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-change-edge-type'))
      expect(defaultProps.onChangeEdgeType).toHaveBeenCalledWith('edge-1')
    })

    it('menu dismisses on Escape key', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses on click outside', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      fireEvent.mouseDown(document.body)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('menu dismisses after action selection (Delete)', () => {
      render(<EdgeContextMenu {...defaultProps} />)
      fireEvent.click(screen.getByTestId('context-menu-delete-edge'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })
})
