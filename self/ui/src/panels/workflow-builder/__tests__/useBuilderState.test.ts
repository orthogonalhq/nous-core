// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { useBuilderState } from '../hooks/useBuilderState'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from '../demo-workflow'

describe('useBuilderState', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('returns nodes array with 7 items matching demo data IDs', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.nodes).toHaveLength(7)
      const nodeIds = result.current.nodes.map((n) => n.id)
      for (const demoNode of DEMO_WORKFLOW_NODES) {
        expect(nodeIds).toContain(demoNode.id)
      }
    })

    it('returns edges array with 7 items matching demo data IDs', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.edges).toHaveLength(7)
      const edgeIds = result.current.edges.map((e) => e.id)
      for (const demoEdge of DEMO_WORKFLOW_EDGES) {
        expect(edgeIds).toContain(demoEdge.id)
      }
    })

    it('initial selectedNodeId is null', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.selectedNodeId).toBeNull()
    })

    it('initial selectedEdgeId is null', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.selectedEdgeId).toBeNull()
    })

    it('initial mode is "authoring"', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.mode).toBe('authoring')
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('onNodeClick sets selectedNodeId and clears selectedEdgeId', () => {
      const { result } = renderHook(() => useBuilderState())
      const mockEvent = {} as React.MouseEvent
      const targetNode = result.current.nodes[0]

      act(() => {
        result.current.onNodeClick(mockEvent, targetNode)
      })

      expect(result.current.selectedNodeId).toBe(targetNode.id)
      expect(result.current.selectedEdgeId).toBeNull()
    })

    it('onEdgeClick sets selectedEdgeId and clears selectedNodeId', () => {
      const { result } = renderHook(() => useBuilderState())
      const mockEvent = {} as React.MouseEvent

      // First select a node
      act(() => {
        result.current.onNodeClick(mockEvent, result.current.nodes[0])
      })

      // Then select an edge
      const targetEdge = result.current.edges[0]
      act(() => {
        result.current.onEdgeClick(mockEvent, targetEdge)
      })

      expect(result.current.selectedEdgeId).toBe(targetEdge.id)
      expect(result.current.selectedNodeId).toBeNull()
    })

    it('onPaneClick clears both selections', () => {
      const { result } = renderHook(() => useBuilderState())
      const mockEvent = {} as React.MouseEvent

      // Select a node first
      act(() => {
        result.current.onNodeClick(mockEvent, result.current.nodes[0])
      })
      expect(result.current.selectedNodeId).not.toBeNull()

      // Click pane to clear
      act(() => {
        result.current.onPaneClick(mockEvent)
      })

      expect(result.current.selectedNodeId).toBeNull()
      expect(result.current.selectedEdgeId).toBeNull()
    })

    it('setMode updates mode to "monitoring"', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.setMode('monitoring')
      })

      expect(result.current.mode).toBe('monitoring')
    })

    it('onNodesChange applies position changes to nodes', () => {
      const { result } = renderHook(() => useBuilderState())
      const targetNode = result.current.nodes[0]

      act(() => {
        result.current.onNodesChange([
          {
            type: 'position',
            id: targetNode.id,
            position: { x: 999, y: 888 },
          } as any,
        ])
      })

      const updatedNode = result.current.nodes.find((n) => n.id === targetNode.id)
      expect(updatedNode?.position).toEqual({ x: 999, y: 888 })
    })
  })

  // ─── Tier 3 — Edge Case ────────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('double-clicking same node keeps it selected', () => {
      const { result } = renderHook(() => useBuilderState())
      const mockEvent = {} as React.MouseEvent
      const targetNode = result.current.nodes[2]

      act(() => {
        result.current.onNodeClick(mockEvent, targetNode)
      })
      act(() => {
        result.current.onNodeClick(mockEvent, targetNode)
      })

      expect(result.current.selectedNodeId).toBe(targetNode.id)
    })

    it('onConnect is callable and does not throw', () => {
      const { result } = renderHook(() => useBuilderState())

      expect(() => {
        act(() => {
          result.current.onConnect({
            source: 'node-1',
            target: 'node-2',
            sourceHandle: null,
            targetHandle: null,
          })
        })
      }).not.toThrow()
    })
  })

  // ─── Phase 2 Mutations ───────────────────────────────────────────────────

  describe('Phase 2 — Mutations', () => {
    describe('addNode', () => {
      it('creates a valid WorkflowBuilderNode with correct structure', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.nodes.length

        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 100, y: 200 })
        })

        expect(result.current.nodes).toHaveLength(initialCount + 1)
        const newNode = result.current.nodes[result.current.nodes.length - 1]
        expect(newNode.type).toBe('builderNode')
        expect(newNode.position).toEqual({ x: 100, y: 200 })
        expect(newNode.data.category).toBe('trigger')
        expect(newNode.data.nousType).toBe('nous.trigger.webhook')
        expect(newNode.data.label).toBe('Webhook Trigger')
        expect(newNode.id).toBeTruthy()
      })

      it('generates unique IDs for each node', () => {
        const { result } = renderHook(() => useBuilderState())

        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })
        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 50, y: 50 })
        })

        const ids = result.current.nodes.map((n) => n.id)
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(ids.length)
      })

      it('uses fallback registry entry for unknown types', () => {
        const { result } = renderHook(() => useBuilderState())

        act(() => {
          result.current.addNode('nous.unknown.foobar', { x: 0, y: 0 })
        })

        const newNode = result.current.nodes[result.current.nodes.length - 1]
        expect(newNode.data.label).toBe('Unknown')
        expect(newNode.data.nousType).toBe('nous.unknown.foobar')
      })
    })

    describe('removeNode', () => {
      it('removes the target node', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.nodes.length

        act(() => {
          result.current.removeNode('node-1')
        })

        expect(result.current.nodes).toHaveLength(initialCount - 1)
        expect(result.current.nodes.find((n) => n.id === 'node-1')).toBeUndefined()
      })

      it('removes connected edges when node is removed', () => {
        const { result } = renderHook(() => useBuilderState())

        // node-1 is source of edge-1
        act(() => {
          result.current.removeNode('node-1')
        })

        expect(result.current.edges.find((e) => e.id === 'edge-1')).toBeUndefined()
      })
    })

    describe('addEdge', () => {
      it('creates a valid WorkflowBuilderEdge with correct structure', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.edges.length

        act(() => {
          result.current.addEdge({
            source: 'node-6',
            target: 'node-7',
            sourceHandle: null,
            targetHandle: null,
          })
        })

        expect(result.current.edges).toHaveLength(initialCount + 1)
        const newEdge = result.current.edges[result.current.edges.length - 1]
        expect(newEdge.id).toBe('e-node-6-node-7')
        expect(newEdge.source).toBe('node-6')
        expect(newEdge.target).toBe('node-7')
        expect(newEdge.type).toBe('builderEdge')
        expect(newEdge.data?.edgeType).toBe('execution')
      })

      it('prevents duplicate edges for the same source/target pair', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.edges.length

        act(() => {
          result.current.addEdge({
            source: 'node-6',
            target: 'node-7',
            sourceHandle: null,
            targetHandle: null,
          })
        })

        const countAfterFirst = result.current.edges.length
        expect(countAfterFirst).toBe(initialCount + 1)

        act(() => {
          result.current.addEdge({
            source: 'node-6',
            target: 'node-7',
            sourceHandle: null,
            targetHandle: null,
          })
        })

        expect(result.current.edges.length).toBe(countAfterFirst)
      })
    })

    describe('onConnect wiring', () => {
      it('onConnect calls addEdge and creates an edge', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.edges.length

        act(() => {
          result.current.onConnect({
            source: 'node-6',
            target: 'node-7',
            sourceHandle: null,
            targetHandle: null,
          })
        })

        expect(result.current.edges).toHaveLength(initialCount + 1)
        const newEdge = result.current.edges[result.current.edges.length - 1]
        expect(newEdge.source).toBe('node-6')
        expect(newEdge.target).toBe('node-7')
      })
    })
  })
})
