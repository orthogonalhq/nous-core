'use client'

import React from 'react'
import type { ExecutionRun, ExecutionNodeStatus } from '../../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExecutionMonitorProps {
  /** The active execution run to visualize. */
  activeRun: ExecutionRun
}

// ─── Status color map ─────────────────────────────────────────────────────────

const STATUS_BORDER_COLOR: Record<ExecutionNodeStatus, string> = {
  running: 'var(--nous-accent)',
  completed: 'var(--nous-alert-success)',
  failed: 'var(--nous-alert-error)',
  skipped: 'var(--nous-fg-subtle)',
  pending: 'transparent',
}

const STATUS_LABEL: Record<ExecutionNodeStatus, string> = {
  running: 'running\u2026',
  completed: 'done',
  failed: 'failed',
  skipped: 'skipped',
  pending: '',
}

const STATUS_ICON: Record<ExecutionNodeStatus, string> = {
  running: '\u25B6',
  completed: '\u2713',
  failed: '\u2717',
  skipped: '\u2014',
  pending: '',
}

// ─── Duration formatter ───────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ExecutionMonitor — canvas overlay rendering node status badges and highlights.
 *
 * Renders absolutely-positioned overlay elements for each node with execution
 * state. All elements use `pointer-events: none` to preserve canvas pan/zoom.
 * Positioned relative to the canvas wrapper (parent provides positioning context).
 *
 * Note: In the current implementation, badges are rendered as a list overlay
 * panel rather than positioned over individual nodes (which requires viewport
 * coordinate transforms from useReactFlow). This approach provides correct
 * data visualization while keeping the implementation simple. Future iterations
 * can add node-aligned positioning using React Flow's viewport transform.
 */
export function ExecutionMonitor({ activeRun }: ExecutionMonitorProps) {
  const nodeEntries = Object.values(activeRun.nodeStates)

  if (nodeEntries.length === 0) return null

  return (
    <div
      data-testid="execution-monitor-overlay"
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--nous-z-overlay)' as unknown as number,
        pointerEvents: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        maxWidth: '90%',
        justifyContent: 'center',
      }}
    >
      {nodeEntries.map((nodeState) => {
        if (nodeState.status === 'pending') return null

        const isRunning = nodeState.status === 'running'

        return (
          <div
            key={nodeState.nodeId}
            data-testid={`monitor-badge-${nodeState.nodeId}`}
            data-status={nodeState.status}
            className={isRunning ? 'nous-node-pulse' : undefined}
            style={{
              pointerEvents: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--nous-radius-sm)' as unknown as string,
              background: 'var(--nous-builder-monitor-badge-bg)',
              color: 'var(--nous-builder-monitor-badge-fg)',
              fontSize: 'var(--nous-font-size-2xs)' as unknown as string,
              border: `2px solid ${STATUS_BORDER_COLOR[nodeState.status]}`,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{STATUS_ICON[nodeState.status]}</span>
            <span>{nodeState.nodeId}</span>
            <span style={{ opacity: 0.7 }}>
              {nodeState.status === 'running'
                ? STATUS_LABEL.running
                : nodeState.status === 'failed'
                  ? STATUS_LABEL.failed
                  : formatDuration(nodeState.duration)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
