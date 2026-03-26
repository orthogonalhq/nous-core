// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { ValidationPanel } from '../ValidationPanel'
import type { ValidationPanelProps } from '../ValidationPanel'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'
import type { WorkflowSpecValidationError } from '@nous/shared'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, index: number): WorkflowBuilderNode {
  return {
    id,
    type: 'builderNode',
    position: { x: index * 100, y: 0 },
    data: {
      label: `Node ${id}`,
      category: 'agent',
      nousType: `nous.agent.${id}`,
    },
  }
}

function createEdge(id: string, source: string, target: string): WorkflowBuilderEdge {
  return {
    id,
    source,
    target,
    data: { edgeType: 'execution' },
  }
}

const defaultNodes = [createNode('n1', 0), createNode('n2', 1)]
const defaultEdges = [createEdge('e1', 'n1', 'n2')]

function renderPanel(overrides: Partial<ValidationPanelProps> = {}) {
  const containerRef = React.createRef<HTMLDivElement>()
  const props: ValidationPanelProps = {
    validationErrors: [],
    nodes: defaultNodes,
    edges: defaultEdges,
    isVisible: true,
    onClose: vi.fn(),
    onErrorClick: vi.fn(),
    containerRef,
    ...overrides,
  }
  return {
    ...render(<ValidationPanel {...props} />),
    props,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ValidationPanel', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders without crashing with empty validationErrors', () => {
      expect(() => renderPanel()).not.toThrow()
    })

    it('exports ValidationPanelProps type', () => {
      const _props: ValidationPanelProps | undefined = undefined
      expect(_props).toBeUndefined()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('renders error list items with data-testid when errors are present', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'nodes[0].type', message: 'Missing node type' },
        { path: 'nodes[1].type', message: 'Invalid node type' },
      ]
      renderPanel({ validationErrors: errors })
      const items = screen.getAllByTestId('validation-panel-error-item')
      expect(items).toHaveLength(2)
    })

    it('renders empty state with "No issues found" when no errors', () => {
      renderPanel({ validationErrors: [] })
      expect(screen.getByTestId('validation-panel-empty')).toBeTruthy()
      expect(screen.getByText('No issues found')).toBeTruthy()
    })

    it('returns null when isVisible=false', () => {
      const { container } = renderPanel({ isVisible: false })
      expect(container.querySelector('[data-testid="validation-panel"]')).toBeNull()
    })

    it('clicking an error item calls onErrorClick with the error path', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'nodes[0].type', message: 'Missing node type' },
      ]
      const { props } = renderPanel({ validationErrors: errors })
      const item = screen.getByTestId('validation-panel-error-item')
      fireEvent.click(item)
      expect(props.onErrorClick).toHaveBeenCalledWith('nodes[0].type')
    })

    it('error count matches number of validation-panel-error-item elements', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'nodes[0].type', message: 'Error 1' },
        { path: 'nodes[1].type', message: 'Error 2' },
        { path: 'connections[0].from', message: 'Error 3' },
      ]
      renderPanel({ validationErrors: errors })
      const items = screen.getAllByTestId('validation-panel-error-item')
      expect(items).toHaveLength(3)
    })

    it('panel has data-testid="validation-panel"', () => {
      renderPanel()
      expect(screen.getByTestId('validation-panel')).toBeTruthy()
    })

    it('error list has aria-live="polite" attribute', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'nodes[0].type', message: 'Error' },
      ]
      renderPanel({ validationErrors: errors })
      const list = screen.getByRole('list')
      expect(list.getAttribute('aria-live')).toBe('polite')
    })
  })

  // ─── Tier 3 — Edge Cases ───────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('error with node path renders error item', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'nodes[0].type', message: 'Node error' },
      ]
      renderPanel({ validationErrors: errors })
      expect(screen.getByText('Node error')).toBeTruthy()
    })

    it('error with connection path renders error item', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'connections[0].from', message: 'Connection error' },
      ]
      renderPanel({ validationErrors: errors })
      expect(screen.getByText('Connection error')).toBeTruthy()
    })

    it('error with structural path renders error item', () => {
      const errors: WorkflowSpecValidationError[] = [
        { path: 'name', message: 'Name is required' },
      ]
      renderPanel({ validationErrors: errors })
      expect(screen.getByText('Name is required')).toBeTruthy()
    })
  })
})
