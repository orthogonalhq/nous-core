// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkflowInspector } from '../inspectors/WorkflowInspector'
import type { WorkflowSpec } from '@nous/shared'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../floating-panel/useFloatingPanel', () => ({
  useFloatingPanel: () => ({
    state: { x: 0, y: 0, collapsed: false, pinned: false, visible: true },
    panelRef: { current: null },
    onCollapse: vi.fn(),
    onPin: vi.fn(),
    onClose: vi.fn(),
    onShow: vi.fn(),
    onDragStart: vi.fn(),
    onDrag: vi.fn(),
    onDragEnd: vi.fn(),
  }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>

function makeNode(id: string): WorkflowBuilderNode {
  return {
    id,
    type: 'builderNode',
    position: { x: 0, y: 0 },
    data: { label: id, category: 'tool', nousType: `nous.tool.${id}` },
  }
}

function makeEdge(source: string, target: string): WorkflowBuilderEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'builderEdge',
    data: { edgeType: 'execution' },
  }
}

const testNodes = [makeNode('a'), makeNode('b'), makeNode('c')]
const testEdges = [makeEdge('a', 'b')]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkflowInspector', () => {
  // ─── Tier 2 — Behavior ───────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('renders workflow name and version from getCurrentSpec()', () => {
      const getCurrentSpec = vi.fn(() => ({
        spec: {
          name: 'Test Workflow',
          version: 2,
          nodes: [{ id: 'a', name: 'A', type: 'nous.tool.echo', position: [0, 0] as [number, number], parameters: {} }],
          connections: [],
        } satisfies WorkflowSpec,
        yaml: '',
      }))

      render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('workflow-name').textContent).toBe('Test Workflow')
      expect(screen.getByTestId('workflow-version').textContent).toBe('2')
    })

    it('renders empty strings for name/version when getCurrentSpec() returns null', () => {
      const getCurrentSpec = vi.fn(() => null)

      render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('workflow-name').textContent).toBe('')
      expect(screen.getByTestId('workflow-version').textContent).toBe('')
    })

    it('renders correct node count and edge count', () => {
      const getCurrentSpec = vi.fn(() => null)

      render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('workflow-node-count').textContent).toBe('3')
      expect(screen.getByTestId('workflow-edge-count').textContent).toBe('1')
    })

    it('renders correct connected component count from computeConnectedComponents', () => {
      const getCurrentSpec = vi.fn(() => null)

      // 3 nodes, 1 edge (a->b), so 2 components (a-b connected, c isolated)
      render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('workflow-component-count').textContent).toBe('2')
    })

    it('renders content when selectedNodeId and selectedEdgeId are both null', () => {
      const getCurrentSpec = vi.fn(() => null)

      render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('floating-panel')).toBeTruthy()
    })

    it('panel content is hidden when a node is selected (selectedNodeId non-null)', () => {
      const getCurrentSpec = vi.fn(() => null)

      const { container } = render(
        <WorkflowInspector
          selectedNodeId="a"
          selectedEdgeId={null}
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(container.innerHTML).toBe('')
    })

    it('panel content is hidden when an edge is selected (selectedEdgeId non-null)', () => {
      const getCurrentSpec = vi.fn(() => null)

      const { container } = render(
        <WorkflowInspector
          selectedNodeId={null}
          selectedEdgeId="e-a-b"
          nodes={testNodes}
          edges={testEdges}
          getCurrentSpec={getCurrentSpec}
          containerRef={containerRef}
        />,
      )
      expect(container.innerHTML).toBe('')
    })
  })
})
