'use client'

import React, { useMemo } from 'react'
import type { WorkflowSpecValidationError } from '@nous/shared'
import type { WorkflowBuilderNode, WorkflowBuilderEdge, ValidationPanelItem } from '../../types/workflow-builder'
import { FloatingPanel } from './floating-panel/FloatingPanel'
import { useFloatingPanel } from './floating-panel/useFloatingPanel'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ValidationPanelProps {
  /** Validation errors from useBuilderState. */
  validationErrors: WorkflowSpecValidationError[]
  /** Current nodes for element ID resolution. */
  nodes: WorkflowBuilderNode[]
  /** Current edges for element ID resolution. */
  edges: WorkflowBuilderEdge[]
  /** Whether the panel is visible (controlled by toolbar toggle). */
  isVisible: boolean
  /** Close the panel. */
  onClose: () => void
  /** Called when user clicks an error — pans to and selects affected element. */
  onErrorClick: (errorPath: string) => void
  /** Ref to the canvas wrapper for FloatingPanel boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Error path resolution ───────────────────────────────────────────────────

function resolveElementId(
  path: string,
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): { elementId: string | null; elementType: 'node' | 'edge' | 'spec' | null } {
  const nodeMatch = path.match(/^nodes\[(\d+)\]/)
  if (nodeMatch) {
    const index = parseInt(nodeMatch[1], 10)
    return {
      elementId: nodes[index]?.id ?? null,
      elementType: 'node',
    }
  }
  const connMatch = path.match(/^connections\[(\d+)\]/)
  if (connMatch) {
    const index = parseInt(connMatch[1], 10)
    return {
      elementId: edges[index]?.id ?? null,
      elementType: 'edge',
    }
  }
  return { elementId: null, elementType: 'spec' }
}

function deriveValidationItems(
  errors: WorkflowSpecValidationError[],
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): ValidationPanelItem[] {
  return errors.map((error) => {
    const { elementId, elementType } = resolveElementId(error.path, nodes, edges)
    return {
      path: error.path,
      message: error.message,
      severity: 'error' as const,
      elementId,
      elementType,
    }
  })
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const errorListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const errorItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--nous-space-sm)' as unknown as string,
  padding: 'var(--nous-space-xs) var(--nous-space-sm)' as unknown as string,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--nous-border)',
  color: 'var(--nous-fg)',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left' as const,
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  lineHeight: 1.4,
}

const errorIconStyle: React.CSSProperties = {
  fontSize: 14,
  flexShrink: 0,
  marginTop: 1,
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-sm)' as unknown as string,
  padding: 'var(--nous-space-md)' as unknown as string,
  color: 'var(--nous-fg-muted)',
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
}

// ─── Component ───────────────────────────────────────────────────────────────

function ValidationPanelInner({
  validationErrors,
  nodes,
  edges,
  isVisible,
  onClose,
  onErrorClick,
  containerRef,
}: ValidationPanelProps) {
  const { state, panelRef, onCollapse, onPin, onClose: floatingOnClose, onShow, onDragStart } =
    useFloatingPanel({
      initialPosition: 'right',
      containerRef,
    })

  // Sync visibility with isVisible prop
  React.useEffect(() => {
    if (isVisible) {
      onShow()
    }
  }, [isVisible, onShow])

  const items = useMemo(
    () => deriveValidationItems(validationErrors, nodes, edges),
    [validationErrors, nodes, edges],
  )

  if (!isVisible) return null

  const handleClose = () => {
    floatingOnClose()
    onClose()
  }

  const severityIcon = (severity: 'error' | 'warning') =>
    severity === 'error' ? 'codicon-error' : 'codicon-warning'

  const severityColor = (severity: 'error' | 'warning') =>
    severity === 'error' ? 'var(--nous-node-trigger, #e06c75)' : 'var(--nous-fg-muted)'

  return (
    <div data-testid="validation-panel">
      <FloatingPanel
        title="Validation"
        state={state}
        panelRef={panelRef}
        onCollapse={onCollapse}
        onPin={onPin}
        onClose={handleClose}
        onDragStart={onDragStart}
      >
        {items.length === 0 ? (
          <div data-testid="validation-panel-empty" style={emptyStateStyle}>
            <i
              className="codicon codicon-check"
              style={{ fontSize: 16, color: 'var(--nous-node-governance, #98c379)' }}
            />
            <span>No issues found</span>
          </div>
        ) : (
          <ul style={errorListStyle} aria-live="polite" role="list">
            {items.map((item, index) => (
              <li key={`${item.path}-${index}`}>
                <button
                  type="button"
                  style={errorItemStyle}
                  data-testid="validation-panel-error-item"
                  onClick={() => onErrorClick(item.path)}
                  aria-label={`${item.severity}: ${item.message}`}
                >
                  <i
                    className={`codicon ${severityIcon(item.severity)}`}
                    style={{ ...errorIconStyle, color: severityColor(item.severity) }}
                  />
                  <span>{item.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </FloatingPanel>
    </div>
  )
}

export const ValidationPanel = React.memo(ValidationPanelInner)
