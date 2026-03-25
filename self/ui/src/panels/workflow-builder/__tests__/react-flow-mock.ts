/**
 * Reusable @xyflow/react mock for vitest.
 *
 * Call `setupReactFlowMock()` at the top of test files (before imports)
 * via `vi.mock('@xyflow/react', () => reactFlowMock)`.
 */
import { vi } from 'vitest'
import React from 'react'

export const reactFlowMock = {
  // Components
  ReactFlow: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'react-flow', ...props }, children as React.ReactNode),

  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),

  Background: () => React.createElement('div', { 'data-testid': 'react-flow-background' }),
  MiniMap: () => React.createElement('div', { 'data-testid': 'react-flow-minimap' }),
  Controls: () => React.createElement('div', { 'data-testid': 'react-flow-controls' }),

  Handle: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': `handle-${props.type}-${props.id}` }),

  BaseEdge: () => React.createElement('g', { 'data-testid': 'base-edge' }),

  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),

  // Utilities
  getBezierPath: () => ['M0,0', 0, 0] as [string, number, number],

  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  }),

  applyNodeChanges: <T,>(changes: unknown[], nodes: T[]): T[] => {
    // Simplified: apply position changes for testing
    const changeMap = new Map<string, Record<string, unknown>>()
    for (const c of changes as Array<Record<string, unknown>>) {
      if (c.type === 'position' && c.id) {
        changeMap.set(c.id as string, c)
      }
    }
    if (changeMap.size === 0) return nodes
    return nodes.map((node) => {
      const n = node as Record<string, unknown>
      const change = changeMap.get(n.id as string)
      if (change && change.position) {
        return { ...n, position: change.position } as T
      }
      return node
    })
  },

  applyEdgeChanges: <T,>(_changes: unknown[], edges: T[]): T[] => edges,

  // Enums
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },

  BackgroundVariant: {
    Dots: 'dots',
    Lines: 'lines',
    Cross: 'cross',
  },
}
