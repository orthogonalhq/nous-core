'use client'

import React from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardTitle, CardContent } from '../../card'
import { Button } from '../../button'
import { Badge } from '../../badge'
import type { CardRendererProps, CardAction } from '../openui-adapter/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const WorkflowCardSchema = z
  .object({
    title: z.string(),
    workflowId: z.string(),
    nodeCount: z.number().optional(),
    status: z
      .enum(['draft', 'ready', 'running', 'completed', 'failed'])
      .optional(),
    summary: z.string().optional(),
  })
  .strip()

export type WorkflowCardProps = z.infer<typeof WorkflowCardSchema>

// ---------------------------------------------------------------------------
// Token mappings
// ---------------------------------------------------------------------------

const STATUS_DOT_COLOR: Record<string, string> = {
  draft: 'var(--nous-state-idle)',
  ready: 'var(--nous-state-waiting)',
  running: 'var(--nous-state-active)',
  completed: 'var(--nous-state-complete)',
  failed: 'var(--nous-state-blocked)',
}

// ---------------------------------------------------------------------------
// Action definitions for workflow card buttons
// ---------------------------------------------------------------------------

const WORKFLOW_ACTIONS = [
  { label: 'Run', actionType: 'submit' as const },
  { label: 'Edit', actionType: 'navigate' as const },
  { label: 'Inspect', actionType: 'navigate' as const },
]

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function WorkflowCard({
  props,
  stale,
  actionOutcome,
  onAction,
}: CardRendererProps<unknown>) {
  const result = WorkflowCardSchema.safeParse(props)
  if (!result.success) {
    return (
      <div
        data-testid="workflow-card-invalid"
        style={{
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        }}
      >
        Invalid workflow card data
      </div>
    )
  }

  const data = result.data
  const borderColor = stale ? 'var(--nous-fg-muted)' : undefined
  const bgColor = stale ? 'var(--nous-bg-surface)' : undefined
  const dotColor = data.status
    ? (stale ? 'var(--nous-fg-muted)' : STATUS_DOT_COLOR[data.status] ?? 'var(--nous-fg-muted)')
    : undefined

  return (
    <Card
      data-testid="workflow-card"
      style={{
        ...(borderColor ? { borderColor } : {}),
        ...(bgColor ? { background: bgColor } : {}),
      }}
    >
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--nous-space-sm)',
          }}
        >
          {dotColor && (
            <span
              data-testid="workflow-status-dot"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
              }}
            />
          )}
          <CardTitle style={{ fontSize: 'var(--nous-font-size-sm)' }}>
            {data.title}
          </CardTitle>
          {data.nodeCount != null && (
            <Badge
              data-testid="workflow-node-count"
              variant="secondary"
            >
              {data.nodeCount} nodes
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.summary && (
          <div
            data-testid="workflow-summary"
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              color: 'var(--nous-text-primary)',
              marginBottom: 'var(--nous-space-sm)',
            }}
          >
            {data.summary}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 'var(--nous-space-xs)',
            flexWrap: 'wrap',
          }}
        >
          {stale && actionOutcome ? (
            <Badge
              data-testid="workflow-card-outcome"
              variant="secondary"
            >
              {actionOutcome.label}
            </Badge>
          ) : stale ? (
            WORKFLOW_ACTIONS.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                disabled
                data-testid={`workflow-expired-btn-${action.label.toLowerCase()}`}
              >
                Expired
              </Button>
            ))
          ) : (
            WORKFLOW_ACTIONS.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                data-testid={`workflow-btn-${action.label.toLowerCase()}`}
                onClick={() => {
                  if (onAction) {
                    const cardAction: CardAction = {
                      actionType: action.actionType,
                      cardId: '',
                      payload: {
                        workflowId: data.workflowId,
                        action: action.label.toLowerCase(),
                      },
                    }
                    onAction(cardAction)
                  }
                }}
              >
                {action.label}
              </Button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
