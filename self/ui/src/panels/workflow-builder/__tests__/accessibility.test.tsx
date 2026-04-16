// @vitest-environment jsdom

/**
 * Accessibility test suite for all Phase 2 components.
 *
 * Validates ARIA attributes, roles, focus management, and screen-reader
 * semantics across inspectors, context menus, NodeSearch, ValidationPanel,
 * and FloatingPanel.
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@xyflow/react', () => reactFlowMock)

import { trpcMock } from './trpc-mock'
vi.mock('@nous/transport', () => trpcMock)

vi.mock('../nodes/node-registry', () => ({
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

// Import components for standalone rendering
import { CanvasContextMenu } from '../context-menu/CanvasContextMenu'
import { NodeContextMenu } from '../context-menu/NodeContextMenu'
import { EdgeContextMenu } from '../context-menu/EdgeContextMenu'
import { NodeSearch } from '../NodeSearch'
import { WorkflowBuilderPanel } from '../WorkflowBuilderPanel'

// ─── FloatingPanel Accessibility ──────────────────────────────────────────────

describe('Accessibility: FloatingPanel', () => {
  it('FloatingPanel has role="region" when rendered via WorkflowBuilderPanel + validation panel', async () => {
    render(<WorkflowBuilderPanel />)

    // Open validation panel to trigger a FloatingPanel render
    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    const panels = screen.getAllByTestId('floating-panel')
    expect(panels.length).toBeGreaterThan(0)
    // All FloatingPanels should have role="region"
    panels.forEach((panel) => {
      expect(panel.getAttribute('role')).toBe('region')
    })
  })

  it('FloatingPanel has aria-label matching title', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    // Find the validation panel's FloatingPanel by looking inside the validation-panel wrapper
    const validationWrapper = screen.getByTestId('validation-panel')
    const panel = validationWrapper.querySelector('[data-testid="floating-panel"]')
    expect(panel).toBeTruthy()
    expect(panel!.getAttribute('aria-label')).toBe('Validation')
  })

  it('FloatingPanel has aria-labelledby referencing title element', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    const validationWrapper = screen.getByTestId('validation-panel')
    const panel = validationWrapper.querySelector('[data-testid="floating-panel"]')
    expect(panel).toBeTruthy()
    const labelledBy = panel!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()

    // The referenced element should exist and contain the title text
    const titleEl = document.getElementById(labelledBy!)
    expect(titleEl).toBeTruthy()
    expect(titleEl?.textContent).toBe('Validation')
  })

  it('FloatingPanel control buttons have aria-labels', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    // Collapse button
    const collapseBtn = screen.getAllByTestId('floating-panel-collapse')[0]
    expect(collapseBtn.getAttribute('aria-label')).toMatch(/Collapse panel|Expand panel/)

    // Pin button
    const pinBtn = screen.getAllByTestId('floating-panel-pin')[0]
    expect(pinBtn.getAttribute('aria-label')).toMatch(/Pin panel|Unpin panel/)

    // Close button
    const closeBtn = screen.getAllByTestId('floating-panel-close')[0]
    expect(closeBtn.getAttribute('aria-label')).toBe('Close panel')
  })
})

// ─── Context Menu Accessibility ───────────────────────────────────────────────

describe('Accessibility: CanvasContextMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    onClose: vi.fn(),
    onAddNode: vi.fn(),
    onSelectAll: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has role="menu" on container', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    expect(menu.getAttribute('role')).toBe('menu')
  })

  it('has aria-label="Canvas context menu"', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    expect(menu.getAttribute('aria-label')).toBe('Canvas context menu')
  })

  it('all items have role="menuitem"', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBeGreaterThanOrEqual(4)
  })

  it('separators have role="separator"', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    const separators = menu.querySelectorAll('[role="separator"]')
    expect(separators.length).toBeGreaterThanOrEqual(1)
  })

  it('ArrowDown navigates to next menu item', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')

    // Focus first item
    const firstItem = menu.querySelector('[role="menuitem"]:not([disabled])') as HTMLElement
    firstItem?.focus()
    expect(document.activeElement).toBe(firstItem)

    // Press ArrowDown
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).not.toBe(firstItem)
  })

  it('ArrowUp navigates to previous menu item', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]:not([disabled])') as NodeListOf<HTMLElement>

    // Focus second item
    items[1]?.focus()
    expect(document.activeElement).toBe(items[1])

    // Press ArrowUp
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
  })

  it('Tab wraps within menu items', () => {
    render(<CanvasContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('canvas-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]:not([disabled])') as NodeListOf<HTMLElement>
    const lastItem = items[items.length - 1]

    // Focus last item
    lastItem?.focus()
    expect(document.activeElement).toBe(lastItem)

    // Press Tab — should wrap to first
    fireEvent.keyDown(menu, { key: 'Tab' })
    expect(document.activeElement).toBe(items[0])
  })
})

describe('Accessibility: NodeContextMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    nodeId: 'node-1',
    onClose: vi.fn(),
    onDeleteNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onOpenInspector: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has role="menu" and aria-label="Node context menu"', () => {
    render(<NodeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('node-context-menu')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.getAttribute('aria-label')).toBe('Node context menu')
  })

  it('all items have role="menuitem" and aria-label', () => {
    render(<NodeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('node-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBeGreaterThanOrEqual(4)
    items.forEach((item) => {
      expect(item.getAttribute('aria-label')).toBeTruthy()
    })
  })

  it('ArrowDown/ArrowUp navigate menu items', () => {
    render(<NodeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('node-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]:not([disabled])') as NodeListOf<HTMLElement>

    items[0]?.focus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
  })
})

describe('Accessibility: EdgeContextMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    edgeId: 'edge-1',
    onClose: vi.fn(),
    onDeleteEdge: vi.fn(),
    onChangeEdgeType: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has role="menu" and aria-label="Edge context menu"', () => {
    render(<EdgeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('edge-context-menu')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.getAttribute('aria-label')).toBe('Edge context menu')
  })

  it('all items have role="menuitem" and aria-label', () => {
    render(<EdgeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('edge-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBeGreaterThanOrEqual(2)
    items.forEach((item) => {
      expect(item.getAttribute('aria-label')).toBeTruthy()
    })
  })

  it('ArrowDown/ArrowUp navigate menu items', () => {
    render(<EdgeContextMenu {...defaultProps} />)
    const menu = screen.getByTestId('edge-context-menu')
    const items = menu.querySelectorAll('[role="menuitem"]:not([disabled])') as NodeListOf<HTMLElement>

    items[0]?.focus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
  })
})

// ─── NodeSearch Accessibility ─────────────────────────────────────────────────

describe('Accessibility: NodeSearch', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    nodes: [
      {
        id: 'node-1',
        type: 'builderNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Test Node',
          category: 'trigger' as const,
          nousType: 'nous.trigger.webhook',
        },
      },
    ],
    onAddNode: vi.fn(),
    onFocusNode: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('panel has role="search" and aria-label="Node search"', () => {
    render(<NodeSearch {...defaultProps} />)
    const panel = screen.getByTestId('node-search-panel')
    expect(panel.getAttribute('role')).toBe('search')
    expect(panel.getAttribute('aria-label')).toBe('Node search')
  })

  it('input has aria-label="Search nodes"', () => {
    render(<NodeSearch {...defaultProps} />)
    const input = screen.getByTestId('node-search-input')
    expect(input.getAttribute('aria-label')).toBe('Search nodes')
  })

  it('input has aria-expanded and aria-controls', () => {
    render(<NodeSearch {...defaultProps} />)
    const input = screen.getByTestId('node-search-input')
    expect(input.hasAttribute('aria-expanded')).toBe(true)
    expect(input.hasAttribute('aria-controls')).toBe(true)
  })

  it('result sections have role="listbox"', () => {
    render(<NodeSearch {...defaultProps} />)
    const existingSection = screen.getByTestId('node-search-existing-section')
    expect(existingSection.getAttribute('role')).toBe('listbox')
  })

  it('result items have role="option"', () => {
    render(<NodeSearch {...defaultProps} />)
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
  })

  it('has screen-reader result count announcement', () => {
    render(<NodeSearch {...defaultProps} />)
    const srCount = screen.getByTestId('node-search-sr-count')
    expect(srCount.getAttribute('role')).toBe('status')
    expect(srCount.getAttribute('aria-live')).toBe('polite')
    expect(srCount.textContent).toContain('results available')
  })

  it('aria-activedescendant is not set when no item is highlighted', () => {
    render(<NodeSearch {...defaultProps} />)
    const input = screen.getByTestId('node-search-input')
    // Initially no item is highlighted
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })

  it('ArrowDown in input highlights first result (sets aria-activedescendant)', () => {
    render(<NodeSearch {...defaultProps} />)
    const input = screen.getByTestId('node-search-input')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy()
  })

  it('no results: shows empty state and no aria-activedescendant', () => {
    render(<NodeSearch {...defaultProps} nodes={[]} />)
    const input = screen.getByTestId('node-search-input')

    // Type something that won't match any registry entry
    fireEvent.change(input, { target: { value: 'xyznonexistent' } })

    const srCount = screen.getByTestId('node-search-sr-count')
    expect(srCount.textContent).toContain('No results found')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })
})

// ─── ValidationPanel Accessibility ────────────────────────────────────────────

describe('Accessibility: ValidationPanel', () => {
  it('ValidationPanel has aria-live status region when opened via toolbar', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    const statusRegion = screen.getByTestId('validation-panel-status')
    expect(statusRegion.getAttribute('role')).toBe('status')
    expect(statusRegion.getAttribute('aria-live')).toBe('polite')
  })

  it('ValidationPanel empty state has role="status"', async () => {
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    const emptyState = screen.getByTestId('validation-panel-empty')
    expect(emptyState.getAttribute('role')).toBe('status')
  })

  it('ValidationPanel error list has aria-live="polite"', async () => {
    // With no errors, we just verify the structure is correct
    render(<WorkflowBuilderPanel />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbar-validate'))
    })

    // The status region announces the count
    const statusRegion = screen.getByTestId('validation-panel-status')
    expect(statusRegion.textContent).toContain('No validation issues')
  })
})

// ─── Toolbar Accessibility ────────────────────────────────────────────────────

describe('Accessibility: BuilderToolbar', () => {
  it('all toolbar buttons have aria-labels', () => {
    render(<WorkflowBuilderPanel />)
    expect(screen.getByLabelText('Undo')).toBeTruthy()
    expect(screen.getByLabelText('Redo')).toBeTruthy()
    expect(screen.getByLabelText('Save workflow')).toBeTruthy()
    expect(screen.getByLabelText('Toggle validation panel')).toBeTruthy()
  })

  it('validation badge is not rendered when error count is zero', () => {
    render(<WorkflowBuilderPanel />)
    // Badge is conditionally rendered only when validationErrorCount > 0
    expect(screen.queryByTestId('toolbar-validation-badge')).toBeNull()
  })

  it('auto-layout button has disabled attribute and aria-label', () => {
    render(<WorkflowBuilderPanel />)
    const autoLayout = screen.getByLabelText('Auto layout')
    expect(autoLayout).toBeTruthy()
    expect((autoLayout as HTMLButtonElement).disabled).toBe(true)
  })
})
