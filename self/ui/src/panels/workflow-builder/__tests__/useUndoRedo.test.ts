// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import {
  useUndoRedo,
  createAddNodeCommand,
  createRemoveNodeCommand,
  createAddEdgeCommand,
  createRemoveEdgeCommand,
  createMoveNodeCommand,
  createUpdateNodeDataCommand,
} from '../hooks/useUndoRedo'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  BuilderMutableState,
} from '../../../types/workflow-builder'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeNode = (id: string, label = 'Test Node'): WorkflowBuilderNode => ({
  id,
  type: 'builderNode',
  position: { x: 0, y: 0 },
  data: { label, category: 'trigger', nousType: 'nous.trigger.webhook' },
})

const makeEdge = (id: string, source: string, target: string): WorkflowBuilderEdge => ({
  id,
  source,
  target,
  data: { edgeType: 'execution' },
})

const emptyState: BuilderMutableState = { nodes: [], edges: [] }

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useUndoRedo', () => {
  // ─── Tier 1 — Contract ────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('executeCommand applies command and pushes to history; canUndo becomes true', () => {
      const { result } = renderHook(() => useUndoRedo())
      const node = makeNode('n1')
      const command = createAddNodeCommand(node)

      let newState: BuilderMutableState
      act(() => {
        newState = result.current.executeCommand(command, emptyState)
      })

      expect(newState!.nodes).toHaveLength(1)
      expect(newState!.nodes[0].id).toBe('n1')
      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo reverses last command; canRedo becomes true', () => {
      const { result } = renderHook(() => useUndoRedo())
      const node = makeNode('n1')
      const command = createAddNodeCommand(node)

      let state: BuilderMutableState
      act(() => {
        state = result.current.executeCommand(command, emptyState)
      })

      let undoneState: BuilderMutableState | null
      act(() => {
        undoneState = result.current.undo(state!)
      })

      expect(undoneState!).not.toBeNull()
      expect(undoneState!.nodes).toHaveLength(0)
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(true)
    })

    it('redo reapplies undone command; canRedo becomes false', () => {
      const { result } = renderHook(() => useUndoRedo())
      const node = makeNode('n1')
      const command = createAddNodeCommand(node)

      let state: BuilderMutableState
      act(() => {
        state = result.current.executeCommand(command, emptyState)
      })

      act(() => {
        state = result.current.undo(state)!
      })

      let redoneState: BuilderMutableState | null
      act(() => {
        redoneState = result.current.redo(state)
      })

      expect(redoneState!).not.toBeNull()
      expect(redoneState!.nodes).toHaveLength(1)
      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(false)
    })

    it('clearHistory resets stack; canUndo and canRedo both false', () => {
      const { result } = renderHook(() => useUndoRedo())
      const node = makeNode('n1')
      const command = createAddNodeCommand(node)

      act(() => {
        result.current.executeCommand(command, emptyState)
      })

      expect(result.current.canUndo).toBe(true)

      act(() => {
        result.current.clearHistory()
      })

      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })
  })

  // ─── Tier 2 — Behavior ───────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('sequential undo chain: 3 commands, undo all, state matches initial', () => {
      const { result } = renderHook(() => useUndoRedo())
      const n1 = makeNode('n1', 'Node 1')
      const n2 = makeNode('n2', 'Node 2')
      const n3 = makeNode('n3', 'Node 3')

      let state: BuilderMutableState = emptyState
      act(() => {
        state = result.current.executeCommand(createAddNodeCommand(n1), state)
      })
      act(() => {
        state = result.current.executeCommand(createAddNodeCommand(n2), state)
      })
      act(() => {
        state = result.current.executeCommand(createAddNodeCommand(n3), state)
      })

      expect(state.nodes).toHaveLength(3)

      // Undo all 3
      act(() => { state = result.current.undo(state)! })
      act(() => { state = result.current.undo(state)! })
      act(() => { state = result.current.undo(state)! })

      expect(state.nodes).toHaveLength(0)
      expect(result.current.canUndo).toBe(false)
    })

    it('sequential redo chain: undo 3, redo all, state matches post-execution', () => {
      const { result } = renderHook(() => useUndoRedo())
      const n1 = makeNode('n1')
      const n2 = makeNode('n2')
      const n3 = makeNode('n3')

      let state: BuilderMutableState = emptyState
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n1), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n2), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n3), state) })

      // Undo all
      act(() => { state = result.current.undo(state)! })
      act(() => { state = result.current.undo(state)! })
      act(() => { state = result.current.undo(state)! })

      // Redo all
      act(() => { state = result.current.redo(state)! })
      act(() => { state = result.current.redo(state)! })
      act(() => { state = result.current.redo(state)! })

      expect(state.nodes).toHaveLength(3)
      expect(result.current.canRedo).toBe(false)
    })

    it('new command after undo truncates redo future', () => {
      const { result } = renderHook(() => useUndoRedo())
      const n1 = makeNode('n1')
      const n2 = makeNode('n2')
      const n3 = makeNode('n3')
      const nNew = makeNode('n-new', 'New Node')

      let state: BuilderMutableState = emptyState
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n1), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n2), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n3), state) })

      // Undo 1
      act(() => { state = result.current.undo(state)! })
      expect(result.current.canRedo).toBe(true)

      // Execute new command — should truncate redo
      act(() => { state = result.current.executeCommand(createAddNodeCommand(nNew), state) })
      expect(result.current.canRedo).toBe(false)
      expect(state.nodes).toHaveLength(3) // n1, n2, nNew (n3 discarded)
      expect(state.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n-new'])
    })

    it('history depth: push 55 commands with maxDepth=50 -> oldest dropped', () => {
      const { result } = renderHook(() => useUndoRedo(50))

      let state: BuilderMutableState = emptyState
      for (let i = 0; i < 55; i++) {
        act(() => {
          state = result.current.executeCommand(
            createAddNodeCommand(makeNode(`n${i}`)),
            state,
          )
        })
      }

      // Should still be able to undo, but only 50 times
      let undoCount = 0
      let current = state
      while (result.current.canUndo) {
        act(() => { current = result.current.undo(current)! })
        undoCount++
      }

      expect(undoCount).toBe(50)
    })
  })

  // ─── Tier 3 — Edge Cases ──────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('undo on empty stack returns null', () => {
      const { result } = renderHook(() => useUndoRedo())

      let undoneState: BuilderMutableState | null = null
      act(() => {
        undoneState = result.current.undo(emptyState)
      })

      expect(undoneState).toBeNull()
    })

    it('redo on empty redo stack returns null', () => {
      const { result } = renderHook(() => useUndoRedo())

      let redoneState: BuilderMutableState | null = null
      act(() => {
        redoneState = result.current.redo(emptyState)
      })

      expect(redoneState).toBeNull()
    })

    it('history clear while pointer is mid-stack resets cleanly', () => {
      const { result } = renderHook(() => useUndoRedo())
      const n1 = makeNode('n1')
      const n2 = makeNode('n2')

      let state: BuilderMutableState = emptyState
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n1), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n2), state) })
      act(() => { state = result.current.undo(state)! })

      // Pointer is now mid-stack
      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(true)

      act(() => { result.current.clearHistory() })

      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('maxDepth of 1: only one command in history at any time', () => {
      const { result } = renderHook(() => useUndoRedo(1))
      const n1 = makeNode('n1')
      const n2 = makeNode('n2')

      let state: BuilderMutableState = emptyState
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n1), state) })
      act(() => { state = result.current.executeCommand(createAddNodeCommand(n2), state) })

      // Can only undo once
      let undoCount = 0
      while (result.current.canUndo) {
        act(() => { state = result.current.undo(state)! })
        undoCount++
      }
      expect(undoCount).toBe(1)
    })
  })

  // ─── Command Factory Tests ────────────────────────────────────────────

  describe('Command factories', () => {
    it('createRemoveNodeCommand: undo restores node AND connected edges', () => {
      const node = makeNode('n1')
      const edge = makeEdge('e1', 'n1', 'n2')
      const command = createRemoveNodeCommand(node, [edge])

      const initial: BuilderMutableState = {
        nodes: [node, makeNode('n2')],
        edges: [edge],
      }

      const afterRemove = command.execute(initial)
      expect(afterRemove.nodes).toHaveLength(1)
      expect(afterRemove.edges).toHaveLength(0)

      const afterUndo = command.undo(afterRemove)
      expect(afterUndo.nodes).toHaveLength(2)
      expect(afterUndo.edges).toHaveLength(1)
    })

    it('createMoveNodeCommand: execute moves, undo restores position', () => {
      const node = makeNode('n1')
      node.position = { x: 10, y: 20 }

      const command = createMoveNodeCommand('n1', { x: 10, y: 20 }, { x: 100, y: 200 })

      const initial: BuilderMutableState = { nodes: [node], edges: [] }
      const afterMove = command.execute(initial)
      expect(afterMove.nodes[0].position).toEqual({ x: 100, y: 200 })

      const afterUndo = command.undo(afterMove)
      expect(afterUndo.nodes[0].position).toEqual({ x: 10, y: 20 })
    })

    it('createUpdateNodeDataCommand: execute merges data, undo restores', () => {
      const node = makeNode('n1')
      node.data = { ...node.data, customField: 'original' }

      const command = createUpdateNodeDataCommand(
        'n1',
        { customField: 'original' } as any,
        { customField: 'updated' } as any,
      )

      const initial: BuilderMutableState = { nodes: [node], edges: [] }
      const afterUpdate = command.execute(initial)
      expect(afterUpdate.nodes[0].data.customField).toBe('updated')

      const afterUndo = command.undo(afterUpdate)
      expect(afterUndo.nodes[0].data.customField).toBe('original')
    })

    it('createAddEdgeCommand: execute adds, undo removes', () => {
      const edge = makeEdge('e1', 'n1', 'n2')
      const command = createAddEdgeCommand(edge)

      const initial: BuilderMutableState = { nodes: [], edges: [] }
      const afterAdd = command.execute(initial)
      expect(afterAdd.edges).toHaveLength(1)

      const afterUndo = command.undo(afterAdd)
      expect(afterUndo.edges).toHaveLength(0)
    })

    it('createRemoveEdgeCommand: execute removes, undo restores', () => {
      const edge = makeEdge('e1', 'n1', 'n2')
      const command = createRemoveEdgeCommand(edge)

      const initial: BuilderMutableState = { nodes: [], edges: [edge] }
      const afterRemove = command.execute(initial)
      expect(afterRemove.edges).toHaveLength(0)

      const afterUndo = command.undo(afterRemove)
      expect(afterUndo.edges).toHaveLength(1)
    })
  })
})
