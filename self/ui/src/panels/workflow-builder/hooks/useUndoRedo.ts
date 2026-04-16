/**
 * Command-pattern undo/redo hook with bounded history stack.
 *
 * SP 2.2 — Undo/Redo.
 *
 * Each mutation produces a BuilderCommand with execute() and undo() methods.
 * History stack respects a configurable maxDepth (default: 50).
 * Undo history is cleared on spec reload to prevent stale command references.
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  BuilderCommand,
  BuilderMutableState,
  UndoRedoState,
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderNodeData,
} from '../../../types/workflow-builder'
import type { XYPosition } from '@xyflow/react'

// ─── Command Factories ──────────────────────────────────────────────────────

export function createAddNodeCommand(node: WorkflowBuilderNode): BuilderCommand {
  return {
    action: { type: 'addNode', node },
    label: `Add ${node.data.label}`,
    execute: (state) => ({
      ...state,
      nodes: [...state.nodes, node],
    }),
    undo: (state) => ({
      ...state,
      nodes: state.nodes.filter((n) => n.id !== node.id),
    }),
  }
}

export function createRemoveNodeCommand(
  node: WorkflowBuilderNode,
  connectedEdges: WorkflowBuilderEdge[],
): BuilderCommand {
  return {
    action: { type: 'removeNode', nodeId: node.id },
    label: `Remove ${node.data.label}`,
    execute: (state) => ({
      nodes: state.nodes.filter((n) => n.id !== node.id),
      edges: state.edges.filter(
        (e) => e.source !== node.id && e.target !== node.id,
      ),
    }),
    undo: (state) => ({
      nodes: [...state.nodes, node],
      edges: [...state.edges, ...connectedEdges],
    }),
  }
}

export function createAddEdgeCommand(edge: WorkflowBuilderEdge): BuilderCommand {
  return {
    action: { type: 'addEdge', edge },
    label: `Add edge ${edge.id}`,
    execute: (state) => ({
      ...state,
      edges: [...state.edges, edge],
    }),
    undo: (state) => ({
      ...state,
      edges: state.edges.filter((e) => e.id !== edge.id),
    }),
  }
}

export function createRemoveEdgeCommand(edge: WorkflowBuilderEdge): BuilderCommand {
  return {
    action: { type: 'removeEdge', edgeId: edge.id },
    label: `Remove edge ${edge.id}`,
    execute: (state) => ({
      ...state,
      edges: state.edges.filter((e) => e.id !== edge.id),
    }),
    undo: (state) => ({
      ...state,
      edges: [...state.edges, edge],
    }),
  }
}

export function createMoveNodeCommand(
  nodeId: string,
  from: XYPosition,
  to: XYPosition,
): BuilderCommand {
  return {
    action: { type: 'moveNode', nodeId, from, to },
    label: `Move node ${nodeId}`,
    execute: (state) => ({
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: to } : n,
      ),
    }),
    undo: (state) => ({
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: from } : n,
      ),
    }),
  }
}

export function createUpdateNodeDataCommand(
  nodeId: string,
  before: Partial<WorkflowBuilderNodeData>,
  after: Partial<WorkflowBuilderNodeData>,
): BuilderCommand {
  return {
    action: { type: 'updateNodeData', nodeId, before, after },
    label: `Update node ${nodeId}`,
    execute: (state) => ({
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...after } }
          : n,
      ),
    }),
    undo: (state) => ({
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...before } }
          : n,
      ),
    }),
  }
}

// ─── Return type ────────────────────────────────────────────────────────────

export interface UseUndoRedoReturn {
  /** Execute a command and push it onto the undo stack. */
  executeCommand: (command: BuilderCommand, state: BuilderMutableState) => BuilderMutableState
  /** Undo the last command. Returns new state or null if nothing to undo. */
  undo: (state: BuilderMutableState) => BuilderMutableState | null
  /** Redo the last undone command. Returns new state or null if nothing to redo. */
  redo: (state: BuilderMutableState) => BuilderMutableState | null
  /** Whether undo is available. */
  canUndo: boolean
  /** Whether redo is available. */
  canRedo: boolean
  /** Clear the undo history (called on spec reload). */
  clearHistory: () => void
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 50

/**
 * Undo/redo hook using the command pattern.
 *
 * Uses a ref for the undo state to ensure synchronous reads within
 * executeCommand/undo/redo, while a version counter state triggers re-renders.
 */
export function useUndoRedo(maxDepth: number = DEFAULT_MAX_DEPTH): UseUndoRedoReturn {
  const stateRef = useRef<UndoRedoState>({
    history: [],
    pointer: 0,
    maxDepth,
  })

  // Version counter to trigger re-renders when undo state changes
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const canUndo = stateRef.current.pointer > 0
  const canRedo = stateRef.current.pointer < stateRef.current.history.length

  const executeCommand = useCallback(
    (command: BuilderCommand, state: BuilderMutableState): BuilderMutableState => {
      const newState = command.execute(state)
      const s = stateRef.current

      // Truncate redo future
      const truncated = s.history.slice(0, s.pointer)
      truncated.push(command)

      // Enforce max depth
      if (truncated.length > s.maxDepth) {
        const excess = truncated.length - s.maxDepth
        stateRef.current = {
          ...s,
          history: truncated.slice(excess),
          pointer: truncated.length - excess,
        }
      } else {
        stateRef.current = {
          ...s,
          history: truncated,
          pointer: truncated.length,
        }
      }

      bump()
      return newState
    },
    [bump],
  )

  const undoFn = useCallback(
    (state: BuilderMutableState): BuilderMutableState | null => {
      const s = stateRef.current
      if (s.pointer <= 0) return null

      const commandIndex = s.pointer - 1
      const command = s.history[commandIndex]
      if (!command) return null

      const newState = command.undo(state)
      stateRef.current = { ...s, pointer: commandIndex }
      bump()
      return newState
    },
    [bump],
  )

  const redoFn = useCallback(
    (state: BuilderMutableState): BuilderMutableState | null => {
      const s = stateRef.current
      if (s.pointer >= s.history.length) return null

      const command = s.history[s.pointer]
      if (!command) return null

      const newState = command.execute(state)
      stateRef.current = { ...s, pointer: s.pointer + 1 }
      bump()
      return newState
    },
    [bump],
  )

  const clearHistory = useCallback(() => {
    stateRef.current = {
      history: [],
      pointer: 0,
      maxDepth: stateRef.current.maxDepth,
    }
    bump()
  }, [bump])

  return {
    executeCommand,
    undo: undoFn,
    redo: redoFn,
    canUndo,
    canRedo,
    clearHistory,
  }
}
