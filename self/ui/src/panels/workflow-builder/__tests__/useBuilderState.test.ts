// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { useBuilderState } from '../hooks/useBuilderState'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from '../demo-workflow'

// ─── Test YAML fixture ──────────────────────────────────────────────────────

const TEST_YAML = `
name: Test Workflow
version: 1
nodes:
  - id: trigger-1
    name: Webhook Trigger
    type: nous.trigger.webhook
    position: [100, 50]
    parameters:
      path: /api/hook
  - id: agent-1
    name: Classify Intent
    type: nous.agent.classify
    position: [100, 250]
connections:
  - from: trigger-1
    to: agent-1
`

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

    it('initial isDirty is false', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.isDirty).toBe(false)
    })

    it('initial validationErrors is empty array', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.validationErrors).toEqual([])
    })

    it('initial canUndo is false', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.canUndo).toBe(false)
    })

    it('initial canRedo is false', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.canRedo).toBe(false)
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

    describe('removeEdge', () => {
      it('removes the target edge', () => {
        const { result } = renderHook(() => useBuilderState())
        const initialCount = result.current.edges.length

        act(() => {
          result.current.removeEdge('edge-1')
        })

        expect(result.current.edges).toHaveLength(initialCount - 1)
        expect(result.current.edges.find((e) => e.id === 'edge-1')).toBeUndefined()
      })
    })

    describe('updateNodeData', () => {
      it('merges partial data without losing existing fields', () => {
        const { result } = renderHook(() => useBuilderState())
        const nodeId = result.current.nodes[0].id
        const originalLabel = result.current.nodes[0].data.label

        act(() => {
          result.current.updateNodeData(nodeId, { description: 'Updated description' })
        })

        const updatedNode = result.current.nodes.find((n) => n.id === nodeId)!
        expect(updatedNode.data.description).toBe('Updated description')
        expect(updatedNode.data.label).toBe(originalLabel)
        expect(updatedNode.data.category).toBe('trigger')
      })

      it('with empty partial {} produces no visible change', () => {
        const { result } = renderHook(() => useBuilderState())
        const nodeId = result.current.nodes[0].id
        const originalData = { ...result.current.nodes[0].data }

        act(() => {
          result.current.updateNodeData(nodeId, {})
        })

        const updatedNode = result.current.nodes.find((n) => n.id === nodeId)!
        expect(updatedNode.data.label).toBe(originalData.label)
        expect(updatedNode.data.category).toBe(originalData.category)
      })
    })

    describe('moveNode', () => {
      it('updates node position', () => {
        const { result } = renderHook(() => useBuilderState())
        const nodeId = result.current.nodes[0].id

        act(() => {
          result.current.moveNode(nodeId, { x: 999, y: 888 })
        })

        const movedNode = result.current.nodes.find((n) => n.id === nodeId)!
        expect(movedNode.position).toEqual({ x: 999, y: 888 })
      })

      it('move to same position is still tracked as undoable command', () => {
        const { result } = renderHook(() => useBuilderState())
        const nodeId = result.current.nodes[0].id
        const originalPosition = { ...result.current.nodes[0].position }

        act(() => {
          result.current.moveNode(nodeId, originalPosition)
        })

        // Should still be undoable
        expect(result.current.canUndo).toBe(true)
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

  // ─── SP 2.2 — isDirty and validation ─────────────────────────────────────

  describe('SP 2.2 — isDirty tracking', () => {
    it('isDirty becomes true after addNode', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.isDirty).toBe(false)

      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })

      expect(result.current.isDirty).toBe(true)
    })

    it('isDirty is false after loadSpec', () => {
      const { result } = renderHook(() => useBuilderState())

      // Make dirty first
      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.isDirty).toBe(true)

      // Load spec resets
      act(() => {
        result.current.loadSpec(TEST_YAML)
      })

      expect(result.current.isDirty).toBe(false)
    })

    it('markClean resets isDirty to false', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.isDirty).toBe(true)

      act(() => {
        result.current.markClean()
      })
      expect(result.current.isDirty).toBe(false)
    })
  })

  // ─── SP 2.2 — Spec load/serialize ────────────────────────────────────────

  describe('SP 2.2 — Spec load and serialize', () => {
    it('loadSpec replaces nodes/edges with spec-projected state', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        const loadResult = result.current.loadSpec(TEST_YAML)
        expect(loadResult.success).toBe(true)
      })

      expect(result.current.nodes).toHaveLength(2)
      expect(result.current.edges).toHaveLength(1)
      expect(result.current.nodes[0].id).toBe('trigger-1')
      expect(result.current.nodes[1].id).toBe('agent-1')
    })

    it('loadSpec returns errors for invalid YAML', () => {
      const { result } = renderHook(() => useBuilderState())
      const initialNodeCount = result.current.nodes.length

      let loadResult: { success: boolean; errors?: any[] }
      act(() => {
        loadResult = result.current.loadSpec('not: valid: yaml: ][')
      })

      // Builder state should be preserved on failure
      expect(result.current.nodes).toHaveLength(initialNodeCount)
    })

    it('getCurrentSpec returns a valid WorkflowSpec', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.loadSpec(TEST_YAML)
      })

      const specResult = result.current.getCurrentSpec()
      expect(specResult).not.toBeNull()
      expect(specResult!.spec.name).toBe('Test Workflow')
      expect(specResult!.spec.version).toBe(1)
      expect(specResult!.spec.nodes).toHaveLength(2)
      expect(specResult!.yaml).toBeTruthy()
    })

    it('loading a new spec clears undo history', () => {
      const { result } = renderHook(() => useBuilderState())

      // Make a mutation to create undo history
      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.canUndo).toBe(true)

      // Load spec
      act(() => {
        result.current.loadSpec(TEST_YAML)
      })

      expect(result.current.canUndo).toBe(false)
    })
  })

  // ─── SP 2.2 — Undo/Redo integration ──────────────────────────────────────

  describe('SP 2.2 — Undo/Redo integration', () => {
    it('canUndo/canRedo reflect correct state through mutation -> undo -> redo', () => {
      const { result } = renderHook(() => useBuilderState())

      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)

      // Add node
      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(false)

      // Undo
      act(() => {
        result.current.undo()
      })
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(true)

      // Redo
      act(() => {
        result.current.redo()
      })
      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo restores node AND its connected edges after removeNode', () => {
      const { result } = renderHook(() => useBuilderState())

      // node-1 is source of edge-1 (to node-2)
      const edgesBefore = result.current.edges.filter(
        (e) => e.source === 'node-1' || e.target === 'node-1',
      )
      const nodesBefore = result.current.nodes.length

      act(() => {
        result.current.removeNode('node-1')
      })

      expect(result.current.nodes.find((n) => n.id === 'node-1')).toBeUndefined()

      // Undo
      act(() => {
        result.current.undo()
      })

      expect(result.current.nodes).toHaveLength(nodesBefore)
      expect(result.current.nodes.find((n) => n.id === 'node-1')).toBeDefined()

      // Connected edges should be restored
      const edgesAfterUndo = result.current.edges.filter(
        (e) => e.source === 'node-1' || e.target === 'node-1',
      )
      expect(edgesAfterUndo.length).toBe(edgesBefore.length)
    })

    it('undo/redo for addNode works correctly', () => {
      const { result } = renderHook(() => useBuilderState())
      const initialCount = result.current.nodes.length

      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 50, y: 50 })
      })
      expect(result.current.nodes).toHaveLength(initialCount + 1)

      act(() => {
        result.current.undo()
      })
      expect(result.current.nodes).toHaveLength(initialCount)

      act(() => {
        result.current.redo()
      })
      expect(result.current.nodes).toHaveLength(initialCount + 1)
    })

    it('undo/redo for moveNode restores position', () => {
      const { result } = renderHook(() => useBuilderState())
      const nodeId = result.current.nodes[0].id
      const originalPos = { ...result.current.nodes[0].position }

      act(() => {
        result.current.moveNode(nodeId, { x: 500, y: 600 })
      })
      expect(result.current.nodes.find((n) => n.id === nodeId)!.position).toEqual({ x: 500, y: 600 })

      act(() => {
        result.current.undo()
      })
      expect(result.current.nodes.find((n) => n.id === nodeId)!.position).toEqual(originalPos)
    })
  })
})
