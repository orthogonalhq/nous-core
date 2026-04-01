'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection, Viewport, XYPosition } from '@xyflow/react'
import type { WorkflowSpec, WorkflowSpecValidationError } from '@nous/shared'
import { trpc } from '@nous/transport'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderEdgeData,
  WorkflowBuilderNodeData,
  BuilderMode,
  ExecutionRun,
  MonitoringState,
  InspectionState,
} from '../../../types/workflow-builder'
export type { BuilderMode }
import { DEMO_EXECUTION_RUNS } from '../monitoring/demo-execution-data'
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

  /** Monitoring state — active run + isMonitoring flag. */
  monitoringState: MonitoringState
  /** Currently active execution run, or null. */
  activeRun: ExecutionRun | null
  /** Load an execution run by ID for monitor overlay display. */
  setActiveRun: (runId: string) => void
  /** Clear the active execution run. */
  clearActiveRun: () => void

  /** Current inspection state for monitoring/inspecting mode (SP 3.2). */
  inspectionState: InspectionState
  /** Set a node as the inspected target (monitoring/inspecting mode). */
  setInspectedNode: (nodeId: string) => void
  /** Clear the current inspection selection. */
  clearInspection: () => void

  /** Persist workflow to server. Returns the definitionId on success. */
  saveToServer: () => Promise<{ definitionId: string } | null>
  /** Save as a new workflow (no definitionId, receives new ID). */
  saveAsNew: (name?: string) => Promise<{ definitionId: string } | null>
  /** Reset builder to empty state (new workflow). */
  resetToEmpty: () => void
  /** Load a workflow from server by definitionId (fetch + load + track). */
  loadFromServer: (definitionId: string) => Promise<void>
  /** Whether a save operation is currently in-flight. */
  isSaving: boolean
  /** Current stored definitionId (null for unsaved workflows). */
  currentDefinitionId: string | null
}

/** Options for persistence integration. */
export interface UseBuilderStateOptions {
  projectId?: string
  workflowDefinitionId?: string
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
export function useBuilderState(
  mode: BuilderMode = 'authoring',
  options?: UseBuilderStateOptions,
): UseBuilderStateReturn {
  const projectId = options?.projectId
  const workflowDefinitionId = options?.workflowDefinitionId

  // Determine initial state: demo fallback when no projectId, empty when projectId present
  const hasProjectContext = !!projectId
  const [nodes, setNodes] = useState<WorkflowBuilderNode[]>(() =>
    hasProjectContext ? [] : [...DEMO_WORKFLOW_NODES],
  )
  const [edges, setEdges] = useState<WorkflowBuilderEdge[]>(() =>
    hasProjectContext ? [] : [...DEMO_WORKFLOW_EDGES],
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [activeRun, setActiveRunState] = useState<ExecutionRun | null>(null)
  const [inspectionState, setInspectionState] = useState<InspectionState>({ type: 'none' })
  const [viewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [validationErrors, setValidationErrors] = useState<WorkflowSpecValidationError[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Persistence state
  const definitionIdRef = useRef<string | null>(workflowDefinitionId ?? null)

  // Spec metadata for outbound serialization
  const specMetaRef = useRef(DEFAULT_SPEC_META)

  // tRPC hooks for persistence
  const utils = trpc.useUtils()
  const saveMutation = trpc.projects.saveWorkflowSpec.useMutation()

  // ─── Monitoring state helpers ────────────────────────────────────────────

  // Clear active run and inspection state when leaving monitoring/inspecting mode
  useEffect(() => {
    if (mode !== 'monitoring' && mode !== 'inspecting') {
      setActiveRunState(null)
      setInspectionState({ type: 'none' })
    }
  }, [mode])

  const setActiveRun = useCallback(
    (runId: string) => {
      const run = DEMO_EXECUTION_RUNS.find((r) => r.id === runId)
      if (run) {
        setActiveRunState(run)
      }
    },
    [],
  )

  const clearActiveRun = useCallback(() => {
    setActiveRunState(null)
  }, [])

  const setInspectedNode = useCallback((nodeId: string) => {
    setInspectionState({ type: 'node', nodeId })
  }, [])

  const clearInspection = useCallback(() => {
    setInspectionState({ type: 'none' })
  }, [])

  const monitoringState: MonitoringState = {
    activeRun,
    isMonitoring: mode === 'monitoring' && activeRun !== null,
  }

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
    (changes: NodeChange<WorkflowBuilderNode>[]) => {
      if (mode !== 'authoring') return
      setNodes((nds) => applyNodeChanges(changes, nds))
    },
    [mode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowBuilderEdge>[]) => {
      if (mode !== 'authoring') return
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    [mode],
  )

  // ─── Undoable mutations ─────────────────────────────────────────────────

  const addNode = useCallback(
    (nousType: string, position: XYPosition) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  const removeNode = useCallback(
    (nodeId: string) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  const addEdge = useCallback(
    (connection: Connection) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  const removeEdge = useCallback(
    (edgeId: string) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<WorkflowBuilderNodeData>) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  const moveNode = useCallback(
    (nodeId: string, position: XYPosition) => {
      if (mode !== 'authoring') return
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
    [mode, undoRedo, runOutboundSync],
  )

  // ─── Connection handler (delegates to guarded addEdge) ────────────────

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

  // ─── Persistence: mount-time fetch ──────────────────────────────────────

  // Helper: fetch a definition by ID and load into builder state
  const fetchAndLoadDefinition = useCallback(
    (pid: string, defId: string) => {
      return utils.projects.getWorkflowDefinition
        .fetch({ projectId: pid, definitionId: defId })
        .then((definition) => {
          if (!definition.specYaml) {
            // Legacy definition saved before specYaml storage was added.
            // Load empty canvas but keep the definitionId so the next save
            // will re-persist with specYaml (self-healing).
            console.warn(
              `[useBuilderState] Definition ${defId} has no specYaml — legacy entry. Next save will populate specYaml.`,
            )
            setNodes([])
            setEdges([])
            definitionIdRef.current = defId
            setIsDirty(false)
            specMetaRef.current = { name: definition.name ?? 'Untitled Workflow', version: 1 }
            return
          }
          const result = sync.loadSpec(definition.specYaml)
          if (result.success) {
            setNodes(result.nodes!)
            setEdges(result.edges!)
            undoRedo.clearHistory()
            setIsDirty(false)
            setValidationErrors([])
            if (result.spec) {
              specMetaRef.current = {
                name: result.spec.name,
                version: result.spec.version,
              }
            }
            definitionIdRef.current = defId
          }
        })
        .catch((error) => {
          console.warn('[useBuilderState] Failed to fetch workflow definition:', error)
          setNodes([])
          setEdges([])
          definitionIdRef.current = null
        })
    },
    [sync, undoRedo, utils],
  )

  const initFetchedRef = useRef(false)

  // Path 1: Explicit workflowDefinitionId — fetch that specific definition
  useEffect(() => {
    if (initFetchedRef.current) return
    if (!projectId || !workflowDefinitionId) return
    initFetchedRef.current = true
    fetchAndLoadDefinition(projectId, workflowDefinitionId)
  }, [projectId, workflowDefinitionId, fetchAndLoadDefinition])

  // Path 2: projectId but no workflowDefinitionId — check for project default
  // Also re-checks when panel is kept mounted (dockview caching) and the user
  // saves a workflow for the first time (listQuery updates with a new default).
  const defaultQuery = trpc.projects.listWorkflowDefinitions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId && !workflowDefinitionId },
  )

  useEffect(() => {
    if (initFetchedRef.current) return
    if (!projectId || workflowDefinitionId) return
    if (defaultQuery.isLoading || !defaultQuery.data) return

    const defaultDef = defaultQuery.data.find(
      (d: { id: string; isDefault?: boolean }) => d.isDefault,
    )
    if (defaultDef && defaultDef.id !== definitionIdRef.current) {
      initFetchedRef.current = true
      fetchAndLoadDefinition(projectId, defaultDef.id)
    }
    // If no default found, stay with empty state (correct for new projects)
  }, [projectId, workflowDefinitionId, defaultQuery.data, defaultQuery.isLoading, fetchAndLoadDefinition])

  // ─── Persistence: save / saveAs / reset ────────────────────────────────

  const saveToServer = useCallback(async (): Promise<{ definitionId: string } | null> => {
    if (!projectId) return null

    const specResult = getCurrentSpec()
    if (!specResult) return null
    // WorkflowSpec requires at least 1 node — don't send empty canvas
    if (specResult.spec.nodes.length === 0) {
      console.warn('[useBuilderState] Cannot save empty workflow — add at least one node.')
      return null
    }

    setIsSaving(true)
    try {
      const result = await saveMutation.mutateAsync({
        projectId,
        specYaml: specResult.yaml,
        definitionId: definitionIdRef.current ?? undefined,
      })
      definitionIdRef.current = result.definitionId
      markClean()
      // Invalidate list query so default lookup stays fresh (dockview caching)
      void utils.projects.listWorkflowDefinitions.invalidate({ projectId })
      return { definitionId: result.definitionId }
    } catch (error) {
      console.error('[useBuilderState] Save failed:', error)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [projectId, getCurrentSpec, saveMutation, markClean, utils])

  const saveAsNew = useCallback(async (name?: string): Promise<{ definitionId: string } | null> => {
    if (!projectId) return null

    const specResult = getCurrentSpec()
    if (!specResult) return null
    // WorkflowSpec requires at least 1 node — don't send empty canvas
    if (specResult.spec.nodes.length === 0) {
      console.warn('[useBuilderState] Cannot save empty workflow — add at least one node.')
      return null
    }

    setIsSaving(true)
    try {
      const result = await saveMutation.mutateAsync({
        projectId,
        specYaml: specResult.yaml,
        name: name ?? specResult.spec.name,
      })
      definitionIdRef.current = result.definitionId
      markClean()
      return { definitionId: result.definitionId }
    } catch (error) {
      console.error('[useBuilderState] Save As failed:', error)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [projectId, getCurrentSpec, saveMutation, markClean])

  const resetToEmpty = useCallback(() => {
    setNodes([])
    setEdges([])
    definitionIdRef.current = null
    undoRedo.clearHistory()
    setIsDirty(false)
    setValidationErrors([])
    specMetaRef.current = { ...DEFAULT_SPEC_META }
  }, [undoRedo])

  // ─── Undo / Redo ────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (mode !== 'authoring') return
    const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
    const newState = undoRedo.undo(currentState)
    if (!newState) return

    setNodes(newState.nodes)
    setEdges(newState.edges)
    // Recalculate dirty — for simplicity, mark as dirty; a full comparison
    // against lastSyncedSpec is deferred per SDS note on isDirty tracking
    setIsDirty(true)
    runOutboundSync(newState.nodes, newState.edges)
  }, [mode, undoRedo, runOutboundSync])

  const redo = useCallback(() => {
    if (mode !== 'authoring') return
    const currentState = { nodes: nodesRef.current, edges: edgesRef.current }
    const newState = undoRedo.redo(currentState)
    if (!newState) return

    setNodes(newState.nodes)
    setEdges(newState.edges)
    setIsDirty(true)
    runOutboundSync(newState.nodes, newState.edges)
  }, [mode, undoRedo, runOutboundSync])

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
    monitoringState,
    activeRun,
    setActiveRun,
    clearActiveRun,
    inspectionState,
    setInspectedNode,
    clearInspection,
    saveToServer,
    saveAsNew,
    resetToEmpty,
    loadFromServer: useCallback(
      async (defId: string) => {
        if (!projectId) return
        await fetchAndLoadDefinition(projectId, defId)
      },
      [projectId, fetchAndLoadDefinition],
    ),
    isSaving,
    currentDefinitionId: definitionIdRef.current,
  }
}
