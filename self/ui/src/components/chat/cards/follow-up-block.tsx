'use client'

import React from 'react'
import { z } from 'zod'
import { Badge } from '../../badge'
import type { CardRendererProps, CardAction } from '../openui-adapter/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const FollowUpBlockSchema = z
  .object({
    suggestions: z
      .array(
        z.object({
          label: z.string(),
          prompt: z.string().optional(),
          actionType: z
            .enum(['followup', 'navigate', 'submit'])
            .default('followup'),
          payload: z.record(z.unknown()).optional(),
        }),
      )
      .min(1)
      .max(6),
  })
  .strip()

export type FollowUpBlockProps = z.infer<typeof FollowUpBlockSchema>

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
// FollowUpBlock renders as a flex-wrap pill row WITHOUT a card container.
// This is intentionally different from other cards.
// ---------------------------------------------------------------------------

export function FollowUpBlock({
  props,
  stale,
  onAction,
}: CardRendererProps<unknown>) {
  const result = FollowUpBlockSchema.safeParse(props)
  if (!result.success) {
    return (
      <div
        data-testid="followup-block-invalid"
        style={{
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        }}
      >
        Invalid follow-up block data
      </div>
    )
  }

  const data = result.data

  return (
    <div
      data-testid="followup-block"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--nous-space-xs)',
      }}
    >
      {stale
        ? data.suggestions.map((suggestion, i) => (
            <Badge
              key={i}
              variant="outline"
              data-testid="followup-stale-pill"
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                borderRadius: 'var(--nous-radius-md)',
                cursor: 'default',
              }}
            >
              {suggestion.label}
            </Badge>
          ))
        : data.suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              data-testid="followup-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 'var(--nous-space-xs) var(--nous-space-sm)',
                background: 'var(--nous-bg-elevated)',
                border: '1px solid var(--nous-shell-column-border)',
                borderRadius: 'var(--nous-radius-md)',
                fontSize: 'var(--nous-font-size-xs)',
                color: 'var(--nous-text-primary)',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onClick={() => {
                if (onAction) {
                  const cardAction: CardAction = {
                    actionType: suggestion.actionType,
                    cardId: '',
                    payload: {
                      prompt: suggestion.prompt ?? suggestion.label,
                      ...(suggestion.payload ?? {}),
                    },
                  }
                  onAction(cardAction)
                }
              }}
            >
              {suggestion.label}
            </button>
          ))}
    </div>
  )
}
