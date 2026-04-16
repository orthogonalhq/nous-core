'use client'

import React from 'react'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import { useFloatingPanel } from '../floating-panel/useFloatingPanel'
import type { ExecutionRun, ExecutionRunStatus } from '../../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExecutionHistoryProps {
  /** Ref to the canvas wrapper for panel boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Callback when a run is selected from the history list. */
  onSelectRun: (runId: string) => void
  /** Currently selected run ID, or null. */
  activeRunId: string | null
  /** Live execution runs from the server snapshot. Empty array = no runs. */
  runs: ExecutionRun[]
}

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ExecutionRunStatus, string> = {
  running: 'var(--nous-accent)',
  completed: 'var(--nous-alert-success)',
  failed: 'var(--nous-alert-error)',
  paused: 'var(--nous-alert-warning)',
}

const STATUS_LABEL: Record<ExecutionRunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
}

// ─── Duration formatter ───────────────────────────────────────────────────────

function formatRunDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'in progress'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ExecutionHistory — floating panel listing past execution runs.
 *
 * Renders inside FloatingPanel with movable/collapsible/pinnable/dismissable
 * behavior. Lists demo runs sorted by recency. Click to select a run loads
 * it into the monitor overlay.
 */
export function ExecutionHistory({ containerRef, onSelectRun, activeRunId, runs }: ExecutionHistoryProps) {
  const panel = useFloatingPanel({
    initialPosition: 'right',
    containerRef,
  })

  // Sort runs by startedAt descending (newest first)
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )

  return (
    <FloatingPanel
      title="Execution History"
      state={panel.state}
      panelRef={panel.panelRef}
      onCollapse={panel.onCollapse}
      onPin={panel.onPin}
      onClose={panel.onClose}
      onDragStart={panel.onDragStart}
    >
      {sortedRuns.length === 0 ? (
        <div
          data-testid="execution-history-empty"
          style={{
            padding: 'var(--nous-space-md)' as unknown as string,
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-sm)' as unknown as string,
            textAlign: 'center',
          }}
        >
          No execution runs yet.
        </div>
      ) : (
        <div
          data-testid="execution-history-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {sortedRuns.map((run) => {
            const isActive = run.id === activeRunId

            return (
              <button
                key={run.id}
                data-testid={`execution-run-${run.id}`}
                onClick={() => onSelectRun(run.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
                  background: isActive
                    ? 'var(--nous-selection)'
                    : 'transparent',
                  color: 'var(--nous-fg)',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
                }}
              >
                {/* Status dot */}
                <span
                  data-testid={`run-status-${run.id}`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLOR[run.status],
                    flexShrink: 0,
                  }}
                  title={STATUS_LABEL[run.status]}
                />
                {/* Run ID (truncated) */}
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--nous-font-family-mono)' as unknown as string,
                  }}
                >
                  {run.id}
                </span>
                {/* Timestamp + duration */}
                <span
                  style={{
                    color: 'var(--nous-fg-muted)',
                    fontSize: 'var(--nous-font-size-2xs)' as unknown as string,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {formatTimestamp(run.startedAt)} ({formatRunDuration(run.startedAt, run.completedAt)})
                </span>
              </button>
            )
          })}
        </div>
      )}
    </FloatingPanel>
  )
}
