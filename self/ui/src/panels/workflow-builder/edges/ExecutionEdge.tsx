'use client'

import { getBezierPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { WorkflowBuilderEdge, WorkflowBuilderEdgeData } from '../../../types/workflow-builder'

/**
 * ExecutionEdge — solid line for execution flow connections.
 *
 * Uses `--nous-builder-edge-execution` color token, 2px stroke, arrow marker
 * at target end. Includes a placeholder `nousEdgeAnimated` CSS class for
 * future monitor-mode animation (Phase 3).
 */
export function ExecutionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<WorkflowBuilderEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const edgeData = data as unknown as WorkflowBuilderEdgeData | undefined
  const execState = edgeData?.executionState
  const isActive = execState?.status === 'active'
  const isCompleted = execState?.status === 'completed'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={isActive ? 'nous-edge-flow-active' : undefined}
        style={{
          stroke: isActive || isCompleted
            ? 'var(--nous-accent)'
            : 'var(--nous-builder-edge-execution)',
          strokeWidth: 2,
        }}
        markerEnd={markerEnd ?? 'url(#nous-arrow-execution)'}
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-muted)',
              background: 'var(--nous-bg-elevated)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid var(--nous-border)',
              whiteSpace: 'nowrap',
            }}
            className="nodrag nopan"
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
