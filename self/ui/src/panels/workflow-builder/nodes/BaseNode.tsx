'use client'

import React from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { WorkflowBuilderNode, WorkflowBuilderNodeData } from '../../../types/workflow-builder'
import { getRegistryEntry } from './node-registry'

// ─── State indicator color tokens ────────────────────────────────────────────

const STATE_COLOR_VAR: Record<string, string> = {
  idle: 'var(--nous-state-idle)',
  active: 'var(--nous-state-active)',
  complete: 'var(--nous-state-complete)',
  waiting: 'var(--nous-state-waiting)',
  blocked: 'var(--nous-state-blocked)',
}

// ─── BaseNode — custom React Flow node with category styling ─────────────────

function BaseNodeInner({ data }: NodeProps<WorkflowBuilderNode>) {
  const nodeData = data as unknown as WorkflowBuilderNodeData
  const entry = getRegistryEntry(nodeData.nousType)
  const stateKey = (nodeData as Record<string, unknown>).state as string | undefined
  const stateColor = STATE_COLOR_VAR[stateKey ?? 'idle'] ?? STATE_COLOR_VAR.idle

  return (
    <div
      style={{
        background: 'var(--nous-bg-elevated)',
        border: '1px solid var(--nous-border-strong)',
        borderLeft: `3px solid ${entry.colorVar}`,
        borderRadius: '6px',
        padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
        color: 'var(--nous-fg)',
        fontSize: 'var(--nous-font-size-sm)',
        minWidth: 160,
        maxWidth: 240,
        position: 'relative',
      }}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{
          background: 'var(--nous-border-strong)',
          border: '2px solid var(--nous-bg-elevated)',
          width: 8,
          height: 8,
        }}
      />

      {/* Header: icon + title + state indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-sm)',
          marginBottom: 'var(--nous-space-2xs)',
        }}
      >
        {/* Category icon (codicon) */}
        <i
          className={`codicon ${entry.icon}`}
          style={{
            color: entry.colorVar,
            fontSize: 'var(--nous-font-size-base)',
            flexShrink: 0,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontWeight: 600,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.label}
        </div>

        {/* State indicator dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: stateColor,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Description (2-line clamp) */}
      {nodeData.description && (
        <div
          style={{
            fontSize: 'var(--nous-font-size-xs)',
            color: 'var(--nous-fg-subtle)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {nodeData.description}
        </div>
      )}

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          background: 'var(--nous-border-strong)',
          border: '2px solid var(--nous-bg-elevated)',
          width: 8,
          height: 8,
        }}
      />
    </div>
  )
}

export const BaseNode = React.memo(BaseNodeInner)
