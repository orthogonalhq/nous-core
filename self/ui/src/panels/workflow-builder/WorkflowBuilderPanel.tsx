'use client'

import { useMemo, useCallback, useRef, useState, useEffect } from 'react'
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
import type { WorkflowBuilderNode, WorkflowBuilderEdge, ContextMenuState } from '../../types/workflow-builder'
import { useBuilderState } from './hooks/useBuilderState'
import { BuilderToolbar } from './BuilderToolbar'
import { NodePalette } from './NodePalette'
import { NodeInspector } from './inspectors/NodeInspector'
import { EdgeInspector } from './inspectors/EdgeInspector'
import { WorkflowInspector } from './inspectors/WorkflowInspector'
import { CanvasContextMenu, NodeContextMenu, EdgeContextMenu } from './context-menu'
import { NodeSearch } from './NodeSearch'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'

import '@xyflow/react/dist/style.css'

// ─── Core props for non-dockview consumers (web, test, storybook) ───────────

export interface WorkflowBuilderPanelCoreProps {
  className?: string
}

interface WorkflowBuilderDockviewProps extends IDockviewPanelProps {
  params: Record<string, unknown>
}

// ─── Inner canvas (runtime-agnostic — no dockview imports) ──────────────────

// Inner drop-target component — must be inside ReactFlowProvider for useReactFlow()
function CanvasDropTarget({
  className,
  canvasRef,
}: {
  className?: string
  canvasRef: React.RefObject<HTMLDivElement | null>
}) {
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
    mode,
    setMode,
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    updateNodeData,
    getCurrentSpec,
    validationErrors,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBuilderState()

  const { screenToFlowPosition, fitView, setCenter } = useReactFlow()

  // ─── Context menu state ─────────────────────────────────────────────────

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false)

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

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

  // ─── Ctrl+K keyboard handler ───────────────────────────────────────────

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

      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setContextMenu(null) // Close any open context menu
        setNodeSearchOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={memoizedNodeTypes}
        edgeTypes={memoizedEdgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
      />
      <NodePalette containerRef={canvasRef} />
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
    </>
  )
}

function WorkflowBuilderCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={canvasRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <ReactFlowProvider>
        <CanvasDropTarget className={className} canvasRef={canvasRef} />
      </ReactFlowProvider>
    </div>
  )
}

// ─── Panel wrapper (thin dockview adapter) ──────────────────────────────────

export function WorkflowBuilderPanel(
  props: WorkflowBuilderDockviewProps | WorkflowBuilderPanelCoreProps,
) {
  const className = 'className' in props ? props.className : undefined

  return <WorkflowBuilderCanvas className={className} />
}
