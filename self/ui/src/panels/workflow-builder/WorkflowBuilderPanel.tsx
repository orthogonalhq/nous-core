'use client'

import { useMemo, useCallback, useRef } from 'react'
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
import { useBuilderState } from './hooks/useBuilderState'
import { BuilderToolbar } from './BuilderToolbar'
import { NodePalette } from './NodePalette'
import { NodeInspector } from './inspectors/NodeInspector'
import { EdgeInspector } from './inspectors/EdgeInspector'
import { WorkflowInspector } from './inspectors/WorkflowInspector'
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
    removeEdge,
    updateNodeData,
    getCurrentSpec,
    validationErrors,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBuilderState()

  const { screenToFlowPosition } = useReactFlow()

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
