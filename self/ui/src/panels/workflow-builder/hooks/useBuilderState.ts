'use client'

import { useState, useCallback } from 'react'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection, Viewport, XYPosition } from '@xyflow/react'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderEdgeData,
  BuilderMode,
} from '../../../types/workflow-builder'
import { getRegistryEntry } from '../nodes/node-registry'
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
  /** React Flow connection handler — creates a new edge. */
  onConnect: (connection: Connection) => void

  /** Add a new node to the canvas at the given position. */
  addNode: (nousType: string, position: XYPosition) => void
  /** Remove a node and its connected edges. */
  removeNode: (nodeId: string) => void
  /** Add a new edge from a connection event. */
  addEdge: (connection: Connection) => void
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

  // ─── Phase 2 mutations ────────────────────────────────────────────────────

  const addNode = useCallback(
    (nousType: string, position: XYPosition) => {
      const entry = getRegistryEntry(nousType)
      const id = crypto.randomUUID()
      const newNode: WorkflowBuilderNode = {
        id,
        type: 'builderNode',
        position,
        data: {
          label: entry.defaultLabel,
          category: entry.category,
          nousType,
          description: '',
        },
      }
      setNodes((prev) => [...prev, newNode])
    },
    [],
  )

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
    },
    [],
  )

  const addEdge = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const edgeId = `e-${connection.source}-${connection.target}`
      const edgeData: WorkflowBuilderEdgeData = { edgeType: 'execution' }
      const newEdge: WorkflowBuilderEdge = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'builderEdge',
        data: edgeData,
      }
      setEdges((prev) => {
        // Prevent duplicate edges for the same source/target pair
        if (prev.some((e) => e.id === edgeId)) return prev
        return [...prev, newEdge]
      })
    },
    [],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      addEdge(connection)
    },
    [addEdge],
  )

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
    addNode,
    removeNode,
    addEdge,
  }
}
