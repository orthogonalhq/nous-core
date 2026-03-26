'use client'

import { getBezierPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { WorkflowBuilderEdge, WorkflowBuilderEdgeData } from '../../../types/workflow-builder'

/**
 * MemoryFlowEdge — dotted line for memory/context flow connections.
 *
 * Uses `--nous-builder-edge-memory` color token, 1.5px dotted stroke.
 * Supports monitor-mode flow animation via optional `data.executionState`.
 */
export function MemoryFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
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

  // Determine style and animation based on execution state
  const isActive = execState?.status === 'active'
  const isCompleted = execState?.status === 'completed'

  const strokeColor = isActive || isCompleted
    ? 'var(--nous-builder-edge-memory)'
    : 'var(--nous-builder-edge-memory)'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={isActive ? 'nous-edge-flow-active' : undefined}
        style={{
          stroke: strokeColor,
          strokeWidth: 1.5,
          strokeDasharray: isActive ? undefined : '4 4',
          opacity: isCompleted ? 1 : 0.7,
        }}
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 'var(--nous-font-size-2xs)',
              color: 'var(--nous-fg-dim)',
              background: 'var(--nous-bg-elevated)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid var(--nous-border)',
              whiteSpace: 'nowrap',
              opacity: 0.8,
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
