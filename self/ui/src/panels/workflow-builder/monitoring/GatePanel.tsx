'use client'

import React from 'react'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import { useFloatingPanel } from '../floating-panel/useFloatingPanel'
import type { GateState } from '../../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GatePanelProps {
  /** Node whose gates to display. */
  nodeId: string
  /** Label of the node (for the panel header subtitle). */
  nodeLabel: string
  /** Gate states for this node in the active run. Empty array = empty state. */
  gates: GateState[]
  /** Ref to the canvas wrapper for boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Gate type icons (codicons) ───────────────────────────────────────────────

const GATE_TYPE_ICON: Record<GateState['type'], string> = {
  approval: 'codicon-person-add',
  quality: 'codicon-beaker',
  governance: 'codicon-law',
}

const GATE_TYPE_LABEL: Record<GateState['type'], string> = {
  approval: 'Approval',
  quality: 'Quality',
  governance: 'Governance',
}

// ─── Status badge styles ──────────────────────────────────────────────────────

const GATE_STATUS_STYLE: Record<GateState['status'], React.CSSProperties> = {
  passed: { background: 'var(--nous-builder-gate-passed-bg)', color: 'var(--nous-builder-gate-passed-fg)' },
  failed: { background: 'var(--nous-builder-gate-failed-bg)', color: 'var(--nous-builder-gate-failed-fg)' },
  pending: { background: 'var(--nous-builder-gate-pending-bg)', color: 'var(--nous-builder-gate-pending-fg)' },
  skipped: { background: 'var(--nous-builder-gate-skipped-bg)', color: 'var(--nous-builder-gate-skipped-fg)' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GatePanel({ nodeId, nodeLabel, gates, containerRef }: GatePanelProps) {
  const panel = useFloatingPanel({
    initialPosition: 'left',
    containerRef,
  })

  return (
    <FloatingPanel
      title="Gate Checks"
      state={panel.state}
      panelRef={panel.panelRef}
      onCollapse={panel.onCollapse}
      onPin={panel.onPin}
      onClose={panel.onClose}
      onDragStart={panel.onDragStart}
    >
      {/* Node label subtitle */}
      <div
        style={{
          padding: '4px 8px',
          fontSize: 'var(--nous-font-size-2xs)' as unknown as string,
          color: 'var(--nous-fg-muted)',
          borderBottom: '1px solid var(--nous-border)',
        }}
      >
        {nodeLabel}
      </div>

      {gates.length === 0 ? (
        <div
          data-testid="gate-panel-empty"
          style={{
            padding: 'var(--nous-space-md)' as unknown as string,
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-sm)' as unknown as string,
            textAlign: 'center',
          }}
        >
          No gate checks for this node.
        </div>
      ) : (
        <div data-testid="gate-list" style={{ display: 'flex', flexDirection: 'column' }}>
          {gates.map((gate) => (
            <div
              key={gate.gateId}
              data-testid={`gate-row-${gate.gateId}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 8px',
                borderBottom: '1px solid var(--nous-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Gate type icon */}
                <i
                  className={`codicon ${GATE_TYPE_ICON[gate.type]}`}
                  title={GATE_TYPE_LABEL[gate.type]}
                  style={{ fontSize: 12, color: 'var(--nous-fg-muted)', flexShrink: 0 }}
                />
                {/* Gate name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--nous-font-size-sm)' as unknown as string,
                    color: 'var(--nous-fg)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {gate.name}
                </span>
                {/* Status badge */}
                <span
                  data-testid={`gate-status-${gate.gateId}`}
                  data-status={gate.status}
                  style={{
                    ...GATE_STATUS_STYLE[gate.status],
                    padding: '1px 6px',
                    borderRadius: 3,
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}
                >
                  {gate.status}
                </span>
              </div>
              {/* Error detail (failed gates only) */}
              {gate.status === 'failed' && gate.errorDetail && (
                <div
                  data-testid={`gate-error-${gate.gateId}`}
                  style={{
                    marginTop: 3,
                    fontSize: '11px',
                    color: 'var(--nous-builder-gate-failed-fg)',
                    paddingLeft: 18,
                  }}
                >
                  {gate.errorDetail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FloatingPanel>
  )
}
