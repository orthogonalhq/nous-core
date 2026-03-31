import type { ReactElement } from 'react'
import type { z } from 'zod'

// ---------------------------------------------------------------------------
// CardRendererProps<T>
// ---------------------------------------------------------------------------
// Shared interface for all card renderers. The `stale` flag, `actionOutcome`,
// and `onAction` handler are provided by the ChatPanel (sub-phase 1.2) based
// on the card-persistence-model-v1 decision.
// ---------------------------------------------------------------------------

export interface CardRendererProps<T = unknown> {
  props: T
  stale?: boolean
  actionOutcome?: {
    actionType: string
    label: string
    timestamp: string
  }
  onAction?: (action: CardAction) => void
}

// ---------------------------------------------------------------------------
// NousCardDefinition
// ---------------------------------------------------------------------------
// Registry entry for a card type. Each card registers one of these.
//
// SF-1: The `renderer` type uses `CardRendererProps<unknown>` per
// card-persistence-model-v1, superseding the adapter-boundary-v1 original
// type signature of `React.ComponentType<{ props: unknown; children?: React.ReactNode }>`.
// `children` is dropped because card content is delivered via typed props.
// ---------------------------------------------------------------------------

export interface NousCardDefinition {
  name: string
  description: string
  propsSchema: z.ZodType<unknown>
  renderer: React.ComponentType<CardRendererProps<unknown>>
}

// ---------------------------------------------------------------------------
// NousCardElement — parsed tree node
// ---------------------------------------------------------------------------

export interface NousCardElement {
  type: string
  props: Record<string, unknown>
  children: (NousCardElement | string)[]
}

// ---------------------------------------------------------------------------
// NousCardTree — array of parsed elements
// ---------------------------------------------------------------------------

export type NousCardTree = NousCardElement[]

// ---------------------------------------------------------------------------
// NousParseResult — discriminated union for parser output
// ---------------------------------------------------------------------------

export type NousParseResult =
  | { ok: true; tree: NousCardTree }
  | { ok: false; raw: string; error?: string }

// ---------------------------------------------------------------------------
// CardAction — runtime event emitted by card renderers
// ---------------------------------------------------------------------------

export interface CardAction {
  actionType: 'approve' | 'reject' | 'navigate' | 'submit' | 'followup'
  cardId: string
  payload: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// CardActionHandlers — callback interface for renderCardTree
// ---------------------------------------------------------------------------

export interface CardActionHandlers {
  onAction: (action: CardAction) => void
}

// ---------------------------------------------------------------------------
// RenderCardContext — rendering context passed to renderCardTree
// ---------------------------------------------------------------------------
// Carries stale-state and actionOutcome information from ChatPanel to
// individual card renderers. When stale is true, cards render in muted
// mode with no action handler.
// ---------------------------------------------------------------------------

export interface RenderCardContext {
  stale?: boolean
  actionOutcome?: {
    actionType: string
    label: string
    timestamp: string
  }
}

// ---------------------------------------------------------------------------
// NousCardRegistry — read-only registry interface
// ---------------------------------------------------------------------------

export interface NousCardRegistry {
  has(name: string): boolean
  get(name: string): NousCardDefinition | undefined
  list(): string[]
}
