'use client'

import React, { useMemo } from 'react'
import type { WorkflowSpec } from '@nous/shared'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import { useFloatingPanel } from '../floating-panel/useFloatingPanel'
import { computeConnectedComponents } from '../workflow-graph-utils'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
} from '../../../types/workflow-builder'

// ─── Styles ──────────────────────────────────────────────────────────────────

const dlStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 'var(--nous-space-xs)' as unknown as string,
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
  margin: 0,
}

const dtStyle: React.CSSProperties = {
  color: 'var(--nous-fg-muted)',
  fontWeight: 500,
}

const ddStyle: React.CSSProperties = {
  color: 'var(--nous-fg)',
  margin: 0,
}

const sectionStyle: React.CSSProperties = {
  marginTop: 'var(--nous-space-md)' as unknown as string,
  paddingTop: 'var(--nous-space-sm)' as unknown as string,
  borderTop: '1px solid var(--nous-border)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  fontWeight: 600,
  marginBottom: 'var(--nous-space-xs)' as unknown as string,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface WorkflowInspectorProps {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  nodes: WorkflowBuilderNode[]
  edges: WorkflowBuilderEdge[]
  getCurrentSpec: () => { spec: WorkflowSpec; yaml: string } | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Component ───────────────────────────────────────────────────────────────

function WorkflowInspectorInner({
  selectedNodeId,
  selectedEdgeId,
  nodes,
  edges,
  getCurrentSpec,
  containerRef,
}: WorkflowInspectorProps) {
  const panel = useFloatingPanel({
    initialPosition: 'right',
    containerRef,
  })

  const specResult = useMemo(() => getCurrentSpec(), [getCurrentSpec])

  const componentCount = useMemo(
    () => computeConnectedComponents(nodes, edges),
    [nodes, edges],
  )

  // Panel is always mounted, but content is only shown when nothing is selected
  const isActive = !selectedNodeId && !selectedEdgeId

  if (!isActive) return null

  const specName = specResult?.spec.name ?? ''
  const specVersion = specResult?.spec.version ?? ''

  return (
    <FloatingPanel
      title="Workflow Inspector"
      state={panel.state}
      panelRef={panel.panelRef}
      onCollapse={panel.onCollapse}
      onPin={panel.onPin}
      onClose={panel.onClose}
      onDragStart={panel.onDragStart}
    >
      {/* Workflow metadata */}
      <dl style={dlStyle}>
        <dt style={dtStyle}>Name</dt>
        <dd style={ddStyle} data-testid="workflow-name">
          {specName}
        </dd>

        <dt style={dtStyle}>Version</dt>
        <dd style={ddStyle} data-testid="workflow-version">
          {String(specVersion)}
        </dd>
      </dl>

      {/* Dependency summary */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Dependency Summary</div>
        <dl style={dlStyle}>
          <dt style={dtStyle}>Nodes</dt>
          <dd style={ddStyle} data-testid="workflow-node-count">
            {nodes.length}
          </dd>

          <dt style={dtStyle}>Edges</dt>
          <dd style={ddStyle} data-testid="workflow-edge-count">
            {edges.length}
          </dd>

          <dt style={dtStyle}>Connected Components</dt>
          <dd style={ddStyle} data-testid="workflow-component-count">
            {componentCount}
          </dd>
        </dl>
      </div>
    </FloatingPanel>
  )
}

export const WorkflowInspector = React.memo(WorkflowInspectorInner)
