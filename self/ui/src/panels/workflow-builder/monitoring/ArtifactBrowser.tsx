'use client'

import React from 'react'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import { useFloatingPanel } from '../floating-panel/useFloatingPanel'
import type { ArtifactRef } from '../../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ArtifactBrowserProps {
  /** Node whose artifacts to display. */
  nodeId: string
  /** Label of the node (for the panel header subtitle). */
  nodeLabel: string
  /** Artifact references for this node in the active run. Empty array = empty state. */
  artifacts: ArtifactRef[]
  /** Ref to the canvas wrapper for boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Artifact type badge styles ───────────────────────────────────────────────

const ARTIFACT_TYPE_STYLE: Record<ArtifactRef['artifactType'], React.CSSProperties> = {
  dispatch: { background: 'var(--nous-builder-artifact-dispatch-bg)', color: 'var(--nous-builder-artifact-dispatch-fg)' },
  revision: { background: 'var(--nous-builder-artifact-revision-bg)', color: 'var(--nous-builder-artifact-revision-fg)' },
  escalation: { background: 'var(--nous-builder-artifact-escalation-bg)', color: 'var(--nous-builder-artifact-escalation-fg)' },
  output: { background: 'var(--nous-builder-artifact-output-bg)', color: 'var(--nous-builder-artifact-output-fg)' },
  other: { background: 'var(--nous-builder-artifact-other-bg)', color: 'var(--nous-builder-artifact-other-fg)' },
}

const ARTIFACT_TYPE_LABEL: Record<ArtifactRef['artifactType'], string> = {
  dispatch: 'DISPATCH',
  revision: 'REVISION',
  escalation: 'ESCALATION',
  output: 'OUTPUT',
  other: 'OTHER',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArtifactBrowser({ nodeId, nodeLabel, artifacts, containerRef }: ArtifactBrowserProps) {
  const panel = useFloatingPanel({
    initialPosition: 'right',
    containerRef,
  })

  return (
    <FloatingPanel
      title="Artifacts"
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

      {artifacts.length === 0 ? (
        <div
          data-testid="artifact-browser-empty"
          style={{
            padding: 'var(--nous-space-md)' as unknown as string,
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-sm)' as unknown as string,
            textAlign: 'center',
          }}
        >
          No artifacts for this node.
        </div>
      ) : (
        <div data-testid="artifact-list" style={{ display: 'flex', flexDirection: 'column' }}>
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              data-testid={`artifact-row-${artifact.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                borderBottom: '1px solid var(--nous-border)',
                cursor: 'default',
              }}
            >
              {/* Artifact type badge */}
              <span
                data-testid={`artifact-type-${artifact.id}`}
                data-artifact-type={artifact.artifactType}
                style={{
                  ...ARTIFACT_TYPE_STYLE[artifact.artifactType],
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                }}
              >
                {ARTIFACT_TYPE_LABEL[artifact.artifactType]}
              </span>
              {/* Artifact label */}
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
                {artifact.label}
              </span>
              {/* Artifact ID (truncated) */}
              <span
                title={artifact.id}
                style={{
                  fontSize: 'var(--nous-font-size-2xs)' as unknown as string,
                  color: 'var(--nous-fg-muted)',
                  fontFamily: 'var(--nous-font-family-mono)' as unknown as string,
                  maxWidth: 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {artifact.id}
              </span>
            </div>
          ))}
        </div>
      )}
    </FloatingPanel>
  )
}
