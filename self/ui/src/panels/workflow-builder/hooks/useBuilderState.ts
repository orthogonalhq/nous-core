'use client'

import { useState, useCallback } from 'react'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection, Viewport } from '@xyflow/react'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  BuilderMode,
} from '../../../types/workflow-builder'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from '../demo-workflow'

// ─── Return type ──────────────────────────────────────────────────────────────

export interface UseBuilderStateReturn {
  /** Derived React Flow nodes. */
  nodes: WorkflowBuilderNode[]
  /** Derived React Flow edges. */
  edges: WorkflowBuilderEdge[]

  /** React Flow node-change handler. */
  onNodesChange: (changes: NodeChange<WorkflowBuilderNode>[]) => void
  /** React Flow edge-change handler. */
  onEdgesChange: (changes: EdgeChange<WorkflowBuilderEdge>[]) => void
  /** React Flow connection handler (no-op stub in Phase 1). */
  onConnect: (connection: Connection) => void
  /** React Flow node-click handler — sets selectedNodeId. */
  onNodeClick: (event: React.MouseEvent, node: WorkflowBuilderNode) => void
  /** React Flow edge-click handler — sets selectedEdgeId. */
  onEdgeClick: (event: React.MouseEvent, edge: WorkflowBuilderEdge) => void
  /** React Flow pane-click handler — clears selection. */
  onPaneClick: (event: React.MouseEvent) => void

  /** Currently selected node ID, or null. */
  selectedNodeId: string | null
  /** Currently selected edge ID, or null. */
  selectedEdgeId: string | null

  /** Current builder interaction mode. */
  mode: BuilderMode
  /** Update builder interaction mode. */
  setMode: (mode: BuilderMode) => void

  /** Canvas viewport state. */
  viewport: Viewport
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/**
 * Central state hook for the workflow builder canvas.
 *
 * Implements the **projection pattern**: derives React Flow `Node[]` and
 * `Edge[]` from demo data (Phase 1) or a WorkflowSpec (Phase 2+).
 * Never mutates the source spec — only applies React Flow visual changes
 * (position drag, selection highlight) via `applyNodeChanges`/`applyEdgeChanges`.
 */
export function useBuilderState(): UseBuilderStateReturn {
  const [nodes, setNodes] = useState<WorkflowBuilderNode[]>(() => [...DEMO_WORKFLOW_NODES])
  const [edges, setEdges] = useState<WorkflowBuilderEdge[]>(() => [...DEMO_WORKFLOW_EDGES])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [mode, setMode] = useState<BuilderMode>('authoring')
  const [viewport] = useState<Viewport>(DEFAULT_VIEWPORT)

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowBuilderNode>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowBuilderEdge>[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  )

  const onConnect = useCallback((_connection: Connection) => {
    // No-op stub — connection creation is Phase 2 scope
  }, [])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: WorkflowBuilderNode) => {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
    },
    [],
  )

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: WorkflowBuilderEdge) => {
      setSelectedEdgeId(edge.id)
      setSelectedNodeId(null)
    },
    [],
  )

  const onPaneClick = useCallback((_event: React.MouseEvent) => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [])

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    selectedNodeId,
    selectedEdgeId,
    mode,
    setMode,
    viewport,
  }
}
