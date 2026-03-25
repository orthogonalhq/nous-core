'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type { NodeChange, EdgeChange } from '@xyflow/react'
import type { IDockviewPanelProps } from 'dockview-react'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
} from '../../types/workflow-builder'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from './demo-workflow'
import { BuilderToolbar } from './BuilderToolbar'
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

function WorkflowBuilderCanvas({ className }: { className?: string }) {
  const [nodes, setNodes] = useState<WorkflowBuilderNode[]>(DEMO_WORKFLOW_NODES)
  const [edges, setEdges] = useState<WorkflowBuilderEdge[]>(DEMO_WORKFLOW_EDGES)

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

  const memoizedNodeTypes = useMemo(() => nodeTypes, [])
  const memoizedEdgeTypes = useMemo(() => edgeTypes, [])

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={memoizedNodeTypes}
          edgeTypes={memoizedEdgeTypes}
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
        <BuilderToolbar />
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
