'use client'

import { getBezierPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { WorkflowBuilderEdge, WorkflowBuilderEdgeData } from '../../../types/workflow-builder'

/**
 * ConfigEdge — dashed line for configuration/dependency connections.
 *
 * Uses `--nous-builder-edge-config` color token (muted appearance),
 * 1.5px dashed stroke, no arrow marker.
 */
export function ConfigEdge({
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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: 'var(--nous-builder-edge-config)',
          strokeWidth: 1.5,
          strokeDasharray: '6 3',
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
