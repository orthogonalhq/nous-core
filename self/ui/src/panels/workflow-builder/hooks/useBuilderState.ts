'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection, Viewport, XYPosition } from '@xyflow/react'
import type { WorkflowSpec, WorkflowSpecValidationError } from '@nous/shared'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderEdgeData,
  WorkflowBuilderNodeData,
  BuilderMode,
} from '../../../types/workflow-builder'
import { getRegistryEntry } from '../nodes/node-registry'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from '../demo-workflow'
import { useWorkflowSync } from './useWorkflowSync'
import {
  useUndoRedo,
  createAddNodeCommand,
  createRemoveNodeCommand,
  createAddEdgeCommand,
  createRemoveEdgeCommand,
  createMoveNodeCommand,
  createUpdateNodeDataCommand,
} from './useUndoRedo'

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
  /** Remove an edge by ID. */
  removeEdge: (edgeId: string) => void
  /** Update partial node data (shallow merge). */
  updateNodeData: (nodeId: string, data: Partial<WorkflowBuilderNodeData>) => void
  /** Move a node to a new position (undoable). */
  moveNode: (nodeId: string, position: XYPosition) => void

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

  /** Validation errors from most recent outbound sync. */
  validationErrors: WorkflowSpecValidationError[]
  /** Whether builder state has diverged from last-loaded spec. */
  isDirty: boolean

  /** Load a WorkflowSpec YAML into the builder. */
  loadSpec: (yamlString: string) => { success: boolean; errors?: WorkflowSpecValidationError[] }
  /** Serialize current state to WorkflowSpec. */
  getCurrentSpec: () => { spec: WorkflowSpec; yaml: string } | null
  /** Mark builder as clean (e.g., after save). */
  markClean: () => void

  /** Undo the last mutation. */
  undo: () => void
  /** Redo the last undone mutation. */
  redo: () => void
  /** Whether undo is available. */
  canUndo: boolean
  /** Whether redo is available. */
  canRedo: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
const DEFAULT_SPEC_META = { name: 'Untitled Workflow', version: 1 }

/**
 * Central state hook for the workflow builder canvas.
 *
 * Implements the **projection pattern**: derives React Flow `Node[]` and
 * `Edge[]` from demo data (Phase 1 fallback) or a WorkflowSpec via the
 * sync layer. All mutations route through the undo pipeline and trigger
 * outbound sync + validation.
 */
export function useBuilderState(): UseBuilderStateReturn {
  const [nodes, setNodes] = useState<WorkflowBuilderNode[]>(() => [...DEMO_WORKFLOW_NODES])
  const [edges, setEdges] = useState<WorkflowBuilderEdge[]>(() => [...DEMO_WORKFLOW_EDGES])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [mode, setMode] = useState<BuilderMode>('authoring')
  const [viewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [validationErrors, setValidationErrors] = useState<WorkflowSpecValidationError[]>([])
  const [isDirty, setIsDirty] = useState(false)

  // Spec metadata for outbound serialization
  const specMetaRef = useRef(DEFAULT_SPEC_META)

  // Hooks
  const sync = useWorkflowSync()
  const undoRedo = useUndoRedo()

  // Refs for current nodes/edges (needed for stable callbacks)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  // ─── Outbound sync helper ───────────────────────────────────────────────

  const runOutboundSync = useCallback(
    (currentNodes: WorkflowBuilderNode[], currentEdges: WorkflowBuilderEdge[]) => {
      const result = sync.serializeCurrentState(currentNodes, currentEdges, specMetaRef.current)
      setValidationErrors(result.validationErrors)
    },
    [sync],
  )

  // ─── React Flow change handlers (non-undoable — visual only) ────────────

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

  // ─── Undoable mutations ─────────────────────────────────────────────────

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

      const command = createAddNodeCommand(newNode)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  const removeNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) return

      const connectedEdges = edgesRef.current.filter(
        (e) => e.source === nodeId || e.target === nodeId,
      )

      const command = createRemoveNodeCommand(node, connectedEdges)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  const addEdge = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const edgeId = `e-${connection.source}-${connection.target}`

      // Prevent duplicate
      if (edgesRef.current.some((e) => e.id === edgeId)) return

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

      const command = createAddEdgeCommand(newEdge)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  const removeEdge = useCallback(
    (edgeId: string) => {
      const edge = edgesRef.current.find((e) => e.id === edgeId)
      if (!edge) return

      const command = createRemoveEdgeCommand(edge)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<WorkflowBuilderNodeData>) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) return

      // Capture before snapshot (only the keys being changed)
      const before: Partial<WorkflowBuilderNodeData> = {}
      for (const key of Object.keys(data)) {
        ;(before as Record<string, unknown>)[key] = (node.data as Record<string, unknown>)[key]
      }

      const command = createUpdateNodeDataCommand(nodeId, before, data)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  const moveNode = useCallback(
    (nodeId: string, position: XYPosition) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) return

      const command = createMoveNodeCommand(nodeId, node.position, position)
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
      const newState = undoRedo.executeCommand(command, currentState)
      setNodes(newState.nodes)
      setEdges(newState.edges)
      setIsDirty(true)
      runOutboundSync(newState.nodes, newState.edges)
    },
    [undoRedo, runOutboundSync],
  )

  // ─── Connection handler ─────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      addEdge(connection)
    },
    [addEdge],
  )

  // ─── Selection handlers ─────────────────────────────────────────────────

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

  // ─── Spec load / serialize ──────────────────────────────────────────────

  const loadSpec = useCallback(
    (yamlString: string) => {
      const result = sync.loadSpec(yamlString)

      if (!result.success) {
        return { success: false as const, errors: result.errors }
      }

      setNodes(result.nodes!)
      setEdges(result.edges!)
      undoRedo.clearHistory()
      setIsDirty(false)
      setValidationErrors([])

      // Store spec metadata for outbound serialization
      if (result.spec) {
        specMetaRef.current = {
          name: result.spec.name,
          version: result.spec.version,
        }
      }

      return { success: true as const }
    },
    [sync, undoRedo],
  )

  const getCurrentSpec = useCallback((): { spec: WorkflowSpec; yaml: string } | null => {
    const result = sync.serializeCurrentState(
      nodesRef.current,
      edgesRef.current,
      specMetaRef.current,
    )
    return { spec: result.spec, yaml: result.yaml }
  }, [sync])

  const markClean = useCallback(() => {
    setIsDirty(false)
  }, [])

  // ─── Undo / Redo ────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
    const newState = undoRedo.undo(currentState)
    if (!newState) return

    setNodes(newState.nodes)
    setEdges(newState.edges)
    // Recalculate dirty — for simplicity, mark as dirty; a full comparison
    // against lastSyncedSpec is deferred per SDS note on isDirty tracking
    setIsDirty(true)
    runOutboundSync(newState.nodes, newState.edges)
  }, [undoRedo, runOutboundSync])

  const redo = useCallback(() => {
    const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
    const newState = undoRedo.redo(currentState)
    if (!newState) return

    setNodes(newState.nodes)
    setEdges(newState.edges)
    setIsDirty(true)
    runOutboundSync(newState.nodes, newState.edges)
  }, [undoRedo, runOutboundSync])

  // ─── Keyboard bindings ──────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if focus is in an input or textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const isMod = e.ctrlKey || e.metaKey

      if (isMod && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        redo()
        return
      }

      if (isMod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        undo()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

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
    removeEdge,
    updateNodeData,
    moveNode,
    validationErrors,
    isDirty,
    loadSpec,
    getCurrentSpec,
    markClean,
    undo,
    redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
  }
}
