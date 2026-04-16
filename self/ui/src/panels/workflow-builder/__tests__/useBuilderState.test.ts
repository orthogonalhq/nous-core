// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { trpcMock, mockMutateAsync, mockFetch, mockListWorkflowDefinitionsResult } from './trpc-mock'
vi.mock('@nous/transport', () => trpcMock)

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
    type: nous.agent.claude
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

    it('returns edges array with 8 items matching demo data IDs', () => {
      const { result } = renderHook(() => useBuilderState())
      expect(result.current.edges).toHaveLength(8)
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

    it('default mode parameter is authoring', () => {
      // useBuilderState() defaults to 'authoring' mode
      const { result } = renderHook(() => useBuilderState())
      // Verify mutations work (proving authoring mode)
      const initialCount = result.current.nodes.length
      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.nodes.length).toBe(initialCount + 1)
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

    it('accepts mode parameter and defaults to authoring', () => {
      const { result } = renderHook(() => useBuilderState())
      // Default mode is authoring — mutations should work
      const initialCount = result.current.nodes.length
      act(() => {
        result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
      })
      expect(result.current.nodes.length).toBe(initialCount + 1)
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

  // ─── Phase 2.2 — Persistence integration ──────────────────────────────────

  describe('Phase 2.2 — Persistence integration', () => {
    beforeEach(() => {
      mockMutateAsync.mockReset()
      mockFetch.mockReset()
      mockListWorkflowDefinitionsResult.data = []
      mockListWorkflowDefinitionsResult.isLoading = false
    })

    // Tier 1 — Contract

    describe('Tier 1 — Contract', () => {
      it('return type includes saveToServer, saveAsNew, resetToEmpty, isSaving, currentDefinitionId', () => {
        const { result } = renderHook(() => useBuilderState())
        expect(result.current.saveToServer).toBeTypeOf('function')
        expect(result.current.saveAsNew).toBeTypeOf('function')
        expect(result.current.resetToEmpty).toBeTypeOf('function')
        expect(result.current.isSaving).toBe(false)
        expect(result.current.currentDefinitionId).toBeNull()
      })

      it('saveToServer returns null when no projectId', async () => {
        const { result } = renderHook(() => useBuilderState())
        let saveResult: { definitionId: string } | null = null
        await act(async () => {
          saveResult = await result.current.saveToServer()
        })
        expect(saveResult).toBeNull()
        expect(mockMutateAsync).not.toHaveBeenCalled()
      })

      it('saveAsNew returns null when no projectId', async () => {
        const { result } = renderHook(() => useBuilderState())
        let saveResult: { definitionId: string } | null = null
        await act(async () => {
          saveResult = await result.current.saveAsNew()
        })
        expect(saveResult).toBeNull()
        expect(mockMutateAsync).not.toHaveBeenCalled()
      })

      it('resetToEmpty is a no-throw function without projectId', () => {
        const { result } = renderHook(() => useBuilderState())
        expect(() => {
          act(() => {
            result.current.resetToEmpty()
          })
        }).not.toThrow()
      })
    })

    // Tier 2 — Behavior

    describe('Tier 2 — Behavior', () => {
      it('saveToServer calls tRPC mutation with correct args and marks clean on success', async () => {
        mockMutateAsync.mockResolvedValue({ definitionId: 'def-123', validation: { valid: true } })

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        // Make dirty
        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })
        expect(result.current.isDirty).toBe(true)

        let saveResult: { definitionId: string } | null = null
        await act(async () => {
          saveResult = await result.current.saveToServer()
        })

        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-1',
            specYaml: expect.any(String),
          }),
        )
        expect(saveResult).toEqual({ definitionId: 'def-123' })
        expect(result.current.isDirty).toBe(false)
        expect(result.current.isSaving).toBe(false)
      })

      it('saveToServer does NOT mark clean on tRPC error', async () => {
        mockMutateAsync.mockRejectedValue(new Error('Save failed'))

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })
        expect(result.current.isDirty).toBe(true)

        let saveResult: { definitionId: string } | null = null
        await act(async () => {
          saveResult = await result.current.saveToServer()
        })

        expect(saveResult).toBeNull()
        expect(result.current.isDirty).toBe(true)
        expect(result.current.isSaving).toBe(false)
      })

      it('saveAsNew omits definitionId in tRPC call', async () => {
        mockMutateAsync.mockResolvedValue({ definitionId: 'new-def-456', validation: { valid: true } })

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })

        await act(async () => {
          await result.current.saveAsNew('My Workflow')
        })

        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-1',
            specYaml: expect.any(String),
            name: 'My Workflow',
          }),
        )
        // definitionId should NOT be in the call
        const callArgs = mockMutateAsync.mock.calls[0][0]
        expect(callArgs.definitionId).toBeUndefined()
      })

      it('resetToEmpty clears nodes, edges, definitionId, isDirty', () => {
        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        // Add some data first (starts empty with projectId)
        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })
        expect(result.current.nodes.length).toBeGreaterThan(0)
        expect(result.current.isDirty).toBe(true)

        act(() => {
          result.current.resetToEmpty()
        })

        expect(result.current.nodes).toHaveLength(0)
        expect(result.current.edges).toHaveLength(0)
        expect(result.current.isDirty).toBe(false)
        expect(result.current.currentDefinitionId).toBeNull()
      })

      it('initialization without projectId uses demo fallback', () => {
        const { result } = renderHook(() => useBuilderState())
        expect(result.current.nodes).toHaveLength(DEMO_WORKFLOW_NODES.length)
        expect(result.current.edges).toHaveLength(DEMO_WORKFLOW_EDGES.length)
      })

      it('initialization with projectId but no workflowDefinitionId starts empty when no default exists', () => {
        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )
        expect(result.current.nodes).toHaveLength(0)
        expect(result.current.edges).toHaveLength(0)
      })

      it('loads default workflow when projectId provided and project has a default definition', async () => {
        const TEST_SPEC_YAML = `
name: Saved Workflow
version: 1
nodes:
  - id: trigger-saved
    name: Saved Trigger
    type: nous.trigger.webhook
    position: [100, 50]
connections: []
`
        // Configure the list query to return a default definition
        mockListWorkflowDefinitionsResult.data = [
          { id: 'def-default-1', name: 'Saved Workflow', version: 1, isDefault: true },
        ]
        mockListWorkflowDefinitionsResult.isLoading = false

        // Configure the fetch to return specYaml for that definition
        mockFetch.mockResolvedValue({ specYaml: TEST_SPEC_YAML })

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        // Wait for the async fetch to resolve
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })

        // Should have fetched the default definition
        expect(mockFetch).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-1',
            definitionId: 'def-default-1',
          }),
        )

        // Should have loaded the spec into builder state
        expect(result.current.nodes).toHaveLength(1)
        expect(result.current.nodes[0].id).toBe('trigger-saved')
        expect(result.current.currentDefinitionId).toBe('def-default-1')
        expect(result.current.isDirty).toBe(false)
      })

      it('stays empty when projectId provided but no definitions are marked default', async () => {
        // List returns definitions but none is default
        mockListWorkflowDefinitionsResult.data = [
          { id: 'def-other', name: 'Other Workflow', version: 1, isDefault: false },
        ]
        mockListWorkflowDefinitionsResult.isLoading = false

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })

        // Should NOT have fetched any definition
        expect(mockFetch).not.toHaveBeenCalled()

        // Should remain empty
        expect(result.current.nodes).toHaveLength(0)
        expect(result.current.edges).toHaveLength(0)
      })

      it('subsequent saves after first save include the stored definitionId', async () => {
        mockMutateAsync
          .mockResolvedValueOnce({ definitionId: 'def-first', validation: { valid: true } })
          .mockResolvedValueOnce({ definitionId: 'def-first', validation: { valid: true } })

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        // First save
        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })
        await act(async () => {
          await result.current.saveToServer()
        })

        expect(mockMutateAsync.mock.calls[0][0].definitionId).toBeUndefined()

        // Make dirty again and save
        act(() => {
          result.current.addNode('nous.agent.claude', { x: 100, y: 100 })
        })
        await act(async () => {
          await result.current.saveToServer()
        })

        // Second save should include the stored definitionId
        expect(mockMutateAsync.mock.calls[1][0].definitionId).toBe('def-first')
      })
    })

    // Tier 3 — Edge Cases

    describe('Tier 3 — Edge Cases', () => {
      it('saveToServer while already saving is guarded by isSaving', async () => {
        let resolveFirst: (value: unknown) => void
        const firstPromise = new Promise((resolve) => {
          resolveFirst = resolve
        })
        mockMutateAsync.mockReturnValueOnce(firstPromise)

        const { result } = renderHook(() =>
          useBuilderState('authoring', { projectId: 'proj-1' }),
        )

        act(() => {
          result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
        })

        // Start first save (non-blocking)
        let firstSavePromise: Promise<unknown>
        act(() => {
          firstSavePromise = result.current.saveToServer()
        })

        // isSaving should be true while in-flight
        expect(result.current.isSaving).toBe(true)

        // Resolve the first save
        await act(async () => {
          resolveFirst!({ definitionId: 'def-1', validation: { valid: true } })
          await firstSavePromise!
        })

        expect(result.current.isSaving).toBe(false)
      })
    })
  })

  // ─── Phase 1.2 — Workflow navigation fixes ────────────────────────────────

  describe('Phase 1.2 — Navigation re-fetch and reset', () => {
    beforeEach(() => {
      mockMutateAsync.mockReset()
      mockFetch.mockReset()
      mockFetch.mockResolvedValue({ specYaml: undefined })
      mockListWorkflowDefinitionsResult.data = []
      mockListWorkflowDefinitionsResult.isLoading = false
    })

    // Tier 2 — Behavior

    it('re-fetches when workflowDefinitionId changes from id-A to id-B', async () => {
      const TEST_SPEC_A = `
name: Workflow A
version: 1
nodes:
  - id: trigger-a
    name: Trigger A
    type: nous.trigger.webhook
    position: [100, 50]
connections: []
`
      const TEST_SPEC_B = `
name: Workflow B
version: 1
nodes:
  - id: trigger-b
    name: Trigger B
    type: nous.trigger.webhook
    position: [200, 50]
connections: []
`
      mockFetch
        .mockResolvedValueOnce({ specYaml: TEST_SPEC_A })
        .mockResolvedValueOnce({ specYaml: TEST_SPEC_B })

      const { result, rerender } = renderHook(
        ({ defId }: { defId?: string }) =>
          useBuilderState('authoring', { projectId: 'proj-1', workflowDefinitionId: defId }),
        { initialProps: { defId: 'id-A' } },
      )

      // Wait for first fetch
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1', definitionId: 'id-A' }),
      )

      // Change to id-B
      rerender({ defId: 'id-B' })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ projectId: 'proj-1', definitionId: 'id-B' }),
      )
    })

    it('calls resetToEmpty when workflowDefinitionId transitions to undefined', async () => {
      const TEST_SPEC = `
name: Workflow
version: 1
nodes:
  - id: trigger-1
    name: Trigger
    type: nous.trigger.webhook
    position: [100, 50]
connections: []
`
      mockFetch.mockResolvedValue({ specYaml: TEST_SPEC })

      const { result, rerender } = renderHook(
        ({ defId }: { defId?: string }) =>
          useBuilderState('authoring', { projectId: 'proj-1', workflowDefinitionId: defId }),
        { initialProps: { defId: 'id-A' as string | undefined } },
      )

      // Wait for fetch
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(result.current.nodes.length).toBeGreaterThan(0)

      // Transition to undefined (+ button)
      rerender({ defId: undefined })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Should have reset to empty
      expect(result.current.nodes).toHaveLength(0)
      expect(result.current.edges).toHaveLength(0)
      expect(result.current.currentDefinitionId).toBeNull()
    })

    it('does not call resetToEmpty on initial mount with undefined', () => {
      const { result } = renderHook(() =>
        useBuilderState('authoring', { projectId: 'proj-1' }),
      )

      // Should start empty (no default configured) — not reset from demo
      expect(result.current.nodes).toHaveLength(0)
      expect(result.current.edges).toHaveLength(0)
    })

    // Tier 3 — Edge Case

    it('does not re-fetch when rerendered with same workflowDefinitionId', async () => {
      mockFetch.mockResolvedValue({ specYaml: undefined })

      const { rerender } = renderHook(
        ({ defId }: { defId?: string }) =>
          useBuilderState('authoring', { projectId: 'proj-1', workflowDefinitionId: defId }),
        { initialProps: { defId: 'id-A' } },
      )

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Rerender with same ID
      rerender({ defId: 'id-A' })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Should still only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
