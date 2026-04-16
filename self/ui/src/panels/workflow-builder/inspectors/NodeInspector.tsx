'use client'

import React, { useMemo, useCallback } from 'react'
import type { z } from 'zod'
import { resolveNodeTypeParameterSchema } from '@nous/shared'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import { useFloatingPanel } from '../floating-panel/useFloatingPanel'
import { getRegistryEntry } from '../nodes/node-registry'
import { ParameterForm } from './ParameterForm'
import type { WorkflowSpecValidationError } from '@nous/shared'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderNodeData,
} from '../../../types/workflow-builder'

// ─── Styles ──────────────────────────────────────────────────────────────────

const headerInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
  marginBottom: 'var(--nous-space-sm)' as unknown as string,
}

const typeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  fontFamily: 'var(--nous-font-mono)' as unknown as string,
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

const previewBlockStyle: React.CSSProperties = {
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-sm)' as unknown as string,
  padding: 'var(--nous-space-sm)' as unknown as string,
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 120,
  overflow: 'auto',
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface NodeInspectorProps {
  selectedNodeId: string | null
  nodes: WorkflowBuilderNode[]
  updateNodeData: (nodeId: string, data: Partial<WorkflowBuilderNodeData>) => void
  validationErrors: WorkflowSpecValidationError[]
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Optional markdown content for node.md preview. */
  markdownContent?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

function NodeInspectorInner({
  selectedNodeId,
  nodes,
  updateNodeData,
  validationErrors,
  containerRef,
  markdownContent,
}: NodeInspectorProps) {
  const panel = useFloatingPanel({
    initialPosition: 'right',
    containerRef,
  })

  const node = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : undefined),
    [selectedNodeId, nodes],
  )

  const schema = useMemo(() => {
    if (!node) return null
    return resolveNodeTypeParameterSchema(node.data.nousType)
  }, [node])

  const registryEntry = useMemo(() => {
    if (!node) return null
    return getRegistryEntry(node.data.nousType)
  }, [node])

  const paramValues = useMemo(() => {
    if (!node) return {}
    // Extract parameter values from node data (exclude standard fields)
    const { label: _label, category: _cat, nousType: _type, description: _desc, ...params } = node.data
    return params as Record<string, unknown>
  }, [node])

  const fieldErrors = useMemo(() => {
    // Convert WorkflowSpecValidationError[] to Record<string, string> for ParameterForm
    // Filter for errors related to this node
    const errors: Record<string, string> = {}
    if (validationErrors && selectedNodeId) {
      for (const err of validationErrors) {
        const path = err.path ?? ''
        if (path.includes(selectedNodeId)) {
          const fieldName = path.split('.').pop() ?? ''
          errors[fieldName] = err.message
        }
      }
    }
    return errors
  }, [validationErrors, selectedNodeId])

  const handleChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, patch as Partial<WorkflowBuilderNodeData>)
    },
    [selectedNodeId, updateNodeData],
  )

  if (!selectedNodeId || !node) return null

  return (
    <FloatingPanel
      title={node.data.label || 'Node Inspector'}
      state={panel.state}
      panelRef={panel.panelRef}
      onCollapse={panel.onCollapse}
      onPin={panel.onPin}
      onClose={panel.onClose}
      onDragStart={panel.onDragStart}
    >
      {/* Type badge */}
      <div style={headerInfoStyle}>
        {registryEntry && (
          <span style={typeBadgeStyle} data-testid="node-type-badge">
            <i className={registryEntry.icon} />
            {node.data.nousType}
          </span>
        )}
      </div>

      {/* Parameter form */}
      {schema && (
        <ParameterForm
          schema={schema as z.ZodObject<z.ZodRawShape>}
          values={paramValues}
          validationErrors={fieldErrors}
          onChange={handleChange}
        />
      )}

      {/* Scope guard and lifecycle state */}
      <div style={sectionStyle} data-testid="node-metadata-section">
        <div style={sectionTitleStyle}>Node Metadata</div>
        <dl style={dlStyle}>
          <dt style={dtStyle}>Scope Guard</dt>
          <dd style={ddStyle} data-testid="scope-guard-value">
            {(node.data as Record<string, unknown>).scopeGuard as string ?? 'Not configured'}
          </dd>
          <dt style={dtStyle}>Lifecycle State</dt>
          <dd style={ddStyle} data-testid="lifecycle-state-value">
            {(node.data as Record<string, unknown>).lifecycleState as string ?? 'Not configured'}
          </dd>
        </dl>
      </div>

      {/* Node.md preview */}
      <div style={sectionStyle} data-testid="node-md-preview">
        <div style={sectionTitleStyle}>Documentation</div>
        {markdownContent ? (
          <pre style={previewBlockStyle} data-testid="node-md-content">
            {markdownContent}
          </pre>
        ) : (
          <div style={previewBlockStyle} data-testid="node-md-placeholder">
            <strong>{node.data.label}</strong>
            {'\n'}
            Type: {node.data.nousType}
            {'\n'}
            Category: {node.data.category}
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}

export const NodeInspector = React.memo(NodeInspectorInner)
