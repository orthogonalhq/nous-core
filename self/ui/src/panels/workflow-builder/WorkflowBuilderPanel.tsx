'use client'

import { useMemo, useCallback, useContext, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
} from '@xyflow/react'
import type { IDockviewPanelProps } from 'dockview-react'
import { trpc } from '@nous/transport'
import { ShellContext } from '../../components/shell/ShellContext'
import type { WorkflowBuilderNode, WorkflowBuilderEdge, ContextMenuState } from '../../types/workflow-builder'
import { BuilderModeProvider, useBuilderMode } from './context/BuilderModeContext'
import { useBuilderState } from './hooks/useBuilderState'
import { useKeyboardNav } from './hooks/useKeyboardNav'
import { BuilderToolbar } from './BuilderToolbar'
import { NodePalette } from './NodePalette'
import { NodeInspector } from './inspectors/NodeInspector'
import { EdgeInspector } from './inspectors/EdgeInspector'
import { WorkflowInspector } from './inspectors/WorkflowInspector'
import { CanvasContextMenu, NodeContextMenu, EdgeContextMenu } from './context-menu'
import { NodeSearch } from './NodeSearch'
import { ValidationPanel } from './ValidationPanel'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import { WorkflowPicker } from './WorkflowPicker'
import { ExecutionMonitor } from './monitoring/ExecutionMonitor'
import { ExecutionHistory } from './monitoring/ExecutionHistory'
import { GatePanel } from './monitoring/GatePanel'
import { ArtifactBrowser } from './monitoring/ArtifactBrowser'

import '@xyflow/react/dist/style.css'

// ─── Core props for non-dockview consumers (web, test, storybook) ───────────

export interface WorkflowBuilderPanelCoreProps {
  className?: string
  projectId?: string
  workflowDefinitionId?: string
}

interface WorkflowBuilderDockviewProps extends IDockviewPanelProps {
  params: Record<string, unknown>
}

// ─── Inner canvas (runtime-agnostic — no dockview imports) ──────────────────

// Imperative handle exposed by CanvasDropTarget to parent for keyboard nav wiring
interface CanvasDropTargetHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void
}

// Inner drop-target component — must be inside ReactFlowProvider for useReactFlow()
const CanvasDropTarget = forwardRef<
  CanvasDropTargetHandle,
  {
    canvasRef: React.RefObject<HTMLDivElement | null>
    canvasHasFocus: boolean
    onFocusedNodeChange: (nodeId: string | null) => void
    projectId?: string
    workflowDefinitionId?: string
  }
>(function CanvasDropTarget({
  canvasRef,
  canvasHasFocus,
  onFocusedNodeChange,
  projectId,
  workflowDefinitionId,
}, ref) {
  const { mode, setMode } = useBuilderMode()
  const {
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
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    updateNodeData,
    getCurrentSpec,
    validationErrors,
    isDirty,
    markClean,
    moveNode,
    undo,
    redo,
    canUndo,
    canRedo,
    monitoringState,
    activeRun,
    setActiveRun,
    clearActiveRun,
    inspectionState,
    setInspectedNode,
    clearInspection,
    loadSpec,
    saveToServer,
    saveAsNew,
    resetToEmpty,
    loadFromServer,
    isSaving,
    currentDefinitionId,
  } = useBuilderState(mode, { projectId, workflowDefinitionId })

  const { screenToFlowPosition, fitView } = useReactFlow()

  // ─── Context menu state ─────────────────────────────────────────────────

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false)
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false)

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // ─── Keyboard navigation ───────────────────────────────────────────────

  const { focusedNodeId, handleKeyDown: keyboardNavHandleKeyDown } = useKeyboardNav({
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    onSelectNode: (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (node) onNodeClick({} as React.MouseEvent, node)
    },
    onDeselectAll: () => onPaneClick({} as React.MouseEvent),
    removeNode,
    removeEdge,
    moveNode,
    onEscape: () => {
      setContextMenu(null)
      setNodeSearchOpen(false)
      setIsValidationPanelOpen(false)
    },
    canvasHasFocus,
  })

  // ─── Expose keyboard nav handler to parent via imperative handle ────────

  useImperativeHandle(ref, () => ({
    handleKeyDown: (e: React.KeyboardEvent) => {
      // Suppress keyboard navigation/mutations in monitor mode
      if (mode === 'monitoring') return
      keyboardNavHandleKeyDown(e)
    },
  }), [mode, keyboardNavHandleKeyDown])

  // Propagate focusedNodeId changes to parent for visual focus ring
  useEffect(() => {
    onFocusedNodeChange(focusedNodeId)
  }, [focusedNodeId, onFocusedNodeChange])

  // ─── Mode-aware click handlers (SP 3.2) ─────────────────────────────────

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: WorkflowBuilderNode) => {
      if (mode === 'monitoring' || mode === 'inspecting') {
        setInspectedNode(node.id)
      } else {
        onNodeClick(event, node)
      }
    },
    [mode, onNodeClick, setInspectedNode],
  )

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (mode === 'monitoring' || mode === 'inspecting') {
        clearInspection()
      } else {
        onPaneClick(event)
      }
    },
    [mode, onPaneClick, clearInspection],
  )

  // ─── Save handlers with inline naming ──────────────────────────────────

  const [showNameInput, setShowNameInput] = useState(false)
  const [pendingNameAction, setPendingNameAction] = useState<'save' | 'saveAs' | null>(null)
  const [nameInputValue, setNameInputValue] = useState('Untitled Workflow')

  const handleNameSubmit = useCallback(() => {
    const name = nameInputValue.trim() || 'Untitled Workflow'
    setShowNameInput(false)
    setPendingNameAction(null)
    if (pendingNameAction === 'saveAs') {
      void saveAsNew(name)
    } else {
      void saveToServer(name)
    }
  }, [nameInputValue, pendingNameAction, saveAsNew, saveToServer])

  const handleSave = useCallback(() => {
    if (projectId) {
      if (!currentDefinitionId) {
        // First save — ask for name
        setPendingNameAction('save')
        setShowNameInput(true)
        return
      }
      void saveToServer()
    } else {
      getCurrentSpec()
      markClean()
    }
  }, [projectId, currentDefinitionId, saveToServer, getCurrentSpec, markClean])

  const handleSaveAs = useCallback(() => {
    setPendingNameAction('saveAs')
    setShowNameInput(true)
  }, [])

  const handleNewWorkflow = useCallback(() => {
    resetToEmpty()
  }, [resetToEmpty])

  // ─── Select workflow from picker ──────────────────────────────────────

  const handleSelectWorkflow = useCallback(
    async (definitionId: string) => {
      await loadFromServer(definitionId)
    },
    [loadFromServer],
  )

  // ─── Delete workflow from picker ─────────────────────────────────────

  const deleteMutation = trpc.projects.deleteWorkflowDefinition.useMutation()
  const trpcUtils = trpc.useUtils()
  const handleDeleteWorkflow = useCallback(
    async (definitionId: string) => {
      if (!projectId) return
      try {
        await deleteMutation.mutateAsync({ projectId, definitionId })
        void trpcUtils.projects.listWorkflowDefinitions.invalidate({ projectId })
      } catch (error) {
        console.error('[WorkflowBuilder] Failed to delete workflow:', error)
      }
    },
    [projectId, deleteMutation, trpcUtils],
  )

  // ─── Validate toggle handler (SP 2.5) ──────────────────────────────────

  const handleValidate = useCallback(() => {
    setIsValidationPanelOpen((prev) => !prev)
  }, [])

  // ─── Error click handler (SP 2.5) ─────────────────────────────────────

  const handleErrorClick = useCallback(
    (errorPath: string) => {
      // Parse path to find affected node/edge
      const nodeMatch = errorPath.match(/^nodes\[(\d+)\]/)
      if (nodeMatch) {
        const index = parseInt(nodeMatch[1], 10)
        const node = nodes[index]
        if (node) {
          onNodeClick({} as React.MouseEvent, node)
          fitView({ nodes: [{ id: node.id }], duration: 300 })
        }
        return
      }
      const connMatch = errorPath.match(/^connections\[(\d+)\]/)
      if (connMatch) {
        const index = parseInt(connMatch[1], 10)
        const edge = edges[index]
        if (edge) {
          onEdgeClick({} as React.MouseEvent, edge)
        }
      }
    },
    [nodes, edges, onNodeClick, onEdgeClick, fitView],
  )

  // ─── Context menu event handlers ────────────────────────────────────────

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
      setContextMenu({
        type: 'canvas',
        position: { x: event.clientX, y: event.clientY },
        targetId: null,
      })
    },
    [],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: WorkflowBuilderNode) => {
      event.preventDefault()
      setContextMenu({
        type: 'node',
        position: { x: event.clientX, y: event.clientY },
        targetId: node.id,
      })
    },
    [],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: WorkflowBuilderEdge) => {
      event.preventDefault()
      setContextMenu({
        type: 'edge',
        position: { x: event.clientX, y: event.clientY },
        targetId: edge.id,
      })
    },
    [],
  )

  // ─── Context menu action handlers ──────────────────────────────────────

  const handleContextMenuAddNode = useCallback(
    (nousType: string) => {
      if (contextMenu) {
        const position = screenToFlowPosition({
          x: contextMenu.position.x,
          y: contextMenu.position.y,
        })
        addNode(nousType, position)
      }
      closeContextMenu()
    },
    [contextMenu, screenToFlowPosition, addNode, closeContextMenu],
  )

  const handleContextMenuDeleteNode = useCallback(
    (nodeId: string) => {
      removeNode(nodeId)
      closeContextMenu()
    },
    [removeNode, closeContextMenu],
  )

  const handleContextMenuDuplicateNode = useCallback(
    (nodeId: string) => {
      const sourceNode = nodes.find((n) => n.id === nodeId)
      if (sourceNode) {
        addNode(sourceNode.data.nousType, {
          x: sourceNode.position.x + 50,
          y: sourceNode.position.y + 50,
        })
      }
      closeContextMenu()
    },
    [nodes, addNode, closeContextMenu],
  )

  const handleContextMenuOpenInspector = useCallback(
    (nodeId: string) => {
      // Simulate node click to open the inspector for this node
      const node = nodes.find((n) => n.id === nodeId)
      if (node) {
        onNodeClick({} as React.MouseEvent, node)
      }
      closeContextMenu()
    },
    [nodes, onNodeClick, closeContextMenu],
  )

  const handleContextMenuDeleteEdge = useCallback(
    (edgeId: string) => {
      removeEdge(edgeId)
      closeContextMenu()
    },
    [removeEdge, closeContextMenu],
  )

  const handleContextMenuChangeEdgeType = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId)
      if (edge) {
        // Toggle edge type by removing and re-adding with toggled type
        const currentType = edge.data?.edgeType || 'execution'
        const newType = currentType === 'execution' ? 'config' : 'execution'
        // Use removeEdge + addEdge pattern (known SP 2.3 limitation: always creates 'execution')
        removeEdge(edgeId)
        if (edge.source && edge.target) {
          addEdge({
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
          })
        }
        // Note: edge type toggle inherits known SP 2.3 issue
        void newType // Acknowledge the intended type; actual toggle depends on addEdge default
      }
      closeContextMenu()
    },
    [edges, removeEdge, addEdge, closeContextMenu],
  )

  const handleSelectAll = useCallback(() => {
    // Select all nodes by applying selection changes
    const changes = nodes.map((node) => ({
      type: 'select' as const,
      id: node.id,
      selected: true,
    }))
    onNodesChange(changes)
    closeContextMenu()
  }, [nodes, onNodesChange, closeContextMenu])

  // ─── Node Search handlers ─────────────────────────────────────────────

  const handleSearchAddNode = useCallback(
    (nousType: string) => {
      // Add at canvas center (0, 0 in flow coordinates)
      addNode(nousType, { x: 0, y: 0 })
    },
    [addNode],
  )

  const handleSearchFocusNode = useCallback(
    (nodeId: string) => {
      fitView({ nodes: [{ id: nodeId }], duration: 300 })
    },
    [fitView],
  )

  // ─── Global keyboard shortcuts (Ctrl+K, Ctrl+Z, Ctrl+Shift+Z, Ctrl+S) ───
  // Registered in CAPTURE PHASE so this handler fires before App.tsx's
  // bubble-phase Ctrl+K handler. In monitor mode, stopImmediatePropagation
  // prevents the event from reaching any other listener.

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const isMod = e.ctrlKey || e.metaKey
      if (!isMod) return

      const key = e.key.toLowerCase()
      const isAuthoringKey =
        key === 'k' ||
        key === 'z' ||
        key === 's'

      if (!isAuthoringKey) return

      // Monitor mode: fully consume the event — no other handler should see it
      if (mode === 'monitoring') {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Authoring mode: handle normally (no stopImmediatePropagation —
      // App.tsx Ctrl+K CommandPalette must still work in bubble phase)
      if (key === 'k') {
        e.preventDefault()
        setContextMenu(null)
        setNodeSearchOpen((prev) => !prev)
      } else if (key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [mode, undo, redo, handleSave])

  // ─── Drag and drop ────────────────────────────────────────────────────

  const memoizedNodeTypes = useMemo(() => nodeTypes, [])
  const memoizedEdgeTypes = useMemo(() => edgeTypes, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nousType = e.dataTransfer.getData('application/nous-node-type')
      if (!nousType) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(nousType, position)
    },
    [screenToFlowPosition, addNode],
  )

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={mode !== 'monitoring' ? onPaneContextMenu : undefined}
        onNodeContextMenu={mode !== 'monitoring' ? onNodeContextMenu : undefined}
        onEdgeContextMenu={mode !== 'monitoring' ? onEdgeContextMenu : undefined}
        nodeTypes={memoizedNodeTypes}
        edgeTypes={memoizedEdgeTypes}
        nodesDraggable={mode !== 'monitoring'}
        nodesConnectable={mode !== 'monitoring'}
        elementsSelectable={mode !== 'monitoring'}
        onDragOver={onDragOver}
        onDrop={onDrop}
        deleteKeyCode={mode !== 'monitoring' ? 'Delete' : null}
        fitView
        style={{
          background: 'var(--nous-builder-canvas-bg)',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--nous-builder-grid-color)"
          gap={20}
          size={1}
        />
        <MiniMap
          style={{
            background: 'var(--nous-builder-minimap-bg)',
            borderRadius: '6px',
            border: '1px solid var(--nous-border)',
          }}
          nodeColor="var(--nous-builder-minimap-node)"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
        <Controls
          style={{
            background: 'var(--nous-bg-elevated)',
            border: '1px solid var(--nous-border)',
            borderRadius: '6px',
          }}
        />
      </ReactFlow>
      <BuilderToolbar
        mode={mode}
        onModeChange={setMode}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={handleSave}
        onSaveAs={projectId ? handleSaveAs : undefined}
        onNewWorkflow={projectId ? handleNewWorkflow : undefined}
        onValidate={handleValidate}
        isDirty={isDirty}
        isSaving={isSaving}
        validationErrorCount={validationErrors.length}
        isValidationPanelOpen={isValidationPanelOpen}
      />
      {/* Inline workflow naming dialog */}
      {showNameInput && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            background: 'var(--nous-bg-elevated)',
            border: '1px solid var(--nous-border-strong)',
            borderRadius: '8px',
            padding: 'var(--nous-space-lg)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
            minWidth: 280,
          }}
          data-testid="workflow-name-dialog"
        >
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 600, color: 'var(--nous-fg)', marginBottom: 'var(--nous-space-sm)' }}>
            {pendingNameAction === 'saveAs' ? 'Save As New Workflow' : 'Name Your Workflow'}
          </div>
          <input
            type="text"
            value={nameInputValue}
            onChange={(e) => setNameInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit()
              if (e.key === 'Escape') { setShowNameInput(false); setPendingNameAction(null) }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              background: 'var(--nous-bg)',
              border: '1px solid var(--nous-border)',
              borderRadius: '4px',
              color: 'var(--nous-fg)',
              fontSize: 'var(--nous-font-size-sm)',
              outline: 'none',
              marginBottom: 'var(--nous-space-sm)',
            }}
            data-testid="workflow-name-input"
          />
          <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { setShowNameInput(false); setPendingNameAction(null) }}
              style={{
                background: 'transparent',
                border: '1px solid var(--nous-border)',
                borderRadius: '4px',
                color: 'var(--nous-fg-muted)',
                cursor: 'pointer',
                padding: 'var(--nous-space-xs) var(--nous-space-md)',
                fontSize: 'var(--nous-font-size-xs)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNameSubmit}
              style={{
                background: 'var(--nous-accent)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                padding: 'var(--nous-space-xs) var(--nous-space-md)',
                fontSize: 'var(--nous-font-size-xs)',
              }}
              data-testid="workflow-name-submit"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {/* Authoring-only UI — hidden in monitor mode */}
      {mode !== 'monitoring' && (
        <>
          <NodePalette containerRef={canvasRef} />
          {projectId && (
            <WorkflowPicker
              projectId={projectId}
              currentDefinitionId={currentDefinitionId}
              onSelectWorkflow={(id) => void handleSelectWorkflow(id)}
              onNewWorkflow={handleNewWorkflow}
              onDeleteWorkflow={(id) => void handleDeleteWorkflow(id)}
              containerRef={canvasRef}
            />
          )}
          <NodeInspector
            selectedNodeId={selectedNodeId}
            nodes={nodes}
            updateNodeData={updateNodeData}
            validationErrors={validationErrors}
            containerRef={canvasRef}
          />
          <EdgeInspector
            selectedEdgeId={selectedEdgeId}
            edges={edges}
            nodes={nodes}
            removeEdge={removeEdge}
            addEdge={addEdge}
            containerRef={canvasRef}
          />
          <WorkflowInspector
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            nodes={nodes}
            edges={edges}
            getCurrentSpec={getCurrentSpec}
            containerRef={canvasRef}
          />

          {/* Context Menus */}
          {contextMenu?.type === 'canvas' && (
            <CanvasContextMenu
              position={contextMenu.position}
              onClose={closeContextMenu}
              onAddNode={handleContextMenuAddNode}
              onSelectAll={handleSelectAll}
            />
          )}
          {contextMenu?.type === 'node' && contextMenu.targetId && (
            <NodeContextMenu
              position={contextMenu.position}
              nodeId={contextMenu.targetId}
              onClose={closeContextMenu}
              onDeleteNode={handleContextMenuDeleteNode}
              onDuplicateNode={handleContextMenuDuplicateNode}
              onOpenInspector={handleContextMenuOpenInspector}
            />
          )}
          {contextMenu?.type === 'edge' && contextMenu.targetId && (
            <EdgeContextMenu
              position={contextMenu.position}
              edgeId={contextMenu.targetId}
              onClose={closeContextMenu}
              onDeleteEdge={handleContextMenuDeleteEdge}
              onChangeEdgeType={handleContextMenuChangeEdgeType}
            />
          )}

          {/* Node Search */}
          <NodeSearch
            isOpen={nodeSearchOpen}
            onClose={() => setNodeSearchOpen(false)}
            nodes={nodes}
            onAddNode={handleSearchAddNode}
            onFocusNode={handleSearchFocusNode}
          />

          {/* Validation Panel (SP 2.5) */}
          <ValidationPanel
            validationErrors={validationErrors}
            nodes={nodes}
            edges={edges}
            isVisible={isValidationPanelOpen}
            onClose={() => setIsValidationPanelOpen(false)}
            onErrorClick={handleErrorClick}
            containerRef={canvasRef}
          />
        </>
      )}

      {/* Execution Monitor Overlay (SP 3.1) */}
      {mode === 'monitoring' && activeRun !== null && (
        <ExecutionMonitor activeRun={activeRun} />
      )}

      {/* Execution History Panel (SP 3.1) */}
      {mode === 'monitoring' && (
        <ExecutionHistory
          containerRef={canvasRef}
          onSelectRun={setActiveRun}
          activeRunId={activeRun?.id ?? null}
        />
      )}

      {/* Inspection Panels (SP 3.2) */}
      {(mode === 'monitoring' || mode === 'inspecting') &&
        inspectionState.type === 'node' &&
        activeRun !== null && (() => {
          const inspectedNodeId = inspectionState.nodeId
          const inspectedNode = nodes.find((n) => n.id === inspectedNodeId)
          const gates = activeRun.gateStates?.[inspectedNodeId] ?? []
          const artifacts = activeRun.artifactRefs?.[inspectedNodeId] ?? []
          return (
            <>
              <GatePanel
                key={`gate-${inspectedNodeId}`}
                nodeId={inspectedNodeId}
                nodeLabel={inspectedNode?.data.label ?? inspectedNodeId}
                gates={gates}
                containerRef={canvasRef}
              />
              <ArtifactBrowser
                key={`artifact-${inspectedNodeId}`}
                nodeId={inspectedNodeId}
                nodeLabel={inspectedNode?.data.label ?? inspectedNodeId}
                artifacts={artifacts}
                containerRef={canvasRef}
              />
            </>
          )
        })()
      }
    </>
  )
})

function WorkflowBuilderCanvas({ className, projectId, workflowDefinitionId }: {
  className?: string
  projectId?: string
  workflowDefinitionId?: string
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dropTargetRef = useRef<CanvasDropTargetHandle>(null)
  const [canvasHasFocus, setCanvasHasFocus] = useState(false)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    dropTargetRef.current?.handleKeyDown(e)
  }, [])

  const handleFocusedNodeChange = useCallback((nodeId: string | null) => {
    setFocusedNodeId(nodeId)
  }, [])

  return (
    <div
      ref={canvasRef}
      className={className}
      tabIndex={0}
      onFocus={() => setCanvasHasFocus(true)}
      onBlur={() => setCanvasHasFocus(false)}
      onKeyDown={handleKeyDown}
      data-focused-node-id={focusedNodeId ?? undefined}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        outline: 'none',
      }}
    >
      <BuilderModeProvider>
        <ReactFlowProvider>
          <CanvasDropTarget
            ref={dropTargetRef}
            canvasRef={canvasRef}
            canvasHasFocus={canvasHasFocus}
            onFocusedNodeChange={handleFocusedNodeChange}
            projectId={projectId}
            workflowDefinitionId={workflowDefinitionId}
          />
        </ReactFlowProvider>
      </BuilderModeProvider>
    </div>
  )
}

// ─── Panel wrapper (thin dockview adapter) ──────────────────────────────────

export function WorkflowBuilderPanel(
  props: WorkflowBuilderDockviewProps | WorkflowBuilderPanelCoreProps,
) {
  const className = 'className' in props ? props.className : undefined
  const propProjectId = 'projectId' in props ? props.projectId : undefined
  const workflowDefinitionId = 'workflowDefinitionId' in props ? props.workflowDefinitionId : undefined

  // Desktop panels are mounted via dockview without explicit props.
  // Fall back to ShellContext.activeProjectId when no projectId prop is provided.
  // useContext returns null when no ShellProvider is present (e.g. in tests/storybook).
  const shellCtx = useContext(ShellContext)
  const projectId = propProjectId ?? shellCtx?.activeProjectId ?? undefined

  return (
    <WorkflowBuilderCanvas
      className={className}
      projectId={projectId}
      workflowDefinitionId={workflowDefinitionId}
    />
  )
}
