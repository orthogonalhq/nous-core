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
import type { NodeProps, NodeChange, EdgeChange } from '@xyflow/react'
import type { IDockviewPanelProps } from 'dockview-react'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderNodeData,
  NodeCategory,
} from '../../types/workflow-builder'
import { DEMO_WORKFLOW_NODES, DEMO_WORKFLOW_EDGES } from './demo-workflow'
import { BuilderToolbar } from './BuilderToolbar'

import '@xyflow/react/dist/style.css'

// ─── Core props for non-dockview consumers (web, test, storybook) ───────────

export interface WorkflowBuilderPanelCoreProps {
  className?: string
}

interface WorkflowBuilderDockviewProps extends IDockviewPanelProps {
  params?: Record<string, unknown>
}

// ─── Category color mapping ─────────────────────────────────────────────────

const CATEGORY_COLOR_VAR: Record<NodeCategory, string> = {
  trigger: 'var(--nous-builder-node-trigger)',
  agent: 'var(--nous-builder-node-agent)',
  condition: 'var(--nous-builder-node-condition)',
  app: 'var(--nous-builder-node-app)',
  tool: 'var(--nous-builder-node-tool)',
  memory: 'var(--nous-builder-node-memory)',
  governance: 'var(--nous-builder-node-governance)',
}

// ─── Minimal node placeholder (replaced by BaseNode in SP 1.3) ─────────────

function BuilderMinimalNode({ data }: NodeProps<WorkflowBuilderNode>) {
  const nodeData = data as unknown as WorkflowBuilderNodeData
  const accentColor = CATEGORY_COLOR_VAR[nodeData.category] ?? 'var(--nous-fg-dim)'

  return (
    <div
      style={{
        background: 'var(--nous-bg-elevated)',
        border: '1px solid var(--nous-border-strong)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: '6px',
        padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
        color: 'var(--nous-fg)',
        fontSize: 'var(--nous-font-size-sm)',
        minWidth: 140,
        maxWidth: 220,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 'var(--nous-space-2xs)',
        }}
      >
        {nodeData.label}
      </div>
      {nodeData.description && (
        <div
          style={{
            fontSize: 'var(--nous-font-size-xs)',
            color: 'var(--nous-fg-subtle)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {nodeData.description}
        </div>
      )}
    </div>
  )
}

// ─── Stable nodeTypes / edgeTypes (React Flow requires referential stability) ─

const nodeTypes = { builderNode: BuilderMinimalNode }
const edgeTypes = {}

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
